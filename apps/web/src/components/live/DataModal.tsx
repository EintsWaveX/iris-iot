/**
 * A Live value card's detail (Phase 9, mockup G2 "data cards open a detail
 * modal sized to their data"): the numbers behind the card over every
 * message this page still holds, as stats, a time chart with one crosshair
 * (ZoomChart, one panel per measure, never two scales on one plot) and the
 * newest readings, with a CSV of the same rows.
 */
import { useMemo } from "react";
import Dialog from "../ui/Dialog";
import ZoomChart, { useZoom, type Panel, type Titik } from "../server/ZoomChart";
import { localeOf } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { jamMs, type LiveRecord } from "../../lib/live-records";
import { LV } from "./liveStrings";

export type DataKind = "oneway" | "rtt" | "suhu" | "lembap" | "posisi" | "rssi" | "snr" | "jarak";

interface Measure {
  k: string;
  label: string;
  unit: string;
  c: string;
  dp: number;
  get: (r: LiveRecord) => number | null | undefined;
}

const num = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Milliseconds since the epoch for a record's receive (else send) time,
 *  on today's date in WIB. */
function waktu(r: LiveRecord, tengahMalam: number): number | null {
  const ms = jamMs(r.rx) ?? jamMs(r.tx);
  return ms === null ? null : tengahMalam + ms;
}

function rentang(vals: number[]): [number, number] {
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.1;
  return [lo - pad, hi + pad];
}

function statsOf(vals: number[]) {
  const s = [...vals].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return {
    now: vals[vals.length - 1],
    min: s[0],
    max: s[s.length - 1],
    mean: vals.reduce((a, b) => a + b, 0) / vals.length,
    p50: q(0.5),
    p95: q(0.95),
  };
}

