/**
 * /modules/[n]/live (Phase 8): the one live workspace. It replaces the old
 * three tabs with three separate group pickers, and /groups/[n], which now
 * redirects here.
 *
 * - One group picker, defaulting to the student's own group (or
 *   ?kelompok=N), with the student's group marked.
 * - A stats strip: average delay, jitter, loss, signal, messages.
 * - The flow, the readings table (copy and CSV) and the protocol layers,
 *   all fed by one stream (useTelemetry). From 1280 they are resizable
 *   panes with the layers collapsible; below that they stack.
 * - "Coba sendiri" (try it yourself) is a secondary mode, not a third tab.
 * - Module 1 only: the board panel, which reads the central ESP32 over
 *   Web Serial on the group PC (BoardLink).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import GroupPicker from "../ui/GroupPicker";
import ResizablePanes from "../ui/ResizablePanes";
import ScrollArea from "../ui/ScrollArea";
import SegmentedControl from "../ui/SegmentedControl";
import { UpdatedAgo } from "../ui/Display";
import LiveSandbox from "../LiveSandbox";
import { useMe, useTick } from "../../lib/app";
import { useMinWidth } from "../../lib/hooks";
import { RAILS, describeLayers, type Reading } from "../../lib/telemetry-sim";
import type { Lang } from "../../lib/kelas";
import { flowStats, selangMs, useTelemetry, type Telemetry } from "./useTelemetry";
import BoardLink from "./BoardLink";
import "./FlowDiagram.css";
import "../LayerXray.css";
import "./LiveWorkspace.css";

interface Layer {
  nama: string;
  nilai: string;
}

const GROUPS = [1, 2, 3, 4, 5];

const T = {
  id: {
    modeLive: "Langsung",
    modeTry: "Coba sendiri",
    mode: "Mode tampilan",
    live: "data asli",
    sim: "simulasi",
    pause: "Jeda",
    resume: "Lanjutkan",
    updated: (s: number) => (s < 3 ? "baru saja" : `${s} detik lalu`),
    avg: "rata rata Δ",
    jitter: "jitter",
    loss: "hilang",
    rssi: "RSSI",
    snr: "SNR",
    msgs: "pesan",
    flow: "Alur pesan",
    readings: "Bacaan terbaru",
    layers: "Lapisan protokol",
    waiting: "Menunggu pesan pertama…",
    lost: "hilang",
    copy: "Salin",
    csv: "Unduh CSV",
    copied: "Bacaan tersalin.",
    copyFail: "Tidak dapat menyalin ke papan klip.",
    col: {
      seq: "#",
      tx: "Kirim",
      rx: "Terima",
      delay: "Δ (ms)",
      gap: "Selang (ms)",
      rssi: "RSSI (dBm)",
    },
    gapAvg: "rata rata selang",
    gapJitter: "jitter selang",
    gapLabel: (ms: number | null) => `selang ${ms ?? "?"} ms`,
    simM1:
      "Belum ada papan terhubung, jadi angka di bawah ini simulasi. Colokkan ESP32 Central ke PC ini lalu hubungkan.",
    simPi: (g: number) =>
      `Belum ada data dari Orange Pi untuk kelompok ${g}, jadi angka di bawah ini simulasi. Data asli muncul begitu papan kelompok ini mengirim.`,
    toBoard: "Hubungkan papan",
    stale: "tidak ada data baru",
    piOnly:
      "Orange Pi hanya melihat waktu terima. Waktu kirim dan delay pulang pergi dicetak papanmu (Serial Monitor atau Thonny); salin dari sana ke jurnal.",
    handle: "Ubah lebar panel",
    mine: "kelompokmu",
    pick: "Pilih kelompok",
    group: "Kelompok",
    tryHint:
      "Tekan tombol untuk mengirim satu pesan uji dan lihat pesan itu melewati setiap lapisan.",
    showLayers: "Tampilkan lapisan",
    hideLayers: "Sembunyikan lapisan",
  },
  en: {
    modeLive: "Live",
    modeTry: "Try it yourself",
    mode: "View mode",
    live: "real data",
    sim: "simulated",
    pause: "Pause",
    resume: "Resume",
    updated: (s: number) => (s < 3 ? "just now" : `${s} s ago`),
    avg: "average Δ",
    jitter: "jitter",
    loss: "lost",
    rssi: "RSSI",
    snr: "SNR",
    msgs: "messages",
    flow: "Message flow",
    readings: "Latest readings",
    layers: "Protocol layers",
    waiting: "Waiting for the first message…",
    lost: "lost",
    copy: "Copy",
    csv: "Download CSV",
    copied: "Readings copied.",
    copyFail: "Could not copy to the clipboard.",
    col: {
      seq: "#",
      tx: "Sent",
      rx: "Received",
      delay: "Δ (ms)",
      gap: "Gap (ms)",
      rssi: "RSSI (dBm)",
    },
    gapAvg: "average gap",
    gapJitter: "gap jitter",
    gapLabel: (ms: number | null) => `gap ${ms ?? "?"} ms`,
    simM1:
      "No board is connected, so the numbers below are simulated. Plug the Central ESP32 into this PC and connect it.",
    simPi: (g: number) =>
      `No data from the Orange Pi for group ${g} yet, so the numbers below are simulated. Real data appears as soon as this group's board sends.`,
    toBoard: "Connect a board",
    stale: "no new data",
    piOnly:
      "The Orange Pi only sees the receive time. Your board prints the send time and round-trip delay (Serial Monitor or Thonny); copy them from there into the journal.",
    handle: "Resize panel",
    mine: "your group",
    pick: "Choose a group",
    group: "Group",
    tryHint: "Press the button to send one test message and watch it cross every layer.",
    showLayers: "Show layers",
    hideLayers: "Hide layers",
  },
};
type Tx = (typeof T)["id"];

function shortTime(t: string | null): string {
  if (!t) return "-";
  const p = t.split(":");
  return p.length === 4 ? `${p[2]}.${p[3]}` : t;
}

/** Which columns the readings actually carry. Modules 2 and 3 as seen by
 *  the Pi have a receive time only, so they get the gap between arrivals
 *  instead of empty send, delay and RSSI columns. */
