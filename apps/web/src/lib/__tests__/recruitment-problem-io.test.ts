/**
 * The Live Coding bank's Markdown file (problem-io.ts): what the export writes, the import reads back
 * unchanged, and what a broken file says.
 */
import { describe, expect, it } from "vitest";
import { validateProblem } from "../recruitment/c-problem";
import { parseProblems, writeProblems, type ProblemFileItem } from "../recruitment/problem-io";
import { SEED_PROBLEMS } from "../recruitment/seed-problems";
import { SAMPLE_PROBLEM_MD } from "../../components/recruitment/panel/tes/bank/problemSample";

const item = (i = 0, over: Partial<ProblemFileItem> = {}): ProblemFileItem => ({
  ...structuredClone(SEED_PROBLEMS[i]),
  status: "ready",
  ...over,
});

describe("problem file round trip", () => {
  it("every default problem comes back exactly as written", () => {
    const all = SEED_PROBLEMS.map((_, i) => item(i, { id: i + 1 }));
    const back = parseProblems(writeProblems(all));
    expect(back).toHaveLength(all.length);
    back.forEach((b, i) => {
      expect(b.errors).toEqual([]);
      expect(b.id).toBe(i + 1);
      expect(b.status).toBe("ready");
      const { id: _id, status: _status, ...want } = all[i];
      expect(b.draft).toEqual(want);
      expect(validateProblem(b.draft!)).toEqual([]);
    });
  });

  it("keeps points, English text, backticks inside code and an empty sample input", () => {
    const p = item(0, { id: undefined });
    p.body.points = 650;
    p.body.en = { statement: "Read two ints.", input: "Two ints.", output: "Their sum." };
    p.reference = 'char *s = "```";\nint main(void) { return 0; }\n';
    p.samples[0] = { input: "", output: "42\n" };
    const [b] = parseProblems(writeProblems([p]));
    expect(b.errors).toEqual([]);
    expect(b.id).toBeUndefined();
    const { id: _id, status: _s, ...want } = p;
    expect(b.draft).toEqual(want);
  });

  it("a horizontal rule or a heading inside a fence or the statement does not split a problem", () => {
    const p = item(0);
    p.body.statement = "Teks.\n\n---\n\nLagi.\n\n```\n## Input\n---\ntitle: x\n```";
    const parsed = parseProblems(writeProblems([p, item(1)]));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].errors).toEqual([]);
    expect(parsed[0].draft!.body.statement).toBe(p.body.statement.trim());
  });
});

describe("problem file errors", () => {
  const ok = writeProblems([item(0)]);

  it("names the line and the section of what is missing", () => {
    const [b] = parseProblems(ok.replace(/## Reference Solution[\s\S]*$/, ""));
    expect(b.draft).toBeNull();
    expect(b.errors.map((e) => `${e.kode}:${e.detail}`)).toContain(
      "bagian_kosong:Reference Solution",
    );
  });

  it("refuses an unknown tier, a bad number and a broken front matter", () => {
    const [a] = parseProblems(ok.replace(/tier: \w+/, "tier: gila"));
    expect(a.errors.map((e) => e.kode)).toContain("tingkat_salah");
    const [b] = parseProblems(ok.replace(/time: \d+/, "time: lama"));
    expect(b.errors.map((e) => e.kode)).toContain("batas_salah");
    const [c] = parseProblems("---\ntitle: x\n\nno closing line");
    expect(c.errors.map((e) => e.kode)).toContain("front_matter_salah");
  });

  it("an Input without its Output is an error, and Indonesian tier words are read", () => {
    const [a] = parseProblems(ok.replace(/(### Output\n\n```\n[^`]*```\n)/, ""));
    expect(a.errors.map((e) => e.kode)).toContain("io_salah");
    const [b] = parseProblems(ok.replace(/tier: \w+/, "tier: susah"));
    expect(b.draft!.tier).toBe("hard");
  });

  it("a file with no problem is an empty list", () => {
    expect(parseProblems("just words\n")).toEqual([]);
  });
});

describe("the sample file Impor offers", () => {
  it("reads clean and is a sound problem", () => {
    const [b] = parseProblems(SAMPLE_PROBLEM_MD);
    expect(b.errors).toEqual([]);
    expect(validateProblem(b.draft!)).toEqual([]);
  });
});
