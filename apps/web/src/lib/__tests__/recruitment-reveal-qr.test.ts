import { describe, expect, it } from "vitest";
import { MAX_WAIT_MS, msUntilReveal, retryDelay, wakeDelay } from "../recruitment/reveal";
import { CODE_ALPHABET, PERIOD_MS, acceptedPeriods, periodAt, periodEnd } from "../recruitment/qr";

describe("the reveal countdown", () => {
  const revealAt = Date.parse("2026-11-11T05:00:00Z");
  const serverNow = Date.parse("2026-11-11T04:58:00Z");

  it("counts from the server's clock plus the time elapsed since it answered", () => {
    expect(msUntilReveal(revealAt, serverNow, 0)).toBe(120_000);
    expect(msUntilReveal(revealAt, serverNow, 90_000)).toBe(30_000);
    expect(msUntilReveal(revealAt, serverNow, 120_000)).toBe(0);
    expect(msUntilReveal(revealAt, serverNow, 150_000)).toBe(-30_000);
  });

  it("does not depend on the device clock at all", () => {
    const real = Date.now;
    try {
      // A device set a day ahead changes nothing: the function never reads it.
      Date.now = () => Date.parse("2026-11-12T05:00:00Z");
      expect(msUntilReveal(revealAt, serverNow, 0)).toBe(120_000);
    } finally {
      Date.now = real;
    }
  });

  it("wakes at the exact moment, never earlier", () => {
    expect(wakeDelay(120_000)).toBe(120_000);
    expect(wakeDelay(1)).toBe(1);
    expect(wakeDelay(0)).toBe(0);
    expect(wakeDelay(-5)).toBe(0);
  });

  it("splits a far away reveal into timers the browser can hold", () => {
    expect(wakeDelay(9 * 86_400_000)).toBe(MAX_WAIT_MS);
    expect(MAX_WAIT_MS).toBeLessThan(2 ** 31);
  });

  it("asks again after a short, growing pause when the server says not yet", () => {
    expect([0, 1, 2, 3, 4, 9].map(retryDelay)).toEqual([500, 1000, 2000, 4000, 5000, 5000]);
  });
});

describe("the QR periods", () => {
  it("rotate every 20 seconds", () => {
    expect(PERIOD_MS).toBe(20_000);
    const t = Date.parse("2026-11-12T11:30:00Z");
    expect(periodAt(t + 19_999)).toBe(periodAt(t));
    expect(periodAt(t + 20_000)).toBe(periodAt(t) + 1);
  });

  it("accepts the current period and the one before, nothing else", () => {
    const t = Date.parse("2026-11-12T11:30:05Z");
    const p = periodAt(t);
    expect(acceptedPeriods(t)).toEqual([p, p - 1]);
  });

  it("knows when a period ends", () => {
    const t = Date.parse("2026-11-12T11:30:05Z");
    expect(periodEnd(periodAt(t))).toBeGreaterThan(t);
    expect(periodEnd(periodAt(t)) - t).toBeLessThanOrEqual(20_000);
  });

  it("types without lookalikes", () => {
    expect(CODE_ALPHABET).not.toMatch(/[ILO01]/);
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
  });
});
