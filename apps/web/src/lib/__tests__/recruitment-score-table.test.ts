/**
 * The score table (prompt 13). The 4.4 worked example goes through
 * `assemble` as the API calls it, then a 30 seat simulation is checked
 * against an independent oracle that uses plain numbers (a different road to
 * the same points), and the pieces the Penilaian tab reads: the most picked
 * wrong answer and the histogram bins.
 */
import { describe, expect, it } from "vitest";
import type {
  FitbQ,
  MultiQ,
  OrderQ,
  Question,
  SeatDraw,
  SingleQ,
  Value,
} from "../recruitment/exam-types";
import type { Caps } from "../recruitment/exam-config";
import {
  assemble,
  histogram,
  wrongPick,
  type QuestionIn,
  type SeatIn,
} from "../recruitment/score-table";

/** The caps the worked example of 4.4 was written with: 1000 a part, 500 for Kodingan, 1000 for Live Coding. */
const CAPS: Caps = {
  parts: { logika: 1000, fitb: 1000, kodingan: 500 },
  written: 2500,
  livecode: 1000,
  total: 3500,
};
const asm = (
  seats: readonly SeatIn[],
  bank: readonly QuestionIn[],
  live: Parameters<typeof assemble>[2],
) => assemble(seats, bank, live, CAPS);

const opt = (...xs: string[]) => xs.map((id) => ({ id, text: `opsi ${id}` }));
const q1: SingleQ = {
  id: 1,
  part: "logika",
  lang: "c",
  format: "single",
  version: 1,
  body: { prompt: "q1", options: opt("a", "b", "c"), shuffle: true },
  answer: { correct: "b" },
};
const q2: MultiQ = {
  id: 2,
  part: "logika",
  lang: "c",
  format: "multi",
  version: 1,
  body: { prompt: "q2", options: opt("a", "b", "c", "d"), shuffle: true },
  answer: { correct: ["a", "c"] },
};
const q3: OrderQ = {
  id: 3,
  part: "logika",
  lang: "c",
  format: "order",
  version: 1,
  body: {
    prompt: "q3",
    lang: "c",
    lines: [
      { id: "l1", text: "satu" },
      { id: "l2", text: "dua" },
      { id: "l3", text: "tiga" },
      { id: "l4", text: "empat" },
    ],
  },
  answer: { order: ["l1", "l2", "l3", "l4"], also: [] },
};
const q4: FitbQ = {
  id: 4,
  part: "logika",
  lang: "c",
  format: "fitb",
  version: 1,
  body: { prompt: "q4 __(1)__ __(2)__", blanks: [{ n: 1 }, { n: 2 }] },
  answer: { blanks: { 1: { accept: ["x"] }, 2: { accept: ["y"] } } },
};
const BANK: QuestionIn[] = [q1, q2, q3, q4].map((q) => ({
  id: q.id,
  title: `Soal ${q.id}`,
  lang: q.lang,
  question: q as Question,
  voided: false,
}));

const drawOf = (part: "logika", ids: number[]): SeatDraw => ({
  [part]: {
    at: 1,
    room: 1,
    items: ids.map((q) => ({ q, v: 1, lang: "c" as const, perm: null })),
  },
});

const seat = (n: number, ids: number[] | null, values: Record<number, Value>): SeatIn => ({
  seatId: n,
  candidateId: 100 + n,
  roomId: 1,
  nim: `1220${n}`,
  nama: `Calon ${n}`,
  draw: ids ? drawOf("logika", ids) : {},
  values: new Map(Object.entries(values).map(([k, v]) => [Number(k), v])),
});

