import { describe, expect, it } from "vitest";
import { flowStats, jamKeMs, selangMs } from "../../components/live/useTelemetry";
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
    expect(flowStats([])).toEqual({
      avg: null,
      loss: 0,
      jitter: null,
      rssi: null,
      snr: null,
      interval: null,
      intervalJitter: null,
    });
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

// Module 2/3 as the Pi sees them: a receive time and the board's seq only.
const pi = (seq: number, rx: string): Reading => ({
  modul: 2,
  group: 1,
  seq,
  tx: null,
  rx,
  delayMs: null,
  rssi: null,
  snr: null,
});

describe("flowStats without a send time", () => {
  const rows = [
    pi(10, "17:42:10:000"),
    pi(11, "17:42:12:000"),
    pi(13, "17:42:16:100"), // #12 never arrived
    pi(14, "17:42:18:100"),
  ];

  it("measures the arrival interval and its jitter", () => {
    const s = flowStats(rows);
    expect(s.avg).toBeNull();
    expect(s.interval).toBe(2700);
    expect(s.intervalJitter).toBe(2100);
    expect(selangMs(rows)).toEqual([null, 2000, 4100, 2000]);
  });

  it("counts a skipped seq as lost only when the relay sees every message", () => {
    expect(flowStats(rows).loss).toBe(0);
    expect(flowStats(rows, 40, true).loss).toBe(20);
  });

  it("does not count a board restart (seq going down) as loss", () => {
    expect(flowStats([pi(40, "10:00:00:000"), pi(1, "10:00:02:000")], 40, true).loss).toBe(0);
  });

  it("wraps past midnight", () => {
    expect(selangMs([pi(1, "23:59:59:500"), pi(2, "00:00:01:500")])).toEqual([null, 2000]);
    expect(jamKeMs("bad")).toBeNull();
  });
});
