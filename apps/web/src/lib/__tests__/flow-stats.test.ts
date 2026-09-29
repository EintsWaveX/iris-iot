import { describe, expect, it } from "vitest";
import { flowStats } from "../../components/live/useTelemetry";
import type { Reading } from "../telemetry-sim";

const r = (
  seq: number,
  delayMs: number | null,
  rssi: number | null = -60,
  snr: number | null = null,
): Reading => ({
  modul: 4,
  group: 1,
  seq,
  tx: "10:00:00:000",
  rx: delayMs === null ? null : "10:00:00:050",
  delayMs,
  rssi,
  snr,
});

describe("flowStats", () => {
  it("is empty-safe", () => {
    expect(flowStats([])).toEqual({ avg: null, loss: 0, jitter: null, rssi: null, snr: null });
  });

  it("averages delay, counts loss and measures jitter between consecutive delays", () => {
    const s = flowStats([r(1, 10), r(2, 20), r(3, null), r(4, 30, -70, 7.5)]);
    expect(s.avg).toBe(20);
    expect(s.loss).toBe(25);
    expect(s.jitter).toBe(10);
    expect(s.rssi).toBe(-70);
    expect(s.snr).toBe(7.5);
  });

  it("only looks at the last n readings", () => {
    const s = flowStats([r(1, 1000), r(2, 10), r(3, 10)], 2);
    expect(s.avg).toBe(10);
    expect(s.jitter).toBe(0);
  });
});