/** The table of 4.4. */
const SEATS = [
  seat(1, [1, 2, 3], {
    1: { pick: "b" },
    2: { picks: ["a", "c"] },
    3: { order: ["l1", "l2", "l3", "l4"] },
  }),
  seat(2, [1, 2, 4], { 1: { pick: "a" }, 2: { picks: ["a"] }, 4: { blanks: { 1: "x", 2: "z" } } }),
  seat(3, [1, 3, 4], {
    1: { pick: "b" },
    3: { order: ["l1", "l3", "l2", "l4"] },
    4: { blanks: { 1: "x", 2: "y" } },
  }),
  seat(4, [2, 3, 4], { 2: { picks: ["a", "b", "c"] }, 4: { blanks: {} } }),
  seat(5, null, {}),
];

const NO_LIVE: Parameters<typeof assemble>[2] = {
  hand: new Map(),
  runs: new Map(),
  waiting: new Set(),
};

describe("assemble, the worked example of 4.4", () => {
  const out = asm(SEATS, BANK, NO_LIVE);
  const logika = (n: number) => out.rows.find((r) => r.seatId === n)!.parts.logika;

  it("part scores 1000, 348, 783, 167 and S5 absent", () => {
    expect([1, 2, 3, 4].map((n) => logika(n).score)).toEqual([1000, 348, 783, 167]);
    expect(logika(5)).toEqual({ score: 0, flag: "absent" });
    expect(out.started.logika).toBe(4);
    expect(out.started.fitb).toBe(0);
  });

  it("statistics are N, M, p and w per question", () => {
    const s = (id: number) => out.stats.find((x) => x.id === id)!;
    expect([s(1).n, s(1).m, s(1).p, s(1).w]).toEqual([3, 2, "3/5", "7/5"]);
    expect([s(2).n, s(2).m, s(2).p, s(2).w]).toEqual([3, 1, "2/5", "8/5"]);
    expect([s(3).n, s(3).m, s(3).p, s(3).w]).toEqual([3, 1, "2/5", "8/5"]);
    expect([s(4).n, s(4).m, s(4).p, s(4).w]).toEqual([3, 1, "2/5", "8/5"]);
    expect(s(1).pv).toBeCloseTo(0.6);
    expect(s(1).wv).toBeCloseTo(1.4);
  });

  it("the most picked wrong answer of q1 is option a, and of q4 the blank typed z", () => {
    const s = (id: number) => out.stats.find((x) => x.id === id)!;
    expect(s(1).wrong).toEqual({ n: 1, id: "a", kind: "option", text: "opsi a" });
    expect(s(4).wrong).toEqual({ n: 1, id: "2", kind: "blank", text: "z" });
    expect(s(3).wrong).toBeNull();
  });

  it("q4 voided: 1000, 267, 667, 250, and the void keeps its numbers in the statistics", () => {
    const v = asm(
      SEATS,
      BANK.map((q) => (q.id === 4 ? { ...q, voided: true } : q)),
      NO_LIVE,
    );
    expect([1, 2, 3, 4].map((n) => v.rows.find((r) => r.seatId === n)!.parts.logika.score)).toEqual(
      [1000, 267, 667, 250],
    );
    const s4 = v.stats.find((x) => x.id === 4)!;
    expect(s4.voided).toBe(true);
    expect([s4.n, s4.m]).toEqual([3, 1]);
  });

  it("a part everyone drew only voided questions of is empty, not absent", () => {
    const v = asm(
      [seat(1, [4], { 4: { blanks: { 1: "x", 2: "y" } } })],
      BANK.map((q) => (q.id === 4 ? { ...q, voided: true } : q)),
      NO_LIVE,
    );
    expect(v.rows[0].parts.logika).toEqual({ score: 0, flag: "empty" });
  });

  it("a deleted question leaves the sums instead of breaking them", () => {
    const v = asm(
      SEATS,
      BANK.filter((q) => q.id !== 4),
      NO_LIVE,
    );
    expect(v.rows.find((r) => r.seatId === 1)!.parts.logika.score).toBe(1000);
  });

  it("a candidate without any seat topic gets 0 Live Coding flagged tanpa", () => {
    const r = out.rows.find((x) => x.seatId === 3)!;
    expect(r.livecode).toBe(0);
    expect(r.liveFlag).toBe("tanpa");
    expect(r.total).toBe(783);
    expect(r.phase1).toBe(783);
  });
});

