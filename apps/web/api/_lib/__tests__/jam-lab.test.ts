/**
 * Phase 18 Task 4: which slots the lab clock starts by itself, and that two
 * triggers in the same minute start a slot once. slotPerluMulai is pure;
 * mulaiOtomatis runs the real start core over a fake database whose second
 * session insert fails the way Postgres does on `sesi_slot_unik`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------ fake rows */

const data = new Map<unknown, unknown[]>();
const audit: { aktor: string; aksi: string; detail: unknown }[] = [];
const kejadian: { sesiId: number; jenis: string; detail: unknown; aktor: string }[] = [];
let sisipan = 0;
const modulHariIni: { v: number | null } = { v: 3 };

function chain(tabel?: unknown): unknown {
  const st = { tabel };
  const p: Record<string, unknown> = {};
  for (const m of ["select", "where", "orderBy", "limit", "set", "onConflictDoNothing"])
    p[m] = () => p;
  p.from = (t: unknown) => {
    st.tabel = t;
    return p;
  };
  p.returning = () => p;
  p.then = (ok: (v: unknown) => unknown) => ok(data.get(st.tabel) ?? []);
  return p;
}

/** The start's transaction: the first insert makes session 41, the next one
 *  meets the unique index (Review Focus 1). */
function tx() {
  return {
    update: () => {
      const p = chain();
      (p as Record<string, unknown>).then = (ok: (v: unknown) => unknown) => ok([]);
      return p;
    },
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          sisipan += 1;
          if (sisipan > 1) {
            throw Object.assign(new Error("duplicate"), {
              cause: { code: "23505", constraint: "sesi_slot_unik" },
            });
          }
          return [{ id: 41, jenis: "reguler", ...v }];
        },
      }),
    }),
  };
}

const db = {
  select: () => chain(),
  insert: () => chain(),
  update: () => chain(),
  transaction: async (fn: (t: unknown) => unknown) => fn(tx()),
};

vi.mock("../../../src/lib/db", () => ({ getDb: () => db }));
vi.mock("../../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async (aktor: string, aksi: string, detail: unknown) => {
    audit.push({ aktor, aksi, detail });
  },
}));
vi.mock("../berjalan", () => ({
  ALASAN_MIN: 5,
  catatKejadian: async (sesiId: number, jenis: string, detail: unknown, aktor: string) => {
    kejadian.push({ sesiId, jenis, detail, aktor });
  },
}));
vi.mock("../siap-mulai", () => ({
  cekSiapMulai: async () => ({
    cek: [{ id: "pc", status: "gagal", keras: false }],
    serverId: 13,
  }),
}));
vi.mock("../phase8", () => ({
  jadwalUntuk: async () => ({ id: 7, slot: 3, jumlahKelompok: 5, jendelaMulaiMenit: 15 }),
  siapkanSesiDariJadwal: async () => ({ kelas: "reguler", ditugaskan: 0 }),
}));
vi.mock("../penugasan-api", () => ({
  muatMinggu: async () => new Map([[7, { status: "aktif", kursi: [], tugas: [], izin: [] }]]),
  diSlotMinggu: () => true,
  muatPengaturanJendela: async () => ({ default: 15, min: 5, max: 30 }),
}));
vi.mock("../roster", () => ({ salinRosterKeSesi: async () => ({ disalin: 25 }) }));
vi.mock("../tp", () => ({ isiTpSesi: async () => {} }));
vi.mock("../perburuan-sesi", () => ({ tutupPerburuan: async () => {} }));
vi.mock("../siaran", () => ({ siarkan: async () => {} }));
const urutan: string[] = [];
vi.mock("../../../src/lib/sesi", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  currentSesi: async () => {
    urutan.push("currentSesi");
    return null;
  },
}));
vi.mock("../hadir-mengajar", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  modulHari: async () => modulHariIni.v,
  muatKonteks: async () => ({ diharapkan: new Set(["2020"]), izin: new Set() }),
  pastikanBaris: async () => {},
}));

const { jadwal } = await import("../../../src/lib/schema");
const { slotPerluMulai, susulanPerluMulai, batasTidurJamLab, mulaiOtomatis, jamLab } =
  await import("../jam-lab");
