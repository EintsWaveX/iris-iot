/**
 * The candidate funnel for Ringkasan: for each stage, how many have reached
 * it, how many are in it now, and how many are through it. Counted from the
 * candidate list the Panitia member may see; withdrawn candidates never count.
 * Pure.
 */
import { STAGES, type CandidateRow, type StageKey } from "./types.js";

export interface FunnelRow {
  stage: StageKey;
  /** Reached this stage or went past it */
  reached: number;
  /** Sitting in this stage now (not cut, not withdrawn) */
  here: number;
  /** Went past it */
  through: number;
  /** Cut in this stage */
  out: number;
}

export function funnelOf(rows: readonly CandidateRow[]): FunnelRow[] {
  const live = rows.filter((c) => c.status !== "withdrawn");
  return STAGES.map((stage, i) => {
    const idx = (c: CandidateRow) => STAGES.indexOf(c.stage);
    const reached = live.filter((c) => idx(c) >= i).length;
    const here = live.filter((c) => idx(c) === i && c.status !== "out").length;
    const out = live.filter((c) => idx(c) === i && c.status === "out").length;
    return { stage, reached, here, through: live.filter((c) => idx(c) > i).length, out };
  });
}

/** The Berkas state of the applicants: how many wait, need a fix, or are verified. */
export function berkasCounts(rows: readonly CandidateRow[]) {
  const live = rows.filter((c) => c.status !== "withdrawn");
  return {
    total: live.length,
    waiting: live.filter((c) => c.status === "applied").length,
    fix: live.filter((c) => c.status === "revision").length,
    verified: live.filter((c) => c.status !== "applied" && c.status !== "revision").length,
  };
}
