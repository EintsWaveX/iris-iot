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
