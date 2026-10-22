/**
 * A group SeeLabs already held is edited, never put in late: the group's
 * FIRST finished robot save decides (an Input Ulang edit), or the read-back
 * found it only in SeeLabs, or the holder marked it as typed in by hand
 * (Sudah Kuinput Sendiri) by the end of the practicum day.
 */
import { describe, expect, it } from "vitest";
import { seelabsBaca, seelabsTugas, sesi, sesiKejadian } from "../../../src/lib/schema";
import { sudahAdaDiSeelabs, tandaManual } from "../lupa-nilai";

function dbDari(
  tugas: unknown[],
  baca: unknown[],
  lain: { sesi?: unknown[]; kejadian?: unknown[] } = {},
) {
  const q = (rows: unknown[]) => {
    const p: Record<string, unknown> = {};
    for (const m of ["where", "orderBy", "limit"]) p[m] = () => p;
    p.then = (ok: (v: unknown) => unknown) => ok(rows);
    return p;
  };
  const tabel = (t: unknown) =>
    t === seelabsTugas
      ? tugas
      : t === seelabsBaca
        ? baca
        : t === sesi
          ? (lain.sesi ?? [])
          : t === sesiKejadian
            ? (lain.kejadian ?? [])
            : [];
  return {
    select: () => ({ from: (t: unknown) => q(tabel(t)) }),
  } as never;
}

describe("sudahAdaDiSeelabs", () => {
  it("counts a group whose first save was an edit", async () => {
    const db = dbDari([{ sesiId: 19, nomor: 4, bukti: { ulang: true } }], []);
    expect([...(await sudahAdaDiSeelabs(db, [19]))]).toEqual(["19.4"]);
  });

  it("does not count a first input that was edited later", async () => {
    const db = dbDari(
      [
        { sesiId: 19, nomor: 3, bukti: { terverifikasi: true } },
        { sesiId: 19, nomor: 3, bukti: { ulang: true } },
      ],
      [],
    );
    expect((await sudahAdaDiSeelabs(db, [19])).size).toBe(0);
  });

  it("counts a group the read-back found only in SeeLabs", async () => {
    const db = dbDari([], [{ sesiId: 19, nomor: 5 }]);
    expect(seelabsBaca).toBeTruthy();
    expect((await sudahAdaDiSeelabs(db, [19])).has("19.5")).toBe(true);
  });

  it("counts a group marked as typed in by hand on the practicum day, not one marked after it", async () => {
    const lain = {
      sesi: [
        { id: 30, tanggal: "2026-10-22" },
        { id: 31, tanggal: "2026-10-22" },
      ],
      kejadian: [
        // 14:00 WIB the same day: in time
        {
          sesiId: 30,
          detail: { nomor: 2, akun: "YEN", manual: true },
          pada: new Date("2026-10-22T07:00:00Z"),
        },
        // 00:30 WIB the next day: after the deadline
        {
          sesiId: 31,
          detail: { nomor: 1, akun: null, manual: true },
          pada: new Date("2026-10-22T17:30:00Z"),
        },
      ],
    };
    const ada = await sudahAdaDiSeelabs(dbDari([], [], lain), [30, 31]);
    expect(ada.has("30.2")).toBe(true);
    expect(ada.has("31.1")).toBe(false);
  });
});

describe("tandaManual", () => {
  it("lists the groups still marked, with the lender and when", async () => {
    const pada = new Date("2026-10-22T07:00:00Z");
    const db = dbDari([], [], {
      kejadian: [
        { sesiId: 30, detail: { nomor: 2, akun: "YEN", manual: true }, pada },
        { sesiId: 30, detail: { nomor: 3, akun: null, manual: true }, pada },
        { sesiId: 30, detail: { nomor: 3, akun: null, manual: false }, pada },
      ],
    });
    const m = await tandaManual(db, [30]);
    expect([...m.keys()]).toEqual(["30.2"]);
    expect(m.get("30.2")).toEqual({ sesiId: 30, nomor: 2, pada, akun: "YEN" });
  });
});
