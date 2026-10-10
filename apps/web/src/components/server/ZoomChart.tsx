/**
 * The Server page's time chart (Phase 9 Stage 5, mockup v-over "Chart").
 * Small multiples, never two scales on one plot: each metric gets its own
 * stacked panel with its own range, and zoom and pan move every panel
 * together. Scroll to zoom, drag to pan, double click to reset; the card's
 * own buttons call the same `useZoom` controls. Hovering shows one
 * crosshair across the panels with the time and each value.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { localeOf } from "../../lib/app";
import "./ZoomChart.css";
import type { Lang } from "../../lib/kelas";
import Nil from "../ui/Nil";

export interface Titik {
  t: number;
  v: Record<string, number | null>;
}

export interface Panel {
  k: string;
  label: string;
  /** The panel's caption with its range, e.g. "CPU · 0 to 100 %". */
  judul: string;
  lo: number;
  hi: number;
  /** A CSS colour, e.g. "var(--accent)". */
  c: string;
  unit: string;
  /** Decimals in the tooltip (0 by default). */
  dp?: number;
  /** Values above this get a warning band. */
  batas?: number;
}

const MIN_TITIK = 8;

/** Index window [a, b] over n points, with zoom and pan helpers. */
export function useZoom(n: number) {
  const [dom, setDom] = useState<[number, number]>([0, Math.max(0, n - 1)]);
  useEffect(() => setDom([0, Math.max(0, n - 1)]), [n]);
  const clamp = (a: number, b: number): [number, number] => {
    const w = Math.min(Math.max(MIN_TITIK, b - a), Math.max(0, n - 1));
    const s = Math.max(0, Math.min(a, n - 1 - w));
    return [s, Math.min(n - 1, s + w)];
  };
  return {
    dom,
    zoomed: n > 1 && (dom[0] > 0 || dom[1] < n - 1),
    zoom(f: number, cx?: number) {
      setDom(([a, b]) => {
        const c = cx ?? (a + b) / 2;
        return clamp(c - (c - a) * f, c + (b - c) * f);
      });
    },
    pan(a: number, b: number) {
      setDom(clamp(a, b));
    },
    reset() {
      setDom([0, Math.max(0, n - 1)]);
    },
  };
}

export type Zoom = ReturnType<typeof useZoom>;

const W = 600;
const GAP = 28;

