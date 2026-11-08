import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

const { waitUntil, tungguLatar, jumlahLatar } = await import("../tunggu.js");
const vercel = await import("@vercel/functions");

afterEach(() => {
  delete process.env.VERCEL;
  vi.clearAllMocks();
});

describe("waitUntil for both homes of the API", () => {
  it("tracks a job until it settles", async () => {
    let selesai!: () => void;
    waitUntil(new Promise<void>((r) => (selesai = r)));
    expect(jumlahLatar()).toBe(1);
    selesai();
    expect(await tungguLatar(1000)).toBe(true);
    expect(jumlahLatar()).toBe(0);
  });

  it("a rejected job is tracked, never thrown, and leaves the set", async () => {
    waitUntil(Promise.reject(new Error("boom")));
    expect(await tungguLatar(1000)).toBe(true);
    expect(jumlahLatar()).toBe(0);
  });

  it("drain gives up when a job outlasts the limit", async () => {
    waitUntil(new Promise(() => {}));
    expect(await tungguLatar(30)).toBe(false);
    expect(jumlahLatar()).toBe(1);
  });

  it("calls Vercel's waitUntil only on Vercel", async () => {
    waitUntil(Promise.resolve());
    expect(vercel.waitUntil).not.toHaveBeenCalled();
    process.env.VERCEL = "1";
    const p = Promise.resolve();
    waitUntil(p);
    expect(vercel.waitUntil).toHaveBeenCalledWith(p);
    await tungguLatar(100);
  });
});