const { kunciSlot } = await import("../hadir-mengajar");

/* ------------------------------------------------------- slotPerluMulai */

// Thursday 15 October 2026 and Friday 16 October 2026, WIB.
const KAMIS = "2026-10-15";
const JUMAT = "2026-10-16";
const pada = (tanggal: string, jam: string) => new Date(`${tanggal}T${jam}+07:00`);
const slot3 = { jadwalId: 7, slot: 3, status: "aktif", libur: false };

function perlu(
  now: Date,
  tanggal = KAMIS,
  o: {
    slots?: { jadwalId: number; slot: number; status: string; libur: boolean }[];
    sesiHariIni?: { slot: number | null; status: string }[];
    geser?: Map<string, number>;
  } = {},
) {
  return slotPerluMulai({
    now,
    tanggal,
    slots: o.slots ?? [slot3],
    sesiHariIni: o.sesiHariIni ?? [],
    geser: o.geser ?? new Map(),
  });
}

describe("which slot the lab clock starts", () => {
  it("starts slot 3 from 12:25:00, not a moment before", () => {
    expect(perlu(pada(KAMIS, "12:25:10"))).toEqual([{ jadwalId: 7, slot: 3 }]);
    expect(perlu(pada(KAMIS, "12:24:50"))).toEqual([]);
  });

  it("leaves a slot that already has a session that date, running, ended or cancelled", () => {
    for (const status of ["berjalan", "selesai", "batal"]) {
      expect(perlu(pada(KAMIS, "12:25:10"), KAMIS, { sesiHariIni: [{ slot: 3, status }] })).toEqual(
        [],
      );
    }
    // Another slot's session (or a Susulan, no slot) does not count.
    expect(
      perlu(pada(KAMIS, "12:25:10"), KAMIS, {
        sesiHariIni: [
          { slot: 2, status: "selesai" },
          { slot: null, status: "berjalan" },
        ],
      }),
    ).toEqual([{ jadwalId: 7, slot: 3 }]);
  });

  it("never starts a holiday or a No Practicum slot", () => {
    const now = pada(KAMIS, "12:26:00");
    expect(perlu(now, KAMIS, { slots: [{ ...slot3, libur: true }] })).toEqual([]);
    expect(perlu(now, KAMIS, { slots: [{ ...slot3, status: "kosong" }] })).toEqual([]);
  });

  it("follows a PJ's shifted clock", () => {
    const geser = new Map([[kunciSlot(7, KAMIS), 12 * 60 + 45]]);
    expect(perlu(pada(KAMIS, "12:30:00"), KAMIS, { geser })).toEqual([]);
    expect(perlu(pada(KAMIS, "12:45:00"), KAMIS, { geser })).toEqual([{ jadwalId: 7, slot: 3 }]);
  });

  it("still starts on a late trigger until the start window closes", () => {
    expect(perlu(pada(KAMIS, "12:40:00"))).toEqual([{ jadwalId: 7, slot: 3 }]);
    expect(perlu(pada(KAMIS, "14:59:00"))).toEqual([{ jadwalId: 7, slot: 3 }]);
    expect(perlu(pada(KAMIS, "15:00:00"))).toEqual([]);
  });

  it("starts Friday's slot 3 at 13:00, after Sholat Jum'at", () => {
    expect(perlu(pada(JUMAT, "12:25:00"), JUMAT)).toEqual([]);
    expect(perlu(pada(JUMAT, "13:00:00"), JUMAT)).toEqual([{ jadwalId: 7, slot: 3 }]);
  });
});

