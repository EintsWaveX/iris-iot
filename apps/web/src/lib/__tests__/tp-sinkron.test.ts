import { describe, expect, it } from "vitest";
import { jedaRelay, sinkronBerikut } from "../tp";

const MENIT = 60_000;
const pada = (iso: string) => Date.parse(iso);

describe("sinkronBerikut", () => {
  it("is the whole minute after the last run", () => {
    expect(sinkronBerikut(pada("2026-10-16T08:30:04.200Z"))).toBe(pada("2026-10-16T08:31:00Z"));
  });

  it("keeps the next minute after a press late in the minute", () => {
    expect(sinkronBerikut(pada("2026-10-16T08:30:57Z"))).toBe(pada("2026-10-16T08:31:00Z"));
  });

  it("is never more than a minute away and always on a whole minute", () => {
    for (let ms = 0; ms < 2 * MENIT; ms += 777) {
      const t = pada("2026-10-16T08:30:00Z") + ms;
      const n = sinkronBerikut(t);
      expect(n % MENIT).toBe(0);
      expect(n - t).toBeGreaterThan(0);
      expect(n - t).toBeLessThanOrEqual(MENIT);
    }
  });

  it("waits 30 minutes after a failed run", () => {
    expect(sinkronBerikut(pada("2026-10-16T08:30:04Z"), true)).toBe(pada("2026-10-16T09:01:00Z"));
  });
});

describe("jedaRelay", () => {
  // sinkronBilaPerlu skips when now - terakhir < jeda
  const lewati = (terakhir: string, now: string) =>
    pada(now) - pada(terakhir) < jedaRelay(pada(now));

  it("runs at the minute after a press at :57", () => {
    expect(lewati("2026-10-16T08:30:57Z", "2026-10-16T08:31:00.400Z")).toBe(false);
  });

  it("runs after its own run a minute ago", () => {
    expect(lewati("2026-10-16T08:30:06Z", "2026-10-16T08:31:01Z")).toBe(false);
  });

  it("skips a run that already ended in this minute", () => {
    expect(lewati("2026-10-16T08:31:01Z", "2026-10-16T08:31:03Z")).toBe(true);
  });
});
