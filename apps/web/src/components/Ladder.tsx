/**
 * Stage 11's ladder: a strip chart, not a growing log. Time runs left to
 * right rather than the usual top-to-bottom sequence diagram, specifically
 * so extra width at lg/xl buys more visible history instead of bigger
 * arrows -- the plan's own gate for this stage. Rails are horizontal lines
 * (two, or three for MQTT, whose broker is real and deserves its own rail);
 * each message is a short vertical connector positioned at its arrival
 * time, newest at the right, anchored there by flex + overflow so a wider
 * container simply reveals more of the same history rather than rescaling
 * anything.
 *
 * All data here is simulated (src/lib/telemetry-sim.ts) -- there is no live
 * telemetry relay from any module yet (that is Stage 15's job), and this
 * page says so plainly rather than implying otherwise.
 */
import { useEffect, useState } from "react";
import { startPolling } from "../scripts/polling";
import { RAILS, nextReading, type Reading } from "../lib/telemetry-sim";
import "./Ladder.css";

interface Props {
  modul: number;
  groups: number[];
  /** /groups/[n]'s own reason for existing: the same readings a student
   * would otherwise hand-copy off a projector, as a real table with a
   * copy action and a CSV download -- see the plan's "readings export"
   * section. Off by default since /modules/[n]/live's general audience
   * does not need a per-message table alongside the strip chart. */
  showReadings?: boolean;
}

const FLUSH_MS = 900;
const HISTORY_MAX = 60;
const READINGS_ROWS = 10;

function formatDelta(r: Reading): string {
  if (r.rx === null) return `#${r.seq} hilang di tengah jalan`;
  return `#${r.seq} · kirim ${r.tx} · terima ${r.rx} · delta ${r.delayMs} ms`;
}

function toRows(history: Reading[]): Reading[] {
  return history.slice(-READINGS_ROWS).reverse();
}

function toTsv(rows: Reading[]): string {
  const header = "seq\tkirim\tterima\tdelta_ms\trssi_dbm";
  const lines = rows.map(
    (r) => `${r.seq}\t${r.tx}\t${r.rx ?? "hilang"}\t${r.delayMs ?? ""}\t${r.rssi}`,
  );
  return [header, ...lines].join("\n");
}

export default function Ladder({ modul, groups, showReadings = false }: Props) {
  const [group, setGroup] = useState(groups[0]);
  const [history, setHistory] = useState<Reading[]>([]);
  const rails = RAILS[modul] ?? RAILS[1];

  useEffect(() => {
    setHistory([]);
    const stop = startPolling(() => {
      setHistory((prev) => [...prev, nextReading(modul, group)].slice(-HISTORY_MAX));
    }, FLUSH_MS);
    return stop;
  }, [modul, group]);

  const latest = history[history.length - 1];
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
    <div className="ladder">
      {groups.length > 1 && (
        <div className="ladder__picker" role="tablist" aria-label="Pilih kelompok">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={g === group}
              className="ladder__picker-btn"
              style={{ "--tile-hue": `var(--group-${g})` } as React.CSSProperties}
              onClick={() => setGroup(g)}
            >
              Kelompok {g}
            </button>
          ))}
        </div>
      )}

      <div
        className="ladder__field"
        style={{ "--tile-hue": `var(--group-${group})` } as React.CSSProperties}
      >
        {rails.map((label, i) => (
          <div
            key={label}
            className="ladder__rail"
            style={{ "--rail-index": i, "--rail-count": rails.length - 1 } as React.CSSProperties}
          >
            <span className="ladder__rail-label">{label}</span>
          </div>
        ))}
        <div className="ladder__strip">
          {history.map((r) => (
            <div key={r.seq} className="ladder__hop" data-hilang={r.rx === null ? "yes" : "no"}>
              <span className="ladder__hop-line" />
            </div>
          ))}
        </div>
      </div>

      <p className="ladder__readout mono">
        {latest ? formatDelta(latest) : "Menunggu pesan pertama…"}
      </p>

      {showReadings && (
        <div className="ladder__readings">
          <div className="ladder__readings-head">
            <h3 className="ladder__readings-title">Bacaan terbaru</h3>
            <div className="ladder__readings-actions">
              <button type="button" onClick={salin} disabled={rows.length === 0}>
                Salin
              </button>
              <button type="button" onClick={unduh} disabled={rows.length === 0}>
                Unduh CSV
              </button>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="ladder__readings-kosong">Menunggu bacaan pertama…</p>
          ) : (
            <table className="ladder__readings-table mono">
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
          )}
        </div>
      )}
    </div>
  );
}
