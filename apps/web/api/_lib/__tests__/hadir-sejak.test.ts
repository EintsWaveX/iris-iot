/**
 * Phase 18: judging starts at HADIR_SEJAK (the deploy date). A finished
 * session from before it has no check-in rows, and must never read as
 * Mangkir: statusOrang gives no judged row for it, so a Bayar rebuild keeps
 * its units. The real statusOrang and sinkronUnit run over canned rows per
 * table (a table the test does not fill reads as empty).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const data = new Map<unknown, unknown[]>();
const disisip: { tabel: unknown; v: unknown }[] = [];

function chain(tabel?: unknown, tulis?: boolean): unknown {
  const st = { tabel };
  const p: Record<string, unknown> = {};
  for (const m of [
    "select",
    "where",
    "orderBy",
    "limit",
    "set",
    "returning",
    "onConflictDoNothing",
    "onConflictDoUpdate",
    "innerJoin",
    "leftJoin",
  ])
    p[m] = () => p;
  p.from = (t: unknown) => {
    st.tabel = t;
    return p;
  };
  p.values = (v: unknown) => {
    disisip.push({ tabel: st.tabel, v });
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => ok(tulis ? [] : (data.get(st.tabel) ?? []));
  return p;
}

const db = {
  select: () => chain(),
  insert: (t: unknown) => chain(t, true),
  update: (t: unknown) => chain(t, true),
  delete: (t: unknown) => chain(t, true),
};

vi.mock("../../../src/lib/db", () => ({ getDb: () => db }));
vi.mock("../seelabs", () => ({
  muatSeelabs: async () => ({ kelompok: [{ nomor: 1, penilai: "2020", akun: "2020" }] }),
}));
vi.mock("../penugasan-api", () => ({
  muatMinggu: async (_db: unknown, rows: { id: number }[]) =>
    new Map(
      rows.map((r) => [
        r.id,
        {
          status: "aktif",
          kursi: [{ nomor: 1, kode: "AAA", jenis: "tetap", tetap: "AAA", izin: false }],
          tugas: [],
          izin: [],
        },
      ]),
    ),
  muatPengaturanJendela: async () => ({ default: 15, min: 5, max: 30 }),
  bayarUlangSlot: async () => {},
}));

const S = await import("../../../src/lib/schema");
const { HADIR_SEJAK } = await import("../../../src/lib/hadir-mengajar");
const { statusOrang, kunciSlot } = await import("../hadir-mengajar");
const { sinkronUnit } = await import("../bayar");

const ctx = {
  tarifUnit: { reguler: 32500, internasional: 65000 },
  kas: { tarif: [], kecuali: [] },
};

/** A finished slot-1 session on `tanggal` where AAA (2020) held group 1 and never checked in. */
function isi(tanggal: string) {
  data.set(S.asisten, [{ nim: "2020", kode: "AAA", nama: "Anak A" }]);
  data.set(S.jadwal, [
    {
      id: 1,
      semester: "2026-ganjil",
      hari: 4,
      slot: 1,
      status: "aktif",
      liburTanggal: null,
      pj: null,
      asisten: ["AAA"],
      jendelaMulaiMenit: null,
    },
  ]);
  data.set(S.sesi, [
    {
      id: 5,
      tanggal,
      slot: 1,
      jenis: "reguler",
      status: "selesai",
      kelas: "reguler",
      modul: 1,
      mulai: "06:30",
    },
  ]);
  data.set(S.nilaiKirim, [{ nomor: 1 }]);
}

const unitBaru = () => disisip.filter((d) => d.tabel === S.unitBayar).map((d) => d.v);
const nolTercatat = () =>
  disisip.filter(
    (d) => d.tabel === S.hadirMengajar && (d.v as { nolkanTercatat?: boolean }).nolkanTercatat,
  );

beforeEach(() => {
  data.clear();
  disisip.length = 0;
});

describe("HADIR_SEJAK", () => {
  it("is a date, the first practicum Monday", () => {
    expect(HADIR_SEJAK).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${HADIR_SEJAK}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it("judges nobody in a session from before it", async () => {
    isi("2026-10-15");
    const r = await statusOrang(
      db as never,
      kunciSlot(1, "2026-10-15"),
      new Date("2026-10-17T12:00:00+07:00"),
    );
    expect(r).toEqual([]);
  });

  it("still judges a session on or after it", async () => {
    isi(HADIR_SEJAK);
    const r = await statusOrang(
      db as never,
      kunciSlot(1, HADIR_SEJAK),
      new Date(`${HADIR_SEJAK}T12:00:00+07:00`),
    );
    expect(r).toEqual([expect.objectContaining({ nim: "2020", status: "mangkir" })]);
  });

  it("keeps the units of a session from before it that has no check-in rows", async () => {
    isi("2026-10-15");
    await sinkronUnit(db as never, 5, ctx as never);
    expect(unitBaru()).toEqual([expect.objectContaining({ nimPenilai: "2020" })]);
    expect(nolTercatat()).toEqual([]);
  });

  it("zeroes the units of a Mangkir on or after it", async () => {
    isi(HADIR_SEJAK);
    await sinkronUnit(db as never, 5, ctx as never);
    expect(unitBaru()).toEqual([]);
    expect(nolTercatat()).toHaveLength(1);
  });
});