export default function DataModal({
  lang,
  modul,
  kind,
  records,
  sub,
  open,
  onOpenChange,
}: {
  lang: Lang;
  modul: number;
  kind: DataKind;
  records: LiveRecord[];
  /** "Group 4 · live data" */
  sub: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = LV[lang];
  const loc = localeOf(lang);
  const fmt = (v: number | null, dp: number) =>
    v === null
      ? "-"
      : v.toLocaleString(loc, { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const M: Record<string, Measure> = {
    oneway: {
      k: "oneway",
      label: t.oneway,
      unit: "ms",
      c: "var(--accent)",
      dp: 0,
      get: (r) => r.oneway,
    },
    rtt: { k: "rtt", label: t.rtt, unit: "ms", c: "var(--accent)", dp: 0, get: (r) => r.rtt },
    suhu: {
      k: "suhu",
      label: t.temp,
      unit: "°C",
      c: "var(--mod-2)",
      dp: 1,
      get: (r) => r.nilai.suhu,
    },
    lembap: {
      k: "lembap",
      label: t.hum,
      unit: "%",
      c: "var(--mod-2)",
      dp: 0,
      get: (r) => r.nilai.lembap,
    },
    posisi: {
      k: "posisi",
      label: t.position,
      unit: "%",
      c: "var(--mod-3)",
      dp: 0,
      get: (r) => r.nilai.posisi,
    },
    rssi: {
      k: "rssi",
      label: "RSSI",
      unit: "dBm",
      c: "var(--mod-4)",
      dp: 0,
      get: (r) => r.rssi,
    },
    rssiHalus: {
      k: "rssiHalus",
      label: t.smoothedL,
      unit: "dBm",
      c: "var(--mod-4)",
      dp: 1,
      get: (r) => r.nilai.rssiHalus,
    },
    snr: { k: "snr", label: "SNR", unit: "dB", c: "var(--mod-4)", dp: 1, get: (r) => r.snr },
    jarak: {
      k: "jarak",
      label: t.distance,
      unit: "m",
      c: "var(--mod-4)",
      dp: 1,
      get: (r) => r.nilai.jarak,
    },
  };
  // Two measures share one timeline; a second one only when it has data.
  const pasangan =
    kind === "suhu" || kind === "lembap"
      ? [M.suhu, M.lembap]
      : kind === "rssi"
        ? [M.rssi, M.rssiHalus]
        : [M[kind]];
  const ukur = pasangan.filter((m, i) => i === 0 || records.some((r) => num(m.get(r)) !== null));
  const judul = kind === "suhu" || kind === "lembap" ? t.dmTempHum : ukur[0].label;

  const { seri, baris } = useMemo(() => {
    const now = Date.now();
    const wib = 7 * 3_600_000;
    const tengahMalam = now - ((now + wib) % 86_400_000);
    const ok = records.filter((r) => !r.lost);
    const seri: Titik[] = [];
    for (const r of ok) {
      const tt = waktu(r, tengahMalam);
      if (tt === null) continue;
      const v: Record<string, number | null> = {};
      let ada = false;
      for (const m of ukur) {
        v[m.k] = num(m.get(r));
        if (v[m.k] !== null) ada = true;
      }
      if (ada) seri.push({ t: tt, v });
    }
    return { seri, baris: ok.filter((r) => ukur.some((m) => num(m.get(r)) !== null)) };
  }, [records, kind, lang]);

  const zoom = useZoom(seri.length);
  const panels: Panel[] = ukur.map((m) => {
    const vals = seri.map((p) => p.v[m.k]).filter((x): x is number => x !== null);
    const [lo, hi] = vals.length ? rentang(vals) : [0, 1];
    return {
      k: m.k,
      label: m.label,
      judul: `${m.label} · ${m.unit}`,
      lo,
      hi,
      c: m.c,
      unit: m.unit,
      dp: m.dp,
    };
  });

  const delay = kind === "oneway" || kind === "rtt";
  const statBlocks = ukur.map((m) => {
    const vals = baris.map((r) => num(m.get(r))).filter((x): x is number => x !== null);
    if (!vals.length) return null;
    const s = statsOf(vals);
    const items: [string, number][] = delay
      ? [
          [t.now, s.now],
          ["p50", s.p50],
          ["p95", s.p95],
          [t.averageL, s.mean],
        ]
      : [
          [t.now, s.now],
          [t.lowest, s.min],
          [t.highest, s.max],
          [t.averageL, s.mean],
        ];
    return { m, items, p95: s.p95 };
  });

  const lambat = (() => {
    if (!delay || !statBlocks[0]) return [];
    const m = ukur[0];
    const p95 = statBlocks[0].p95;
    return baris
      .filter((r) => (num(m.get(r)) ?? -Infinity) > p95)
      .slice(-4)
      .reverse();
  })();

  const terbaru = baris.slice(-8).reverse();

  function unduh() {
    const head = [t.received, ...ukur.map((m) => `${m.label} (${m.unit})`)];
    const rows = baris.map((r) => [r.rx ?? r.tx ?? "", ...ukur.map((m) => num(m.get(r)) ?? "")]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `modul${modul}-${kind}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={judul}
      description={sub}
      size="xl"
      lang={lang}
      alt={
        <button type="button" className="btn btn--ghost" onClick={unduh} disabled={!baris.length}>
          {t.csv}
        </button>
      }
      actions={
        <button type="button" className="btn btn--primary" onClick={() => onOpenChange(false)}>
          {t.done}
        </button>
      }
    >
      <div className="dmodal">
        <p className="hint">{t.window(records.length)}</p>
        {statBlocks.map(
          (b) =>
            b && (
              <div key={b.m.k} className="dmodal__stats">
                {ukur.length > 1 && <b className="dmodal__cap">{b.m.label}</b>}
                <div className="stats">
                  {b.items.map(([l, v]) => (
                    <div key={l} className="stat">
                      <b className="num">
                        {fmt(v, b.m.dp)} <small className="hint">{b.m.unit}</small>
                      </b>
                      <span>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            ),
        )}
        <ZoomChart
          seri={seri}
          panels={panels}
          zoom={zoom}
          lang={lang}
          detik
          sm={ukur.length === 1}
          label={`${t.timeline}: ${judul}`}
          empty={t.noChart}
        />
        {ukur.length > 1 && <p className="hint">{t.oneTimeline}</p>}
        {lambat.length > 0 && (
          <div className="dmodal__slow">
            <h3 className="dmodal__cap">{t.slowest}</h3>
            <ul>
              {lambat.map((r) => (
                <li key={r.seq}>
                  <span className="dmodal__ms num">{fmt(num(ukur[0].get(r)), 0)} ms</span>
                  <span className="hint mono">
                    {r.rx ?? r.tx} · #{r.seq}
                  </span>
                </li>
              ))}
            </ul>
            <span className="hint">{t.slowHint}</span>
          </div>
        )}
        {terbaru.length > 0 && (
          <div className="readings">
            <table>
              <thead>
                <tr>
                  <th>{t.received}</th>
                  <th>#</th>
                  {ukur.map((m) => (
                    <th key={m.k} className="num">
                      {m.label} ({m.unit})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {terbaru.map((r) => (
                  <tr key={r.seq}>
                    <td className="mono">{r.rx ?? r.tx ?? "-"}</td>
                    <td className="num">{r.seq}</td>
                    {ukur.map((m) => (
                      <td key={m.k} className="num">
                        {fmt(num(m.get(r)), m.dp)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}
