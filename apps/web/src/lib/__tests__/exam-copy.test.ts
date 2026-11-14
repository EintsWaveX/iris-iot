import { describe, expect, it } from "vitest";
import { TS } from "../../components/recruitment/exam/testStrings";
import { LCC } from "../../components/recruitment/livecode/lccStrings";

describe("exam wording", () => {
  it("never says how many bonus questions were added (that would show the score)", () => {
    for (const lang of ["id", "en", "zh"] as const) {
      expect(TS[lang].bonus.added()).not.toMatch(/\d/);
      expect(LCC[lang].bonus.added()).not.toMatch(/\d/);
    }
  });

  it("has a done line in every language for a seat with no part left", () => {
    for (const lang of ["id", "en", "zh"] as const) {
      expect(TS[lang].lobby.allDone.length).toBeGreaterThan(10);
      expect(TS[lang].lobby.allDone).not.toBe(TS[lang].lobby.waiting);
    }
  });
});
