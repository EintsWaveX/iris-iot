import { describe, expect, it, vi } from "vitest";

// seelabs.ts imports getDb at load; the function under test gets its own db.
vi.mock("../../../src/lib/db.js", () => ({ getDb: () => ({}) }));

import { pemakaianAkunHari } from "../seelabs";

/** A db whose every select() chain resolves to the next queued result. */
function fakeDb(...hasil: unknown[][]) {
  const antre = [...hasil];
  const rantai = () => {
    const rows = antre.shift() ?? [];
    const p: unknown = new Proxy(() => undefined, {
      get: (_t, k) => (k === "then" ? (f: (v: unknown) => unknown) => f(rows) : () => p),
    });
    return p;
  };
  return { select: rantai } as never;
}

describe("pemakaianAkunHari", () => {
  it("counts each holder's own lowest group and the latest lender, per session", async () => {
    const db = fakeDb(
      // other sessions that date (unordered on purpose)
      [
        { id: 12, mulai: "09:30" },
        { id: 11, mulai: "06:30" },
      ],
      // kelompok id → nomor
      [
        { id: 101, nomor: 1 },
        { id: 102, nomor: 2 },
      ],
      // sesi_asisten
      [
        { sesiId: 11, kelompokId: 101, nim: "NUE" },
        { sesiId: 11, kelompokId: 102, nim: "NUE" },
        { sesiId: 12, kelompokId: 102, nim: "ADD" },
      ],
      // akun_seelabs events: GAN lent then cleared in 11, TWT lent in 12
      [
        { sesiId: 11, detail: { nomor: 2, akun: "GAN" } },
        { sesiId: 11, detail: { nomor: 2, akun: null } },
        { sesiId: 12, detail: { nomor: 1, akun: "TWT" } },
      ],
    );
    const r = await pemakaianAkunHari(db, "2026-10-01", 13);
    expect(r.get("NUE")).toEqual([{ sesiId: 11, mulai: "06:30" }]);
    expect(r.get("ADD")).toEqual([{ sesiId: 12, mulai: "09:30" }]);
    expect(r.get("TWT")).toEqual([{ sesiId: 12, mulai: "09:30" }]);
    expect(r.has("GAN")).toBe(false);
  });

  it("is empty when the day has no other session", async () => {
    expect((await pemakaianAkunHari(fakeDb([]), "2026-10-01", 1)).size).toBe(0);
  });
});
