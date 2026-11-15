import { afterEach, describe, expect, it, vi } from "vitest";
import { batalkanSemuaCache, cacheTunggal } from "../cache-tunggal.js";

afterEach(() => vi.useRealTimers());

/** A loader that counts its runs and lets the test decide when each one finishes. */
function pemuat<T>() {
  const antri: Array<(v: T) => void> = [];
  let jalan = 0;
  return {
    muat: () =>
      new Promise<T>((selesai) => {
        jalan++;
        antri.push(selesai);
      }),
    selesaikan: (v: T) => antri.shift()!(v),
    get jalan() {
      return jalan;
    },
  };
}

describe("cacheTunggal", () => {
  it("is off until turned on: every call loads", async () => {
    let n = 0;
    const c = cacheTunggal(async () => ++n);
    expect(await c.ambil()).toBe(1);
    expect(await c.ambil()).toBe(2);
  });

  it("keeps a value for its life, then loads again", async () => {
    vi.useFakeTimers();
    let n = 0;
    const c = cacheTunggal(async () => ++n);
    c.atur(1000);
    expect(await c.ambil()).toBe(1);
    vi.advanceTimersByTime(999);
    expect(await c.ambil()).toBe(1);
    vi.advanceTimersByTime(2);
    expect(await c.ambil()).toBe(2);
  });

  it("runs one load for everyone asking at once", async () => {
    const p = pemuat<string>();
    const c = cacheTunggal(p.muat);
    c.atur(1000);
    const a = [c.ambil(), c.ambil(), c.ambil()];
    expect(p.jalan).toBe(1);
    p.selesaikan("x");
    expect(await Promise.all(a)).toEqual(["x", "x", "x"]);
  });

  it("drops the value on batalkan, and ignores a load that began before it", async () => {
    const p = pemuat<string>();
    const c = cacheTunggal(p.muat);
    c.atur(1000);
    const lama = c.ambil();
    c.batalkan(); // a write happened while the first read was in flight
    const baru = c.ambil();
    expect(p.jalan).toBe(2);
    p.selesaikan("dari-sebelum-tulis");
    p.selesaikan("dari-sesudah-tulis");
    expect(await lama).toBe("dari-sebelum-tulis");
    expect(await baru).toBe("dari-sesudah-tulis");
    // Only the read after the write may be remembered.
    expect(await c.ambil()).toBe("dari-sesudah-tulis");
    expect(p.jalan).toBe(2);
  });

  it("gives each caller its own copy when asked to", async () => {
    const c = cacheTunggal(
      async () => ({ a: 1 }),
      (r) => ({ ...r }),
    );
    c.atur(1000);
    const x = await c.ambil();
    x.a = 99;
    expect((await c.ambil()).a).toBe(1);
  });

  it("does not cache a failed load", async () => {
    let n = 0;
    const c = cacheTunggal(async () => {
      if (++n === 1) throw new Error("db down");
      return n;
    });
    c.atur(1000);
    await expect(c.ambil()).rejects.toThrow("db down");
    expect(await c.ambil()).toBe(2);
  });

  it("batalkanSemuaCache drops every cache at once", async () => {
    let a = 0;
    let b = 0;
    const ca = cacheTunggal(async () => ++a);
    const cb = cacheTunggal(async () => ++b);
    ca.atur(1000);
    cb.atur(1000);
    await ca.ambil();
    await cb.ambil();
    batalkanSemuaCache();
    expect(await ca.ambil()).toBe(2);
    expect(await cb.ambil()).toBe(2);
  });
});
