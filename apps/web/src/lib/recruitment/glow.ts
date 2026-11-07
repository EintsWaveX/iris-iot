/**
 * The screen-edge glow on the exam pages (2026-11-07): how loud it is follows the time the seat has
 * left, so a candidate feels the clock without staring at it. Pure and browser safe.
 *
 *   more than half left   calm   green, slow
 *   down to a quarter     warm   yellow, a little faster
 *   down to a tenth       hot    orange, quick
 *   under a tenth         crit   red, urgent
 */
export type GlowLevel = "calm" | "warm" | "hot" | "crit";

/** Share of the part's time that is left, 0..1 (more time than planned, after a +time, reads as 1). */
export function glowShare(leftMs: number, totalMs: number): number {
  if (!(totalMs > 0)) return 1;
  return Math.min(1, Math.max(0, leftMs / totalMs));
}

export function glowLevel(leftMs: number, totalMs: number): GlowLevel {
  const s = glowShare(leftMs, totalMs);
  if (s > 0.5) return "calm";
  if (s > 0.25) return "warm";
  if (s > 0.1) return "hot";
  return "crit";
}

/** How far the glow reaches, 0 (just a rim) to 1 (deep into the screen): grows as the time runs out. */
export function glowReach(leftMs: number, totalMs: number): number {
  return 1 - glowShare(leftMs, totalMs);
}

/* ------------------------------------------------------------- colour (9 Nov 2026) */

export interface GlowTone {
  /** The two close tones the layers crossfade between, as CSS colours */
  c1: string;
  c2: string;
  /** How strong the glow is at rest */
  a: number;
}

type Rgb = [number, number, number];
const STOPS: { at: number; c1: Rgb; c2: Rgb; a: number }[] = [
  { at: 0.6, c1: [74, 222, 128], c2: [34, 197, 94], a: 0.34 },
  { at: 0.4, c1: [250, 204, 21], c2: [234, 179, 8], a: 0.38 },
  { at: 0.2, c1: [251, 146, 60], c2: [249, 115, 22], a: 0.42 },
  { at: 0.05, c1: [239, 68, 68], c2: [220, 38, 38], a: 0.5 },
];
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * k),
  Math.round(a[1] + (b[1] - a[1]) * k),
  Math.round(a[2] + (b[2] - a[2]) * k),
];
const css = (c: Rgb) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

/**
 * The glow's colour for the share of time left: it slides from green through yellow and orange to
 * red instead of jumping at the level edges, so nothing changes sharply on screen. The pulse's pace
 * and depth still step by level (a pulse that changes length mid-beat jumps).
 */
export function glowTone(share: number): GlowTone {
  const s = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 1;
  const hi = STOPS[0];
  const lo = STOPS[STOPS.length - 1];
  if (s >= hi.at) return { c1: css(hi.c1), c2: css(hi.c2), a: hi.a };
  if (s <= lo.at) return { c1: css(lo.c1), c2: css(lo.c2), a: lo.a };
  for (let i = 0; i < STOPS.length - 1; i++) {
    const from = STOPS[i];
    const to = STOPS[i + 1];
    if (s <= from.at && s >= to.at) {
      const k = (from.at - s) / (from.at - to.at);
      return {
        c1: css(mix(from.c1, to.c1, k)),
        c2: css(mix(from.c2, to.c2, k)),
        a: Number((from.a + (to.a - from.a) * k).toFixed(3)),
      };
    }
  }
  return { c1: css(lo.c1), c2: css(lo.c2), a: lo.a };
}

/**
 * A steady tint over the glow while the seat has violation points (warning level 1 to 3): amber,
 * orange, red. It does not pulse, so a candidate feels that something was recorded without being
 * startled. Null at level 0.
 */
export function glowTint(level: number): { c: string; a: number; reach: number } | null {
  if (!Number.isFinite(level) || level < 1) return null;
  const l = Math.min(3, Math.floor(level));
  return [
    { c: "rgb(245 158 11)", a: 0.22, reach: 36 },
    { c: "rgb(249 115 22)", a: 0.32, reach: 52 },
    { c: "rgb(239 68 68)", a: 0.42, reach: 70 },
  ][l - 1];
}
