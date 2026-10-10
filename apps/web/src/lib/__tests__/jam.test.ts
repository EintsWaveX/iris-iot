import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aturUlangJam, catatJam, jamServer, pada, periksaBatas, selisihJam } from "../jam";

/**
 * The page's own clock (Phase 12): the gap to the server's clock comes from
 * the Date headers of API answers, and deadlines fire at the server's moment.
 */

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T03:00:00.000Z"));
  aturUlangJam();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------- Server Time ----------
// ---------- Server Time ----------
// ---------- Server Time ----------

describe("server time", () => {
  it("is the laptop's own until an answer came", () => {
    expect(selisihJam()).toBe(0);
    expect(jamServer()).toBe(Date.now());
  });

  it("follows a laptop two minutes slow to within half a second", () => {
    const kini = Date.now();
    // The server is 120.3 s ahead; its header floors to the second
    const server = new Date(Math.floor((kini + 120_300) / 1000) * 1000).toUTCString();
    catatJam(server, kini - 40, kini + 40);
    expect(Math.abs(selisihJam() - 120_300)).toBeLessThanOrEqual(600);
  });

  it("narrows with every answer", () => {
    const gap = 7_250;
    for (let i = 0; i < 20; i++) {
      const kirim = Date.now();
      const terima = kirim + 30;
      const tengah = kirim + 15 + gap;
      catatJam(new Date(Math.floor(tengah / 1000) * 1000).toUTCString(), kirim, terima);
      vi.advanceTimersByTime(137);
    }
    expect(Math.abs(selisihJam() - gap)).toBeLessThanOrEqual(100);
  });

  it("starts over after the laptop's clock jumps", () => {
    const kini = Date.now();
    catatJam(new Date(kini).toUTCString(), kini, kini + 20);
    catatJam(new Date(kini + 3600_000).toUTCString(), kini, kini + 20);
    expect(Math.abs(selisihJam() - 3600_000)).toBeLessThanOrEqual(1000);
  });

  it("ignores answers without a usable date", () => {
    catatJam(null, Date.now(), Date.now() + 10);
    catatJam("not a date", Date.now(), Date.now() + 10);
    catatJam(new Date().toUTCString(), Date.now(), Date.now() + 20_000);
    expect(selisihJam()).toBe(0);
  });
});

// ---------- Deadlines ----------
// ---------- Deadlines ----------
// ---------- Deadlines ----------

describe("deadlines", () => {
  it("fire once at the moment, in order", () => {
    const urut: string[] = [];
    pada(Date.now() + 2000, () => urut.push("b"));
    pada(Date.now() + 1000, () => urut.push("a"));
    vi.advanceTimersByTime(999);
    expect(urut).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(urut).toEqual(["a"]);
    vi.advanceTimersByTime(1000);
    expect(urut).toEqual(["a", "b"]);
    vi.advanceTimersByTime(10_000);
    expect(urut).toEqual(["a", "b"]);
  });

  it("go by the server's clock", () => {
    const kini = Date.now();
    // The server is 30 s ahead of this laptop
    catatJam(new Date(kini + 30_000).toUTCString(), kini, kini);
    const fn = vi.fn();
    pada(kini + 40_000, fn);
    vi.advanceTimersByTime(9_000);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("can be cancelled, and a past moment never fires", () => {
    const fn = vi.fn();
    const batal = pada(Date.now() + 1000, fn);
    pada(Date.now() - 1, fn);
    batal();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("wait past setTimeout's limit by re-arming", () => {
    const fn = vi.fn();
    pada(Date.now() + 3 * 24 * 3600_000, fn);
    vi.advanceTimersByTime(3 * 24 * 3600_000 - 1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("catch up when asked after a sleep", () => {
    const fn = vi.fn();
    pada(Date.now() + 5000, fn);
    // The laptop slept: the clock moved, the timer did not run
    vi.setSystemTime(Date.now() + 60_000);
    periksaBatas();
    expect(fn).toHaveBeenCalledOnce();
  });
});
