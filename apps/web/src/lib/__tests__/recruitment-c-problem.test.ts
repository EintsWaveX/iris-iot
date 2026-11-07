/**
 * Live Coding in C (B7.2): how an answer is compared, when a problem may be
 * saved, and how a seat's points come out of its runs.
 */
import { describe, expect, it } from "vitest";
import {
  C_LIMITS,
  DEFAULT_STARTER,
  NO_PENALTY,
  bestRun,
  failedSubmits,
  judgeRuns,
  lostPercent,
  outcomeOf,
  livecodeResult,
  normalizeOutput,
  parseProblemDraft,
  passedOf,
  problemPoints,
  repairHiddenTests,
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
    { input: "7 8\n", output: "15\n" },
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
    d.tier = "extreme" as never;
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
    d.tests[2] = { input: "5 5\r\n", output: "10\n" };
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
  it("are 24 sound problems, and no sample is also a hidden test", () => {
    expect(SEED_PROBLEMS).toHaveLength(24);
    for (const p of SEED_PROBLEMS) {
      expect(validateProblem(p), p.title).toEqual([]);
      const shown = new Set(p.samples.map((s) => s.input));
      expect(
        p.tests.filter((x) => shown.has(x.input)),
        p.title,
      ).toEqual([]);
    }
  });
  it("hold eight of each tier", () => {
    for (const tier of ["easy", "medium", "hard"] as const)
      expect(SEED_PROBLEMS.filter((p) => p.tier === tier)).toHaveLength(8);
  });
  it("a problem whose hidden test repeats a sample cannot be saved", () => {
    const p = structuredClone(SEED_PROBLEMS[0]);
    p.tests[0] = { ...p.samples[0] };
    expect(validateProblem(p).map((e) => e.kode)).toContain("tes_sama_contoh");
  });
  it("hold enough of each tier for every seat's hand", () => {
    for (const tier of ["easy", "medium", "hard"] as const) {
      expect(SEED_PROBLEMS.filter((p) => p.tier === tier).length).toBeGreaterThanOrEqual(
        DEFAULT_EXAM_CONFIG.livecode.draw[tier],
      );
    }
  });
});

describe("judging what the agent reports", () => {
  const want = ["3\n", "10\n", "0\n"];
  it("accepts a matching output and rejects a different one", () => {
    const v = judgeRuns(want, [
      { st: "ok", out: "3", ms: 4, kb: 900 },
      { st: "ok", out: "11\n" },
      { st: "ok", out: "0\r\n" },
    ]);
    expect(v.map((x) => x.v)).toEqual(["ac", "wa", "ac"]);
    expect(v[0]).toEqual({ v: "ac", ms: 4, kb: 900 });
  });
  it("passes the agent's other endings through as they are", () => {
    expect(judgeRuns(want, [{ st: "tle" }, { st: "mle" }, { st: "ole" }]).map((x) => x.v)).toEqual([
      "tle",
      "mle",
      "ole",
    ]);
    expect(judgeRuns(want, [{ st: "re" }, { st: "re" }, { st: "re" }]).map((x) => x.v)).toEqual([
      "re",
      "re",
      "re",
    ]);
  });
  it("a missing, unknown or output-less run never scores", () => {
    const v = judgeRuns(want, [{ st: "ok" }, { st: "weird" as never, out: "10" }]);
    expect(v.map((x) => x.v)).toEqual(["wa", "re", "re"]);
    expect(judgeRuns(want, undefined).every((x) => x.v === "re")).toBe(true);
  });
  it("clamps silly numbers", () => {
    const [a] = judgeRuns(["1"], [{ st: "ok", out: "1", ms: -5, kb: 1e12 }]);
    expect(a).toEqual({ v: "ac", ms: 0, kb: 4_000_000 });
  });
  it("a compile error has no verdicts and keeps a capped log", () => {
    const o = outcomeOf(want, { compile: { ok: false, log: "x".repeat(20_000) } });
    expect(o.compile.ok).toBe(false);
    expect(o.compile.log).toHaveLength(8000);
    expect(o.verdicts).toEqual([]);
  });
  it("a good compile judges every test", () => {
    const o = outcomeOf(want, {
      compile: { ok: true },
      runs: [{ st: "ok", out: "3" }, { st: "ok", out: "10" }, { st: "tle" }],
    });
    expect(passedOf(o.verdicts)).toBe(2);
    expect(o.verdicts).toHaveLength(3);
  });
});

