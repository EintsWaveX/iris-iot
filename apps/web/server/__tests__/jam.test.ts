import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mulaiJamLab } from "../jam.js";

describe("the lab clock timer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs once at start and then two seconds into every minute", async () => {
    vi.setSystemTime(new Date("2026-11-16T06:00:30.000Z"));
    const jalankan = vi.fn(async () => {});
    const henti = mulaiJamLab({ jalankan });
    await vi.advanceTimersByTimeAsync(5000);
    expect(jalankan).toHaveBeenCalledTimes(1); // the start run, at 06:00:35
    await vi.advanceTimersByTimeAsync(27_000); // 06:01:02
    expect(jalankan).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000); // 06:02:02
    expect(jalankan).toHaveBeenCalledTimes(3);
    henti();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(jalankan).toHaveBeenCalledTimes(3);
  });

  it("does not start a minute while the last one is still running, and survives a failure", async () => {
    vi.setSystemTime(new Date("2026-11-16T06:00:00.000Z"));
    let selesai: () => void = () => {};
    const jalankan = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((r) => (selesai = r)))
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const henti = mulaiJamLab({ jalankan, awalMs: 0 });
    await vi.advanceTimersByTimeAsync(62_000); // first minute starts, hangs
    expect(jalankan).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000); // next minute: skipped, the first is still going
    expect(jalankan).toHaveBeenCalledTimes(1);
    selesai();
    await vi.advanceTimersByTimeAsync(60_000); // the one that throws
    expect(jalankan).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(jalankan).toHaveBeenCalledTimes(3);
    expect(err).toHaveBeenCalled();
    henti();
    err.mockRestore();
  });
});
