/**
 * P7.4's replacement for Ladder.tsx (Stage 11), following the signed-off
 * mockup: a vertical flow -- lanes across the top, newest message on top,
 * each row an arrow labelled with its sequence number, its Δ, and its
 * arrival time -- rather than a horizontal strip chart. The telemetry
 * source underneath is untouched: same polling cadence, same fallback
 * from real readings (telemetry-live.ts) to the simulator
 * (telemetry-sim.ts) for Modules 2-4, same "never mixes real and
 * simulated once real data starts" rule Ladder.tsx documented (Module 1
 * always simulates; no real BLE relay exists).
 *
 * Every module's `RAILS` entry becomes a lane header (three for MQTT's
 * real broker). A `Reading` only ever carries one tx/rx pair regardless of
 * lane count, so a multi-lane row's arrow spans the full lane width --
 * "the message passed through this pipeline" -- rather than claiming to
 * know which specific pair of lanes it hopped between, the same
 * simplification Ladder's own three-rail strip made.
 */
import { useEffect, useState } from "react";
import { startPolling } from "../../scripts/polling";
import { RAILS, nextReading, type Reading } from "../../lib/telemetry-sim";
import { fetchLiveReading, resetLiveReadingMemory } from "../../lib/telemetry-live";
import GroupPicker from "../ui/GroupPicker";
import ScrollArea from "../ui/ScrollArea";
import "./FlowDiagram.css";

interface Props {
  modul: number;
  groups: number[];
  /** /groups/[n]'s own reason for existing: the same readings a student
   * would otherwise hand-copy off a projector, as a real table with a
   * copy action and a CSV download -- see the plan's "readings export"
   * section. Off by default since /modules/[n]/live's general audience
   * does not need a reading table alongside the flow. */
  showReadings?: boolean;
}

const FLUSH_MS = 900;
const HISTORY_MAX = 60;
const VISIBLE_ROWS = 20;
const READINGS_ROWS = 10;

function toRows(history: Reading[]): Reading[] {
  return history.slice(-READINGS_ROWS).reverse();
}

function toTsv(rows: Reading[]): string {
  const header = "seq\tkirim\tterima\tdelta_ms\trssi_dbm";
  const lines = rows.map(
    (r) => `${r.seq}\t${r.tx ?? ""}\t${r.rx ?? "hilang"}\t${r.delayMs ?? ""}\t${r.rssi ?? ""}`,
  );
  return [header, ...lines].join("\n");
}

/** "13:05:38:286" (the sim/live HH:MM:SS:MS format) -> "38.286", the
 *  mockup's compact per-row time -- the hour/minute rarely differ between
 *  two rows a few seconds apart, and the row's own position already says
 *  "just now" relative to its neighbours. */
function shortTime(hhmmssms: string | null): string {
  if (!hhmmssms) return "-";
  const parts = hhmmssms.split(":");
  return parts.length === 4 ? `${parts[2]}.${parts[3]}` : hhmmssms;
}

export default function FlowDiagram({ modul, groups, showReadings = false }: Props) {
  const [group, setGroup] = useState(groups[0]);
  const [history, setHistory] = useState<Reading[]>([]);
  const lanes = RAILS[modul] ?? RAILS[1];

  useEffect(() => {
    setHistory([]);
    resetLiveReadingMemory(modul, group);
    let live = false; // once true, never falls back to simulated for this module/group

    const stop = startPolling(async () => {
      if (modul !== 1) {
        const reading = await fetchLiveReading(modul, group);
        if (reading) {
          live = true;
          setHistory((prev) => [...prev, reading].slice(-HISTORY_MAX));
          return;
        }
        if (live) return; // real data has started; a quiet poll just means nothing new yet
      }
      setHistory((prev) => [...prev, nextReading(modul, group)].slice(-HISTORY_MAX));
    }, FLUSH_MS);
    return stop;
  }, [modul, group]);

  const visible = history.slice(-VISIBLE_ROWS).reverse();
  const rows = showReadings ? toRows(history) : [];

  async function salin() {
    try {
      await navigator.clipboard.writeText(toTsv(rows));
      window.Toast?.show("Bacaan tersalin.", "ok");
    } catch {
      window.Toast?.show("Tidak dapat menyalin ke papan klip.", "danger");
    }
  }

  function unduh() {
    const blob = new Blob([toTsv(rows).replace(/\t/g, ",")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modul${modul}-kelompok${group}-bacaan.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flow-diagram">
      {groups.length > 1 && <GroupPicker value={group} onValueChange={setGroup} groups={groups} />}

      <div className={showReadings ? "flow-diagram__split" : undefined}>
        <div className="flow-diagram__card">
          <div className="flow-lanes">
            {lanes.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="flow-diagram__kosong">Menunggu pesan pertama…</p>
          ) : (
            <div className="flow-rows">
              {visible.map((r) => (
                <div key={r.seq} className="flow-row" data-hilang={r.rx === null ? "yes" : "no"}>
                  <span className="flow-seq">#{r.seq}</span>
                  <div className="flow-arrow">
                    <span className="flow-label">
                      {r.rx === null ? "hilang ✖" : `Δ ${r.delayMs} ms`}
                    </span>
                  </div>
                  <span className="flow-time">{shortTime(r.rx)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {showReadings && (
          <div className="flow-diagram__card flow-diagram__readings">
            <div className="flow-diagram__readings-head">
              <h3 className="flow-diagram__readings-title">Bacaan terbaru</h3>
              <div className="flow-diagram__readings-actions">
                <button type="button" onClick={salin} disabled={rows.length === 0}>
                  Salin
                </button>
                <button type="button" onClick={unduh} disabled={rows.length === 0}>
                  Unduh CSV
                </button>
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="flow-diagram__kosong">Menunggu bacaan pertama…</p>
            ) : (
              <ScrollArea
                label="Bacaan terbaru"
                direction="both"
                className="flow-diagram__readings-scroll"
              >
                <table className="flow-diagram__readings-table mono">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Kirim</th>
                      <th>Terima</th>
                      <th>Delta (ms)</th>
                      <th>RSSI (dBm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.seq} data-hilang={r.rx === null ? "yes" : "no"}>
                        <td>{r.seq}</td>
                        <td>{r.tx}</td>
                        <td>{r.rx ?? "hilang"}</td>
                        <td>{r.delayMs ?? "-"}</td>
                        <td>{r.rssi}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