describe("assemble, Live Coding in C", () => {
  const hand = [
    { problemId: 1, points: 400 },
    { problemId: 2, points: 600 },
  ];
  const run = (problemId: number, passed: number, total: number, at = 1) => ({
    problemId,
    passed,
    total,
    at,
  });

  it("adds each problem's best Submit, rounded, and the total adds it", () => {
    const out = asm(SEATS, BANK, {
      hand: new Map([[3, hand]]),
      runs: new Map([[3, [run(1, 4, 8), run(1, 8, 8, 2), run(2, 5, 10)]]]),
      waiting: new Set(),
    });
    const r = out.rows.find((x) => x.seatId === 3)!;
    expect(r.livecode).toBe(700);
    expect(r.liveFlag).toBeUndefined();
    expect(r.total).toBe(783 + 700);
  });

  it("a seat that was dealt a hand but sent nothing has 0 and is not flagged tanpa", () => {
    const out = asm(SEATS, BANK, {
      hand: new Map([[3, hand]]),
      runs: new Map(),
      waiting: new Set(),
    });
    const r = out.rows.find((x) => x.seatId === 3)!;
    expect(r.livecode).toBe(0);
    expect(r.liveFlag).toBeUndefined();
  });

  it("a Submit still at the judge flags the seat belum and counts what is finished", () => {
    const out = asm(SEATS, BANK, {
      hand: new Map([[1, hand]]),
      runs: new Map([[1, [run(1, 8, 8)]]]),
      waiting: new Set([1]),
    });
    const r = out.rows.find((x) => x.seatId === 1)!;
    expect(r.liveFlag).toBe("belum");
    expect(r.livecode).toBe(400);
    expect(out.liveWaiting).toEqual([1]);
  });

  it("seats without a hand stay tanpa, and a problem no longer in the pool is simply worth nothing", () => {
    const out = asm(SEATS, BANK, { hand: new Map([[1, []]]), runs: new Map(), waiting: new Set() });
    expect(out.rows.find((x) => x.seatId === 2)!.liveFlag).toBe("tanpa");
    expect(out.rows.find((x) => x.seatId === 1)!.livecode).toBe(0);
  });
});

/* ------------------------------------------------- 30 seats, an oracle */

