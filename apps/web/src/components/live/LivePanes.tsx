/**
 * The Live room's panes (Phase 9 Stage 7e): the value cards, the Serial
 * Monitor with source tabs, the message flow and the readings table.
 */
import { useBaru } from "../ui/Sorot";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRightIcon, CopySimpleIcon, FileCsvIcon, UsbIcon } from "@phosphor-icons/react";
import IconButton from "../ui/IconButton";
import Nil from "../ui/Nil";
import Popover from "../ui/Popover";
import TabLine from "../ui/TabLine";
import type { Lang } from "../../lib/kelas";
import { recordStats, type LiveRecord } from "../../lib/live-records";
import type { LogLine } from "./useSerialBoard";
import { LV } from "./liveStrings";
import DataModal, { type DataKind } from "./DataModal";

/** A card's value, or the muted Belum ada (ui/Nil.tsx). */
const dash = (v: number | string | null | undefined): ReactNode =>
  v === null || v === undefined ? <Nil /> : v;
/** The same for a dense row or a small pair: a muted dot read as Belum ada. */
const dot = (v: number | string | null | undefined): ReactNode =>
  v === null || v === undefined ? <Nil dot /> : v;

/* ------------------------------------------------------------ visuals */

export function Spark({ vals }: { vals: number[] }) {
  if (vals.length < 2) return <span className="vspark" aria-hidden="true" />;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const sp = hi - lo || 1;
  const pts = vals
    .map((v, i) => `${(i / (vals.length - 1)) * 100},${26 - ((v - lo) / sp) * 22}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="vspark" aria-hidden="true">
      <polyline points={pts} />
    </svg>
  );
}

function Dial({ p }: { p: number }) {
  const a = Math.PI * (1 - Math.max(0, Math.min(100, p)) / 100);
  return (
    <svg viewBox="0 0 100 56" className="vdial" aria-hidden="true">
      <path d="M8 50 A42 42 0 0 1 92 50" className="vdial__track" />
      <path
        d={`M8 50 A42 42 0 0 1 ${50 + 42 * Math.cos(a)} ${50 - 42 * Math.sin(a)}`}
        className="vdial__fill"
      />
    </svg>
  );
}

export function VCard({
  label,
  v,
  unit,
  sub,
  tone,
  children,
  onOpen,
  openLabel,
}: {
  label: string;
  v: ReactNode;
  unit?: string;
  sub?: string;
  tone?: "ok" | "warn";
  children?: ReactNode;
  /** Opens the card's data modal (mockup G2). */
  onOpen?: () => void;
  openLabel?: string;
}) {
  const inner = (
    <>
      <span className="vcard__l">{label}</span>
      <span className="vcard__v num">
        {v}
        {unit && (typeof v === "string" || typeof v === "number") && <small>{unit}</small>}
      </span>
      {children}
      {sub && <span className="vcard__s">{sub}</span>}
    </>
  );
  if (!onOpen)
    return (
      <div className="vcard" data-tone={tone}>
        {inner}
      </div>
    );
  return (
    <button
      type="button"
      className="vcard vcard--btn"
      data-tone={tone}
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={openLabel}
    >
      {inner}
    </button>
  );
}

function TimeCard({ label, r, a, b }: { label: string; r?: LiveRecord; a: string; b: string }) {
  return (
    <div className="vcard vcard--wide">
      <span className="vcard__l">{label}</span>
      <span className="vtimes">
        <span>
          <small>{a}</small>
          <b className="mono">{dot(r?.tx)}</b>
        </span>
        <ArrowRightIcon size={16} aria-hidden="true" />
        <span>
          <small>{b}</small>
          <b className="mono">{dot(r?.rx)}</b>
        </span>
      </span>
    </div>
  );
}

/* --------------------------------------------------------- value cards */

export function ValueCards({
  lang,
  modul,
  records,
  group,
  live,
}: {
  lang: Lang;
  modul: number;
  records: LiveRecord[];
  group: number;
  live: boolean;
}) {
  const t = LV[lang];
  const [dm, setDm] = useState<DataKind | null>(null);
  const buka = (k: DataKind, label: string) => ({
    onOpen: () => setDm(k),
    openLabel: t.openData(label),
  });
  const modal = dm && (
    <DataModal
      lang={lang}
      modul={modul}
      kind={dm}
      records={records}
      sub={t.liveSub(group, live)}
      open
      onOpenChange={(o) => !o && setDm(null)}
    />
  );
  const rows = records.slice(-40);
  const s = recordStats(rows);
  const ok = rows.filter((r) => !r.lost);
  const last = [...ok].reverse().find((r) => r.rx !== null || r.rtt !== null) ?? ok.at(-1);
  const n = (k: string) => last?.nilai[k] ?? null;
  const series = (f: (r: LiveRecord) => number | null | undefined) =>
    ok.map(f).filter((x): x is number => typeof x === "number");

  const delay = (
    <VCard
      label={t.oneway}
      v={dash(last?.oneway)}
      unit="ms"
      sub={t.average(s.oneway)}
      {...buka("oneway", t.oneway)}
    >
      <Spark vals={series((r) => r.oneway)} />
    </VCard>
  );
  const quality = (
    <VCard
      label={t.quality}
      v={s.lost}
      unit={t.lostPct}
      sub={t.jitter(s.jitter)}
      tone={s.lost > 5 ? "warn" : undefined}
    />
  );
  const rtt = (
    <VCard
      label={t.rtt}
      v={dash(last?.rtt)}
      unit="ms"
      sub={t.average(s.rtt)}
      {...buka("rtt", t.rtt)}
    />
  );

  if (modul === 1) {
    const led = n("led") ?? n("tombol");
    const tombol = n("tombol");
    return (
      <div className="vcards">
        <VCard
          label={t.ledState}
          v={led === null ? <Nil /> : led ? t.on : t.off}
          unit={led === null ? undefined : `(${led})`}
          tone={led ? "ok" : undefined}
          sub={t.fromPeripheral}
        />
        <VCard
          label={t.button}
          v={tombol === null ? <Nil /> : tombol ? t.pressed : t.released}
          sub={t.onCentral}
        />
        <TimeCard label={t.times} r={last} a="Central" b="Peripheral" />
        {delay}
        {rtt}
        {quality}
        {modal}
      </div>
    );
  }
  if (modul === 2) {
    return (
      <div className="vcards">
        <VCard label={t.temp} v={dash(n("suhu"))} unit="°C" {...buka("suhu", t.temp)}>
          <Spark vals={series((r) => r.nilai.suhu)} />
        </VCard>
        <VCard label={t.hum} v={dash(n("lembap"))} unit="%" {...buka("lembap", t.hum)}>
          <Spark vals={series((r) => r.nilai.lembap)} />
        </VCard>
        <TimeCard label={t.times} r={last} a="ESP32" b="Orange Pi" />
        {delay}
        {rtt}
        {quality}
        {modal}
      </div>
    );
  }
  if (modul === 3) {
    const pos = n("posisi");
    return (
      <div className="vcards">
        <VCard label={t.position} v={dash(pos)} unit="%" {...buka("posisi", t.position)}>
          {pos !== null && <Dial p={pos} />}
        </VCard>
        <VCard label={t.sampleNo} v={last ? `#${last.seq}` : <Nil />} sub={t.sampleSub} />
        <TimeCard label={t.times} r={last} a="Publisher" b="Subscriber" />
        {delay}
        {quality}
        {modal}
      </div>
    );
  }
  const halus = n("rssiHalus");
  const tren = n("tren");
  const closer = tren === null ? null : tren > 0;
  return (
    <div className="vcards">
      <VCard
        label="RSSI"
        v={dash(last?.rssi)}
        unit="dBm"
        sub={t.smoothed(halus)}
        {...buka("rssi", "RSSI")}
      >
        <Spark vals={series((r) => r.nilai.rssiHalus ?? r.rssi)} />
      </VCard>
      <VCard label="SNR" v={dash(last?.snr)} unit="dB" {...buka("snr", "SNR")} />
      <VCard
        label={t.distance}
        v={dash(n("jarak"))}
        unit="m"
        sub={closer === null ? undefined : closer ? t.closer : t.farther}
        {...buka("jarak", t.distance)}
        tone={closer === null ? undefined : closer ? "ok" : "warn"}
      />
      <TimeCard label={t.times} r={last} a="Beacon" b="Hunter" />
      {delay}
      {quality}
      {modal}
    </div>
  );
}