export default function ZoomChart({
  seri,
  panels,
  zoom,
  lang,
  harian,
  detik,
  sm,
  label,
  empty,
}: {
  seri: Titik[];
  panels: Panel[];
  zoom: Zoom;
  lang: Lang;
  /** Label the time axis with dates instead of clock times. */
  harian?: boolean;
  /** Clock times with seconds (live data a few seconds apart). */
  detik?: boolean;
  sm?: boolean;
  label: string;
  empty: string;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; d: [number, number] } | null>(null);
  const [hover, setHover] = useState<{ f: number; x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const H = sm ? 220 : 270;
  const ph = (H - GAP * (panels.length - 1)) / panels.length;
  const [a, b] = zoom.dom;
  const vis = seri.slice(Math.round(a), Math.round(b) + 1);
  const x = (i: number) => (i / Math.max(1, vis.length - 1)) * W;
  const loc = localeOf(lang);
  const fmtT = (t: number, panjang = false) =>
    new Date(t)
      .toLocaleString(loc, {
        timeZone: "Asia/Jakarta",
        ...(harian && !panjang
          ? { day: "numeric", month: "long" }
          : harian
            ? { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }
            : { hour: "2-digit", minute: "2-digit", ...(detik ? { second: "2-digit" } : {}) }),
      })
      .replace(/(\d{2})\.(\d{2})(?:\.(\d{2}))?/g, (_, h, m, d) =>
        d ? `${h}:${m}:${d}` : `${h}:${m}`,
      ); // clock times keep their colon in every language

  // Scroll to zoom needs a non-passive listener (React's onWheel is passive).
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      if (seri.length < 2) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const [da, db] = zoomRef.current.dom;
      const cx = da + ((e.clientX - r.left) / r.width) * (db - da);
      zoomRef.current.zoom(e.deltaY < 0 ? 0.8 : 1.25, cx);
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, [seri.length]);

  if (seri.length < 2) {
    return (
      <div className={`zchart${sm ? " zchart--sm" : ""}`} role="img" aria-label={label}>
        <div className="zchart__empty">{empty}</div>
      </div>
    );
  }

  const path = (p: Panel, top: number) => {
    let d = "";
    let pen = false;
    const y = (v: number) =>
      top + ph - ((Math.min(p.hi, Math.max(p.lo, v)) - p.lo) / (p.hi - p.lo)) * ph;
    vis.forEach((pt, i) => {
      const v = pt.v[p.k];
      if (v === null || v === undefined) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return { d, y };
  };

  // The hovered point, resolved against the window shown now (a zoom can
  // land between the pointer event and this render).
  const hi = hover ? Math.round(hover.f * (vis.length - 1)) : -1;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => vis[Math.round(f * (vis.length - 1))]?.t);

  return (
    <div>
      <div
        ref={box}
        className={`zchart${sm ? " zchart--sm" : ""}`}
        data-drag={dragging ? "yes" : undefined}
        role="img"
        aria-label={label}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, d: zoom.dom };
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (drag.current && zoom.zoomed) {
            const dx =
              ((e.clientX - drag.current.x) / r.width) * (drag.current.d[1] - drag.current.d[0]);
            zoom.pan(drag.current.d[0] - dx, drag.current.d[1] - dx);
          }
          const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          setHover({ f, x: e.clientX - r.left, w: r.width });
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerLeave={() => {
          drag.current = null;
          setDragging(false);
          setHover(null);
        }}
        onDoubleClick={zoom.reset}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {panels.map((p, pi) => {
            const top = pi * (ph + GAP);
            const { d, y } = path(p, top);
            const by = p.batas !== undefined ? y(p.batas) : null;
            return (
              <g key={p.k} style={{ "--c": p.c } as CSSProperties}>
                {[0, 0.5, 1].map((f) => (
                  <line
                    key={f}
                    x1="0"
                    x2={W}
                    y1={top + ph * f}
                    y2={top + ph * f}
                    className="zchart__grid"
                  />
                ))}
                {by !== null && by > top && (
                  <>
                    <rect x="0" y={top} width={W} height={by - top} className="zchart__limit" />
                    <line x1="0" x2={W} y1={by} y2={by} className="zchart__limitline" />
                  </>
                )}
                {d && (
                  <>
                    <path
                      d={`${d} L${x(vis.length - 1)},${top + ph} L0,${top + ph} Z`}
                      className="zchart__area"
                    />
                    <path d={d} className="zchart__line" />
                  </>
                )}
              </g>
            );
          })}
          {hover && <line x1={x(hi)} x2={x(hi)} y1="0" y2={H} className="zchart__cross" />}
        </svg>
        {panels.map((p, pi) => (
          <span
            key={p.k}
            className="zchart__panel"
            style={{ top: `${((pi * (ph + GAP)) / H) * 100}%` }}
          >
            {p.judul}
          </span>
        ))}
        {hover && vis[hi] && (
          <div
            className="zchart__tip"
            style={{ left: hover.x }}
            data-side={hover.x > hover.w * 0.6 ? "left" : undefined}
          >
            <b>{fmtT(vis[hi].t, true)}</b>
            {panels.map((p) => {
              const v = vis[hi].v[p.k];
              return (
                <span key={p.k} className="legend" style={{ "--c": p.c } as CSSProperties}>
                  {p.label}{" "}
                  {v === null || v === undefined ? (
                    <Nil dot />
                  ) : (
                    `${v.toLocaleString(loc, { maximumFractionDigits: p.dp ?? 0, minimumFractionDigits: p.dp ?? 0 })} ${p.unit}`
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="zchart__x" aria-hidden="true">
        {ticks.map((t, i) => (
          <span key={i}>{t ? fmtT(t) : ""}</span>
        ))}
      </div>
    </div>
  );
}
