import { describe, expect, it } from "vitest";

const { waitUntil, tungguLatar, jumlahLatar } = await import("../tunggu.js");

describe("waitUntil", () => {
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
});
