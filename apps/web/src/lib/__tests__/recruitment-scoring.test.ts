/**
 * Scoring (EXAM-ENGINE 4). The worked example of 4.4 is normative: this file
 * reproduces every number in it, with credits from the real formats.
 */
import { describe, expect, it } from "vitest";
import type {
  FitbQ,
  MultiQ,
  OrderQ,
  Rubric,
  RubricSheet,
  SingleQ,
  Value,
} from "../recruitment/exam-types";
import { credit } from "../recruitment/formats";
import { frac, type Frac } from "../recruitment/frac";
import {
  countedSheets,
  livecodeScore,
  scorePart,
  sheetRatio,
  totals,
  weightOf,
  type SeatPart,
} from "../recruitment/scoring";

const opt = (...xs: string[]) => xs.map((id) => ({ id, text: id }));
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
const QS = { 1: q1, 2: q2, 3: q3, 4: q4 } as const;

/** The table of 4.4: seat → question → value (absent key: not drawn). */
const ANSWERS: Record<number, Partial<Record<1 | 2 | 3 | 4, Value>>> = {
  1: { 1: { pick: "b" }, 2: { picks: ["a", "c"] }, 3: { order: ["l1", "l2", "l3", "l4"] } },
  2: { 1: { pick: "a" }, 2: { picks: ["a"] }, 4: { blanks: { 1: "x", 2: "z" } } },
  3: {
    1: { pick: "b" },
    3: { order: ["l1", "l3", "l2", "l4"] },
    4: { blanks: { 1: "x", 2: "y" } },
  },
  4: { 2: { picks: ["a", "b", "c"] }, 3: null, 4: { blanks: {} } },
};

function seats(): SeatPart[] {
  const rows: SeatPart[] = Object.entries(ANSWERS).map(([seat, byQ]) => {
    const drawn = Object.keys(byQ).map(Number);
    const credits: Record<number, Frac> = {};
    for (const id of drawn)
      credits[id] = credit(QS[id as 1 | 2 | 3 | 4], byQ[id as 1 | 2 | 3 | 4] ?? null);
    return { seat: Number(seat), drawn, credits };
  });
  rows.push({ seat: 5, drawn: null, credits: {} });
  return rows;
}

describe("weightOf", () => {
  it("w = 2 − (M + 1) / (N + 2)", () => {
    expect(weightOf(3, 2)).toEqual(frac(7, 5));
    expect(weightOf(3, 1)).toEqual(frac(8, 5));
    expect(weightOf(0, 0)).toEqual(frac(3, 2));
  });
});

describe("scorePart, the worked example of 4.4", () => {
  const out = scorePart(1000, seats(), new Set());

  it("statistics: N, M, p and w per question, S5 out of every N", () => {
    expect(out.stats.get(1)).toEqual({ n: 3, m: 2, p: frac(3, 5), w: frac(7, 5) });
    expect(out.stats.get(2)).toEqual({ n: 3, m: 1, p: frac(2, 5), w: frac(8, 5) });
    expect(out.stats.get(3)).toEqual({ n: 3, m: 1, p: frac(2, 5), w: frac(8, 5) });
    expect(out.stats.get(4)).toEqual({ n: 3, m: 1, p: frac(2, 5), w: frac(8, 5) });
  });

  it("part scores 1000, 348, 783, 167 and S5 absent", () => {
    expect(out.seats.get(1)).toEqual({ score: 1000, ratio: frac(1) });
    expect(out.seats.get(2)).toEqual({ score: 348, ratio: frac(8, 23) });
    expect(out.seats.get(3)).toEqual({ score: 783, ratio: frac(18, 23) });
    expect(out.seats.get(4)).toEqual({ score: 167, ratio: frac(1, 6) });
    expect(out.seats.get(5)).toEqual({ score: 0, ratio: frac(0), flag: "absent" });
  });

  it("q4 voided: 1000, 267, 667, 250", () => {
    const v = scorePart(1000, seats(), new Set([4]));
    expect(v.stats.has(4)).toBe(false);
    expect(v.stats.get(1)).toEqual({ n: 3, m: 2, p: frac(3, 5), w: frac(7, 5) });
    expect([1, 2, 3, 4].map((s) => v.seats.get(s)!.score)).toEqual([1000, 267, 667, 250]);
  });

  it("a part's cap comes from the config: the same ratios rescale (cap 320 gives 111 and 250)", () => {
    const small = scorePart(320, seats(), new Set());
    expect(small.seats.get(2)!.score).toBe(111);
    expect(small.seats.get(3)!.score).toBe(250);
  });

  it("a seat whose drawn questions were all voided scores 0, flagged empty", () => {
    const v = scorePart(1000, [{ seat: 9, drawn: [4], credits: { 4: frac(1) } }], new Set([4]));
    expect(v.seats.get(9)).toEqual({ score: 0, ratio: frac(0), flag: "empty" });
  });

  it("an unanswered drawn question counts as shown with credit 0", () => {
    const v = scorePart(1000, [{ seat: 1, drawn: [1, 2], credits: { 1: frac(1) } }], new Set());
    expect(v.stats.get(2)).toEqual({ n: 1, m: 0, p: frac(1, 3), w: frac(5, 3) });
    // (1 × 4/3) ÷ (4/3 + 5/3) = 4/9
    expect(v.seats.get(1)).toEqual({ score: 444, ratio: frac(4, 9) });
  });
});

