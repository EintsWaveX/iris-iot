/**
 * Lupa Input Nilai counts a member complete without an L1 row: unless an
 * Asisten typed one, L1 is the system's (rubric, 2026-10-17).
 */
import { describe, expect, it, vi } from "vitest";
import {
  asisten,
  kelompok,
  nilai,
  nilaiAbsen,
  nilaiKirim,
  seelabsEkspor,
  seelabsTugas,
  sesi,
  sesiAnggota,
  sesiAsisten,
} from "../../../src/lib/schema";

vi.mock("../seelabs", () => ({ muatSeelabs: async () => null }));

const { muatNilaiTerbuka } = await import("../lupa-nilai");

const TANPA_L1 = ["TP", "TA", "D1", "D2", "D3", "D4", "L2"];

/** A db whose every read answers the rows given for its table. */
function dbDari(baris: Map<unknown, unknown[]>) {
  const q = (rows: unknown[]) => {
    const p: Record<string, unknown> = {};
    for (const m of ["where", "orderBy", "innerJoin"]) p[m] = () => p;
    p.then = (ok: (v: unknown) => unknown) => ok(rows);
    return p;
  };
  return {
    select: () => ({ from: (t: unknown) => q(baris.get(t) ?? []) }),
  } as never;
}

function db(skorA2: string[]) {
  return dbDari(
    new Map<unknown, unknown[]>([
      [
        sesi,
        [{ id: 7, modul: 1, tanggal: "2026-10-19", slot: 1, jenis: "reguler", status: "selesai" }],
      ],
      [
        sesiAnggota,
        [
          { sesiId: 7, nomor: 1, nim: "A1" },
          { sesiId: 7, nomor: 1, nim: "A2" },
        ],
      ],
      [sesiAsisten, [{ sesiId: 7, kelompokId: 11, nim: "1010" }]],
      [kelompok, [{ id: 11, nomor: 1 }]],
      [nilaiKirim, []],
      [seelabsEkspor, []],
      [nilaiAbsen, []],
      [
        nilai,
        [
          ...TANPA_L1.map((komponen) => ({ sesiId: 7, nim: "A1", komponen })),
          ...skorA2.map((komponen) => ({ sesiId: 7, nim: "A2", komponen })),
        ],
      ],
      [seelabsTugas, []],
      [asisten, [{ nim: "1010", kode: "ABC" }]],
    ]),
  );
}

describe("muatNilaiTerbuka and the automatic L1", () => {
  it("counts a group complete when only L1 rows are missing", async () => {
    const [g] = await muatNilaiTerbuka(db(TANPA_L1), [7]);
    expect(g).toMatchObject({ nomor: 1, lengkap: true });
    expect(g.kurang).not.toContain("lengkap");
  });

  it("still counts a missing level component", async () => {
    const [g] = await muatNilaiTerbuka(db(TANPA_L1.filter((k) => k !== "D3")), [7]);
    expect(g).toMatchObject({ nomor: 1, lengkap: false });
    expect(g.kurang).toContain("lengkap");
  });
});
