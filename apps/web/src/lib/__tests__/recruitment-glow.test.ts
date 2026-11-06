import { describe, expect, it } from "vitest";
import { glowLevel, glowReach, glowShare } from "../recruitment/glow";

const MIN = 60_000;

describe("glowShare", () => {
  it("is the share of the part's time that is left, kept between 0 and 1", () => {
    expect(glowShare(5 * MIN, 20 * MIN)).toBe(0.25);
    expect(glowShare(-5, 20 * MIN)).toBe(0);
    expect(glowShare(25 * MIN, 20 * MIN)).toBe(1);
  });
  it("reads as full when the part has no known length", () => {
    expect(glowShare(5 * MIN, 0)).toBe(1);
    expect(glowShare(0, Number.NaN)).toBe(1);
  });
});

describe("glowLevel", () => {
  const total = 20 * MIN;
  it("steps from calm to warm to hot to critical as the time runs out", () => {
    expect(glowLevel(20 * MIN, total)).toBe("calm");
    expect(glowLevel(10.5 * MIN, total)).toBe("calm");
    expect(glowLevel(10 * MIN, total)).toBe("warm");
    expect(glowLevel(5.5 * MIN, total)).toBe("warm");
    expect(glowLevel(5 * MIN, total)).toBe("hot");
    expect(glowLevel(2.5 * MIN, total)).toBe("hot");
    expect(glowLevel(2 * MIN, total)).toBe("crit");
    expect(glowLevel(0, total)).toBe("crit");
  });
});

describe("glowReach", () => {
  it("grows from a rim to the deepest reach as the time runs out", () => {
    expect(glowReach(20 * MIN, 20 * MIN)).toBe(0);
    expect(glowReach(10 * MIN, 20 * MIN)).toBe(0.5);
    expect(glowReach(0, 20 * MIN)).toBe(1);
  });
});
