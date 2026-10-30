/**
 * What a seat sees of Live Coding in C (B7.4): the shape of `GET lcc` and
 * `POST lcc-send`, shared by api/_lib/recruitment-lcc.ts and the runner.
 * Types and pure mappers only, browser safe. Nothing in it can carry a hidden
 * test, an expected output of a hidden test or the reference solution: the
 * server builds these from the problem's public part and the judge's verdicts.
 */
import type { CSample, CProblemText, TestVerdict, Verdict } from "./c-problem.js";
import { livecodeResult, passedOf } from "./c-problem.js";
import type { Tier } from "./exam-types.js";

export interface LccProblem {
  id: number;
  title: string;
  tier: Tier;
  /** What a full pass of this problem is worth */
  points: number;
  text: CProblemText;
  en?: CProblemText;
  samples: CSample[];
  starter: string;
  /** Number of hidden tests, so the candidate sees "7 / 10 test" without seeing a test */
  tests: number;
  limits: { timeMs: number; memKb: number };
}

/** One Run Sample or Submit as the seat sees it. */
export interface LccSub {
  id: number;
  kind: "run" | "submit";
  status: "antre" | "diambil" | "selesai" | "gagal";
  /** Verdict per test, in order; empty while waiting or after a compile error */
  verdicts: Verdict[];
  passed: number | null;
  total: number | null;
  /** The compiler's words, only when it failed */
  compileLog: string | null;
  /** Why the judge could not finish (agen_diam and the like) */
  kode: string | null;
  at: number;
}

export interface LccProblemState {
  /** The newest Run Sample and the newest Submit, whatever their state */
  run: LccSub | null;
  submit: LccSub | null;
  /** The best finished Submit's tests passed, and what that is worth */
  best: { passed: number; total: number; got: number } | null;
  /** Where a waiting job stands in the room's queue, counting from 1 */
  position: number | null;
}

export interface LccSelf {
  /** spin: the hand is shown, work: the editor is open */
  fase: "spin" | "kerja";
  hand: LccProblem[];
  state: Record<number, LccProblemState>;
  /** Points so far out of `cap`, from the best Submit of each problem */
  total: number;
  cap: number;
  /** The Live Coding minutes from the exam settings */
  minutes: number;
  /** False when the PC agent has not said it can judge: a banner, the code is still kept */
  judgeReady: boolean;
}

export interface LccSendReply {
  id: number;
  replaced: boolean;
}

/* ------------------------------------------------------ the panel's room view */

export interface LccRoomProblem {
  problemId: number;
  title: string;
  points: number;
  got: number;
  passed: number | null;
  total: number | null;
}

export interface LccRoomSeat {
  seatId: number;
  no: number | null;
  nama: string;
  /** The seat was dealt a hand */
  dealt: boolean;
  problems: LccRoomProblem[];
  /** Points from the best Submit of each problem */
  got: number;
  /** Submits and Run Samples waiting at the judge */
  waiting: number;
  /** The newest thing the seat sent, in ms, or null */
  lastAt: number | null;
}

/** `GET lcc-room?id=`: the judge, its queue and every seat's results, for the room's staff. */
export interface LccRoom {
  judgeReady: boolean;
  queue: { waiting: number; running: number };
  cap: number;
  seats: LccRoomSeat[];
}

/* ---------------------------------------------------------------- mapping */

export interface SubRow {
  id: number;
  problemId: number;
  kind: "run" | "submit" | "check";
  status: LccSub["status"];
  passed: number | null;
  total: number | null;
  kode: string | null;
  requestedAt: Date;
  outcome: { compile: { ok: boolean; log: string }; verdicts: TestVerdict[] } | null;
}

export function toSub(r: SubRow): LccSub | null {
  if (r.kind === "check") return null;
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    verdicts: r.outcome?.verdicts.map((v) => v.v) ?? [],
    passed: r.passed,
    total: r.total,
    compileLog: r.outcome && !r.outcome.compile.ok ? r.outcome.compile.log : null,
    kode: r.kode,
    at: r.requestedAt.getTime(),
  };
}

/**
 * The seat's state for each dealt problem from its submissions (newest
 * first in `rows`), plus the points total. A run or submit still waiting is
 * the newest of its kind; the best Submit is the best FINISHED one.
 */
export function stateOf(
  hand: readonly { id: number; points: number }[],
  rows: readonly SubRow[],
  position: (subId: number) => number | null,
): { state: Record<number, LccProblemState>; total: number } {
  const state: Record<number, LccProblemState> = {};
  const live = livecodeResult(
    hand.map((h) => ({
      problemId: h.id,
      points: h.points,
      runs: rows
        .filter(
          (r) => r.kind === "submit" && r.status === "selesai" && r.total && r.passed !== null,
        )
        .filter((r) => r.problemId === h.id)
        .map((r) => ({ passed: r.passed ?? 0, total: r.total ?? 0, at: r.requestedAt.getTime() })),
    })),
  );
  for (const h of hand) {
    const mine = rows.filter((r) => r.problemId === h.id);
    const run = mine.find((r) => r.kind === "run") ?? null;
    const submit = mine.find((r) => r.kind === "submit") ?? null;
    const best = live.problems.find((p) => p.problemId === h.id);
    const waiting = [run, submit].find(
      (r) => r && (r.status === "antre" || r.status === "diambil"),
    );
    state[h.id] = {
      run: run ? toSub(run) : null,
      submit: submit ? toSub(submit) : null,
      best: best?.best ? { passed: best.best.passed, total: best.best.total, got: best.got } : null,
      position: waiting ? position(waiting.id) : null,
    };
  }
  return { state, total: live.total };
}

export { passedOf };
