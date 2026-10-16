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
  for (const m of ["select", "from", "where", "limit", "set", "returning", "onConflictDoUpdate"])
    p[m] = () => p;
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

let statusDiberikan: { nim: string; nolkanUnit: boolean; potong?: number; diharapkan?: boolean }[] =
  [];
vi.mock("../hadir-mengajar", () => ({
  kunciDariSesi: async () => "j:1:2026-10-01",
  statusOrang: async () => statusDiberikan,
  muatPotongan: async () => ({ perMenit: 2000, maks: 10 }),
  uraiKunci: () => ({ jenis: "j", jadwalId: 1, tanggal: "2026-10-01" }),
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

/** The unit inserts only (the attendance rows carry no kelompokNomor). */
const unitBaru = () => disisip.filter((v) => "kelompokNomor" in (v as object));
const hadirBaru = () =>
  disisip.filter((v) => "tarifTercatat" in (v as object)) as Record<string, unknown>[];

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
    expect(
      unitBaru()
        .map((v) => (v as { nimPenilai: string }).nimPenilai)
        .sort(),
    ).toEqual(["A", "B"]);
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
    expect(unitBaru().map((v) => (v as { nimPenilai: string }).nimPenilai)).toEqual(["B"]);
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
    expect(unitBaru().map((v) => (v as { nimPenilai: string }).nimPenilai)).toEqual(["B"]);
  });

  it("stores what each status cost, the groups lost and the rate used", async () => {
    statusDiberikan = [
      { nim: "A", nolkanUnit: true, potong: 0, diharapkan: true },
      { nim: "B", nolkanUnit: false, potong: 4000, diharapkan: true },
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
    const h = hadirBaru();
    expect(h.find((x) => x.nim === "A")).toMatchObject({
      sesiId: 5,
      potongTercatat: 0,
      nolkanTercatat: true,
      unitHilang: 1,
      tarifTercatat: { perMenit: 2000, maks: 10 },
    });
    expect(h.find((x) => x.nim === "B")).toMatchObject({
      potongTercatat: 4000,
      nolkanTercatat: false,
      unitHilang: 0,
    });
  });
});

describe("rebuild trigger", () => {
  it("also watches clock shifts and attendance changes after the session", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../bayar.ts", import.meta.url), "utf8");
    for (const k of ["akun_seelabs", "jam_geser", "hadir_status", "hadir_izin", "hadir_tandai"])
      expect(src).toContain(`'${k}'`);
    expect(src).toContain("max(h.diubah_pada) from hadir_mengajar");
  });
});
