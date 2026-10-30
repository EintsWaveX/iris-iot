/**
 * Live Coding in C (B7.2): how an answer is compared, when a problem may be
 * saved, and how a seat's points come out of its runs.
 */
import { describe, expect, it } from "vitest";
import {
  C_LIMITS,
  DEFAULT_STARTER,
  bestRun,
  livecodeResult,
  normalizeOutput,
  passedOf,
  problemPoints,
  sameOutput,
  validateProblem,
  type CProblemDraft,
  type TestVerdict,
} from "../recruitment/c-problem";
import { SEED_PROBLEMS } from "../recruitment/seed-problems";
import { DEFAULT_EXAM_CONFIG } from "../recruitment/exam-types";

const draft = (): CProblemDraft => ({
  title: "Jumlah Dua Bilangan",
  tier: "easy",
  body: {
    statement: "Baca dua bilangan, cetak jumlahnya.",
    input: "Satu baris: dua bilangan bulat.",
    output: "Satu bilangan: jumlahnya.",
    starter: DEFAULT_STARTER,
  },
  limits: { timeMs: 1000, memKb: 65_536 },
  samples: [{ input: "1 2\n", output: "3\n" }],
  tests: [
    { input: "1 2\n", output: "3\n" },
    { input: "5 5\n", output: "10\n" },
    { input: "-4 4\n", output: "0\n" },
  ],
  reference:
    '#include <stdio.h>\nint main(void){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);return 0;}\n',
});
const fields = (d: CProblemDraft) => validateProblem(d).map((e) => `${e.field}:${e.kode}`);
const tv = (v: TestVerdict["v"]): TestVerdict => ({ v, ms: 1, kb: 1 });

describe("normalizeOutput and sameOutput", () => {
  it("line endings, trailing spaces and trailing blank lines do not count", () => {
    expect(sameOutput("3\n", "3")).toBe(true);
    expect(sameOutput("3\r\n", "3\n\n\n")).toBe(true);
    expect(sameOutput("a b  \nc\t\n", "a b\nc")).toBe(true);
    expect(normalizeOutput("x\r\ny\r")).toBe("x\ny");
  });
  it("everything else must match exactly", () => {
    expect(sameOutput("3", "4")).toBe(false);
    expect(sameOutput("a b", "a  b")).toBe(false);
    expect(sameOutput("a\nb", "a\n\nb")).toBe(false);
    expect(sameOutput(" 3", "3")).toBe(false);
    expect(sameOutput("Yes", "yes")).toBe(false);
  });
});

describe("validateProblem", () => {
  it("accepts a sound problem", () => {
    expect(validateProblem(draft())).toEqual([]);
  });

  it("wants a title, the three texts, a reference and an output for every example", () => {
    const d = draft();
    d.title = "  ";
    d.body.statement = "";
    d.body.input = " ";
    d.body.output = "";
    d.reference = "";
    d.samples[0].output = "";
    d.tests[1].output = "";
    expect(fields(d)).toEqual([
      "title:kosong",
      "body.statement:kosong",
      "body.input:kosong",
      "body.output:kosong",
      "samples.0.output:kosong",
      "tests.1.output:kosong",
      "reference:kosong",
    ]);
  });

  it("keeps the limits, the counts and the tier in range", () => {
    const d = draft();
    d.tier = "hard" as never;
    d.limits = { timeMs: 50, memKb: 1_000_000 };
    d.samples = [];
    d.tests = d.tests.slice(0, 2);
    expect(fields(d)).toEqual([
      "tier:tingkat_salah",
      "limits.timeMs:batas_salah",
      "limits.memKb:batas_salah",
      "samples:contoh_kurang",
      "tests:tes_kurang",
    ]);
    const big = draft();
    big.samples = Array.from({ length: C_LIMITS.samples.max + 1 }, () => big.samples[0]);
    big.tests = Array.from({ length: C_LIMITS.tests.max + 1 }, (_, i) => ({
      input: `${i}\n`,
      output: "1\n",
    }));
    expect(fields(big)).toEqual(["samples:contoh_kebanyakan", "tests:tes_kebanyakan"]);
  });

  it("refuses two hidden tests with the same input", () => {
    const d = draft();
    d.tests[2] = { input: "1 2\r\n", output: "3\n" };
    expect(fields(d)).toEqual(["tests.2:tes_kembar"]);
  });

  it("refuses text that is too long", () => {
    const d = draft();
    d.title = "x".repeat(C_LIMITS.title + 1);
    d.body.statement = "y".repeat(C_LIMITS.text + 1);
    expect(fields(d)).toEqual(["title:terlalu_panjang", "body.statement:terlalu_panjang"]);
  });
});

