/**
 * Live Coding in C (B7.2, 30 Oct 2026): what a problem is, what the judge
 * says about one submission, how an answer is compared and how a seat's
 * points are worked out. Browser safe and pure: the hidden tests and the
 * reference solution are plain strings here, and the API never sends them to a
 * candidate (EXAM-ENGINE 2).
 */
import { ZERO, cmp, frac, maxFrac, roundHalfUp, type Frac } from "./frac.js";
import type { FieldError, Tier } from "./exam-types.js";

/** What the judge says about one test. `ole` is output over the cap. */
export const VERDICTS = ["ac", "wa", "tle", "mle", "re", "ole"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** A sample the candidate sees next to the statement, and may Run. */
export interface CSample {
  input: string;
  output: string;
}

/** A hidden test: only the judge ever holds these. */
export interface CTest {
  input: string;
  output: string;
}

export interface CProblemText {
  statement: string;
  input: string;
  output: string;
}

/** The problem as the Akademik edits it. `en` is optional; the Indonesian text is the one every seat has. */
export interface CProblemBody extends CProblemText {
  en?: CProblemText;
  /** The code the editor starts with */
  starter: string;
}

export interface CProblemLimits {
  timeMs: number;
  memKb: number;
}

export interface CProblemDraft {
  title: string;
  tier: Tier;
  body: CProblemBody;
  limits: CProblemLimits;
  samples: CSample[];
  tests: CTest[];
  /** What the judge runs to check the tests: a correct program, never shown */
  reference: string;
}

export const C_LIMITS = {
  title: 80,
  text: 6000,
  code: 20_000,
  io: 4000,
  timeMs: { min: 200, max: 5000, def: 1000 },
  memKb: { min: 16_384, max: 262_144, def: 65_536 },
  samples: { min: 1, max: 4 },
  tests: { min: 3, max: 40 },
} as const;

export const DEFAULT_STARTER = "#include <stdio.h>\n\nint main(void) {\n  \n  return 0;\n}\n";

/** What a submission is allowed to be: one C file, a bounded size. */
export const CODE_MAX_BYTES = 32_768;

/** What one test came to. */
export interface TestVerdict {
  v: Verdict;
  ms: number;
  kb: number;
}

/** What the judge returns for one submission. A compile error leaves `verdicts` empty. */
export interface Outcome {
  compile: { ok: boolean; log: string };
  verdicts: TestVerdict[];
}

/* ------------------------------------------------------------- comparing */

/**
 * The usual judge rule: line endings are one thing, trailing spaces and
 * trailing blank lines do not count, everything else must match exactly.
 */
export function normalizeOutput(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

export const sameOutput = (expected: string, got: string) =>
  normalizeOutput(expected) === normalizeOutput(got);

/* --------------------------------------------------------------- judging */

/** What the PC agent reports for one test: how the program ended, never whether it was right. */
export const RUN_STATES = ["ok", "tle", "mle", "re", "ole"] as const;
export type RunState = (typeof RUN_STATES)[number];

export interface AgentRun {
  st: RunState;
  /** What the program printed (capped by the agent); only read when st is ok */
  out?: string;
  ms?: number;
  kb?: number;
}

/** What the agent sends back for one job. `ce` carries the compiler's message. */
export interface AgentAnswer {
  id: number;
  compile: { ok: boolean; log?: string };
  runs?: AgentRun[];
}

const clampInt = (n: unknown, max: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : 0;

/**
 * The verdict of every test, decided here and not on the agent: an `ok` run is
 * accepted when its output matches the expected one under `sameOutput`, any
 * other ending is its own verdict. A missing or extra run is a runtime error
 * (a lying or broken agent can never raise a score).
 */
export function judgeRuns(
  expected: readonly string[],
  runs: readonly AgentRun[] | undefined,
): TestVerdict[] {
  return expected.map((want, i) => {
    const r = runs?.[i];
    const ms = clampInt(r?.ms, 600_000);
    const kb = clampInt(r?.kb, 4_000_000);
    if (!r || !(RUN_STATES as readonly string[]).includes(r.st)) return { v: "re", ms, kb };
    if (r.st === "ok") {
      return { v: typeof r.out === "string" && sameOutput(want, r.out) ? "ac" : "wa", ms, kb };
    }
    return { v: r.st, ms, kb };
  });
}

/** The whole outcome for a job whose expected outputs are `expected`. */
export function outcomeOf(
  expected: readonly string[],
  a: Pick<AgentAnswer, "compile" | "runs">,
): Outcome {
  const log = typeof a.compile?.log === "string" ? a.compile.log.slice(0, 8000) : "";
  if (!a.compile?.ok) return { compile: { ok: false, log }, verdicts: [] };
  return { compile: { ok: true, log }, verdicts: judgeRuns(expected, a.runs) };
}

/* ------------------------------------------------------------ validating */

const tooLong = (s: string, n: number) => s.length > n;

/** Why a problem cannot be saved as ready; empty when it is sound. */
export function validateProblem(p: CProblemDraft): FieldError[] {
  const e: FieldError[] = [];
  const bad = (field: string, kode: string) => e.push({ field, kode });
  const title = p.title.trim();
  if (!title) bad("title", "kosong");
  else if (title.length > C_LIMITS.title) bad("title", "terlalu_panjang");
  if (!["easy", "medium"].includes(p.tier)) bad("tier", "tingkat_salah");
  for (const k of ["statement", "input", "output"] as const) {
    if (!p.body[k].trim()) bad(`body.${k}`, "kosong");
    else if (tooLong(p.body[k], C_LIMITS.text)) bad(`body.${k}`, "terlalu_panjang");
  }
  if (tooLong(p.body.starter, C_LIMITS.code)) bad("body.starter", "terlalu_panjang");
  const t = p.limits.timeMs;
  if (!Number.isInteger(t) || t < C_LIMITS.timeMs.min || t > C_LIMITS.timeMs.max)
    bad("limits.timeMs", "batas_salah");
  const m = p.limits.memKb;
  if (!Number.isInteger(m) || m < C_LIMITS.memKb.min || m > C_LIMITS.memKb.max)
    bad("limits.memKb", "batas_salah");
  if (p.samples.length < C_LIMITS.samples.min) bad("samples", "contoh_kurang");
  if (p.samples.length > C_LIMITS.samples.max) bad("samples", "contoh_kebanyakan");
  p.samples.forEach((s, i) => {
    if (!s.output.trim()) bad(`samples.${i}.output`, "kosong");
    if (tooLong(s.input, C_LIMITS.io) || tooLong(s.output, C_LIMITS.io))
      bad(`samples.${i}`, "terlalu_panjang");
  });
  if (p.tests.length < C_LIMITS.tests.min) bad("tests", "tes_kurang");
  if (p.tests.length > C_LIMITS.tests.max) bad("tests", "tes_kebanyakan");
  p.tests.forEach((s, i) => {
    if (!s.output.trim()) bad(`tests.${i}.output`, "kosong");
    if (tooLong(s.input, C_LIMITS.io) || tooLong(s.output, C_LIMITS.io))
      bad(`tests.${i}`, "terlalu_panjang");
  });
  const seen = new Set<string>();
  p.tests.forEach((s, i) => {
    const k = normalizeOutput(s.input);
    if (seen.has(k)) bad(`tests.${i}`, "tes_kembar");
    seen.add(k);
  });
  if (!p.reference.trim()) bad("reference", "kosong");
  else if (tooLong(p.reference, C_LIMITS.code)) bad("reference", "terlalu_panjang");
  return e;
}

/* --------------------------------------------------------------- parsing */

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function parseText(v: unknown): CProblemText | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const statement = str(o.statement);
  const input = str(o.input);
  const output = str(o.output);
  return statement === null || input === null || output === null
    ? null
    : { statement, input, output };
}

function parseIo(v: unknown): CSample[] | null {
  if (!Array.isArray(v) || v.length > 200) return null;
  const out: CSample[] = [];
  for (const x of v) {
    const o = typeof x === "object" && x !== null ? (x as Record<string, unknown>) : null;
    const input = str(o?.input);
    const output = str(o?.output);
    if (input === null || output === null) return null;
    out.push({ input, output });
  }
  return out;
}

/** A draft from untrusted JSON, or null when its shape is wrong (what is IN it is validateProblem's business). */
export function parseProblemDraft(raw: unknown): CProblemDraft | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const title = str(o.title);
  const tier = o.tier === "easy" || o.tier === "medium" ? o.tier : null;
  const body =
    typeof o.body === "object" && o.body !== null ? (o.body as Record<string, unknown>) : null;
  const text = parseText(body);
  const starter = str(body?.starter);
  const lim =
    typeof o.limits === "object" && o.limits !== null
      ? (o.limits as Record<string, unknown>)
      : null;
  const samples = parseIo(o.samples);
  const tests = parseIo(o.tests);
  const reference = str(o.reference);
  if (
    title === null ||
    !tier ||
    !text ||
    starter === null ||
    !lim ||
    !samples ||
    !tests ||
    reference === null
  )
    return null;
  const timeMs = Number(lim.timeMs);
  const memKb = Number(lim.memKb);
  let en: CProblemText | undefined;
  if (body?.en !== undefined && body.en !== null) {
    const e = parseText(body.en);
    if (!e) return null;
    en = e;
  }
  return {
    title,
    tier,
    body: { ...text, ...(en ? { en } : {}), starter },
    limits: { timeMs, memKb },
    samples,
    tests,
    reference,
  };
}

/* --------------------------------------------------------------- scoring */

/** One finished submission of a seat for one problem. Only Submit counts, never Run Sample. */
export interface Run {
  passed: number;
  total: number;
  /** When it was sent, in ms: the earlier of two equal runs is the one that counts */
  at: number;
}

export const passedOf = (verdicts: readonly TestVerdict[]) =>
  verdicts.filter((v) => v.v === "ac").length;

export const ratioOf = (r: { passed: number; total: number }): Frac =>
  r.total > 0 ? frac(r.passed, r.total) : ZERO;

/** The best run: the most tests passed, the earlier one on a tie. */
export function bestRun<R extends Run>(runs: readonly R[]): R | null {
  let best: R | null = null;
  for (const r of runs) {
    if (!best) best = r;
    else {
      const c = cmp(ratioOf(r), ratioOf(best));
      if (c > 0 || (c === 0 && r.at < best.at)) best = r;
    }
  }
  return best;
}

/** round(points × passed / total), a half going up. */
export const problemPoints = (points: number, r: { passed: number; total: number }) =>
  roundHalfUp(points, ratioOf(r));

/** One dealt problem with what it is worth, and the runs the seat sent for it. */
export interface HandEntry {
  problemId: number;
  points: number;
  runs: readonly Run[];
}

export interface LiveResult {
  /** Each problem: its best run and the points it gave */
  problems: { problemId: number; points: number; best: Run | null; got: number }[];
  /** All the problems added up */
  total: number;
  /** True when the seat sent nothing at all */
  empty: boolean;
}

export function livecodeResult(hand: readonly HandEntry[]): LiveResult {
  const problems = hand.map((h) => {
    const best = bestRun(h.runs);
    return {
      problemId: h.problemId,
      points: h.points,
      best,
      got: best ? problemPoints(h.points, best) : 0,
    };
  });
  return {
    problems,
    total: problems.reduce((a, p) => a + p.got, 0),
    empty: hand.every((h) => h.runs.length === 0),
  };
}

/** The best ratio over a set of seats' runs, for the Penilaian spread. */
export const bestRatio = (runs: readonly Run[]): Frac =>
  runs.length ? maxFrac(runs.map(ratioOf)) : ZERO;
