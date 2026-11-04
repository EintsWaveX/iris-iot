/**
 * The bonus round and per-question scores (4 Nov 2026): the three Live Coding tiers, the
 * Tampil / Target numbers, what a part's maximum is with bonus, how bonus questions are scored on
 * top of the cap, and how a bonus is dealt.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXAM_CONFIG,
  type DrawnItem,
  type Question,
  type SingleQ,
} from "../recruitment/exam-types";
import {
  capsOf,
  defaultQuestionPoints,
  maxWithBonus,
  spreadDraw,
  upgradeConfig,
  validateConfig,
} from "../recruitment/exam-config";
import { drawBonus, drawBonusProblems, drawSeed } from "../recruitment/draw";
import { ONE, ZERO, frac } from "../recruitment/frac";
import { scorePart, type SeatPart } from "../recruitment/scoring";

const SALT = "ab".repeat(32);

describe("the default config", () => {
  it("deals 5 of 24 Live Coding problems, 2 easy, 2 medium and 1 hard, worth the Live Coding share", () => {
    const c = DEFAULT_EXAM_CONFIG;
    expect(c.livecode.draw).toEqual({ easy: 2, medium: 2, hard: 1 });
    expect(c.livecode.pool).toBe(24);
    expect(validateConfig(c)).toEqual([]);
    expect(capsOf(c).livecode).toBe(2400);
  });

  it("a part's maximum with bonus is its cap over what is shown, times the pool", () => {
    const m = maxWithBonus(DEFAULT_EXAM_CONFIG);
    expect(m.parts.logika).toBe(Math.round((640 * 20) / 15));
    // 2400 base plus the 19 other problems of an even 8 / 8 / 8 pool at their tier's points
    expect(m.livecode).toBe(2400 + 6 * 300 + 6 * 500 + 7 * 800);
  });

  it("a written question's default score is the cap over what is shown", () => {
    expect(defaultQuestionPoints(DEFAULT_EXAM_CONFIG).logika).toBe(Math.round(640 / 15));
  });
});

describe("spreadDraw", () => {
  it("is the default mix at 5 and always adds up", () => {
    expect(spreadDraw(5)).toEqual({ easy: 2, medium: 2, hard: 1 });
    for (let n = 1; n <= 40; n++) {
      const d = spreadDraw(n);
      expect(d.easy + d.medium + d.hard).toBe(n);
    }
  });
});

describe("upgradeConfig keeps what an older config dealt", () => {
  it("a config saved before the hard tier deals no hard problem and still adds up", () => {
    const c = upgradeConfig({
      v: 2,
      budgetMin: 120,
      livecode: {
        minutes: 60,
        draw: { easy: 3, medium: 2 },
        points: { easy: 400, medium: 600 },
        runLimit: 0,
        workers: 4,
      },
    });
    expect(c.livecode.draw).toEqual({ easy: 3, medium: 2, hard: 0 });
    expect(c.livecode.pool).toBe(24);
    expect(validateConfig(c)).toEqual([]);
  });

  it("bonus minutes are read, and refused when out of range", () => {
    const c = upgradeConfig({ v: 2, parts: { logika: { bonusMin: 8 } } });
    expect(c.parts.logika.bonusMin).toBe(8);
    c.parts.fitb.bonusMin = 99;
    expect(validateConfig(c).map((e) => e.kode)).toContain("menit_salah");
  });
});

/* --------------------------------------------------------------- scoring */

const seat = (
  id: number,
  drawn: number[],
  credits: Record<number, ReturnType<typeof frac>>,
  bonus?: number[],
): SeatPart => ({ seat: id, drawn, ...(bonus ? { bonus } : {}), credits });

