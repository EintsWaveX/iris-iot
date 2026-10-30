/**
 * The score table, pure (EXAM-ENGINE 4, prompt 13): seats, answers and the
 * bank in, one row per candidate and one line of statistics per question
 * out. The API loads the rows (api/_lib/recruitment-score.ts); everything
 * that decides a number is here, on exact fractions and scoring.ts, so the
 * API, the Cutting board and the tests cannot differ by a point.
 */
import {
  PHASE1_PARTS,
  type Phase1Part,
  type Question,
  type SeatDraw,
  type Value,
} from "./exam-types.js";
import type { Caps } from "./exam-config.js";
import { credit } from "./formats.js";
import { fracText, type Frac } from "./frac.js";
import type { LiveFlag, PartScore, ScoreRow, StatRow, WrongPick } from "./score-api.js";
import { scorePart, totals, type SeatPart } from "./scoring.js";
import { livecodeResult, type Run } from "./c-problem.js";

export interface SeatIn {
  seatId: number;
  candidateId: number;
  roomId: number;
  nim: string;
  nama: string;
  draw: SeatDraw;
  /** What the seat stored, by question id; a missing entry is unanswered */
  values: ReadonlyMap<number, Value>;
}

export interface QuestionIn {
  id: number;
  title: string;
  lang: string;
  question: Question;
  voided: boolean;
}

/** What Live Coding in C needs to score a seat (B7.5): the hand it was dealt and what it Submitted. */
export interface LiveIn {
  /** Seats that were dealt a hand, with what each problem is worth */
  hand: ReadonlyMap<number, readonly { problemId: number; points: number }[]>;
  /** Finished Submits per seat; a Run Sample never counts */
  runs: ReadonlyMap<number, readonly (Run & { problemId: number })[]>;
  /** Seats with a Submit still waiting at the judge */
  waiting: ReadonlySet<number>;
}

export interface Assembled {
  rows: ScoreRow[];
  stats: StatRow[];
  /** Seats that started each part */
  started: Record<Phase1Part, number>;
  /** Seats with a Submit the judge has not answered yet */
  liveWaiting: number[];
}

const share = (f: Frac) => Number(f.n) / Number(f.d);

/** One row per real seat, and statistics for every question some real seat was dealt. */
export function assemble(
  seats: readonly SeatIn[],
  questions: readonly QuestionIn[],
  live: LiveIn,
  caps: Caps,
): Assembled {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const voided = new Set(questions.filter((q) => q.voided).map((q) => q.id));

  const scored = {} as Record<
    Phase1Part,
    {
      now: ReturnType<typeof scorePart>;
      raw: ReturnType<typeof scorePart>;
    }
  >;
  const started = {} as Record<Phase1Part, number>;
  for (const part of PHASE1_PARTS) {
    const parts: SeatPart[] = seats.map((s) => {
      const run = s.draw[part];
      if (!run) return { seat: s.seatId, drawn: null, credits: {} };
      const drawn: number[] = [];
      const credits: Record<number, Frac> = {};
      for (const it of run.items) {
        const q = byId.get(it.q);
        // A question deleted since the draw cannot be judged; it leaves the sums like a void.
        if (!q) continue;
        drawn.push(it.q);
        credits[it.q] = credit(q.question, s.values.get(it.q) ?? null);
      }
      return { seat: s.seatId, drawn, credits };
    });
    started[part] = parts.filter((p) => p.drawn !== null).length;
    scored[part] = {
      now: scorePart(caps.parts[part], parts, voided),
      raw: scorePart(caps.parts[part], parts, new Set()),
    };
  }

  const rows: ScoreRow[] = [];
  const liveWaiting: number[] = [];
  for (const s of seats) {
    const parts = {} as Record<Phase1Part, PartScore>;
    for (const part of PHASE1_PARTS) {
      const r = scored[part].now.seats.get(s.seatId)!;
      parts[part] = r.flag ? { score: r.score, flag: r.flag } : { score: r.score };
    }
    let lc: number | null = null;
    let liveFlag: LiveFlag | undefined;
    const hand = live.hand.get(s.seatId);
    if (!hand) {
      lc = 0;
      liveFlag = "tanpa";
    } else {
      const runs = live.runs.get(s.seatId) ?? [];
      lc = livecodeResult(
        hand.map((h) => ({
          problemId: h.problemId,
          points: h.points,
          runs: runs.filter((r) => r.problemId === h.problemId),
        })),
      ).total;
      if (live.waiting.has(s.seatId)) {
        liveFlag = "belum";
        liveWaiting.push(s.seatId);
      }
    }
    const t = totals({
      logika: parts.logika.score,
      fitb: parts.fitb.score,
      kodingan: parts.kodingan.score,
      livecode: lc,
    });
    rows.push({
      candidateId: s.candidateId,
      seatId: s.seatId,
      roomId: s.roomId,
      nim: s.nim,
      nama: s.nama,
      parts,
      phase1: t.phase1,
      livecode: lc,
      ...(liveFlag ? { liveFlag } : {}),
      total: t.total,
    });
  }

  // Statistics: every question some seat was dealt, a voided one with the numbers it had.
  const dealt = new Set<number>();
  for (const s of seats)
    for (const part of PHASE1_PARTS) for (const it of s.draw[part]?.items ?? []) dealt.add(it.q);
  const valuesOf = new Map<number, Value[]>();
  for (const s of seats)
    for (const part of PHASE1_PARTS)
      for (const it of s.draw[part]?.items ?? []) {
        const v = s.values.get(it.q);
        if (v == null) continue;
        const l = valuesOf.get(it.q) ?? [];
        l.push(v);
        valuesOf.set(it.q, l);
      }
  const stats: StatRow[] = [];
  for (const id of [...dealt].sort((a, b) => a - b)) {
    const q = byId.get(id);
    if (!q) continue;
    const part = q.question.part;
    const st = scored[part].raw.stats.get(id);
    const n = st?.n ?? 0;
    const m = st?.m ?? 0;
    const p = st?.p ?? { n: 1n, d: 2n };
    const w = st?.w ?? { n: 3n, d: 2n };
    stats.push({
      id,
      part,
      lang: q.lang,
      format: q.question.format,
      title: q.title,
      voided: q.voided,
      n,
      m,
      p: fracText(p),
      w: fracText(w),
      pv: share(p),
      wv: share(w),
      wrong: wrongPick(q.question, valuesOf.get(id) ?? []),
    });
  }
  return { rows, stats, started, liveWaiting };
}

