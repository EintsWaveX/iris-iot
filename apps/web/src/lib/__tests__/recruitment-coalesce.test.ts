import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coalesce } from "../recruitment/coalesce.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("coalesce", () => {
  it("runs a lone call at once", () => {
    const run = vi.fn();
    coalesce(run, 600).call();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("folds a burst into the first run plus one trailing run", () => {
    const run = vi.fn();
    const c = coalesce(run, 600);
    c.call();
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(10);
      c.call();
    }
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(600);
    expect(run).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("never loses the latest call: one that lands just before the window closes still runs", () => {
    const run = vi.fn();
    const c = coalesce(run, 600);
    c.call();
    vi.advanceTimersByTime(599);
    c.call();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("runs at most once per window under a steady stream", () => {
    const run = vi.fn();
    const c = coalesce(run, 600);
    for (let t = 0; t < 6000; t += 50) {
      c.call();
      vi.advanceTimersByTime(50);
    }
    // 6 s of messages every 50 ms: about one run per 600 ms, not 120.
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(run.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it("is quick again after a quiet spell, and cancel drops a waiting run", () => {
    const run = vi.fn();
    const c = coalesce(run, 600);
    c.call();
    vi.advanceTimersByTime(700);
    c.call();
    expect(run).toHaveBeenCalledTimes(2);
    c.call();
    c.cancel();
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
