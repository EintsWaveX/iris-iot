import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buatPantau } from "../pantau-sheet.js";

describe("the sheet watcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const dua = [{ nama: "A" }];

  it("does nothing while switched off", async () => {
    const baca = vi.fn(async () => dua);
    const p = buatPantau({ baca, kabari: vi.fn() });
    p.diminta("s", dua);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(baca).not.toHaveBeenCalled();
    expect(p.jumlah()).toBe(0);
  });

  it("announces once when the sheet changes, not when it stays the same", async () => {
    let isi = [{ nama: "A" }];
    const kabari = vi.fn();
    const p = buatPantau({ baca: async () => isi, kabari, jedaMs: 1000, sepiMs: 30_000 });
    p.aktif = true;
    p.diminta("s", isi);
    await vi.advanceTimersByTimeAsync(3000);
    expect(kabari).not.toHaveBeenCalled();
    isi = [{ nama: "B" }, { nama: "A" }];
    await vi.advanceTimersByTimeAsync(1000);
    expect(kabari).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(kabari).toHaveBeenCalledTimes(1);
    p.hentikan();
  });

  it("starts one watch per sheet however many pages ask, and stops 30 s after the last ask", async () => {
    const baca = vi.fn(async () => dua);
    const p = buatPantau({ baca, kabari: vi.fn(), jedaMs: 1000, sepiMs: 30_000 });
    p.aktif = true;
    p.diminta("s", dua);
    p.diminta("s", dua);
    p.diminta("t", dua);
    expect(p.jumlah()).toBe(2);
    await vi.advanceTimersByTimeAsync(20_000);
    p.diminta("s", dua); // a page asks again: "s" lives on
    await vi.advanceTimersByTimeAsync(20_000);
    expect(p.jumlah()).toBe(1); // "t" went quiet and was dropped
    await vi.advanceTimersByTimeAsync(40_000);
    expect(p.jumlah()).toBe(0);
    const n = baca.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(baca.mock.calls.length).toBe(n);
  });

  it("ignores an unreadable sheet, survives a throw, and never doubles a slow read", async () => {
    const kabari = vi.fn();
    let n = 0;
    const baca = vi.fn(async () => {
      n++;
      if (n === 1) return null;
      if (n === 2) throw new Error("google down");
      if (n === 3)
        return new Promise<typeof dua>((r) => setTimeout(() => r([{ nama: "Z" }]), 3500));
      return [{ nama: "Z" }];
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const p = buatPantau({ baca, kabari, jedaMs: 1000, sepiMs: 60_000 });
    p.aktif = true;
    p.diminta("s", dua);
    await vi.advanceTimersByTimeAsync(2000); // reads 1 and 2
    expect(kabari).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000); // read 3 is still running: no second one started
    expect(baca).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(kabari).toHaveBeenCalledTimes(1);
    p.hentikan();
    err.mockRestore();
  });
});
