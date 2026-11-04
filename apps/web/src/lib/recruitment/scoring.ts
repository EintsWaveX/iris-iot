/**
 * Scoring (EXAM-ENGINE 4, PRD 7.4). A question weighs more the fewer seats
 * got it fully right: p = (M + 1) / (N + 2), w = 2 − p. Exact fractions all
 * the way, one rounding per part score. The caller passes only real seats
 * (rehearsal seats count nowhere) and only one part at a time.
 */
import type { Phase1Part, Rubric, RubricSheet } from "./exam-types.js";
import { ZERO, add, div, frac, isOne, mul, roundHalfUp, sub, sum, type Frac } from "./frac.js";
import { BONUS_OVER } from "./bonus.js";

/** One seat in one part: the questions it drew (null: never started) and their credits. */
export interface SeatPart {
  seat: number;
  drawn: number[] | null;
  /**
   * The bonus round (4 Nov 2026): bonus questions the seat ANSWERED. They add to what the seat
   * earned but not to what it could earn, so a seat can pass its part's cap. A bonus question
   * left blank is not listed at all: it costs nothing and counts in no statistic.
   */
  bonus?: number[];
  /** Missing entries are unanswered: credit 0, still shown. */
  credits: Record<number, Frac>;
}

export interface QuestionStat {
  n: number;
  m: number;
  p: Frac;
  w: Frac;
}

export interface SeatScore {
  score: number;
  ratio: Frac;
  flag?: "absent" | "empty";
}

/** w = 2 − (M + 1) / (N + 2), between 1 and 2. */
export const weightOf = (n: number, m: number) => sub(frac(2), frac(m + 1, n + 2));

/** N, M, p and w per question, and every seat's score for one part. */
export function scorePart(
  cap: number,
  seats: readonly SeatPart[],
  voided: ReadonlySet<number>,
  /**
   * What each question is worth, as a weight (4 Nov 2026). A question without an entry is worth
   * `defaultPts`, so with no entries at all every question weighs the same and the result is
   * the pass-rate weighting alone, as before.
   */
  pts: ReadonlyMap<number, number> = new Map(),
  defaultPts = 1,
): { stats: Map<number, QuestionStat>; seats: Map<number, SeatScore> } {
  const counts = new Map<number, { n: number; m: number }>();
  for (const s of seats) {
    for (const q of [...(s.drawn ?? []), ...(s.bonus ?? [])]) {
      if (voided.has(q)) continue;
      const c = counts.get(q) ?? { n: 0, m: 0 };
      c.n++;
      if (s.credits[q] && isOne(s.credits[q])) c.m++;
      counts.set(q, c);
    }
  }
  const stats = new Map<number, QuestionStat>();
  for (const [q, { n, m }] of counts)
    stats.set(q, { n, m, p: frac(m + 1, n + 2), w: weightOf(n, m) });

  const out = new Map<number, SeatScore>();
  for (const s of seats) {
    if (s.drawn === null) {
      out.set(s.seat, { score: 0, ratio: ZERO, flag: "absent" });
      continue;
    }
    const live = s.drawn.filter((q) => !voided.has(q));
    if (live.length === 0) {
      out.set(s.seat, { score: 0, ratio: ZERO, flag: "empty" });
      continue;
    }
    // weight = pass-rate weight x the question's score; the cap is what the DEALT questions make
    const wOf = (q: number) => mul(stats.get(q)!.w, frac(pts.get(q) ?? defaultPts));
    const ws = live.map(wOf);
    const extra = (s.bonus ?? []).filter((q) => !voided.has(q));
    const got = sum([
      ...live.map((q, i) => mul(s.credits[q] ?? ZERO, ws[i])),
      // a bonus question is worth half of a normal one (bonus.ts)
      ...extra.map((q) => mul(mul(s.credits[q] ?? ZERO, wOf(q)), frac(1, BONUS_OVER))),
    ]);
    const ratio = div(got, sum(ws));
    out.set(s.seat, { score: roundHalfUp(cap, ratio), ratio });
  }
  return { stats, seats: out };
}

/* ------------------------------------------------------------ Live Coding */

/** Σ weight·value/max ÷ Σ weight. Every row needs a whole value in 0..max. */
export function sheetRatio(rubric: Rubric, values: Record<string, number>): Frac {
  let got = ZERO;
  let total = ZERO;
  for (const r of rubric.rows) {
    const v = values[r.key];
    if (!Number.isInteger(v) || v < 0 || v > r.max)
      throw new RangeError(`sheetRatio: ${r.key} = ${v}`);
    got = add(got, frac(r.weight * v, r.max));
    total = add(total, frac(r.weight));
  }
  return div(got, total);
}

/** The first two sheets, by time, from two different people. */
export function countedSheets(sheets: readonly RubricSheet[]): RubricSheet[] {
  const out: RubricSheet[] = [];
  for (const s of [...sheets].sort((a, b) => a.at - b.at)) {
    if (out.length < 2 && !out.some((o) => o.grader === s.grader)) out.push(s);
  }
  return out;
}

/** round(cap × mean of the two counted ratios), or null before two count. */
export function livecodeScore(
  rubric: Rubric,
  sheets: readonly RubricSheet[],
  cap: number,
): number | null {
  const counted = countedSheets(sheets);
  if (counted.length < 2) return null;
  const mean = div(sum(counted.map((s) => sheetRatio(rubric, s.values))), frac(counted.length));
  return roundHalfUp(cap, mean);
}

/* ----------------------------------------------------------------- totals */

/** The written total is the three parts (each rounded first); the test total adds Live Coding. */
export function totals(s: Record<Phase1Part, number> & { livecode: number | null }) {
  const phase1 = s.logika + s.fitb + s.kodingan;
  return { phase1, total: phase1 + (s.livecode ?? 0) };
}
