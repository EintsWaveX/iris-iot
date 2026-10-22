/**
 * A group SeeLabs already held is edited, never put in late: the group's
 * FIRST finished robot save decides (an Input Ulang edit), or the read-back
 * found it only in SeeLabs.
 */
import { describe, expect, it } from "vitest";
import { seelabsBaca, seelabsTugas } from "../../../src/lib/schema";
import { sudahAdaDiSeelabs } from "../lupa-nilai";

function dbDari(tugas: unknown[], baca: unknown[]) {
  const q = (rows: unknown[]) => {
    const p: Record<string, unknown> = {};
    for (const m of ["where", "orderBy", "limit"]) p[m] = () => p;
    p.then = (ok: (v: unknown) => unknown) => ok(rows);
    return p;
  };
  return {
    select: () => ({ from: (t: unknown) => q(t === seelabsTugas ? tugas : baca) }),
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
});
