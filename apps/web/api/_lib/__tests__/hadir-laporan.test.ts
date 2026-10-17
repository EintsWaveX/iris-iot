import { describe, expect, it, vi } from "vitest";

// hadir-laporan.ts imports getDb at load; the function under test gets its own db.
vi.mock("../../../src/lib/db.js", () => ({ getDb: () => ({}) }));

import { muatInputNilai } from "../hadir-laporan";

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

const SESI = { id: 7, tanggal: "2026-10-21", status: "selesai", jenis: "reguler" };
const t = (s: string) => new Date(s);
const kirim = (nomor: number, pada: string) => ({
  kelompokNomor: nomor,
  dikirimOleh: "NUE",
  dikirimPada: t(pada),
});
const simpan = (nomor: number, pada: string, akun = "NUE", cara = "robot") => ({
  kelompokNomor: nomor,
  disimpanPada: t(pada),
  akunNim: akun,
  cara,
});
const SEKARANG = t("2026-10-23T03:00:00+07:00");

describe("muatInputNilai", () => {
  it("keeps a group on time when it was saved again on a later day", async () => {
    const db = fakeDb(
      [kirim(1, "2026-10-21T14:50:00+07:00")],
      // newest first, as the query orders them: the Input Ulang re-save, then the first save
      [simpan(1, "2026-10-22T08:00:00+07:00"), simpan(1, "2026-10-21T15:00:00+07:00")],
      [],
    );
    const [g] = (await muatInputNilai(db, SESI, [1], new Map([[1, "NUE"]]), SEKARANG))!;
    expect(g.status).toBe("tepat");
    expect(g.menyusulPada).toBeNull();
    // what is shown is the latest save
    expect(g.simpan?.pada).toBe(t("2026-10-22T08:00:00+07:00").toISOString());
  });

  it("calls a first save after the deadline late even without a record yet", async () => {
    const db = fakeDb(
      [kirim(1, "2026-10-21T14:50:00+07:00")],
      [simpan(1, "2026-10-22T08:12:00+07:00")],
      [],
    );
    const [g] = (await muatInputNilai(db, SESI, [1], new Map([[1, "NUE"]]), SEKARANG))!;
    expect(g.status).toBe("menyusul");
    expect(g.menyusulPada).toBe(t("2026-10-22T08:12:00+07:00").toISOString());
  });

  it("lets a recorded miss decide: its put-in time, or still open", async () => {
    const db = fakeDb(
      [kirim(1, "2026-10-21T14:50:00+07:00"), kirim(2, "2026-10-21T14:50:00+07:00")],
      [simpan(1, "2026-10-22T08:12:00+07:00")],
      [
        {
          kelompokNomor: 1,
          nim: "NUE",
          kurang: ["seelabs"],
          menyusulPada: t("2026-10-22T08:12:00+07:00"),
        },
        { kelompokNomor: 2, nim: "NUE", kurang: ["seelabs"], menyusulPada: null },
      ],
    );
    const r = (await muatInputNilai(
      db,
      SESI,
      [1, 2],
      new Map([
        [1, "NUE"],
        [2, "NUE"],
      ]),
      SEKARANG,
    ))!;
    expect(r[0].status).toBe("menyusul");
    expect(r[0].menyusulPada).toBe(t("2026-10-22T08:12:00+07:00").toISOString());
    expect(r[1].status).toBe("lupa");
    expect(r[1].kurang).toEqual(["seelabs"]);
  });

  it("names why a group went through someone else's account", async () => {
    const db = fakeDb(
      [kirim(1, "2026-10-21T14:00:00+07:00"), kirim(2, "2026-10-21T14:00:00+07:00")],
      [
        simpan(1, "2026-10-21T14:10:00+07:00", "TWT"),
        simpan(2, "2026-10-21T14:10:00+07:00", "NUE"),
      ],
      [],
    );
    const pegang = new Map([
      [1, "NUE"],
      [2, "NUE"],
    ]);
    const r = (await muatInputNilai(db, SESI, [1, 2], pegang, SEKARANG))!;
    // the lowest group on a lender means the holder's own account was full
    expect(r[0].alasanAkun).toBe("sesi_ketiga");
    expect(r[1].alasanAkun).toBeNull();
    const db2 = fakeDb(
      [kirim(2, "2026-10-21T14:00:00+07:00")],
      [simpan(2, "2026-10-21T14:10:00+07:00", "TWT")],
      [],
    );
    const [g] = (await muatInputNilai(db2, SESI, [2], pegang, SEKARANG))!;
    expect(g.alasanAkun).toBe("kelompok_kedua");
  });

  it("leaves TOT sessions out", async () => {
    expect(
      await muatInputNilai(fakeDb(), { ...SESI, jenis: "tot" }, [1], new Map(), SEKARANG),
    ).toBeNull();
  });

  it("never judges a session before HADIR_SEJAK, even with nothing put in", async () => {
    const lama = { ...SESI, tanggal: "2026-10-15" };
    expect(
      await muatInputNilai(fakeDb([], [], []), lama, [1], new Map([[1, "NUE"]]), SEKARANG),
    ).toBeNull();
  });
});
