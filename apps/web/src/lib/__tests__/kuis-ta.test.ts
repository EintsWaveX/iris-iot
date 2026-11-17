import { describe, expect, it } from "vitest";
import { nilaiTA, unitTA } from "../kuis/ta";

const jumlah = (poin: number[]) => poin.reduce((a, p) => a + unitTA(p), 0);

describe("unitTA", () => {
  it("is 4000 for a right answer at the last moment and 5000 for an instant one", () => {
    expect(unitTA(500)).toBe(4000);
    expect(unitTA(1000)).toBe(5000);
    expect(unitTA(750)).toBe(4500);
  });

  it("holds those bounds for points outside the live range", () => {
    expect(unitTA(0)).toBe(4000);
    expect(unitTA(1500)).toBe(5000);
  });
});

describe("nilaiTA", () => {
  it("gives a right answer 80 and a fast one up to 20 more, over the questions played", () => {
    // 5 questions, all right, all at the last moment / all instant
    expect(nilaiTA(jumlah([500, 500, 500, 500, 500]), 5)).toBe(80);
    expect(nilaiTA(jumlah([1000, 1000, 1000, 1000, 1000]), 5)).toBe(100);
  });

  it("scores 4 right out of 5 between 64 and 80, however the speed goes", () => {
    expect(nilaiTA(jumlah([500, 500, 500, 500]), 5)).toBe(64);
    expect(nilaiTA(jumlah([1000, 1000, 1000, 1000]), 5)).toBe(80);
    // the case that read 61 before: four right answers at ordinary speed
    expect(nilaiTA(jumlah([760, 760, 760, 760]), 5)).toBe(73);
  });

  it("counts a wrong or empty answer as 0, so one right out of two is about half", () => {
    expect(nilaiTA(jumlah([800]), 2)).toBe(46);
    expect(nilaiTA(jumlah([500]), 2)).toBe(40);
  });

  it("rounds up and holds 0 as the floor and 100 as the ceiling", () => {
    expect(nilaiTA(1, 20)).toBe(1);
    expect(nilaiTA(0, 10)).toBe(0);
    expect(nilaiTA(-50, 10)).toBe(0);
    expect(nilaiTA(60_000, 10)).toBe(100);
  });

  it("is 0 when there are no questions, and never NaN", () => {
    expect(nilaiTA(500, 0)).toBe(0);
    expect(nilaiTA(Number.NaN, 5)).toBe(0);
    expect(nilaiTA(500, Number.NaN)).toBe(0);
  });
});
