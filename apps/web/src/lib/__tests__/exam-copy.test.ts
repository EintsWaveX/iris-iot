import { describe, expect, it } from "vitest";
import { TS } from "../../components/recruitment/exam/testStrings";
import { LCC } from "../../components/recruitment/livecode/lccStrings";

describe("exam wording", () => {
  it("says one bonus question, not 1 questions", () => {
    expect(TS.en.bonus.added(1)).toBe("1 bonus question was added to the question list.");
    expect(TS.en.bonus.added(3)).toBe("3 bonus questions were added to the question list.");
  });

  it("says one bonus problem, not 1 problems", () => {
    expect(LCC.en.bonus.added(1)).toBe("1 bonus problem was added to the problem list.");
    expect(LCC.en.bonus.added(2)).toBe("2 bonus problems were added to the problem list.");
  });

  it("has a done line in every language for a seat with no part left", () => {
    for (const lang of ["id", "en", "zh"] as const) {
      expect(TS[lang].lobby.allDone.length).toBeGreaterThan(10);
      expect(TS[lang].lobby.allDone).not.toBe(TS[lang].lobby.waiting);
    }
  });
});