/* ------------------------------------------------------------ wrong picks */

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function top(counts: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  // Ties go to the key that sorts first, so the answer never depends on seat order.
  for (const [k, n] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
    if (!best || n > best[1]) best = [k, n];
  return best;
}

/**
 * The wrong answer picked by the most seats, for the formats where "a wrong
 * answer" is one thing: an option (single, multi), a line (lines), an option
 * in a slot (fix), and the text typed into a blank (fitb). Order and match
 * have no single wrong answer; they answer null.
 */
export function wrongPick(q: Question, values: readonly Value[]): WrongPick | null {
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  switch (q.format) {
    case "single": {
      for (const v of values)
        if (v && "pick" in v && typeof v.pick === "string" && v.pick !== q.answer.correct)
          bump(v.pick);
      const t = top(counts);
      const o = t && q.body.options.find((x) => x.id === t[0]);
      return t ? { n: t[1], id: t[0], kind: "option", text: clip(o?.text ?? t[0]) } : null;
    }
    case "multi": {
      const right = new Set(q.answer.correct);
      for (const v of values)
        if (v && "picks" in v && Array.isArray(v.picks))
          for (const x of new Set(v.picks as string[])) if (!right.has(x)) bump(x);
      const t = top(counts);
      const o = t && q.body.options.find((x) => x.id === t[0]);
      return t ? { n: t[1], id: t[0], kind: "option", text: clip(o?.text ?? t[0]) } : null;
    }
    case "lines": {
      const right = new Set(q.answer.lines);
      for (const v of values)
        if (v && "picks" in v && Array.isArray(v.picks))
          for (const x of new Set(v.picks as number[])) if (!right.has(x)) bump(String(x));
      const t = top(counts);
      return t ? { n: t[1], id: t[0], kind: "line", text: "" } : null;
    }
    case "fix": {
      for (const v of values) {
        if (!v || !("picks" in v) || Array.isArray(v.picks)) continue;
        for (const [line, o] of Object.entries(v.picks as Record<string, string | null>))
          if (o != null && q.answer.picks[Number(line)] !== o) bump(`${line}:${o}`);
      }
      const t = top(counts);
      if (!t) return null;
      const [line, opt] = t[0].split(":");
      const slot = q.body.slots.find((s) => String(s.line) === line);
      const o = slot?.options.find((x) => x.id === opt);
      return { n: t[1], id: t[0], kind: "slot", text: clip(o?.text ?? opt) };
    }
    case "fitb": {
      for (const v of values) {
        if (!v || !("blanks" in v)) continue;
        for (const [n, s] of Object.entries(v.blanks as Record<string, unknown>)) {
          if (typeof s !== "string" || s.trim() === "") continue;
          const key = q.answer.blanks[Number(n)];
          // A blank that earned credit is not wrong; the key's own rule decides what is.
          if (key && credit(blankOnly(q, Number(n)), { blanks: { [n]: s } }).n > 0n) continue;
          bump(`${n}:${s}`);
        }
      }
      const t = top(counts);
      if (!t) return null;
      const at = t[0].indexOf(":");
      return { n: t[1], id: t[0].slice(0, at), kind: "blank", text: clip(t[0].slice(at + 1)) };
    }
    default:
      return null;
  }
}

/** A one-blank copy of a fitb question, so `credit` can judge that blank alone. */
function blankOnly(q: Extract<Question, { format: "fitb" }>, n: number): Question {
  return {
    ...q,
    body: { ...q.body, blanks: q.body.blanks.filter((b) => b.n === n) },
    answer: { blanks: { [n]: q.answer.blanks[n] } },
  };
}

/* ------------------------------------------------------------- histogram */

export interface Bin {
  from: number;
  /** Exclusive, except the last bin, which holds `cap` itself */
  to: number;
  n: number;
}

/** `bins` equal bins over 0..cap; every value lands in exactly one. */
export function histogram(values: readonly number[], cap: number, bins = 10): Bin[] {
  const out: Bin[] = [];
  for (let i = 0; i < bins; i++)
    out.push({ from: (cap * i) / bins, to: (cap * (i + 1)) / bins, n: 0 });
  for (const v of values) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((v / cap) * bins)));
    out[i].n++;
  }
  return out;
}
