/**
 * Phase 18 Task 3: check-in, the PJ's rights and writes, and the clock shift,
 * through the real functions with the database replaced by canned rows per
 * table (a table the test does not fill reads as empty).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const data = new Map<unknown, unknown[]>();
const updReturn: unknown[][] = [];
const ditulis: { tabel: unknown; v: unknown; jenis: "insert" | "update" | "delete" }[] = [];
const kejadian: { sesiId: number; jenis: string; detail: unknown }[] = [];
const audit: { aksi: string; detail: unknown }[] = [];
const mingguIzin: { nim: string; status: string }[] = [];
const orangMuat: { current: Record<string, unknown> | null } = { current: null };
const bayarUlang: { jadwalId: number; tanggal: string }[] = [];

function chain(tabel?: unknown, jenis?: "insert" | "update" | "delete"): unknown {
  const st = { tabel, jenis };
  const p: Record<string, unknown> = {};
  for (const m of [
    "select",
    "where",
    "orderBy",
    "limit",
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
    ditulis.push({ tabel: st.tabel, v, jenis: "insert" });
    return p;
  };
  p.set = (v: unknown) => {
    ditulis.push({ tabel: st.tabel, v, jenis: "update" });
    return p;
  };
  p.returning = () => {
    st.jenis = "update";
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) =>
    ok(st.jenis === "update" ? (updReturn.shift() ?? []) : (data.get(st.tabel) ?? []));
  return p;
}

vi.mock("../../../src/lib/db", () => ({
  getDb: () => ({
    select: () => chain(),
    insert: (t: unknown) => chain(t, "insert"),
    update: (t: unknown) => chain(t, "update"),
    delete: (t: unknown) => {
      ditulis.push({ tabel: t, v: null, jenis: "delete" });
      return chain(t, "delete");
    },
  }),
}));
vi.mock("../../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async (_n: string, aksi: string, detail: unknown) => {
    audit.push({ aksi, detail });
  },
}));
vi.mock("../berjalan", () => ({
  ALASAN_MIN: 5,
  catatKejadian: async (sesiId: number, jenis: string, detail: unknown) => {
    kejadian.push({ sesiId, jenis, detail });
  },
}));
vi.mock("../hak", () => ({ muatOrang: async () => orangMuat.current }));
vi.mock("../penugasan-api", () => ({
  muatMinggu: async (_db: unknown, rows: { id: number }[]) =>
    new Map(
      rows.map((r) => [
        r.id,
        {
          tanggal: "2026-10-19",
          status: "aktif",
          kursi: [{ nomor: 1, kode: "AAA", jenis: "tetap", tetap: "AAA", izin: false }],
          tugas: [],
          izin: mingguIzin,
        },
      ]),
    ),
  muatPengaturanJendela: async () => ({ default: 15, min: 5, max: 30 }),
  bayarUlangSlot: async (_db: unknown, jadwalId: number, tanggal: string) => {
    bayarUlang.push({ jadwalId, tanggal });
  },
}));

const { asisten, hadirJam, hadirMengajar, jadwal, sesi, sesiAsisten } =
  await import("../../../src/lib/schema");
const {
  masuk,
  batalMasuk,
  bolehPj,
  handleHadirPj,
  kunciSlot,
  kunciSusulan,
  muatKonteks,
  uraiKunci,
} = await import("../hadir-mengajar");

const NOW = new Date("2026-10-19T06:30:00+07:00");
const KUNCI = kunciSlot(1, "2026-10-19");

function fakeRes() {
  const res = {
    code: 200,
    body: undefined as Record<string, unknown> | undefined,
    status(c: number) {
      res.code = c;
      return res;
    },
    json(b: Record<string, unknown>) {
      res.body = b;
      return res;
    },
  };
  return res;
}

const orang = (extra: Record<string, unknown> = {}) => ({
  nim: "1010",
  kode: "PJX",
  nama: "Pe Je",
  tier: "asisten",
  badges: [],
  hakOverride: {},
  divisi: "ASO",
  status: "aktif",
  ...extra,
});

function isiSlot() {
  data.set(asisten, [
    { nim: "1010", kode: "PJX", nama: "Pe Je" },
    { nim: "2020", kode: "AAA", nama: "Anak A" },
  ]);
  data.set(jadwal, [
    {
      id: 1,
      semester: "2026-ganjil",
      hari: 1,
      slot: 1,
      status: "aktif",
      liburTanggal: null,
      pj: "PJX",
      asisten: ["AAA"],
      jendelaMulaiMenit: null,
    },
  ]);
}

async function pj(body: Record<string, unknown>, nim = "1010") {
  const res = fakeRes();
  await handleHadirPj(
    { body, method: "POST" } as never,
    res as never,
    { nim, role: "asisten" } as never,
  );
  return res;
}

beforeEach(() => {
  data.clear();
  updReturn.length = 0;
  mingguIzin.length = 0;
  ditulis.length = 0;
  kejadian.length = 0;
  audit.length = 0;
  bayarUlang.length = 0;
  orangMuat.current = orang();
});

describe("keys", () => {
  it("builds and reads both shapes", () => {
    expect(kunciSlot(3, "2026-10-19")).toBe("j:3:2026-10-19");
    expect(kunciSusulan(9)).toBe("s:9");
    expect(uraiKunci("j:3:2026-10-19")).toEqual({ jenis: "j", jadwalId: 3, tanggal: "2026-10-19" });
    expect(uraiKunci("s:9")).toEqual({ jenis: "s", sesiId: 9 });
    expect(uraiKunci("x:1")).toBeNull();
  });
});

describe("masuk", () => {
  it("refuses a person with no slot today", async () => {
    data.set(asisten, [{ nim: "3030", kode: "ZZZ", nama: "Tak Ada" }]);
    const { getDb } = await import("../../../src/lib/db");
    const r = await masuk(getDb() as never, "3030", KUNCI, NOW);
    expect(r).toEqual({ ok: false, kode: "tidak_dijadwalkan" });
  });

  it("stamps the first press and answers sudah on the second", async () => {
    isiSlot();
    const { getDb } = await import("../../../src/lib/db");
    updReturn.push([{ hadirPada: NOW }]);
    const a = await masuk(getDb() as never, "2020", KUNCI, NOW);
    expect(a).toEqual({ ok: true, hadirPada: NOW.toISOString() });
    // The second update touches no row: the first time stands.
    updReturn.push([]);
    const b = await masuk(getDb() as never, "2020", KUNCI, new Date(NOW.getTime() + 60000));
    expect(b).toEqual({ ok: false, kode: "sudah" });
    const sets = ditulis.filter((d) => d.tabel === hadirMengajar && d.jenis === "update");
    expect(sets).toHaveLength(2);
  });
});

describe("bolehPj", () => {
  const dasar = { tier: "asisten", badges: [] as string[], kode: "XYZ", nim: "9" };
  it("allows the full right, the slot's PJ code and a Susulan's creator", () => {
    expect(bolehPj({ ...dasar, tier: "admin" }, { pj: "AAA" })).toBe(true);
    expect(bolehPj({ ...dasar, badges: ["dev"] }, { pj: null })).toBe(true);
    expect(bolehPj({ ...dasar, kode: "pjx" }, { pj: "PJX" })).toBe(true);
    expect(bolehPj(dasar, { pj: null, pembuat: "9" })).toBe(true);
  });
  it("refuses another Asisten", () => {
    expect(bolehPj(dasar, { pj: "PJX" })).toBe(false);
    expect(bolehPj(dasar, { pj: null, pembuat: "1" })).toBe(false);
  });
});

describe("PJ status", () => {
  it("needs a reason of at least five characters", async () => {
    isiSlot();
    const r = await pj({
      aksi: "status",
      kunci: KUNCI,
      nim: "2020",
      status: "tepat",
      alasan: "ok",
    });
    expect(r.body).toMatchObject({ ok: false, kode: "alasan_kosong" });
    expect(ditulis).toHaveLength(0);
  });

  it("refuses a PJ changing their own row without the full right", async () => {
    isiSlot();
    const r = await pj({
      aksi: "status",
      kunci: KUNCI,
      nim: "1010",
      status: "tepat",
      alasan: "salah catat",
    });
    expect(r.code).toBe(403);
    expect(r.body).toMatchObject({ ok: false, kode: "tanpa_hak" });
  });

  it("refuses an Asisten who is not the PJ", async () => {
    isiSlot();
    orangMuat.current = orang({ kode: "QQQ" });
    const r = await pj({
      aksi: "status",
      kunci: KUNCI,
      nim: "2020",
      status: "tepat",
      alasan: "salah catat",
    });
    expect(r.body).toMatchObject({ ok: false, kode: "tanpa_hak" });
  });

  it("writes the override and audits it", async () => {
    isiSlot();
    const r = await pj({
      aksi: "status",
      kunci: KUNCI,
      nim: "2020",
      status: "telat",
      menit: 4,
      alasan: "macet di jalan",
    });
    expect(r.body).toEqual({ ok: true });
    const w = ditulis.find((d) => d.tabel === hadirMengajar && d.jenis === "insert");
    expect(w?.v).toMatchObject({
      nim: "2020",
      ubahStatus: "telat",
      ubahMenit: 4,
      diharapkan: true,
    });
    expect(audit.map((a) => a.aksi)).toContain("hadir_status");
  });

  it("rejects a Telat outside 1 to 10 minutes", async () => {
    isiSlot();
    const r = await pj({
      aksi: "status",
      kunci: KUNCI,
      nim: "2020",
      status: "telat",
      menit: 11,
      alasan: "macet di jalan",
    });
    expect(r.body).toMatchObject({ ok: false, kode: "format_salah" });
  });
});

describe("clock shift", () => {
  it("writes hadir_jam and a jam_geser event", async () => {
    isiSlot();
    data.set(sesi, [{ id: 7, status: "terjadwal", modul: 1, mulai: "06:30" }]);
    const r = await pj({ aksi: "geser", kunci: KUNCI, jam: "06:40", alasan: "ruang belum dibuka" });
    expect(r.body).toEqual({ ok: true, base: "06:40" });
    const w = ditulis.find((d) => d.tabel === hadirJam && d.jenis === "insert");
    expect(w?.v).toMatchObject({ kunci: KUNCI, baseMenit: 400, dariMenit: 385, oleh: "1010" });
    expect(kejadian).toEqual([expect.objectContaining({ sesiId: 7, jenis: "jam_geser" })]);
    expect(audit.map((a) => a.aksi)).toContain("hadir_geser");
  });

  it("works before the session exists (no event row yet)", async () => {
    isiSlot();
    const r = await pj({ aksi: "geser", kunci: KUNCI, jam: "06:40", alasan: "ruang belum dibuka" });
    expect(r.body).toMatchObject({ ok: true });
    expect(kejadian).toHaveLength(0);
  });

  it("null undoes the shift", async () => {
    isiSlot();
    const r = await pj({ aksi: "geser", kunci: KUNCI, jam: null, alasan: "kembali normal" });
    expect(r.body).toEqual({ ok: true, base: "06:25" });
    expect(ditulis.some((d) => d.tabel === hadirJam && d.jenis === "delete")).toBe(true);
  });
});

describe("masuk window and Izin", () => {
  it("lets a person on Izin check in", async () => {
    isiSlot();
    mingguIzin.push({ nim: "2020", status: "aktif" });
    const { getDb } = await import("../../../src/lib/db");
    updReturn.push([{ hadirPada: NOW }]);
    expect(await masuk(getDb() as never, "2020", KUNCI, NOW)).toEqual({
      ok: true,
      hadirPada: NOW.toISOString(),
    });
  });

  it("refuses before the start window opens", async () => {
    isiSlot();
    const { getDb } = await import("../../../src/lib/db");
    const r = await masuk(getDb() as never, "2020", KUNCI, new Date("2026-10-19T05:00:00+07:00"));
    expect(r).toEqual({ ok: false, kode: "belum_buka" });
  });

  it("refuses after the session is over", async () => {
    isiSlot();
    const { getDb } = await import("../../../src/lib/db");
    const r = await masuk(getDb() as never, "2020", KUNCI, new Date("2026-10-19T10:00:00+07:00"));
    expect(r).toEqual({ ok: false, kode: "sudah_selesai" });
  });
});

describe("batalMasuk", () => {
  const baris = (extra: Record<string, unknown> = {}) =>
    data.set(hadirMengajar, [{ hadirPada: NOW, oleh: "2020", ubah: null, ...extra }]);
  const panggil = async (nim = "2020", detik = 10) => {
    const { getDb } = await import("../../../src/lib/db");
    return batalMasuk(getDb() as never, nim, KUNCI, new Date(NOW.getTime() + detik * 1000));
  };
  it("takes the own stamp back within 15 s", async () => {
    baris();
    expect(await panggil()).toEqual({ ok: true });
  });
  it("refuses after 15 s", async () => {
    baris();
    expect(await panggil("2020", 16)).toEqual({ ok: false, kode: "terlalu_lama" });
  });
  it("refuses a stamp someone else made", async () => {
    baris({ oleh: "1010" });
    expect(await panggil()).toEqual({ ok: false, kode: "tidak_ada" });
  });
  it("refuses when a PJ override stands", async () => {
    baris({ ubah: "telat" });
    expect(await panggil()).toEqual({ ok: false, kode: "tidak_ada" });
  });
});

describe("Susulan PJ", () => {
  const dasar = { tier: "asisten", badges: [] as string[], kode: "XYZ", nim: "9", hakOverride: {} };
  it("also allows the full Pair right", () => {
    expect(bolehPj({ ...dasar, hakOverride: { pair: true } }, { pj: null, susulan: true })).toBe(
      true,
    );
    expect(bolehPj(dasar, { pj: null, susulan: true })).toBe(false);
  });
});

describe("Susulan expected people", () => {
  /** Susulan 9 on the first judged Monday: 2020 was written down at its start,
   *  3030 holds a group now (a cover, or a group moved after the end). */
  function isiSusulan(status: string) {
    data.set(asisten, [
      { nim: "2020", kode: "AAA", nama: "Anak A" },
      { nim: "3030", kode: "CCC", nama: "Cadangan" },
    ]);
    data.set(sesi, [{ id: 9, status, modul: 1, mulai: "08:00", tanggal: "2026-10-19" }]);
    data.set(sesiAsisten, [{ nim: "3030" }]);
    data.set(hadirMengajar, [
      { nim: "2020", diharapkan: true },
      { nim: "3030", diharapkan: false },
    ]);
  }
  const konteks = async (o?: { pemegangSekarang?: boolean }) => {
    const { getDb } = await import("../../../src/lib/db");
    return muatKonteks(getDb() as never, kunciSusulan(9), o);
  };

  it("once started, expects the people its start wrote down, not who holds a group now", async () => {
    isiSusulan("berjalan");
    expect([...(await konteks())!.diharapkan]).toEqual(["2020"]);
    isiSusulan("selesai");
    expect([...(await konteks())!.diharapkan]).toEqual(["2020"]);
  });

  it("before its start, and at the start itself, expects who holds a group", async () => {
    isiSusulan("terjadwal");
    expect([...(await konteks())!.diharapkan]).toEqual(["3030"]);
    isiSusulan("berjalan");
    expect([...(await konteks({ pemegangSekarang: true }))!.diharapkan]).toEqual(["3030"]);
  });
});

