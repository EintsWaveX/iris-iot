import { describe, expect, it } from "vitest";
import { glowLevel, glowReach, glowShare, glowTint, glowTone } from "../recruitment/glow";

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

describe("glowTone: the colour slides with the time left instead of jumping (9 Nov 2026)", () => {
  const rgb = (c: string) => (c.match(/\d+/g) ?? []).map(Number);
  it("is green with plenty of time and red when it is nearly gone", () => {
    expect(glowTone(1)).toMatchObject({ c1: "rgb(74 222 128)", a: 0.34 });
    expect(glowTone(0)).toMatchObject({ c1: "rgb(239 68 68)", a: 0.5 });
  });
  it("is yellow at 40% and orange at 20%", () => {
    expect(glowTone(0.4).c1).toBe("rgb(250 204 21)");
    expect(glowTone(0.2).c1).toBe("rgb(251 146 60)");
  });
  it("blends between two stops, so a small change in time is a small change in colour", () => {
    const [r1, g1] = rgb(glowTone(0.3).c1);
    const [r0, g0] = rgb(glowTone(0.4).c1);
    const [r2, g2] = rgb(glowTone(0.2).c1);
    expect(r1).toBeGreaterThanOrEqual(Math.min(r0, r2));
    expect(r1).toBeLessThanOrEqual(Math.max(r0, r2));
    expect(g1).toBeLessThan(g0);
    expect(g1).toBeGreaterThan(g2);
  });
  it("never goes outside 0..1 and never makes an invalid colour", () => {
    for (const x of [-3, 0, 0.05, 0.33, 0.6, 0.99, 1, 7, Number.NaN]) {
      const t = glowTone(x);
      expect(t.c1).toMatch(/^rgb\(\d{1,3} \d{1,3} \d{1,3}\)$/);
      expect(t.c2).toMatch(/^rgb\(\d{1,3} \d{1,3} \d{1,3}\)$/);
      expect(t.a).toBeGreaterThanOrEqual(0.34);
      expect(t.a).toBeLessThanOrEqual(0.5);
    }
  });
  it("gets stronger as the time runs out", () => {
    expect(glowTone(0.1).a).toBeGreaterThan(glowTone(0.9).a);
  });
});

describe("glowTint: the steady tint a seat's violations give the glow", () => {
  it("is nothing with no warning, and grows with the level", () => {
    expect(glowTint(0)).toBeNull();
    const [a, b, c] = [glowTint(1)!, glowTint(2)!, glowTint(3)!];
    expect(a.a).toBeLessThan(b.a);
    expect(b.a).toBeLessThan(c.a);
    expect(a.reach).toBeLessThan(c.reach);
  });
  it("is amber at first and red at the end", () => {
    expect(glowTint(1)!.c).toBe("rgb(245 158 11)");
    expect(glowTint(3)!.c).toBe("rgb(239 68 68)");
  });
  it("clamps strange levels", () => {
    expect(glowTint(-1)).toBeNull();
    expect(glowTint(9)).toEqual(glowTint(3));
    expect(glowTint(Number.NaN)).toBeNull();
  });
});