/** A small seeded generator (mulberry32), so the run is the same every time. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("30 simulated seats against an oracle", () => {
  const next = rng(20261025);
  // Six single questions, key "b"; each seat draws four of them.
  const singles: QuestionIn[] = [1, 2, 3, 4, 5, 6].map((id) => ({
    id,
    title: `S${id}`,
    lang: "c",
    question: {
      id,
      part: "logika",
      lang: "c",
      format: "single",
      version: 1,
      body: { prompt: `s${id}`, options: opt("a", "b", "c"), shuffle: false },
      answer: { correct: "b" },
    } as SingleQ,
    voided: false,
  }));
  const sims: SeatIn[] = Array.from({ length: 30 }, (_, i) => {
    const ids = [1, 2, 3, 4, 5, 6].sort(() => next() - 0.5).slice(0, 4);
    const values: Record<number, Value> = {};
    for (const q of ids) {
      const r = next();
      // unanswered, right, or wrong; harder questions (higher id) are missed more
      if (r < 0.1) continue;
      values[q] = { pick: next() < 0.75 - q * 0.08 ? "b" : "a" };
    }
    return seat(i + 1, ids, values);
  });

  /** The same formula in plain numbers: w = 2 - (M + 1) / (N + 2), round(1000 * ratio). */
  function oracle(voidId: number | null) {
    const N: Record<number, number> = {};
    const M: Record<number, number> = {};
    for (const s of sims)
      for (const it of s.draw.logika!.items) {
        if (it.q === voidId) continue;
        N[it.q] = (N[it.q] ?? 0) + 1;
        if ((s.values.get(it.q) as { pick: string } | undefined)?.pick === "b")
          M[it.q] = (M[it.q] ?? 0) + 1;
      }
    const w = (q: number) => 2 - ((M[q] ?? 0) + 1) / (N[q] + 2);
    return sims.map((s) => {
      const live = s.draw.logika!.items.map((i) => i.q).filter((q) => q !== voidId);
      const got = live.reduce(
        (a, q) => a + ((s.values.get(q) as { pick: string } | undefined)?.pick === "b" ? w(q) : 0),
        0,
      );
      const all = live.reduce((a, q) => a + w(q), 0);
      return Math.round((1000 * got) / all + 1e-9);
    });
  }

  it("every seat's Logika matches the oracle", () => {
    const out = asm(sims, singles, NO_LIVE);
    expect(out.rows.map((r) => r.parts.logika.score)).toEqual(oracle(null));
  });

  it("with a question voided every seat still matches the oracle", () => {
    const out = asm(
      sims,
      singles.map((q) => (q.id === 3 ? { ...q, voided: true } : q)),
      NO_LIVE,
    );
    expect(out.rows.map((r) => r.parts.logika.score)).toEqual(oracle(3));
  });

  it("the numbers are the same however the seats are ordered", () => {
    const a = asm(sims, singles, NO_LIVE);
    const b = asm([...sims].reverse(), singles, NO_LIVE);
    for (const r of a.rows) expect(b.rows.find((x) => x.seatId === r.seatId)).toEqual(r);
  });
});

/* ----------------------------------------------------------- wrong picks */

describe("wrongPick", () => {
  it("single: the wrong option with most picks; a tie goes to the id that sorts first", () => {
    const v: Value[] = [{ pick: "c" }, { pick: "a" }, { pick: "c" }, { pick: "b" }, { pick: null }];
    expect(wrongPick(q1, v)).toEqual({ n: 2, id: "c", kind: "option", text: "opsi c" });
    expect(wrongPick(q1, [{ pick: "c" }, { pick: "a" }])).toMatchObject({ id: "a" });
    expect(wrongPick(q1, [{ pick: "b" }])).toBeNull();
  });
  it("multi: counts each wrong option once per seat", () => {
    const v: Value[] = [{ picks: ["a", "d", "d"] }, { picks: ["d", "c"] }, { picks: ["b"] }];
    expect(wrongPick(q2, v)).toMatchObject({ id: "d", n: 2 });
  });
  it("order and match have no single wrong answer", () => {
    expect(wrongPick(q3, [{ order: ["l2", "l1", "l3", "l4"] }])).toBeNull();
  });
  it("fitb: ignores blanks the key accepts, keeps the typed text", () => {
    const v: Value[] = [
      { blanks: { 1: "x", 2: "z" } },
      { blanks: { 1: "q", 2: "z" } },
      { blanks: {} },
    ];
    expect(wrongPick(q4, v)).toEqual({ n: 2, id: "2", kind: "blank", text: "z" });
  });
});

describe("histogram", () => {
  it("puts every value in exactly one bin and the cap in the last", () => {
    const bins = histogram([0, 99, 100, 550, 1000, 1000], 1000, 10);
    expect(bins).toHaveLength(10);
    expect(bins.map((b) => b.n)).toEqual([2, 1, 0, 0, 0, 1, 0, 0, 0, 2]);
    expect(bins.reduce((a, b) => a + b.n, 0)).toBe(6);
    expect(bins[0]).toMatchObject({ from: 0, to: 100 });
  });
  it("clamps strays instead of dropping them", () => {
    expect(histogram([-5, 1200], 1000, 4).map((b) => b.n)).toEqual([1, 0, 0, 1]);
  });
});
