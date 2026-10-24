/**
 * Exact fractions for the exam scores (EXAM-ENGINE 4.1): no floating point in
 * any credit, weight or ratio, and one rounding per part score.
 */
import { describe, expect, it } from "vitest";
import {
  ONE,
  ZERO,
  add,
  cmp,
  div,
  eq,
  frac,
  fracText,
  isOne,
  maxFrac,
  mul,
  parseFrac,
  roundHalfUp,
  sub,
  sum,
} from "../recruitment/frac";

describe("frac", () => {
  it("reduces and keeps the sign on the numerator", () => {
    expect(frac(6, 8)).toEqual({ n: 3n, d: 4n });
    expect(frac(3, -6)).toEqual({ n: -1n, d: 2n });
    expect(frac(0, 5)).toEqual({ n: 0n, d: 1n });
  });

  it("refuses a zero denominator", () => {
    expect(() => frac(1, 0)).toThrow();
    expect(() => div(ONE, ZERO)).toThrow();
  });

  it("adds, subtracts, multiplies and divides exactly", () => {
    expect(add(frac(1, 3), frac(1, 6))).toEqual(frac(1, 2));
    expect(sub(frac(1, 2), frac(3, 4))).toEqual(frac(-1, 4));
    expect(mul(frac(2, 3), frac(9, 4))).toEqual(frac(3, 2));
    expect(div(frac(8, 5), frac(23, 5))).toEqual(frac(8, 23));
    expect(sum([frac(7, 5), frac(8, 5), frac(8, 5)])).toEqual(frac(23, 5));
    expect(sum([])).toEqual(ZERO);
  });

  it("compares", () => {
    expect(cmp(frac(1, 3), frac(1, 2))).toBe(-1);
    expect(cmp(frac(2, 4), frac(1, 2))).toBe(0);
    expect(cmp(frac(-1, 2), frac(-2, 3))).toBe(1);
    expect(eq(frac(2, 4), frac(1, 2))).toBe(true);
    expect(isOne(frac(5, 5))).toBe(true);
    expect(isOne(frac(4, 5))).toBe(false);
    expect(maxFrac([frac(1, 4), frac(3, 8), frac(1, 3)])).toEqual(frac(3, 8));
  });

  it("rounds cap × ratio half up, once (4.4)", () => {
    expect(roundHalfUp(1000, frac(8, 23))).toBe(348); // 347.83
    expect(roundHalfUp(1000, frac(18, 23))).toBe(783); // 782.61
    expect(roundHalfUp(1000, frac(1, 6))).toBe(167); // 166.67
    expect(roundHalfUp(500, frac(5, 8))).toBe(313); // 312.5, the tie goes up
    expect(roundHalfUp(1000, ONE)).toBe(1000);
    expect(roundHalfUp(1000, ZERO)).toBe(0);
  });

  it("writes and reads the n/d text form the freeze stores", () => {
    expect(fracText(frac(8, 23))).toBe("8/23");
    expect(fracText(frac(2, 1))).toBe("2");
    expect(parseFrac("8/23")).toEqual(frac(8, 23));
    expect(parseFrac("-3/6")).toEqual(frac(-1, 2));
    expect(parseFrac("2")).toEqual(frac(2, 1));
    expect(() => parseFrac("1/0")).toThrow();
    expect(() => parseFrac("0.5")).toThrow();
  });
});