describe("parseProblemDraft", () => {
  it("reads a draft back as it was written", () => {
    const d = draft();
    expect(parseProblemDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it("keeps an English text when it is whole, refuses a half one", () => {
    const d = draft();
    const en = { statement: "a", input: "b", output: "c" };
    expect(parseProblemDraft({ ...d, body: { ...d.body, en } })?.body.en).toEqual(en);
    expect(parseProblemDraft({ ...d, body: { ...d.body, en: { statement: "a" } } })).toBeNull();
  });
  it("refuses anything with the wrong shape", () => {
    const d = draft();
    for (const bad of [
      null,
      "x",
      [],
      { ...d, tier: "extreme" },
      { ...d, title: 5 },
      { ...d, tests: "none" },
      { ...d, tests: [{ input: "1" }] },
      { ...d, samples: null },
      { ...d, limits: null },
      { ...d, body: null },
      { ...d, reference: undefined },
    ]) {
      expect(parseProblemDraft(bad)).toBeNull();
    }
  });
  it("turns a missing limit into NaN so validateProblem refuses it", () => {
    const d = draft();
    const p = parseProblemDraft({ ...d, limits: { memKb: 65536 } })!;
    expect(validateProblem(p).map((e) => e.kode)).toContain("batas_salah");
  });
});

describe("repairHiddenTests", () => {
  const prod9 = (): CProblemDraft => {
    // The shape problem 9 had on prod (5 Nov 2026): its old list doubled as samples AND hidden tests
    const d = draft();
    d.samples = [
      { input: "3 5\n", output: "8\n" },
      { input: "-4 10\n", output: "6\n" },
    ];
    d.tests = [
      { input: "3 5\n", output: "8\n" },
      { input: "-4 10\n", output: "6\n" },
      { input: "0 0\n", output: "0\n" },
      { input: "1000 1000\n", output: "2000\n" },
      { input: "-1000 -1000\n", output: "-2000\n" },
      { input: "-1000 1000\n", output: "0\n" },
      { input: "123 877\n", output: "1000\n" },
      { input: "-7 -3\n", output: "-10\n" },
    ];
    return d;
  };

  it("drops the tests that repeat a sample and fills back up from the spare ones", () => {
    const d = prod9();
    expect(fields(d)).toEqual(["tests.0:tes_sama_contoh", "tests.1:tes_sama_contoh"]);
    const spare = [
      { input: "500 -250\n", output: "250\n" },
      { input: "-1 1\n", output: "0\n" },
      { input: "0 0\n", output: "0\n" },
    ];
    const r = repairHiddenTests(d, spare);
    expect(r.dropped).toBe(2);
    expect(r.added).toBe(2);
    expect(r.tests).toHaveLength(8);
    expect(r.tests.map((t) => t.input)).toContain("500 -250\n");
    expect(validateProblem({ ...d, tests: r.tests })).toEqual([]);
  });

  it("with nothing to fill from it only drops", () => {
    const d = prod9();
    const r = repairHiddenTests(d);
    expect(r).toMatchObject({ dropped: 2, added: 0 });
    expect(r.tests).toHaveLength(6);
    expect(validateProblem({ ...d, tests: r.tests })).toEqual([]);
  });

  it("sees through line endings and trailing blanks, and drops repeats among the tests too", () => {
    const d = draft();
    d.tests = [
      { input: "1 2  \r\n", output: "3\n" }, // the sample, dressed differently
      { input: "7 8\n", output: "15\n" },
      { input: "7 8\r\n", output: "15\n" },
      { input: "5 5\n", output: "10\n" },
    ];
    const r = repairHiddenTests(d);
    expect(r.dropped).toBe(2);
    expect(r.tests.map((t) => t.input)).toEqual(["7 8\n", "5 5\n"]);
  });

  it("never lets a spare test repeat a sample, and leaves a sound problem alone", () => {
    const d = prod9();
    const r = repairHiddenTests(d, [{ input: "3 5\n", output: "8\n" }]);
    expect(r.added).toBe(0);
    const ok = draft();
    expect(repairHiddenTests(ok, [{ input: "9 9\n", output: "18\n" }])).toEqual({
      tests: ok.tests,
      dropped: 0,
      added: 0,
    });
  });

  it("every default problem is already sound, so installing the bank never mends anything", () => {
    for (const p of SEED_PROBLEMS) expect(repairHiddenTests(p).dropped, p.title).toBe(0);
  });
});

describe("the penalty for failed Submits (8 Nov 2026)", () => {
  const pen = { free: 1, step: 5, max: 30 };
  const run = (passed: number, at: number, total = 8) => ({ passed, total, at });

  it("counts Submits that did not pass every test, up to the first full pass", () => {
    expect(failedSubmits([])).toBe(0);
    expect(failedSubmits([run(2, 1), run(5, 2), run(8, 3)])).toBe(2);
    // sent after the problem was solved: free
    expect(failedSubmits([run(8, 1), run(0, 2), run(3, 3)])).toBe(0);
    // never solved: every one counts
    expect(failedSubmits([run(2, 1), run(5, 2), run(7, 3)])).toBe(3);
    // the order of the list does not matter, the time does
    expect(failedSubmits([run(8, 3), run(2, 1), run(5, 2)])).toBe(2);
  });

  it("loses `step` percent for each failure past the free ones, never more than `max`", () => {
    expect(lostPercent(0, pen)).toBe(0);
    expect(lostPercent(1, pen)).toBe(0);
    expect(lostPercent(2, pen)).toBe(5);
    expect(lostPercent(4, pen)).toBe(15);
    expect(lostPercent(7, pen)).toBe(30);
    expect(lostPercent(50, pen)).toBe(30);
    expect(lostPercent(9, NO_PENALTY)).toBe(0);
    expect(lostPercent(9, { free: 0, step: 0, max: 30 })).toBe(0);
  });

  it("takes the percentage off what the problem earned, not off its full worth", () => {
    // 3 failures before the pass: 2 past the free one, 10% off 400
    const solved = livecodeResult(
      [{ problemId: 1, points: 400, runs: [run(1, 1), run(4, 2), run(2, 3), run(8, 4)] }],
      pen,
    );
    expect(solved.problems[0]).toMatchObject({ got: 360, fails: 3, lost: 10 });
    // never solved: 4 of 8 is 200, 3 failures is 10% off that
    const part = livecodeResult(
      [{ problemId: 1, points: 400, runs: [run(1, 1), run(4, 2), run(2, 3)] }],
      pen,
    );
    expect(part.problems[0]).toMatchObject({ got: 180, fails: 3, lost: 10 });
    expect(part.total).toBe(180);
  });

  it("a problem that earned nothing stays at zero, and no penalty is the old result", () => {
    const zero = livecodeResult(
      [{ problemId: 1, points: 400, runs: [run(0, 1), run(0, 2), run(0, 3)] }],
      pen,
    );
    expect(zero.problems[0].got).toBe(0);
    const runs = [run(1, 1), run(4, 2), run(2, 3), run(8, 4)];
    const old = livecodeResult([{ problemId: 1, points: 400, runs }]);
    expect(old.problems[0]).toMatchObject({ got: 400, fails: 3, lost: 0 });
  });

  it("rounds half up", () => {
    // 5 points, 8 of 8, 30% off: 3.5 -> 4
    const r = livecodeResult(
      [
        {
          problemId: 1,
          points: 5,
          runs: [...Array.from({ length: 7 }, (_, i) => run(0, i + 1)), run(8, 9)],
        },
      ],
      pen,
    );
    expect(r.problems[0]).toMatchObject({ lost: 30, got: 4 });
  });
});
