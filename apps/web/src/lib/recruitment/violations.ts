/**
 * The violation rules (9 Nov 2026): which strikes count and how much, the score cut they suggest
 * and the warning level the candidate sees. Pure and browser safe; the API decides with it and the
 * pages only show what it says. Nothing here applies a penalty: it only suggests one, and staff
 * confirm, reduce or waive it (rec_seat_penalty).
 *
 *   points  = sum over counted strikes of the heaviest counting kind on the strike,
 *             plus 1 for each strike past the cap (they are counted, just not stored)
 *   cut%    = min(max, step x max(0, points - free))
 *   level   = how many of the warnAt thresholds the points reached (0 none, 1 notice, 2 strong, 3 final)
 *
 * Excused strikes (staff forgave them) count for nothing, so a level can fall back.
 */
import { DEFAULT_EXAM_CONFIG, type PartKey, type ViolationRules } from "./exam-types.js";
import { STRIKE_KINDS } from "./seat-lockdown.js";

export type { ViolationRules };
export type WarnLevel = 0 | 1 | 2 | 3;

export const DEFAULT_VIOLATION_RULES: ViolationRules = DEFAULT_EXAM_CONFIG.violations;

/** What the rules need of a strike */
export interface StrikeLite {
  kinds: readonly string[];
  excused: boolean;
}

/** The weight of one strike: its heaviest kind that counts, 0 when none does. */
export function strikeWeight(kinds: readonly string[], rules: ViolationRules): number {
  let w = 0;
  for (const k of kinds) {
    if (!(STRIKE_KINDS as readonly string[]).includes(k)) continue;
    const r = rules.kinds[k as keyof ViolationRules["kinds"]];
    if (r?.counts) w = Math.max(w, r.weight);
  }
  return w;
}

/** A seat's points in one part. `overflow` is the strikes past the cap, each worth 1. */
export function countedPoints(
  strikes: readonly StrikeLite[],
  overflow: number,
  rules: ViolationRules,
): number {
  let n = Math.max(0, Math.floor(overflow));
  for (const x of strikes) if (!x.excused) n += strikeWeight(x.kinds, rules);
  return n;
}

/** The score cut, in percent, that `points` suggests. */
export const suggestedCut = (points: number, rules: ViolationRules): number =>
  Math.max(0, Math.min(rules.max, rules.step * Math.max(0, points - rules.free)));

export function warnLevel(points: number, rules: ViolationRules): WarnLevel {
  return rules.warnAt.filter((t) => points >= t).length as WarnLevel;
}

export interface PartViolations {
  points: number;
  level: WarnLevel;
  /** The suggested score cut, percent */
  cut: number;
}

/**
 * A seat's points, level and suggested cut in each part it has a strike or an overflow in.
 * Parts with nothing to count are left out.
 */
export function seatViolations(
  strikes: readonly (StrikeLite & { part: PartKey })[],
  overflow: Partial<Record<PartKey, number>>,
  rules: ViolationRules,
): Partial<Record<PartKey, PartViolations>> {
  const parts = new Set<PartKey>([
    ...strikes.map((x) => x.part),
    ...(Object.keys(overflow) as PartKey[]).filter((p) => (overflow[p] ?? 0) > 0),
  ]);
  const out: Partial<Record<PartKey, PartViolations>> = {};
  for (const part of parts) {
    const points = countedPoints(
      strikes.filter((x) => x.part === part),
      overflow[part] ?? 0,
      rules,
    );
    out[part] = { points, level: warnLevel(points, rules), cut: suggestedCut(points, rules) };
  }
  return out;
}