describe("Izin after the session", () => {
  it("a PJ's Izin reopens that date's Bayar", async () => {
    isiSlot();
    const r = await pj({
      aksi: "status",
      kunci: KUNCI,
      nim: "2020",
      status: "izin",
      alasan: "sakit, ada surat",
    });
    expect(r.body).toEqual({ ok: true });
    expect(bayarUlang).toEqual([{ jadwalId: 1, tanggal: "2026-10-19" }]);
  });
});

describe("PJ writes only for someone on the slot", () => {
  /** 3030 is an Asisten, but not seated, not on Izin and has no row here. */
  function isiLuar() {
    isiSlot();
    data.set(asisten, [
      { nim: "1010", kode: "PJX", nama: "Pe Je" },
      { nim: "2020", kode: "AAA", nama: "Anak A" },
      { nim: "3030", kode: "ZZZ", nama: "Orang Luar" },
    ]);
  }

  it("refuses a status for someone not on the slot", async () => {
    isiLuar();
    const r = await pj({
      aksi: "status",
      kunci: KUNCI,
      nim: "3030",
      status: "telat",
      menit: 3,
      alasan: "salah catat",
    });
    expect(r.body).toEqual({ ok: false, kode: "tidak_ada" });
    expect(ditulis.filter((d) => d.tabel === hadirMengajar)).toHaveLength(0);
  });

  it("refuses an Ambil Alih answer for someone not on the slot", async () => {
    isiLuar();
    const r = await pj({ aksi: "aa", kunci: KUNCI, nim: "3030", izin: true });
    expect(r.body).toEqual({ ok: false, kode: "tidak_ada" });
    expect(ditulis).toHaveLength(0);
  });

  it("still allows someone on Izin, or someone already in a row", async () => {
    isiLuar();
    mingguIzin.push({ nim: "3030", status: "aktif" });
    const body = {
      aksi: "status",
      kunci: KUNCI,
      nim: "3030",
      status: "ikut",
      alasan: "salah catat",
    };
    expect((await pj(body)).body).toEqual({ ok: true });
    mingguIzin.length = 0;
    data.set(hadirMengajar, [{ ubah: "telat" }]);
    expect((await pj(body)).body).toEqual({ ok: true });
  });
});
