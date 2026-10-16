/**
 * Phase 18: a Mangkir (or a counted Mangkir Mengajar) zeroes that person's
 * units for the session. sinkronUnit runs against a queue of canned query
 * results, with the attendance and SeeLabs readers replaced.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const hasil: unknown[][] = [];
const dihapus: unknown[] = [];
const disisip: unknown[] = [];

function chain(jenis?: string): unknown {
  const p: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "limit", "set", "returning"]) p[m] = () => p;
  p.values = (v: unknown) => {
    disisip.push(v);
    return p;
  };
  p.where = (w: unknown) => {
    if (jenis === "delete") dihapus.push(w);
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => ok(jenis ? [] : (hasil.shift() ?? []));
  return p;
}

vi.mock("../../../src/lib/db", () => ({
  getDb: () => ({
    select: () => chain(),
    insert: () => chain("insert"),
    update: () => chain("update"),
    delete: () => chain("delete"),
  }),
}));

let statusDiberikan: { nim: string; nolkanUnit: boolean }[] = [];
vi.mock("../hadir-mengajar", () => ({
  kunciDariSesi: async () => "j:1:2026-10-01",
  statusOrang: async () => statusDiberikan,
}));
vi.mock("../seelabs", () => ({
  muatSeelabs: async () => ({
    kelompok: [
      { nomor: 1, penilai: "A", akun: "A" },
      { nomor: 2, penilai: "B", akun: "B" },
    ],
  }),
}));

const { sinkronUnit } = await import("../bayar");

const ctx = {
  tarifUnit: { reguler: 32500, internasional: 65000 },
  kas: { tarif: [], kecuali: [] },
};
const sesiRow = {
  id: 5,
  jenis: "biasa",
  status: "selesai",
  kelas: "reguler",
  tanggal: "2026-10-01",
  slot: 3,
};

/** The queue sinkronUnit reads: the session, its units, the sent groups. */
function antrean(units: unknown[] = []) {
  hasil.push([sesiRow], units, [{ nomor: 1 }, { nomor: 2 }]);
}

beforeEach(() => {
  hasil.length = 0;
  dihapus.length = 0;
  disisip.length = 0;
  statusDiberikan = [];
});

describe("sinkronUnit with attendance", () => {
  it("makes units for everyone who scored when nobody is zeroed", async () => {
    antrean();
    await sinkronUnit(
      {
        select: () => chain(),
        insert: () => chain("insert"),
        update: () => chain("update"),
        delete: () => chain("delete"),
      } as never,
      5,
      ctx as never,
    );
    expect(disisip.map((v) => (v as { nimPenilai: string }).nimPenilai).sort()).toEqual(["A", "B"]);
  });

  it("makes no unit for a person whose session is zeroed", async () => {
    statusDiberikan = [
      { nim: "A", nolkanUnit: true },
      { nim: "B", nolkanUnit: false },
    ];
    antrean();
    await sinkronUnit(
      {
        select: () => chain(),
        insert: () => chain("insert"),
        update: () => chain("update"),
        delete: () => chain("delete"),
      } as never,
      5,
      ctx as never,
    );
    expect(disisip.map((v) => (v as { nimPenilai: string }).nimPenilai)).toEqual(["B"]);
  });

  it("deletes a unit that already exists for the zeroed person", async () => {
    statusDiberikan = [{ nim: "A", nolkanUnit: true }];
    antrean([{ id: 9, kelompokNomor: 1, nimPenilai: "A", nimAkunSeelabs: "A", kotor: 32500 }]);
    await sinkronUnit(
      {
        select: () => chain(),
        insert: () => chain("insert"),
        update: () => chain("update"),
        delete: () => chain("delete"),
      } as never,
      5,
      ctx as never,
    );
    expect(dihapus.length).toBeGreaterThan(0);
    expect(disisip.map((v) => (v as { nimPenilai: string }).nimPenilai)).toEqual(["B"]);
  });
});