describe("points from runs", () => {
  it("counts only the tests that were accepted", () => {
    expect(passedOf([tv("ac"), tv("wa"), tv("tle"), tv("ac"), tv("re")])).toBe(2);
    expect(passedOf([])).toBe(0);
  });

  it("rounds points x passed / total with a half going up", () => {
    expect(problemPoints(400, { passed: 8, total: 8 })).toBe(400);
    expect(problemPoints(400, { passed: 0, total: 8 })).toBe(0);
    expect(problemPoints(600, { passed: 7, total: 10 })).toBe(420);
    expect(problemPoints(400, { passed: 1, total: 8 })).toBe(50);
    expect(problemPoints(500, { passed: 1, total: 3 })).toBe(167);
    expect(problemPoints(400, { passed: 1, total: 800 })).toBe(1);
    expect(problemPoints(400, { passed: 3, total: 0 })).toBe(0);
  });

  it("the best run has the most tests passed, the earlier one on a tie", () => {
    expect(bestRun([])).toBeNull();
    const a = { passed: 3, total: 8, at: 10 };
    const b = { passed: 6, total: 8, at: 30 };
    const c = { passed: 6, total: 8, at: 20 };
    expect(bestRun([a, b, c])).toBe(c);
    expect(bestRun([b, a])).toBe(b);
  });

  it("adds a hand of problems up, and knows when nothing was sent", () => {
    const r = livecodeResult([
      {
        problemId: 1,
        points: 400,
        runs: [
          { passed: 4, total: 8, at: 1 },
          { passed: 8, total: 8, at: 2 },
        ],
      },
      { problemId: 2, points: 400, runs: [{ passed: 1, total: 8, at: 1 }] },
      { problemId: 3, points: 600, runs: [] },
    ]);
    expect(r.problems.map((p) => p.got)).toEqual([400, 50, 0]);
    expect(r.total).toBe(450);
    expect(r.empty).toBe(false);
    const none = livecodeResult([{ problemId: 1, points: 400, runs: [] }]);
    expect(none).toMatchObject({ total: 0, empty: true });
  });

  it("a full hand at the default points is the whole Live Coding share", () => {
    const hand = [400, 400, 400, 600, 600].map((points, i) => ({
      problemId: i + 1,
      points,
      runs: [{ passed: 5, total: 5, at: 1 }],
    }));
    expect(livecodeResult(hand).total).toBe(2400);
  });
});

describe("the default problems", () => {
  it("are all sound, with the samples being the first tests", () => {
    expect(SEED_PROBLEMS).toHaveLength(8);
    for (const p of SEED_PROBLEMS) {
      expect(validateProblem(p), p.title).toEqual([]);
      expect(p.tests.slice(0, p.samples.length)).toEqual(p.samples);
    }
  });
  it("hold enough of each tier for every seat's hand", () => {
    for (const tier of ["easy", "medium"] as const) {
      expect(SEED_PROBLEMS.filter((p) => p.tier === tier).length).toBeGreaterThanOrEqual(
        DEFAULT_EXAM_CONFIG.livecode.draw[tier],
      );
    }
  });
});
