/**
 * Phase 18 Task 10: catatLupaNilai over a fake database. After the practicum
 * day a group not sent or not saved is recorded for its holder; a done group,
 * a TOT session and a day still running are left alone; a recorded group
 * that is done later gets menyusulPada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const data = new Map<unknown, unknown[]>();
const masuk: Record<string, unknown>[] = [];
const ubah: Record<string, unknown>[] = [];
// When true the fake insert reports no row written (onConflictDoNothing skipped it)
let lewatiMasuk = false;

function chain(tabel?: unknown): unknown {
  const st = { tabel };
  const p: Record<string, unknown> = {};
  for (const m of ["select", "where", "orderBy", "limit", "onConflictDoNothing"]) p[m] = () => p;
  p.from = (t: unknown) => {
    st.tabel = t;
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => ok(data.get(st.tabel) ?? []);
  return p;
}

const db = {
  select: () => chain(),
  insert: () => ({
    values: (v: Record<string, unknown>) => {
      masuk.push(v);
      return {
        onConflictDoNothing: () => ({
          returning: async () => (lewatiMasuk ? [] : [{ id: masuk.length }]),
        }),
      };
    },
  }),
  update: () => ({
    set: (v: Record<string, unknown>) => {
      ubah.push(v);
      return chain();
    },
  }),
};

vi.mock("../../../src/lib/db", () => ({ getDb: () => db }));
vi.mock("../siaran", () => ({ siarkan: async () => {} }));

const S = await import("../../../src/lib/schema");
const { catatLupaNilai } = await import("../jam-lab");

// 15 October 2026 is a Thursday; "now" is just past that day's deadline.
const SESUDAH = new Date("2026-10-16T00:00:30+07:00");
const SEBELUM = new Date("2026-10-15T22:00:00+07:00");

function siapkan(o: { jenis?: string; tanggal?: string } = {}) {
  data.set(S.sesi, [
    {
      id: 1,
      tanggal: o.tanggal ?? "2026-10-15",
      jenis: o.jenis ?? "reguler",
      status: "selesai",
    },
  ]);
  data.set(S.sesiAnggota, [
    { sesiId: 1, nomor: 1 },
    { sesiId: 1, nomor: 2 },
  ]);
  data.set(S.kelompok, [
    { id: 11, nomor: 1 },
    { id: 12, nomor: 2 },
  ]);
  data.set(S.sesiAsisten, [
    { sesiId: 1, kelompokId: 11, nim: "1001" },
    { sesiId: 1, kelompokId: 12, nim: "1002" },
  ]);
  data.set(S.nilaiKirim, []);
  data.set(S.seelabsEkspor, []);
  data.set(S.lupaNilai, []);
}

beforeEach(() => {
  data.clear();
  masuk.length = 0;
  ubah.length = 0;
  lewatiMasuk = false;
});

describe("catatLupaNilai", () => {
  it("records an unsent, unsaved group for its holder with what was missing", async () => {
    siapkan();
    data.set(S.nilaiKirim, [{ sesiId: 1, nomor: 2 }]);
    const n = await catatLupaNilai(db as never, SESUDAH);
    expect(n).toBe(2);
    expect(masuk).toEqual([
      expect.objectContaining({ kelompokNomor: 1, nim: "1001", kurang: ["kirim", "seelabs"] }),
      expect.objectContaining({ kelompokNomor: 2, nim: "1002", kurang: ["seelabs"] }),
    ]);
  });

  it("records nothing for a group that was sent and saved", async () => {
    siapkan();
    data.set(S.nilaiKirim, [
      { sesiId: 1, nomor: 1 },
      { sesiId: 1, nomor: 2 },
    ]);
    data.set(S.seelabsEkspor, [
      { sesiId: 1, nomor: 1 },
      { sesiId: 1, nomor: 2 },
    ]);
    expect(await catatLupaNilai(db as never, SESUDAH)).toBe(0);
    expect(masuk).toEqual([]);
  });

  it("leaves a TOT session and a day still running alone", async () => {
    siapkan({ jenis: "tot" });
    expect(await catatLupaNilai(db as never, SESUDAH)).toBe(0);
    siapkan();
    expect(await catatLupaNilai(db as never, SEBELUM)).toBe(0);
    expect(masuk).toEqual([]);
  });

  it("records a group once, even on the next minute", async () => {
    siapkan();
    data.set(S.lupaNilai, [
      { sesiId: 1, nomor: 1, menyusulPada: null },
      { sesiId: 1, nomor: 2, menyusulPada: null },
    ]);
    expect(await catatLupaNilai(db as never, SESUDAH)).toBe(0);
    expect(masuk).toEqual([]);
  });

  it("stamps menyusulPada when a recorded group is now done", async () => {
    siapkan();
    data.set(S.nilaiKirim, [{ sesiId: 1, nomor: 1 }]);
    const disimpan = new Date("2026-10-16T08:30:00+07:00");
    data.set(S.seelabsEkspor, [{ sesiId: 1, nomor: 1, pada: disimpan }]);
    data.set(S.lupaNilai, [
      { sesiId: 1, nomor: 1, menyusulPada: null },
      { sesiId: 1, nomor: 2, menyusulPada: null },
    ]);
    const lambat = new Date("2026-10-16T09:00:00+07:00");
    expect(await catatLupaNilai(db as never, lambat)).toBe(0);
    // The real save time, not the minute the clock ran
    expect(ubah).toEqual([{ menyusulPada: disimpan }]);
  });

  it("stamps a record whose practicum day is five days old", async () => {
    siapkan({ tanggal: "2026-10-10" });
    // Only the open lupa_nilai row is read for stamping; the session is outside the 3-day window
    data.set(S.sesi, []);
    const dikirim = new Date("2026-10-15T10:00:00+07:00");
    const disimpan = new Date("2026-10-15T10:05:00+07:00");
    data.set(S.nilaiKirim, [{ sesiId: 1, nomor: 1, pada: dikirim }]);
    data.set(S.seelabsEkspor, [{ sesiId: 1, nomor: 1, pada: disimpan }]);
    data.set(S.lupaNilai, [{ sesiId: 1, nomor: 1, menyusulPada: null }]);
    expect(await catatLupaNilai(db as never, new Date("2026-10-15T12:00:00+07:00"))).toBe(0);
    expect(ubah).toEqual([{ menyusulPada: disimpan }]);
  });

  it("counts only the rows actually written", async () => {
    siapkan();
    lewatiMasuk = true;
    expect(await catatLupaNilai(db as never, SESUDAH)).toBe(0);
    expect(masuk).toHaveLength(2);
  });
});