describe("Live Coding sheets (9.8)", () => {
  const rubric: Rubric = {
    id: 1,
    stage: "tes_tulis",
    kind: "livecode",
    rows: [
      { key: "jalan", label: "Jalan", max: 4, weight: 3 },
      { key: "protokol", label: "Protokol", max: 4, weight: 2 },
      { key: "data", label: "Data", max: 4, weight: 2 },
      { key: "kode", label: "Kode", max: 4, weight: 1 },
      { key: "jelas", label: "Jelas", max: 4, weight: 2 },
    ],
  };
  const sheet = (grader: string, at: number, v: number[]): RubricSheet => ({
    grader,
    at,
    values: Object.fromEntries(rubric.rows.map((r, i) => [r.key, v[i]])),
  });
  const A = sheet("101", 10, [3, 4, 3, 2, 3]);
  const B = sheet("102", 20, [4, 3, 4, 3, 3]);

  it("a sheet's ratio is Σ weight·value/max ÷ Σ weight", () => {
    expect(sheetRatio(rubric, A.values)).toEqual(frac(31, 40));
    expect(sheetRatio(rubric, B.values)).toEqual(frac(35, 40));
  });

  it("two graders give 825 (4.4), and the cap scales it: 1980 of 2400", () => {
    expect(livecodeScore(rubric, [A, B], 1000)).toBe(825);
    expect(livecodeScore(rubric, [A, B], 2400)).toBe(1980);
  });

  it("is null with fewer than two counted sheets", () => {
    expect(livecodeScore(rubric, [A], 1000)).toBeNull();
    expect(livecodeScore(rubric, [A, { ...A, at: 30 }], 1000)).toBeNull();
  });

  it("counts the first two from two different people", () => {
    const C = sheet("103", 30, [0, 0, 0, 0, 0]);
    const A2 = { ...sheet("101", 15, [0, 0, 0, 0, 0]) };
    expect(countedSheets([C, B, A2, A]).map((s) => s.at)).toEqual([10, 20]);
    expect(livecodeScore(rubric, [C, B, A2, A], 1000)).toBe(825);
  });

  it("a missing or out of range value is refused", () => {
    expect(() => sheetRatio(rubric, { ...A.values, kode: 5 })).toThrow();
    const { jelas: _gone, ...short } = A.values;
    expect(() => sheetRatio(rubric, short)).toThrow();
  });
});

describe("totals", () => {
  it("the written total is the three parts, and the test total adds Live Coding", () => {
    expect(totals({ logika: 783, fitb: 348, kodingan: 174, livecode: 825 })).toEqual({
      phase1: 1305,
      total: 2130,
    });
  });
  it("without a Live Coding score the total is the written total alone", () => {
    expect(totals({ logika: 783, fitb: 348, kodingan: 174, livecode: null }).total).toBe(1305);
  });
});