export function kolomBacaan(rows: Reading[]) {
  const delay = rows.some((r) => r.delayMs != null);
  return {
    tx: rows.some((r) => r.tx != null),
    delay,
    gap: !delay,
    rssi: rows.some((r) => r.rssi != null),
  };
}

type Kolom = [string, (r: Reading, i: number) => string | number];

/** Oldest first, the same columns the table shows. */
function toTsv(rows: Reading[], lost: string): string {
  const k = kolomBacaan(rows);
  const gaps = selangMs(rows);
  const cols: Kolom[] = [["seq", (r) => r.seq]];
  if (k.tx) cols.push(["kirim", (r) => r.tx ?? ""]);
  cols.push(["terima", (r) => r.rx ?? lost]);
  if (k.delay) cols.push(["delta_ms", (r) => r.delayMs ?? ""]);
  else cols.push(["selang_ms", (_, i) => gaps[i] ?? ""]);
  if (k.rssi) cols.push(["rssi_dbm", (r) => r.rssi ?? ""]);
  return [
    cols.map(([h]) => h).join("\t"),
    ...rows.map((r, i) => cols.map(([, f]) => f(r, i)).join("\t")),
  ].join("\n");
}

function Flow({
  modul,
  history,
  t,
  hue,
}: {
  modul: number;
  history: Reading[];
  t: Tx;
  hue: string;
}) {
  const lanes = RAILS[modul] ?? RAILS[1];
  const recent = history.slice(-24);
  const byDelay = recent.some((r) => r.delayMs != null);
  const gaps = selangMs(recent);
  const rows = recent.map((r, i) => ({ r, gap: gaps[i] })).reverse();
  return (
    <div className="livews__card" style={{ "--tile-hue": hue } as React.CSSProperties}>
      <h2 className="livews__h">{t.flow}</h2>
      <div className="flow-lanes">
        {lanes.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="flow-diagram__kosong">{t.waiting}</p>
      ) : (
        <div className="flow-rows livews__rows">
          {rows.map(({ r, gap }, i) => (
            <div
              key={`${r.seq}-${i}`}
              className="flow-row"
              data-hilang={r.rx === null ? "yes" : "no"}
            >
              <span className="flow-seq">#{r.seq}</span>
              <div className="flow-arrow">
                <span className="flow-label">
                  {r.rx === null
                    ? `${t.lost} ✖`
                    : byDelay
                      ? `Δ ${r.delayMs ?? "?"} ms`
                      : t.gapLabel(gap)}
                </span>
              </div>
              <span className="flow-time">{shortTime(r.rx)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Readings({
  history,
  t,
  modul,
  group,
}: {
  history: Reading[];
  t: Tx;
  modul: number;
  group: number;
}) {
  const recent = history.slice(-30);
  const k = kolomBacaan(recent);
  const gaps = selangMs(recent);
  const rows = recent.map((r, i) => ({ r, gap: gaps[i] })).reverse();
  const tsv = () => toTsv(recent, t.lost);
  async function salin() {
    try {
      await navigator.clipboard.writeText(tsv());
      window.Toast?.show(t.copied, "ok");
    } catch {
      window.Toast?.show(t.copyFail, "danger");
    }
  }
  function unduh() {
    const blob = new Blob([tsv().replace(/\t/g, ",")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modul${modul}-kelompok${group}-bacaan.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="livews__card">
      <div className="livews__cardhead">
        <h2 className="livews__h">{t.readings}</h2>
        <div className="row">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={salin}
            disabled={!rows.length}
          >
            {t.copy}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={unduh}
            disabled={!rows.length}
          >
            {t.csv}
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="flow-diagram__kosong">{t.waiting}</p>
      ) : (
        <ScrollArea label={t.readings} direction="both" className="livews__table-scroll">
          <table className="flow-diagram__readings-table mono livews__table">
            <thead>
              <tr>
                <th>{t.col.seq}</th>
                {k.tx && <th>{t.col.tx}</th>}
                <th>{t.col.rx}</th>
                {k.delay && <th>{t.col.delay}</th>}
                {k.gap && <th>{t.col.gap}</th>}
                {k.rssi && <th>{t.col.rssi}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, gap }, i) => (
                <tr key={`${r.seq}-${i}`} data-hilang={r.rx === null ? "yes" : "no"}>
                  <td>{r.seq}</td>
                  {k.tx && <td>{r.tx ?? "-"}</td>}
                  <td>{r.rx ?? t.lost}</td>
                  {k.delay && <td>{r.delayMs ?? "-"}</td>}
                  {k.gap && <td>{gap ?? "-"}</td>}
                  {k.rssi && <td>{r.rssi ?? "-"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
}

function LayerPanel({
  layers,
  last,
  lang,
  t,
  hue,
}: {
  layers: Layer[];
  last: Reading | undefined;
  lang: Lang;
  t: Tx;
  hue: string;
}) {
  const values = last ? describeLayers(last, lang) : layers.map(() => "…");
  return (
    <div className="livews__card">
      <h2 className="livews__h">{t.layers}</h2>
      <ol
        className="layer-xray__layers livews__layers"
        style={{ "--tile-hue": hue } as React.CSSProperties}
      >
        {layers.map((layer, i) => (
          <li key={layer.nama} className="layer-xray__layer">
            <div className="layer-xray__layer-head">
              <span className="layer-xray__layer-index">{layers.length - i}</span>
              <span className="layer-xray__layer-name">{layer.nama}</span>
            </div>
            <p className="layer-xray__layer-value mono">{values[i]}</p>
            <p className="layer-xray__layer-caption">{layer.nilai}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function LiveWorkspace({
  lang,
  modul,
  layers,
}: {
  lang: Lang;
  modul: number;
  layers: Layer[];
}) {
  const t = T[lang];
  const me = useMe();
  const own = me?.role === "praktikan" ? (me.kelompok ?? null) : null;
  const [group, setGroup] = useState(1);
  const [picked, setPicked] = useState(false);
  const [mode, setMode] = useState<"live" | "try">("live");
  const [paused, setPaused] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const wide = useMinWidth(1280);

  // ?kelompok=N (from /groups/N and the dashboard) wins, then the student's
  // own group, until someone picks another one by hand.
  useEffect(() => {
    if (picked) return;
    const q = Number(new URLSearchParams(location.search).get("kelompok"));
    if (GROUPS.includes(q)) setGroup(q);
    else if (own && GROUPS.includes(own)) setGroup(own);
  }, [own, picked]);

  // Module 1's board on this PC feeds its own group's view directly.
  const [boardTel, setBoardTel] = useState<Telemetry | null>(null);
  const boardGroup = own ?? group;
  const local = modul === 1 && boardTel && group === boardGroup ? boardTel : null;
  const tel = useTelemetry(modul, group, paused || mode !== "live", 1000, local);
  // A skipped seq is a lost message only where the Pi sees every one
  // (Modules 2 and 3); Module 4's relay exposes the newest row only.
  const seqGaps = tel.live && (modul === 2 || modul === 3);
  const stats = useMemo(() => flowStats(tel.history, 40, seqGaps), [tel.history, seqGaps]);
  const kolom = useMemo(() => kolomBacaan(tel.history.slice(-40)), [tel.history]);
  const last = tel.history[tel.history.length - 1];
  const hue = `var(--group-${group})`;
  const now = useTick(2000);
  const stale = tel.live && tel.updatedAt !== null && now - tel.updatedAt > 20_000;
  const boardRef = useRef<HTMLDivElement>(null);
  const num = (v: number | null) => (v == null ? "-" : String(v));

  const tiles: { k: string; v: string; unit?: string; bad?: boolean }[] = [
    kolom.delay
      ? { k: t.avg, v: num(stats.avg), unit: "ms" }
      : { k: t.gapAvg, v: num(stats.interval), unit: "ms" },
    kolom.delay
      ? { k: t.jitter, v: num(stats.jitter), unit: "ms" }
      : { k: t.gapJitter, v: num(stats.intervalJitter), unit: "ms" },
    { k: t.loss, v: `${stats.loss}`, unit: "%", bad: stats.loss > 10 },
    ...(kolom.rssi ? [{ k: t.rssi, v: num(stats.rssi), unit: "dBm" }] : []),
    ...(modul === 4 ? [{ k: t.snr, v: num(stats.snr), unit: "dB" }] : []),
    { k: t.msgs, v: last ? `#${last.seq}` : "-" },
  ];

  const flow = <Flow modul={modul} history={tel.history} t={t} hue={hue} />;
  const readings = <Readings history={tel.history} t={t} modul={modul} group={group} />;
  const layerPanel = <LayerPanel layers={layers} last={last} lang={lang} t={t} hue={hue} />;

  return (
    <div className="livews" style={{ "--tile-hue": hue } as React.CSSProperties}>
      <div className="livews__bar">
        <div className="livews__groups">
          <GroupPicker
            value={group}
            onValueChange={(g) => {
              setPicked(true);
              setGroup(g);
            }}
            groups={GROUPS}
            label={t.group}
            aria-label={t.pick}
            mark={own ?? undefined}
            markLabel={t.mine}
          />
        </div>
        <div className="livews__controls">
          <SegmentedControl
            value={mode}
            onValueChange={(v) => setMode(v as "live" | "try")}
            aria-label={t.mode}
            options={[
              { value: "live", label: t.modeLive },
              { value: "try", label: t.modeTry },
            ]}
          />
        </div>
      </div>

      {modul === 1 && (
        <div ref={boardRef} className="livews__boardslot">
          <BoardLink
            lang={lang}
            group={boardGroup}
            canUpload={me?.role === "praktikan"}
            onTelemetry={setBoardTel}
          />
        </div>
      )}

      {mode === "live" ? (
        <>
          <div className="livews__status">
            <span
              className={`pill ${tel.live ? (stale ? "pill--warn" : "pill--ok") : "pill--mono"}`}
            >
              <span
                className={`dot ${tel.live ? (stale ? "dot--warn" : "dot--ok dot--pulse") : "dot--off"}`}
                aria-hidden="true"
              />
              {tel.live ? (stale ? t.stale : t.live) : t.sim}
            </span>
            <UpdatedAgo since={tel.updatedAt} template={t.updated} />
            <button
              type="button"
              className="btn btn--ghost btn--sm livews__pause"
              aria-pressed={paused}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? (
                <Play size={15} aria-hidden="true" />
              ) : (
                <Pause size={15} aria-hidden="true" />
              )}
              {paused ? t.resume : t.pause}
            </button>
          </div>

          {!tel.live && (
            <div className="livews__note" role="status">
              <p>{modul === 1 ? t.simM1 : t.simPi(group)}</p>
              {modul === 1 && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => {
                    const el = boardRef.current;
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    el?.querySelector<HTMLButtonElement>(".board .btn--primary")?.focus({
                      preventScroll: true,
                    });
                  }}
                >
                  {t.toBoard}
                </button>
              )}
            </div>
          )}
          {tel.live && !kolom.delay && modul !== 1 && (
            <p className="livews__note livews__note--quiet">{t.piOnly}</p>
          )}

          <div className="livews__stats" style={{ "--n": tiles.length } as React.CSSProperties}>
            {tiles.map((s, i) => (
              <div
                key={s.k}
                className="livews__stat"
                data-bad={s.bad ? "yes" : undefined}
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className="livews__stat-v num">
                  {s.v}
                  {s.unit && s.v !== "-" && <small>{s.unit}</small>}
                </span>
                <span className="livews__stat-k">{s.k}</span>
              </div>
            ))}
          </div>

          {wide ? (
            <ResizablePanes
              id={`live-m${modul}`}
              className="livews__panes"
              handleLabel={t.handle}
              panes={[
                { id: "flow", label: t.flow, content: flow, defaultSize: 38, minSize: 24 },
                {
                  id: "readings",
                  label: t.readings,
                  content: readings,
                  defaultSize: 34,
                  minSize: 22,
                },
                {
                  id: "layers",
                  label: t.layers,
                  content: layerPanel,
                  defaultSize: 28,
                  minSize: 18,
                  collapsible: true,
                },
              ]}
            />
          ) : (
            <div className="livews__stack">
              {flow}
              {readings}
              <button
                type="button"
                className="btn btn--secondary livews__layers-toggle"
                aria-expanded={showLayers}
                onClick={() => setShowLayers((v) => !v)}
              >
                {showLayers ? t.hideLayers : t.showLayers}
              </button>
              {showLayers && layerPanel}
            </div>
          )}
        </>
      ) : (
        <div className="livews__card livews__try">
          <p className="hint">{t.tryHint}</p>
          <LiveSandbox modul={modul} groups={[group]} layers={layers} lang={lang} />
        </div>
      )}
    </div>
  );
}