describe("a Susulan draft", () => {
  const draf = [{ id: 9, tanggal: KAMIS, mulai: "13:00", status: "terjadwal", jenis: "susulan" }];
  it("starts five minutes before its own start, a shift moving it", () => {
    const geser = new Map<string, number>();
    const at = (jam: string, g = geser) =>
      susulanPerluMulai({ now: pada(KAMIS, jam), tanggal: KAMIS, draf, geser: g });
    expect(at("12:54:59")).toEqual([]);
    expect(at("12:55:00")).toEqual([9]);
    expect(at("12:58:00", new Map([["s:9", 13 * 60 + 10]]))).toEqual([]);
    // Started already, or on another day: left alone.
    expect(
      susulanPerluMulai({
        now: pada(KAMIS, "12:56:00"),
        tanggal: KAMIS,
        draf: [
          { ...draf[0], status: "berjalan" },
          { ...draf[0], id: 10, tanggal: JUMAT },
        ],
        geser,
      }),
    ).toEqual([]);
  });
});

describe("the relay's sleep", () => {
  it("is a minute at most from 05:50 to 00:15 WIB", () => {
    expect(batasTidurJamLab(6 * 3600, pada(KAMIS, "05:50:00"))).toBe(60);
    expect(batasTidurJamLab(6 * 3600, pada(KAMIS, "19:00:00"))).toBe(60);
    expect(batasTidurJamLab(6 * 3600, pada(KAMIS, "00:14:30"))).toBe(60);
  });
  it("in the quiet hours never sleeps past 05:50", () => {
    expect(batasTidurJamLab(6 * 3600, pada(KAMIS, "00:15:00"))).toBe(5 * 3600 + 35 * 60);
    expect(batasTidurJamLab(600, pada(KAMIS, "03:00:00"))).toBe(600);
    expect(batasTidurJamLab(6 * 3600, pada(KAMIS, "05:49:30"))).toBe(60);
  });
});

/* -------------------------------------------------------- mulaiOtomatis */

describe("the lab clock's start", () => {
  beforeEach(() => {
    data.clear();
    audit.length = 0;
    kejadian.length = 0;
    sisipan = 0;
    modulHariIni.v = 3;
    data.set(jadwal, [
      {
        id: 7,
        semester: "2026-ganjil",
        hari: 4,
        slot: 3,
        status: "aktif",
        liburTanggal: null,
        jumlahKelompok: 5,
        jendelaMulaiMenit: 15,
        asisten: ["AAA"],
        pengganti: [],
      },
    ]);
  });

  it("starts a slot once when two triggers meet; the second starts nothing", async () => {
    const now = pada(KAMIS, "12:25:05");
    const a = await mulaiOtomatis(db as never, now);
    expect(a).toEqual({ mulai: [41], tolak: [] });
    const b = await mulaiOtomatis(db as never, now);
    expect(b).toEqual({ mulai: [], tolak: [] });

    // The start is IRIS's own, past the soft lab check, logged as such.
    expect(kejadian).toHaveLength(1);
    expect(kejadian[0]).toMatchObject({
      sesiId: 41,
      jenis: "mulai",
      aktor: "otomatis",
      detail: { otomatis: true, dipaksa: { alasan: "Dimulai otomatis", gagal: ["pc"] } },
    });
    expect(audit.filter((x) => x.aksi === "sesi_mulai")).toHaveLength(1);
    expect(audit.some((x) => x.aksi === "sesi_otomatis_tolak")).toBe(false);
  });

  it("refuses a date with no module known and writes it down for the banner", async () => {
    modulHariIni.v = null;
    const r = await mulaiOtomatis(db as never, pada(KAMIS, "12:25:05"));
    expect(r).toEqual({ mulai: [], tolak: [{ jadwalId: 7, kode: "modul_tidak_diketahui" }] });
    expect(sisipan).toBe(0);
    expect(audit).toEqual([
      {
        aktor: "otomatis",
        aksi: "sesi_otomatis_tolak",
        detail: {
          jadwalId: 7,
          tanggal: KAMIS,
          kode: "modul_tidak_diketahui",
          kunci: kunciSlot(7, KAMIS),
        },
      },
    ]);
  });
});

describe("the lab clock's minute", () => {
  it("ends a session past its cap first, through currentSesi", async () => {
    urutan.length = 0;
    data.clear();
    // 03:00 WIB: nothing is due to start, the minute still checks the cap.
    await jamLab(db as never, new Date("2026-10-22T03:00:00+07:00"));
    expect(urutan).toEqual(["currentSesi"]);
  });
});
