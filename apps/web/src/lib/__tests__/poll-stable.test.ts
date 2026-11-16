import { describe, expect, it } from "vitest";
import { tetap } from "../hooks";

describe("tetap (keep the old object when a poll brings the same data)", () => {
  it("returns the previous object when the new one says the same", () => {
    const prev = { a: [1, 2, { b: "x" }], n: 3 };
    const next = { a: [1, 2, { b: "x" }], n: 3 };
    expect(tetap(prev, next)).toBe(prev);
  });

  it("returns the new object when anything differs", () => {
    const prev = { a: [1, 2], n: 3 };
    const next = { a: [1, 2], n: 4 };
    expect(tetap(prev, next)).toBe(next);
  });

  it("takes the new value when there was none, and for primitives and null", () => {
    const next = { a: 1 };
    expect(tetap(null, next)).toBe(next);
    expect(tetap(5, 5)).toBe(5);
    expect(tetap({ a: 1 } as unknown, null)).toBeNull();
  });

  it("falls back to the new value when the data cannot be compared as text", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    const next = { ok: 1 };
    expect(tetap(loop, next)).toBe(next);
  });
});
