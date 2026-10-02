/**
 * Phase 9: chart colours from the theme tokens. uPlot draws on a canvas,
 * which cannot read CSS variables, so the values are read from <html> at
 * draw time and a chart redraws when the theme changes (useThemeKey).
 * The tokens live in src/styles/theme.css, one set per theme.
 */
import { useEffect, useState } from "react";

export interface ChartColors {
  /** --chart-1 .. --chart-4: general series. */
  series: string[];
  /** --group-1 .. --group-10: a series that stands for one group. */
  groups: string[];
  axis: string;
  grid: string;
  tick: string;
}

const FALLBACK: ChartColors = {
  series: ["#7dd3fc", "#c4b5fd", "#fca5a5", "#5eead4"],
  groups: [
    "#5eead4",
    "#a78bfa",
    "#fb7185",
    "#f59e6a",
    "#7dd3fc",
    "#a3e635",
    "#f472b6",
    "#fde047",
    "#93a5ff",
    "#e2a3ff",
  ],
  axis: "#959da7",
  grid: "rgba(255, 255, 255, 0.06)",
  tick: "rgba(255, 255, 255, 0.1)",
};

export function chartColors(): ChartColors {
  if (typeof document === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    series: FALLBACK.series.map((f, i) => v(`--chart-${i + 1}`, f)),
    groups: FALLBACK.groups.map((f, i) => v(`--group-${i + 1}`, f)),
    axis: v("--chart-axis", FALLBACK.axis),
    grid: v("--chart-grid", FALLBACK.grid),
    tick: v("--chart-tick", FALLBACK.tick),
  };
}

/** The colour for group `nomor` (1-based), wrapping past ten. */
export function warnaKelompok(c: ChartColors, nomor: number): string {
  return c.groups[(((nomor - 1) % c.groups.length) + c.groups.length) % c.groups.length];
}

/** The current html[data-theme], re-rendering when it changes; put it in a
 *  chart effect's dependencies so the chart redraws in the new colours. */
export function useThemeKey(): string {
  const [key, setKey] = useState(() =>
    typeof document === "undefined" ? "dark" : (document.documentElement.dataset.theme ?? "dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const mo = new MutationObserver(() => setKey(el.dataset.theme ?? "dark"));
    mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return key;
}
