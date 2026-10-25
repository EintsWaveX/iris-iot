/**
 * The score distributions of the Penilaian tab (prompt 13): one histogram
 * for each part and one for the total, drawn by the dataviz rules. One
 * series each, so one hue (the site's accent); thin bars with rounded tops
 * and a 2px gap; a recessive baseline; the numbers are in the table view
 * behind a button and in the readout line that follows the pointer or the
 * keyboard focus. Text wears text tokens, never the series colour.
 */
import { useMemo, useState } from "react";
import type { Lang } from "../../../../../lib/kelas";
import { histogram } from "../../../../../lib/recruitment/score-table";
import type { ScoreRow } from "../../../../../lib/recruitment/score-api";
import { PN } from "./penilaianStrings";

interface Seri {
  key: string;
  name: string;
  cap: number;
  values: number[];
}

/** The series the tab draws, from the rows: pending and absent scores are left out, not counted as 0. */
export function seriesDari(rows: readonly ScoreRow[], lang: Lang): Seri[] {
  const t = PN[lang];
  const menunggu = (r: ScoreRow) => r.liveFlag === "belum" || r.liveFlag === "rubrik";
  const part = (k: "logika" | "fitb") =>
    rows.filter((r) => r.parts[k].flag !== "absent").map((r) => r.parts[k].score);
  return [
    { key: "logika", name: t.col.logika, cap: 1000, values: part("logika") },
    { key: "fitb", name: t.col.fitb, cap: 1000, values: part("fitb") },
    {
      key: "debugging",
      name: t.col.debugging,
      cap: 1000,
      values: rows
        .filter((r) => r.parts.kodingan.flag !== "absent" || r.parts.mikro.flag !== "absent")
        .map((r) => r.debugging),
    },
    {
      key: "livecode",
      name: t.col.livecode,
      cap: 1000,
      values: rows.flatMap((r) =>
        r.livecode !== null && r.liveFlag !== "tanpa" ? [r.livecode] : [],
      ),
    },
    {
      key: "total",
      name: t.col.total,
      cap: 4000,
      values: rows.filter((r) => !menunggu(r)).map((r) => r.total),
    },
  ];
}

const median = (xs: readonly number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const W = 320;
const H = 132;
const PAD = { l: 28, r: 6, t: 10, b: 20 };

function Grafik({ lang, s }: { lang: Lang; s: Seri }) {
  const t = PN[lang];
  const bins = useMemo(() => histogram(s.values, s.cap, 10), [s]);
  const [fokus, setFokus] = useState<number | null>(null);
  const [tabel, setTabel] = useState(false);
  const maks = Math.max(1, ...bins.map((b) => b.n));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const bw = iw / bins.length;
  const avg = s.values.length
    ? Math.round(s.values.reduce((a, b) => a + b, 0) / s.values.length)
    : 0;
  const b = fokus === null ? null : bins[fokus];

  return (
    <figure className="sc-chart">
      <figcaption className="sc-chart__head">
        <b>{t.spreadFor(s.name, s.values.length)}</b>
        {s.values.length > 0 && (
          <span className="hint num">
            {t.median} {median(s.values)} · {t.average} {avg}
          </span>
        )}
      </figcaption>
      {s.values.length === 0 ? (
        <p className="hint">{t.spreadNone}</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="sc-chart__svg"
            role="img"
            aria-label={t.spreadFor(s.name, s.values.length)}
          >
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={PAD.t + ih}
              y2={PAD.t + ih}
              className="sc-chart__axis"
            />
            <text x={PAD.l - 6} y={PAD.t + 4} textAnchor="end" className="sc-chart__tick">
              {maks}
            </text>
            <text x={PAD.l - 6} y={PAD.t + ih} textAnchor="end" className="sc-chart__tick">
              0
            </text>
            <text x={PAD.l} y={H - 5} className="sc-chart__tick">
              0
            </text>
            <text x={W - PAD.r} y={H - 5} textAnchor="end" className="sc-chart__tick">
              {s.cap}
            </text>
            {bins.map((bin, i) => {
              const h = bin.n === 0 ? 0 : Math.max(3, (bin.n / maks) * ih);
              const x = PAD.l + i * bw + 1;
              return (
                <g key={i}>
                  {/* the hit target is the whole column, taller than the mark */}
                  <rect
                    x={PAD.l + i * bw}
                    y={PAD.t}
                    width={bw}
                    height={ih}
                    className="sc-chart__hit"
                    tabIndex={0}
                    role="img"
                    aria-label={t.bin(Math.round(bin.from), Math.round(bin.to), bin.n)}
                    onPointerEnter={() => setFokus(i)}
                    onPointerLeave={() => setFokus(null)}
                    onFocus={() => setFokus(i)}
                    onBlur={() => setFokus(null)}
                  />
                  {h > 0 && (
                    <rect
                      x={x}
                      y={PAD.t + ih - h}
                      width={Math.max(1, bw - 2)}
                      height={h}
                      rx={3}
                      className="sc-chart__bar"
                      data-on={fokus === i ? "yes" : "no"}
                    />
                  )}
                </g>
              );
            })}
          </svg>
          <span className="hint num sc-chart__read" aria-live="polite">
            {b ? t.bin(Math.round(b.from), Math.round(b.to), b.n) : " "}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-expanded={tabel}
            onClick={() => setTabel(!tabel)}
          >
            {tabel ? t.hideTable : t.table}
          </button>
          {tabel && (
            <table className="sc-table sc-table--mini">
              <thead>
                <tr>
                  <th>{t.binHead}</th>
                  <th className="num">{t.countHead}</th>
                </tr>
              </thead>
              <tbody>
                {bins.map((bin, i) => (
                  <tr key={i}>
                    <td className="num">
                      {Math.round(bin.from)} - {Math.round(bin.to)}
                    </td>
                    <td className="num">{bin.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </figure>
  );
}

export default function Sebaran({ lang, rows }: { lang: Lang; rows: readonly ScoreRow[] }) {
  const t = PN[lang];
  const seri = useMemo(() => seriesDari(rows, lang), [rows, lang]);
  return (
    <div className="stack">
      <p className="hint">{t.spreadLede}</p>
      <div className="sc-charts">
        {seri.map((s) => (
          <Grafik key={s.key} lang={lang} s={s} />
        ))}
      </div>
    </div>
  );
}