describe("scorePart with bonus questions", () => {
  // Two questions dealt (1, 2), one bonus (3) that only seat 1 took
  const seats = [
    seat(1, [1, 2], { 1: ONE, 2: ONE, 3: ONE }, [3]),
    seat(2, [1, 2], { 1: ONE, 2: ZERO }),
    seat(3, [1, 2], { 1: ONE, 2: ONE }),
  ];

  it("a seat that did everything right and took the bonus passes the cap", () => {
    const out = scorePart(1000, seats, new Set());
    expect(out.seats.get(3)!.score).toBe(1000);
    expect(out.seats.get(1)!.score).toBeGreaterThan(1000);
  });

  it("the bonus counts as dealt only for those who answered it", () => {
    const out = scorePart(1000, seats, new Set());
    expect(out.stats.get(3)!.n).toBe(1);
    expect(out.stats.get(1)!.n).toBe(3);
  });

  it("a seat without a bonus is scored as before, so the cap is still the dealt questions", () => {
    const plain = seats.map((s) => ({ ...s, bonus: undefined }));
    const withBonus = scorePart(1000, seats, new Set());
    const without = scorePart(1000, plain, new Set());
    expect(withBonus.seats.get(2)!.score).toBe(without.seats.get(2)!.score);
  });
});

describe("scorePart with a score per question", () => {
  const seats = [seat(1, [1, 2], { 1: ONE, 2: ZERO }), seat(2, [1, 2], { 1: ZERO, 2: ONE })];

  it("equal scores are the pass-rate weighting alone", () => {
    const plain = scorePart(1000, seats, new Set());
    const equal = scorePart(
      1000,
      seats,
      new Set(),
      new Map([
        [1, 85],
        [2, 85],
      ]),
      85,
    );
    expect(equal.seats.get(1)!.score).toBe(plain.seats.get(1)!.score);
  });

  it("a question worth three times as much moves the score with it, and the cap stays the cap", () => {
    const heavy = scorePart(1000, seats, new Set(), new Map([[1, 300]]), 100);
    // seat 1 has the heavy question right, seat 2 the light one
    expect(heavy.seats.get(1)!.score).toBeGreaterThan(heavy.seats.get(2)!.score);
    expect(heavy.seats.get(1)!.score + heavy.seats.get(2)!.score).toBe(1000);
  });
});

/* ------------------------------------------------------------- the deal */

const sq = (id: number): SingleQ => ({
  id,
  part: "logika",
  lang: "c",
  format: "single",
  version: 1,
  body: {
    prompt: `Soal ${id}`,
    options: ["a", "b", "c", "d"].map((x) => ({ id: `${x}${id}`, text: x })),
    shuffle: true,
  },
  answer: { correct: `a${id}` },
});

describe("drawBonus", () => {
  const pool: Question[] = [1, 2, 3, 4, 5, 6].map(sq);
  const dealt = new Set([1, 2, 3]);

  it("deals every question the seat did not get, once, the same way for the same seed", async () => {
    const seed = await drawSeed(SALT, 9, "logika");
    const a: DrawnItem[] = drawBonus(seed, pool, dealt);
    expect(a.map((i) => i.q).sort()).toEqual([4, 5, 6]);
    expect(drawBonus(seed, [...pool].reverse(), dealt)).toEqual(a);
  });

  it("is empty when the seat already has the whole pool", async () => {
    const seed = await drawSeed(SALT, 9, "logika");
    expect(drawBonus(seed, pool, new Set(pool.map((p) => p.id)))).toEqual([]);
  });
});

describe("drawBonusProblems", () => {
  const pool = [
    ...[1, 2, 3].map((id) => ({ id, tier: "easy" as const })),
    ...[4, 5].map((id) => ({ id, tier: "medium" as const })),
    ...[6, 7].map((id) => ({ id, tier: "hard" as const })),
  ];

  it("deals the rest of the pool, easy tier first, never a problem already held", async () => {
    const seed = await drawSeed(SALT, 4, "livecode");
    const ids = drawBonusProblems(seed, pool, new Set([1, 4, 6]));
    expect(ids).toHaveLength(4);
    expect(ids.slice(0, 2).sort()).toEqual([2, 3]);
    expect(ids[2]).toBe(5);
    expect(ids[3]).toBe(7);
  });
});