/* ------------------------------------------------------- Serial Monitor */

export interface Source {
  k: string;
  label: string;
  lines: LogLine[];
  /** A hint under the tab line while this source is open. */
  note?: string;
  /** Shown in place of "waiting" when this source has no lines. */
  empty?: string;
}

function Help({ lang, modul }: { lang: Lang; modul: number }) {
  const t = LV[lang];
  return (
    <Popover
      align="end"
      trigger={
        <button type="button" className="btn btn--ghost btn--sm">
          {t.noLines}
        </button>
      }
    >
      <div className="serial__help">
        <b>{t.emptyTitle}</b>
        <ol className="helplist">
          {t.help(modul).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      </div>
    </Popover>
  );
}

export function SerialMonitor({
  lang,
  modul,
  sources,
  role,
}: {
  lang: Lang;
  modul: number;
  sources: Source[];
  /** own: a Praktikan on their own group; other: on another group; asisten. */
  role: "own" | "other" | "asisten";
}) {
  const t = LV[lang];
  const [tab, setTab] = useState("all");
  const [follow, setFollow] = useState(true);
  const box = useRef<HTMLDivElement | null>(null);
  const cur = sources.find((s) => s.k === tab);
  const lines = useMemo(() => {
    if (tab !== "all") return (cur?.lines ?? []).map((l) => ({ ...l, src: tab }));
    return sources
      .flatMap((s) => s.lines.map((l) => ({ ...l, src: s.k })))
      .sort((a, b) => a.t - b.t)
      .slice(-300);
  }, [tab, sources, cur]);

  useLayoutEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  });

  if (role === "other") {
    return (
      <div className="serial">
        <div className="serial__empty">
          <UsbIcon size={28} aria-hidden="true" />
          <b>{t.ownOnly}</b>
          <span className="hint">{t.ownOnlyBody}</span>
        </div>
      </div>
    );
  }
  if (!sources.length) {
    return (
      <div className="serial">
        <div className="serial__empty">
          <UsbIcon size={28} aria-hidden="true" />
          <span className="hint">{t.noPiLines}</span>
        </div>
      </div>
    );
  }

  const tabs = [
    { v: "all", label: t.combined },
    ...sources.map((s) => ({ v: s.k, label: s.label })),
  ];
  const tag = (k: string) =>
    k === "pi" ? "Pi" : k === "mir" ? "PC" : String(Number(k.slice(1)) + 1);
  const boardEmpty = role === "own" && cur && cur.k !== "pi" && cur.lines.length === 0;

  return (
    <div className="serial">
      <div className="serial__bar">
        <TabLine seg value={tab} onChange={setTab} label={t.source} tabs={tabs} />
        <Help lang={lang} modul={modul} />
      </div>
      {cur?.note && <p className="hint">{cur.note}</p>}
      {boardEmpty ? (
        <div className="serial__empty">
          <UsbIcon size={28} aria-hidden="true" />
          <b>{t.plugTitle}</b>
          <span className="hint">{t.plugBody(modul)}</span>
        </div>
      ) : (
        <div
          className="serial__log mono"
          ref={box}
          role="log"
          aria-live="off"
          aria-label={t.serial}
          tabIndex={0}
          onScroll={(e) => {
            const el = e.currentTarget;
            setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
          }}
        >
          {lines.length === 0 ? (
            <p className="serial__wait">{cur?.empty ?? t.waiting}</p>
          ) : (
            lines.map((x) => (
              <div className="sline" data-src={x.src} key={`${x.src}-${x.id}`}>
                {tab === "all" && sources.length > 1 && (
                  <span className="sline__src">{tag(x.src)}</span>
                )}
                <span>{x.text}</span>
              </div>
            ))
          )}
        </div>
      )}
      {!follow && (
        <button type="button" className="serial__follow" onClick={() => setFollow(true)}>
          {t.follow}
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------- flow, readings */

export function FlowPane({ lang, records }: { lang: Lang; records: LiveRecord[] }) {
  const t = LV[lang];
  const rows = records.slice(-12).reverse();
  if (!rows.length) return <p className="hint">{t.waitingMsg}</p>;
  const max = Math.max(120, ...rows.map((r) => r.oneway ?? r.rtt ?? 0));
  return (
    <div className="flow">
      {rows.map((r) => {
        const d = r.oneway ?? r.rtt;
        return (
          <div className="flow__row" key={r.seq} data-lost={r.lost ? "yes" : "no"}>
            <span className="mono hint">#{r.seq}</span>
            <span className="flow__bar">
              <i
                style={{
                  width: `${r.lost ? 100 : d === null ? 0 : Math.min(100, (d / max) * 100)}%`,
                }}
              />
            </span>
            <b className="num">{r.lost ? t.lost : d === null ? <Nil dot /> : `${d} ms`}</b>
          </div>
        );
      })}
    </div>
  );
}

type Tl = (typeof LV)["id"];
const VALS = (t: Tl): Record<number, [string, (r: LiveRecord) => number | null | undefined][]> => ({
  1: [["LED", (r) => r.nilai.led ?? r.nilai.tombol]],
  2: [
    [`${t.temp} (°C)`, (r) => r.nilai.suhu],
    [`${t.hum} (%)`, (r) => r.nilai.lembap],
  ],
  3: [[`${t.position} (%)`, (r) => r.nilai.posisi]],
  4: [
    ["RSSI (dBm)", (r) => r.rssi],
    ["SNR (dB)", (r) => r.snr],
  ],
});

export function ReadingsPane({
  lang,
  modul,
  group,
  records,
}: {
  lang: Lang;
  modul: number;
  group: number;
  records: LiveRecord[];
}) {
  const t = LV[lang];
  const rows = records.slice(-30);
  const cols = VALS(t)[modul] ?? [];
  // A reading that lands while the table is open slides in at the top.
  const baru = useBaru(rows.map((r) => r.seq));
  const head = ["#", ...cols.map(([h]) => h), t.sent, t.received, `${t.delay} (ms)`];
  const tsv = () =>
    [
      head.join("\t"),
      ...rows.map((r) =>
        [
          r.seq,
          ...cols.map(([, f]) => f(r) ?? ""),
          r.tx ?? "",
          r.lost ? t.lost : (r.rx ?? ""),
          r.oneway ?? r.rtt ?? "",
        ].join("\t"),
      ),
    ].join("\n");
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
  if (!rows.length) return <p className="hint">{t.waitingMsg}</p>;
  return (
    <div className="stack readings">
      <div className="row row--end">
        <IconButton sm icon={CopySimpleIcon} label={t.copy} onClick={() => void salin()} />
        <IconButton sm icon={FileCsvIcon} label={t.csv} onClick={unduh} />
      </div>
      <div className="readings__scroll">
        <table className="table table--tight">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.seq} data-baru={baru.has(String(r.seq)) ? "yes" : undefined}>
                <td className="mono">{r.seq}</td>
                {cols.map(([h, f]) => (
                  <td key={h} className="num">
                    {dot(f(r))}
                  </td>
                ))}
                <td className="mono hint">{dot(r.tx)}</td>
                <td className="mono hint">{r.lost ? <Nil dot /> : dot(r.rx)}</td>
                <td className="num">
                  {r.lost ? (
                    <span className="readings__lost">{t.lost}</span>
                  ) : (
                    dot(r.oneway ?? r.rtt)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
