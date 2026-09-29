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
 */
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ClipboardCopy,
  Download,
  Layers,
  Pause,
  Play,
  Radio,
  Sparkles,
} from "lucide-react";
import GroupPicker from "../ui/GroupPicker";
import ResizablePanes from "../ui/ResizablePanes";
import ScrollArea from "../ui/ScrollArea";
import SegmentedControl from "../ui/SegmentedControl";
import { UpdatedAgo } from "../ui/Display";
import LiveSandbox from "../LiveSandbox";
import { useMe } from "../../lib/app";
import { useMinWidth } from "../../lib/hooks";
import { RAILS, describeLayers, type Reading } from "../../lib/telemetry-sim";
import type { Lang } from "../../lib/kelas";
import { flowStats, useTelemetry } from "./useTelemetry";
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
    cols: ["#", "Kirim", "Terima", "Δ (ms)", "RSSI (dBm)"],
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
    cols: ["#", "Sent", "Received", "Δ (ms)", "RSSI (dBm)"],
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

function toTsv(rows: Reading[], lost: string): string {
  const header = "seq\tkirim\tterima\tdelta_ms\trssi_dbm";
  return [
    header,
    ...rows.map(
      (r) => `${r.seq}\t${r.tx ?? ""}\t${r.rx ?? lost}\t${r.delayMs ?? ""}\t${r.rssi ?? ""}`,
    ),
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
  const rows = history.slice(-24).reverse();
  return (
    <div className="livews__card" style={{ "--tile-hue": hue } as React.CSSProperties}>
      <h2 className="livews__h">
        <Activity size={17} aria-hidden="true" />
        {t.flow}
      </h2>
      <div className="flow-lanes">
        {lanes.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="flow-diagram__kosong">{t.waiting}</p>
      ) : (
        <div className="flow-rows livews__rows">
          {rows.map((r) => (
            <div key={r.seq} className="flow-row" data-hilang={r.rx === null ? "yes" : "no"}>
              <span className="flow-seq">#{r.seq}</span>
              <div className="flow-arrow">
                <span className="flow-label">
                  {r.rx === null ? `${t.lost} ✖` : `Δ ${r.delayMs ?? "?"} ms`}
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
  const rows = history.slice(-30).reverse();
  async function salin() {
    try {
      await navigator.clipboard.writeText(toTsv(rows, t.lost));
      window.Toast?.show(t.copied, "ok");
    } catch {
      window.Toast?.show(t.copyFail, "danger");
    }
  }
  function unduh() {
    const blob = new Blob([toTsv(rows, t.lost).replace(/\t/g, ",")], { type: "text/csv" });
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
        <h2 className="livews__h">
          <Radio size={17} aria-hidden="true" />
          {t.readings}
        </h2>
        <div className="row">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={salin}
            disabled={!rows.length}
          >
            <ClipboardCopy size={15} aria-hidden="true" />
            {t.copy}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={unduh}
            disabled={!rows.length}
          >
            <Download size={15} aria-hidden="true" />
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
                {t.cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.seq} data-hilang={r.rx === null ? "yes" : "no"}>
                  <td>{r.seq}</td>
                  <td>{r.tx ?? "-"}</td>
                  <td>{r.rx ?? t.lost}</td>
                  <td>{r.delayMs ?? "-"}</td>
                  <td>{r.rssi ?? "-"}</td>
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
      <h2 className="livews__h">
        <Layers size={17} aria-hidden="true" />
        {t.layers}
      </h2>
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

  const tel = useTelemetry(modul, group, paused || mode !== "live");
  const stats = useMemo(() => flowStats(tel.history), [tel.history]);
  const last = tel.history[tel.history.length - 1];
  const hue = `var(--group-${group})`;

  const tiles: { k: string; v: string; unit?: string; bad?: boolean }[] = [
    { k: t.avg, v: stats.avg == null ? "-" : String(stats.avg), unit: "ms" },
    { k: t.jitter, v: stats.jitter == null ? "-" : String(stats.jitter), unit: "ms" },
    { k: t.loss, v: `${stats.loss}`, unit: "%", bad: stats.loss > 10 },
    { k: t.rssi, v: stats.rssi == null ? "-" : String(stats.rssi), unit: "dBm" },
    ...(modul === 4
      ? [{ k: t.snr, v: stats.snr == null ? "-" : String(stats.snr), unit: "dB" }]
      : []),
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

      {mode === "live" ? (
        <>
          <div className="livews__status">
            <span className={`pill ${tel.live ? "pill--ok" : "pill--mono"}`}>
              <span
                className={`dot ${tel.live ? "dot--ok dot--pulse" : "dot--off"}`}
                aria-hidden="true"
              />
              {tel.live ? t.live : t.sim}
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
                <Layers size={17} aria-hidden="true" />
                {showLayers ? t.hideLayers : t.showLayers}
              </button>
              {showLayers && layerPanel}
            </div>
          )}
        </>
      ) : (
        <div className="livews__card livews__try">
          <p className="hint">
            <Sparkles size={15} aria-hidden="true" /> {t.tryHint}
          </p>
          <LiveSandbox modul={modul} groups={[group]} layers={layers} lang={lang} />
        </div>
      )}
    </div>
  );
}
