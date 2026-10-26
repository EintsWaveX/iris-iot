/** Grading Live Coding (EXAM-ENGINE 9.8, 11.3 item 1): two sheets, hidden peers. */
import { describe, expect, it } from "vitest";
import { DEFAULT_RUBRIC_ROWS } from "../recruitment/lc-defaults";
import {
  canSubmit,
  peerView,
  runTerakhir,
  sameRubricRows,
  validateSheet,
  type StoredSheet,
} from "../recruitment/lc-grade";
import type { Rubric } from "../recruitment/exam-types";

const rubric: Rubric = { id: 1, stage: "tes_tulis", kind: "livecode", rows: DEFAULT_RUBRIC_ROWS };
const full = { jalan: 4, protokol: 4, data: 4, kode: 4, jelas: 4 };
const sheet = (grader: string, at: number, values = full): StoredSheet => ({
  grader,
  at,
  values,
  note: "",
  name: grader,
});

describe("validateSheet", () => {
  it("accepts a whole value in 0..max for every row", () => {
    expect(validateSheet(rubric, full)).toEqual([]);
  });
  it("names every row that is missing, fractional or out of range", () => {
    const errs = validateSheet(rubric, { jalan: 5, protokol: 2.5, data: -1, kode: 4 } as Record<
      string,
      number
    >);
    expect(errs.map((e) => e.field).sort()).toEqual(["data", "jalan", "jelas", "protokol"]);
  });
  it("refuses a key the rubric does not have", () => {
    expect(validateSheet(rubric, { ...full, extra: 1 }).map((e) => e.field)).toEqual(["extra"]);
  });
});

describe("canSubmit", () => {
  it("lets the first two graders submit and refuses a third with sudah_dua", () => {
    expect(canSubmit([], "a")).toEqual({ ok: true });
    expect(canSubmit([sheet("a", 1)], "b")).toEqual({ ok: true });
    expect(canSubmit([sheet("a", 1), sheet("b", 2)], "c")).toEqual({
      ok: false,
      kode: "sudah_dua",
    });
  });
  it("lets a grader who already has a sheet change it", () => {
    expect(canSubmit([sheet("a", 1), sheet("b", 2)], "b")).toEqual({ ok: true });
  });
});

describe("peerView", () => {
  const sheets = [sheet("a", 10, { ...full, jalan: 1 }), sheet("b", 20)];
  it("shows a grader only who and when for the other sheets", () => {
    const v = peerView(sheets, "a", false);
    expect(v.mine?.values.jalan).toBe(1);
    expect(v.others).toEqual([{ grader: "b", name: "b", at: 20 }]);
    expect(JSON.stringify(v.others)).not.toContain("values");
  });
  it("shows every sheet in full to the bank right after Finalkan", () => {
    const v = peerView(sheets, "z", true);
    expect(v.others.length).toBe(2);
    expect(v.others[0]).toHaveProperty("values");
  });
  it("shows a grader with no sheet only the others' names", () => {
    const v = peerView(sheets, "z", false);
    expect(v.mine).toBeNull();
    expect(v.others.map((o) => o.grader)).toEqual(["a", "b"]);
    expect(JSON.stringify(v.others)).not.toContain("values");
  });
});

describe("sameRubricRows", () => {
  it("ignores the key order jsonb hands back", () => {
    const reordered = DEFAULT_RUBRIC_ROWS.map((r) => ({
      weight: r.weight,
      max: r.max,
      label: r.label,
      key: r.key,
    }));
    expect(sameRubricRows(DEFAULT_RUBRIC_ROWS, reordered)).toBe(true);
  });
  it("sees a changed weight, label, max, key or length", () => {
    const [first, ...rest] = DEFAULT_RUBRIC_ROWS;
    expect(
      sameRubricRows(DEFAULT_RUBRIC_ROWS, [{ ...first, weight: first.weight + 1 }, ...rest]),
    ).toBe(false);
    expect(sameRubricRows(DEFAULT_RUBRIC_ROWS, [{ ...first, label: "Lain" }, ...rest])).toBe(false);
    expect(sameRubricRows(DEFAULT_RUBRIC_ROWS, [{ ...first, max: first.max + 1 }, ...rest])).toBe(
      false,
    );
    expect(sameRubricRows(DEFAULT_RUBRIC_ROWS, rest)).toBe(false);
  });
});

describe("runTerakhir", () => {
  const run = (at: number, ok: boolean, kind: "compile" | "flash" = "compile") => ({
    at,
    kind,
    board: 1 as const,
    ok,
    ms: 10,
  });
  it("shows the latest compile, not the oldest, with how many there were", () => {
    // The seat stores its runs oldest first.
    const runs = [run(1000, false), run(2000, false), run(3000, true), run(2500, true, "flash")];
    expect(runTerakhir(runs, "compile")).toEqual({ at: 3000, ok: true, n: 3 });
    expect(runTerakhir(runs, "flash")).toEqual({ at: 2500, ok: true, n: 1 });
  });
  it("takes the newest by time even if the list order is not", () => {
    expect(runTerakhir([run(3000, true), run(1000, false)], "compile")).toEqual({
      at: 3000,
      ok: true,
      n: 2,
    });
  });
  it("is null when the seat never compiled or flashed", () => {
    expect(runTerakhir([], "compile")).toBeNull();
    expect(runTerakhir([run(1, true)], "flash")).toBeNull();
  });
});
