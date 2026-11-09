/**
 * The violation rules (9 Nov 2026): which strikes count and how much, the suggested score cut and
 * the warning level. Pure; the API and the pages share them.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIOLATION_RULES as R,
  countedPoints,
  seatViolations,
  strikeWeight,
  suggestedCut,
  warnLevel,
  type ViolationRules,
} from "../recruitment/violations";

const rules = (o: Partial<ViolationRules> = {}): ViolationRules => ({
  ...structuredClone(R),
  ...o,
});
const s = (kinds: string[], excused = false) => ({ kinds, excused });

describe("strikeWeight", () => {
  it("is the heaviest counting kind on the strike", () => {
    const r = rules();
    r.kinds.alat = { counts: true, weight: 3 };
    expect(strikeWeight(["tab", "alat"], r)).toBe(3);
    expect(strikeWeight(["tab"], r)).toBe(1);
  });

  it("ignores kinds that do not count, and unknown kinds", () => {
    const r = rules();
    expect(strikeWeight(["ganda"], r)).toBe(0);
    expect(strikeWeight(["ganda", "tab"], r)).toBe(1);
    expect(strikeWeight(["nope"], r)).toBe(0);
    expect(strikeWeight([], r)).toBe(0);
  });
});

describe("countedPoints", () => {
  it("adds the weights, skips excused strikes, and counts overflow as 1 each", () => {
    const r = rules();
    r.kinds.foto = { counts: true, weight: 2 };
    expect(countedPoints([s(["tab"]), s(["foto"]), s(["layar"], true)], 0, r)).toBe(3);
    expect(countedPoints([s(["tab"])], 4, r)).toBe(5);
    expect(countedPoints([], 0, r)).toBe(0);
  });

  it("an excused strike stops counting, so the level can fall back", () => {
    const r = rules();
    const all = [s(["tab"]), s(["tab"]), s(["tab"])];
    expect(countedPoints(all, 0, r)).toBe(3);
    expect(countedPoints([all[0], all[1], { ...all[2], excused: true }], 0, r)).toBe(2);
  });
});

describe("suggestedCut", () => {
  it("forgives `free` points, takes `step` percent for each after, never over `max`", () => {
    const r = rules({ free: 2, step: 5, max: 30 });
    expect(suggestedCut(0, r)).toBe(0);
    expect(suggestedCut(2, r)).toBe(0);
    expect(suggestedCut(3, r)).toBe(5);
    expect(suggestedCut(6, r)).toBe(20);
    expect(suggestedCut(50, r)).toBe(30);
  });

  it("step 0 turns the cut off", () => {
    expect(suggestedCut(99, rules({ step: 0, max: 0 }))).toBe(0);
  });
});

describe("warnLevel", () => {
  it("rises at each threshold", () => {
    const r = rules({ warnAt: [1, 3, 5] });
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => warnLevel(n, r))).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
});

describe("the defaults", () => {
  it("count every kind but the second-tab one the page does not cause", () => {
    expect(R.kinds.ganda.counts).toBe(false);
    for (const k of ["layar", "tab", "fokus", "tempel", "alat", "foto"] as const)
      expect(R.kinds[k]).toEqual({ counts: true, weight: 1 });
  });
});

describe("seatViolations", () => {
  it("gives each part its own points, level and suggested cut", () => {
    const r = rules({ free: 1, step: 10, max: 30, warnAt: [1, 3, 5] });
    const v = seatViolations(
      [
        { part: "logika", kinds: ["tab"], excused: false },
        { part: "logika", kinds: ["layar"], excused: false },
        { part: "logika", kinds: ["fokus"], excused: false },
        { part: "fitb", kinds: ["tab"], excused: true },
      ],
      { kodingan: 4 },
      r,
    );
    expect(v.logika).toEqual({ points: 3, level: 2, cut: 20 });
    expect(v.fitb).toEqual({ points: 0, level: 0, cut: 0 });
    expect(v.kodingan).toEqual({ points: 4, level: 2, cut: 30 });
    expect(v.livecode).toBeUndefined();
  });

  it("nothing recorded, nothing listed", () => {
    expect(seatViolations([], {}, rules())).toEqual({});
  });
});

describe("the kinds added on 9 Nov 2026", () => {
  it("a second screen, a reload and an automated browser count 1 each by default", () => {
    for (const k of ["layar2", "muat", "otomatis"] as const)
      expect(R.kinds[k]).toEqual({ counts: true, weight: 1 });
  });
  it("copy attempts and a lost connection are recorded at weight 0: seen, never counted", () => {
    for (const k of ["salin", "putus"] as const) {
      expect(R.kinds[k]).toEqual({ counts: true, weight: 0 });
      expect(strikeWeight([k], R)).toBe(0);
    }
    expect(countedPoints([s(["salin"]), s(["putus"]), s(["salin", "tab"])], 0, R)).toBe(1);
  });
});
