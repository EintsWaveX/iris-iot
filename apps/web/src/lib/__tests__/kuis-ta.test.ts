import { describe, expect, it } from "vitest";
import { nilaiTA } from "../kuis/ta";

describe("nilaiTA", () => {
  it("is points over (questions x 1000), as a percentage, rounded up", () => {
    expect(nilaiTA(3000, 5)).toBe(60);
    expect(nilaiTA(3001, 5)).toBe(61);
    expect(nilaiTA(4210, 10)).toBe(43);
    expect(nilaiTA(1, 20)).toBe(1);
  });

  it("holds 0 as the floor and 100 as the ceiling", () => {
    expect(nilaiTA(0, 10)).toBe(0);
    expect(nilaiTA(-50, 10)).toBe(0);
    expect(nilaiTA(10_000, 10)).toBe(100);
    expect(nilaiTA(12_000, 10)).toBe(100);
  });

  it("is 0 when there are no questions, and never NaN", () => {
    expect(nilaiTA(500, 0)).toBe(0);
    expect(nilaiTA(Number.NaN, 5)).toBe(0);
    expect(nilaiTA(500, Number.NaN)).toBe(0);
  });
});
