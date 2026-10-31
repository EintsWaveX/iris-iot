/**
 * The problem bank as the Akademik's editor sees it (B7.5): shapes of `GET problems`,
 * `GET problem` and the replies of the three writes. Types only, browser safe.
 * This is the one place a hidden test or a reference solution travels to a browser,
 * and only to a session with the bank right.
 */
import type { CProblemDraft, Verdict } from "./c-problem.js";
import type { Tier } from "./exam-types.js";

export interface ProblemSummary {
  id: number;
  title: string;
  tier: Tier;
  status: "draft" | "ready";
  /** The default problems: a Bawaan badge, nothing else */
  sample: boolean;
  version: number;
  tests: number;
  checkedAt: string | null;
  /** True when the reference solution passed every hidden test on the judge */
  checkOk: boolean | null;
  /** A real seat was dealt it: its tests, samples, limits and reference are locked */
  shown: boolean;
}

export interface ProblemFull extends ProblemSummary {
  draft: CProblemDraft;
}

export interface ProblemCheck {
  id: number;
  status: "antre" | "diambil" | "selesai" | "gagal";
  passed: number | null;
  total: number | null;
  verdicts: Verdict[];
  compileLog: string | null;
  kode: string | null;
}

export interface ProblemsResponse {
  ok: true;
  problems: ProblemSummary[];
}

export interface ProblemResponse {
  ok: true;
  problem: ProblemFull;
  check: ProblemCheck | null;
}
