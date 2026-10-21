import { describe, expect, it } from "vitest";
import {
  akunPerluBaca,
  bacaShiftBap,
  bacaTanggalBap,
  bandingkan,
  bandingkanBap,
  barisBap,
  bacakuUntuk,
  dasarDariBaris,
  JEDA_BACA_RAMAI_MS,
  JEDA_BACA_TENANG_MS,
  jedaBaca,
  sidikStabil,
  nilaiTersimpan,
  rencanaTerima,
  tempatkan,
  uraiJurnal,
  uraiPraktikum,
  waktunyaMalam,
  type NilaiTersimpan,
} from "../seelabs-baca";
import { PROTOKOL_BACA, jenisDiambil } from "../seelabs-robot";

const dasar: NilaiTersimpan = { tp: 80, ta: 75, praktikum: 83.25, jurnal: 86.5, presensi: true };
const ubah = (x: Partial<NilaiTersimpan>): NilaiTersimpan => ({ ...dasar, ...x });

describe("nilaiTersimpan", () => {
  it("keeps TP, TA and the two means as SeeLabs does", () => {
    expect(
      nilaiTersimpan({ TP: 80, TA: 75, D1: 90, D2: 85, D3: 88, D4: 70, L1: 92, L2: 81 }),
    ).toEqual({ tp: 80, ta: 75, praktikum: 83.25, jurnal: 86.5, presensi: true });
  });
  it("reads all zeros as absent", () => {
    expect(nilaiTersimpan({}).presensi).toBe(false);
  });
});

describe("bandingkan", () => {
  const p = (seelabs: NilaiTersimpan, x: Partial<Parameters<typeof bandingkan>[0]> = {}) =>
    bandingkan({ dasar, iris: dasar, seelabs, menunggu: false, ...x });

  it("calls a mean inside SeeLabs's rounding the same", () => {
    expect(p(ubah({ praktikum: 83.2549 }))).toEqual({ tindakan: "sama" });
  });
  it("copies a changed TP or TA", () => {
    expect(p(ubah({ tp: 85 }))).toEqual({ tindakan: "salin_tp_ta", tp: 85, ta: 75 });
  });
  it("rounds a SeeLabs TP half up", () => {
    expect(p(ubah({ tp: 85.5 }))).toEqual({ tindakan: "salin_tp_ta", tp: 86, ta: 75 });
  });
  it("flags a changed mean without copying", () => {
    expect(p(ubah({ praktikum: 80 }))).toEqual({ tindakan: "beda_rerata" });
  });
  it("copies TP and TA and flags when a mean changed too", () => {
    expect(p(ubah({ tp: 85, praktikum: 80 }))).toEqual({ tindakan: "beda_rerata", tp: 85, ta: 75 });
  });
  it("flags SeeLabs reading absent", () => {
    expect(p({ tp: 80, ta: 75, praktikum: 0, jurnal: 0, presensi: false })).toEqual({
      tindakan: "beda_rerata",
    });
  });
  it("skips while an IRIS send is waiting", () => {
    expect(p(ubah({ tp: 85 }), { menunggu: true })).toEqual({ tindakan: "lewati" });
    expect(p(dasar, { menunggu: true })).toEqual({ tindakan: "sama" });
  });
  it("without a saved copy compares with IRIS and never copies", () => {
    expect(p(dasar, { dasar: null })).toEqual({ tindakan: "sama" });
    expect(p(ubah({ tp: 85 }), { dasar: null })).toEqual({ tindakan: "beda_tanpa_dasar" });
  });
});

describe("uraiPraktikum", () => {
  it("takes the Praktikum mean apart into the levels that make it, highest first", () => {
    // 90, 90, 90, 80: the only four levels that average 87.5
    expect(uraiPraktikum(87.5)).toEqual({ d: [90, 90, 90, 80], pasti: true });
  });
  it("reads 0 as four zeros", () => {
    expect(uraiPraktikum(0)).toEqual({ d: [0, 0, 0, 0], pasti: true });
  });
  it("says so when other levels make the same mean, and takes the evenest", () => {
    // 65 x4, 90 + 90 + 80 + 0 and 45 + 45 + 80 + 90 all make 260
    const r = uraiPraktikum(65)!;
    expect(r.pasti).toBe(false);
    expect(r.d).toEqual([65, 65, 65, 65]);
    expect(r.d.reduce((a, b) => a + b, 0)).toBe(260);
  });
  it("lands on rubric levels with the same mean, for every set of four levels", () => {
    const L = [0, 45, 65, 80, 90];
    for (const a of L)
      for (const b of L)
        for (const c of L)
          for (const d of L) {
            // SeeLabs shows the mean to two decimals
            const rerata = Math.round(((a + b + c + d) / 4) * 100) / 100;
            const r = uraiPraktikum(rerata)!;
            expect(r, `${a} ${b} ${c} ${d}`).not.toBeNull();
            expect(r.d.every((x) => L.includes(x))).toBe(true);
            expect(r.d.reduce((x, y) => x + y, 0)).toBe(a + b + c + d);
          }
  });
  it("has nothing for a mean no four levels make", () => {
    expect(uraiPraktikum(83.25)).toBeNull();
    expect(uraiPraktikum(12.34)).toBeNull();
  });
});

describe("uraiJurnal", () => {
  it("finds the L2 level that makes the mean with IRIS's L1", () => {
    expect(uraiJurnal(85, 80)).toBe(90);
    expect(uraiJurnal(80.55, 71.1)).toBe(90);
    expect(uraiJurnal(32.5, 0)).toBe(65);
  });
  it("has nothing without an L1 or when no level fits", () => {
    expect(uraiJurnal(80, null)).toBeNull();
    expect(uraiJurnal(86.5, 92)).toBeNull();
  });
});

describe("tempatkan", () => {
  const reguler = { sesiId: 1, kelompokNomor: 2, akun: "A", tanggal: "2026-10-20", mulai: "06:30" };
  const susulan = { sesiId: 9, kelompokNomor: 1, akun: "B", tanggal: "2026-10-23", mulai: "12:30" };
  it("prefers the session sent through the account read", () => {
    expect(tempatkan([susulan, reguler], "A")).toEqual({ sesiId: 1, kelompokNomor: 2 });
    expect(tempatkan([reguler, susulan], "B")).toEqual({ sesiId: 9, kelompokNomor: 1 });
  });
  it("else takes the latest", () => {
    expect(tempatkan([reguler, susulan], "C")).toEqual({ sesiId: 9, kelompokNomor: 1 });
  });
  it("has no place with no session", () => {
    expect(tempatkan([], "A")).toBeNull();
  });
});

describe("jedaBaca", () => {
  // WIB is UTC+7.
  const wib = (jam: string) => new Date(`2026-10-22T${jam}+07:00`);

  it("reads every minute while scores move, day or night", () => {
    expect(jedaBaca(wib("10:00:00"), true)).toBe(JEDA_BACA_RAMAI_MS);
    expect(jedaBaca(wib("02:00:00"), true)).toBe(60_000);
  });

  it("reads every 30 minutes through a quiet day", () => {
    expect(jedaBaca(wib("10:00:00"), false)).toBe(JEDA_BACA_TENANG_MS);
    expect(jedaBaca(wib("05:50:00"), false)).toBe(30 * 60_000);
    expect(jedaBaca(wib("00:14:00"), false)).toBe(30 * 60_000);
  });

  it("reads nothing in the quiet hours, 00:15 to 05:50", () => {
    expect(jedaBaca(wib("00:15:00"), false)).toBeNull();
    expect(jedaBaca(wib("03:00:00"), false)).toBeNull();
    expect(jedaBaca(wib("05:49:00"), false)).toBeNull();
  });
});

describe("waktunyaMalam", () => {
  it("is the first beat from 22:00 WIB, once a day", () => {
    expect(waktunyaMalam(new Date("2026-10-20T22:05:00+07:00"), "2026-10-19")).toBe(true);
    expect(waktunyaMalam(new Date("2026-10-20T22:05:00+07:00"), "2026-10-20")).toBe(false);
    expect(waktunyaMalam(new Date("2026-10-20T21:59:00+07:00"), "2026-10-19")).toBe(false);
    expect(waktunyaMalam(new Date("2026-10-20T23:30:00+07:00"), null)).toBe(true);
  });
});

describe("Rekap BAP cells", () => {
  it("reads the four shifts by their start", () => {
    expect(bacaShiftBap("Shift 06.30 - 09.00")).toBe(1);
    expect(bacaShiftBap("Shift 09.30 - 12.00")).toBe(2);
    expect(bacaShiftBap("Shift 12.30 - 15.00")).toBe(3);
    expect(bacaShiftBap("Shift 15.30 - 18.00")).toBe(4);
    expect(bacaShiftBap("Shift 3")).toBe(3);
    expect(bacaShiftBap("Pagi")).toBeNull();
  });
  it("reads Indonesian dates with or without the day", () => {
    expect(bacaTanggalBap("20 Oktober 2026")).toBe("2026-10-20");
    expect(bacaTanggalBap("Jumat, 23 Oktober 2026")).toBe("2026-10-23");
    expect(bacaTanggalBap("2026-10-23")).toBe("2026-10-23");
    expect(bacaTanggalBap("kemarin")).toBeNull();
  });
});

describe("bandingkanBap", () => {
  it("lists the day and shift only one side has, two units in one shift as one", () => {
    const iris = [
      { tanggal: "2026-10-20", shift: 1, penilai: "A" },
      { tanggal: "2026-10-20", shift: 1, penilai: "B" },
      { tanggal: "2026-10-21", shift: 2, penilai: "A" },
    ];
    const bap = [
      { tanggal: "2026-10-20", shift: 1 },
      { tanggal: "2026-10-22", shift: 3 },
    ];
    expect(bandingkanBap(iris, bap)).toEqual([
      { tanggal: "2026-10-21", shift: 2, jenis: "hanya_iris", penilai: ["A"] },
      { tanggal: "2026-10-22", shift: 3, jenis: "hanya_seelabs", penilai: [] },
    ]);
  });
});

describe("akunPerluBaca", () => {
  const sekarang = new Date("2026-10-20T07:00:00+07:00");
  const akun = [
    { nim: "A", status: "aktif" },
    { nim: "B", status: "aktif" },
    { nim: "C", status: "ditolak" },
    { nim: "D", status: "menunggu_uji" },
    { nim: "E", status: "aktif" },
  ];
  it("takes connected accounts never read or read longer ago than the gap", () => {
    const terakhir = {
      A: "2026-10-20T06:50:00+07:00", // 10 min ago
      B: "2026-10-20T06:58:00+07:00", // 2 min ago
      C: "2026-10-20T05:00:00+07:00",
    };
    expect(akunPerluBaca({ akun, terakhir, jedaMs: 300_000, sekarang })).toEqual(["A", "E"]);
  });
  it("skips an account whose last read is still waiting or running", () => {
    expect(
      akunPerluBaca({ akun, terakhir: {}, jedaMs: 60_000, sekarang, sibuk: new Set(["A"]) }),
    ).toEqual(["B", "E"]);
  });
});

describe("sidikStabil", () => {
  it("is the same for the same rows whatever their order or key order", () => {
    const a = [
      { k: "1|2", status: "sama", seelabs: { tp: 80, ta: 70 } },
      { k: "1|3", status: "beda", seelabs: null },
    ];
    const b = [
      { seelabs: null, status: "beda", k: "1|3" },
      { status: "sama", k: "1|2", seelabs: { ta: 70, tp: 80 } },
    ];
    expect(sidikStabil(a)).toBe(sidikStabil(b));
  });
  it("differs when a value moved", () => {
    expect(sidikStabil([{ k: "1|2", status: "sama" }])).not.toBe(
      sidikStabil([{ k: "1|2", status: "beda" }]),
    );
  });
});

describe("jenisDiambil", () => {
  it("never hands a baca job to an agent below protocol 8", () => {
    expect(jenisDiambil(7)).not.toContain("baca");
    expect(jenisDiambil(7)).toContain("nilai");
    expect(jenisDiambil(8)).toContain("baca");
    expect(PROTOKOL_BACA).toBe(8);
  });
});

describe("rencanaTerima", () => {
  const S = { TP: 80, TA: 75, D1: 90, D2: 85, D3: 88, D4: 70, L1: 92, L2: 81 };
  const baris = (nim: string, x: Partial<NilaiTersimpan> = {}) => ({ nim, ...dasar, ...x });
  const calon = (sesiId: number, nomor = 1, akun: string | null = "AK", tanggal = "2026-10-20") => [
    { sesiId, kelompokNomor: nomor, akun, tanggal, mulai: "06:30" },
  ];
  const dasar1 = { N1: dasar, N2: dasar };
  const p = (x: Partial<Parameters<typeof rencanaTerima>[0]> = {}) =>
    rencanaTerima({
      akunBaca: "AK",
      bacaan: [{ praktikum: 237, klp: 4, modul: 2, baris: [baris("N1"), baris("N2")] }],
      calon: { "N1|2": calon(11), "N2|2": calon(11) },
      keadaan: {
        "11|1": { dasar: dasar1, iris: { N1: S, N2: S }, terkirim: true, menunggu: false },
      },
      klpSemester: new Set(["237|4"]),
      tersimpan: [{ sesiId: 11, kelompokNomor: 1, praktikum: 237, modul: 2, klp: [4] }],
      ...x,
    });

  it("calls an unchanged group sama and writes nothing", () => {
    const r = p();
    expect(r.salin).toEqual([]);
    expect(r.kelompok).toEqual([
      expect.objectContaining({ sesiId: 11, kelompokNomor: 1, status: "sama", dasarBaru: false }),
    ]);
  });

  it("copies a TP changed in SeeLabs and moves the baseline", () => {
    const r = p({
      bacaan: [{ praktikum: 237, klp: 4, modul: 2, baris: [baris("N1", { tp: 85 }), baris("N2")] }],
    });
    expect(r.salin).toEqual([
      { sesiId: 11, nim: "N1", komponen: "TP", skor: 85, sebelum: 80, mentah: 85 },
    ]);
    expect(r.kelompok[0]).toMatchObject({ status: "sama", dasarBaru: true });
    expect(r.kelompok[0].seelabs.N1.tp).toBe(85);
  });

  it("leaves a group alone while its IRIS send waits", () => {
    const r = p({
      bacaan: [{ praktikum: 237, klp: 4, modul: 2, baris: [baris("N1", { tp: 85 }), baris("N2")] }],
      keadaan: {
        "11|1": { dasar: dasar1, iris: { N1: S, N2: S }, terkirim: true, menunggu: true },
      },
    });
    expect(r.salin).toEqual([]);
    expect(r.kelompok).toEqual([]);
  });

  it("lets IRIS win when both sides changed the same score", () => {
    const r = p({
      bacaan: [{ praktikum: 237, klp: 4, modul: 2, baris: [baris("N1", { tp: 85 }), baris("N2")] }],
      keadaan: {
        "11|1": {
          dasar: dasar1,
          iris: { N1: { ...S, TP: 82 }, N2: S },
          terkirim: true,
          menunggu: false,
        },
      },
    });
    expect(r.salin).toEqual([]);
    expect(r.kelompok[0]).toMatchObject({ status: "beda", dasarBaru: false });
  });

  it("lets IRIS win when SeeLabs moved TP and IRIS moved D since the save", () => {
    const r = p({
      bacaan: [{ praktikum: 237, klp: 4, modul: 2, baris: [baris("N1", { tp: 85 }), baris("N2")] }],
      keadaan: {
        "11|1": {
          dasar: dasar1,
          iris: { N1: { ...S, D1: 50 }, N2: S },
          terkirim: true,
          menunggu: false,
        },
      },
    });
    expect(r.salin).toEqual([]);
    expect(r.kelompok[0]).toMatchObject({ status: "beda", dasarBaru: false });
  });

  it("keeps the baseline while another Praktikan's IRIS edit is unsent", () => {
    const r = p({
      bacaan: [{ praktikum: 237, klp: 4, modul: 2, baris: [baris("N1", { tp: 85 }), baris("N2")] }],
      keadaan: {
        "11|1": {
          dasar: dasar1,
          iris: { N1: S, N2: { ...S, L2: 40 } },
          terkirim: true,
          menunggu: false,
        },
      },
    });
    expect(r.salin).toEqual([expect.objectContaining({ nim: "N1", komponen: "TP", skor: 85 })]);
    expect(r.kelompok[0]).toMatchObject({ status: "sama", dasarBaru: false });
  });

  it("flags a changed mean and keeps SeeLabs's value to show", () => {
    const r = p({
      bacaan: [
        { praktikum: 237, klp: 4, modul: 2, baris: [baris("N1", { praktikum: 80 }), baris("N2")] },
      ],
    });
    expect(r.salin).toEqual([]);
    expect(r.kelompok[0]).toMatchObject({ status: "beda", dasarBaru: false });
    expect(r.kelompok[0].seelabs.N1.praktikum).toBe(80);
  });

  it("without a baseline only flags, and stores one once both agree", () => {
    const tanpa = {
      "11|1": { dasar: null, iris: { N1: S, N2: S }, terkirim: true, menunggu: false },
    };
    const beda = p({
      keadaan: tanpa,
      bacaan: [{ praktikum: 237, klp: 4, modul: 2, baris: [baris("N1", { tp: 85 }), baris("N2")] }],
    });
    expect(beda.salin).toEqual([]);
    expect(beda.kelompok[0]).toMatchObject({ status: "beda", dasarBaru: false });
    expect(p({ keadaan: tanpa }).kelompok[0]).toMatchObject({ status: "sama", dasarBaru: true });
  });

  it("copies TP and TA into an IRIS group scored only in SeeLabs", () => {
    const r = p({
      keadaan: {
        "11|1": { dasar: null, iris: { N1: {}, N2: { TP: 70 } }, terkirim: false, menunggu: false },
      },
      tersimpan: [],
    });
    expect(r.salin).toEqual([
      { sesiId: 11, nim: "N1", komponen: "TP", skor: 80, sebelum: null, mentah: 80 },
      { sesiId: 11, nim: "N1", komponen: "TA", skor: 75, sebelum: null, mentah: 75 },
      { sesiId: 11, nim: "N2", komponen: "TA", skor: 75, sebelum: null, mentah: 75 },
    ]);
    expect(r.kelompok[0]).toMatchObject({ status: "hanya_seelabs", dasarBaru: false });
  });

  it("works D1..D4 and L2 out of the means for a group scored only in SeeLabs", () => {
    const sl = { praktikum: 87.5, jurnal: 85 };
    const r = p({
      bacaan: [{ praktikum: 237, klp: 4, modul: 2, baris: [baris("N1", sl)] }],
      keadaan: {
        "11|1": {
          dasar: null,
          iris: { N1: { TP: 80, TA: 75, L1: 80 } },
          terkirim: false,
          menunggu: false,
        },
      },
      tersimpan: [],
    });
    const d = r.salin.filter((c) => c.komponen !== "TP" && c.komponen !== "TA");
    expect(d.map((c) => [c.komponen, c.skor])).toEqual([
      ["D1", 90],
      ["D2", 90],
      ["D3", 90],
      ["D4", 80],
      ["L2", 90],
    ]);
    expect(d.every((c) => c.perkiraan === true && c.sebelum === null)).toBe(true);
    expect(r.kelompok[0]).toMatchObject({ status: "hanya_seelabs", dasarBaru: false });
  });

  it("leaves D and L alone when the Asisten already typed them, or SeeLabs reads absent", () => {
    const sl = { praktikum: 87.5, jurnal: 85 };
    const dengan = (iris: Record<string, number>, x: Partial<NilaiTersimpan> = {}) =>
      p({
        bacaan: [{ praktikum: 237, klp: 4, modul: 2, baris: [baris("N1", { ...sl, ...x })] }],
        keadaan: { "11|1": { dasar: null, iris: { N1: iris }, terkirim: false, menunggu: false } },
        tersimpan: [],
      }).salin.filter((c) => /^[DL]/.test(c.komponen));
    expect(dengan({ TP: 80, TA: 75, D2: 65, L1: 80, L2: 80 })).toEqual([]);
    expect(dengan({ L1: 80 }, { presensi: false })).toEqual([]);
    // TP and TA only: D and L were never filled in SeeLabs, a mean of 0 is not four zeros
    expect(dengan({ L1: 80 }, { praktikum: 0, jurnal: 0 })).toEqual([]);
    // L2 needs IRIS's L1; the D levels do not
    expect(dengan({}).map((c) => c.komponen)).toEqual(["D1", "D2", "D3", "D4"]);
  });

  it("places a Praktikan in the susulan sent through the account read", () => {
    const r = p({
      calon: {
        "N1|2": [...calon(11, 1, "AK"), ...calon(30, 2, "LAIN", "2026-10-23")],
        "N2|2": calon(11),
      },
      keadaan: {
        "11|1": { dasar: dasar1, iris: { N1: S, N2: S }, terkirim: true, menunggu: false },
        "30|2": { dasar: dasar1, iris: { N1: S }, terkirim: true, menunggu: false },
      },
    });
    expect(r.kelompok.map((k) => `${k.sesiId}|${k.kelompokNomor}`)).toEqual(["11|1"]);
  });

  it("lists a Praktikan with no IRIS session, and ignores a KLP outside the semester", () => {
    const r = p({
      bacaan: [
        { praktikum: 237, klp: 4, modul: 2, baris: [baris("N1"), baris("N2"), baris("N9")] },
        { praktikum: 237, klp: 50, modul: 2, baris: [baris("X1")] },
      ],
    });
    expect(r.lepas).toEqual([{ praktikum: 237, klp: 4, modul: 2, nim: "N9", nilai: { ...dasar } }]);
  });

  it("marks a verified save gone from SeeLabs as hilang", () => {
    const r = p({
      bacaan: [],
      keadaan: {
        "11|1": { dasar: dasar1, iris: { N1: S, N2: S }, terkirim: true, menunggu: false },
      },
    });
    expect(r.kelompok).toEqual([
      expect.objectContaining({ sesiId: 11, kelompokNomor: 1, status: "hilang" }),
    ]);
  });
});

describe("dasarDariBaris", () => {
  it("keeps what a save put in SeeLabs, per NIM", () => {
    expect(
      dasarDariBaris([
        { nim: "N1", tp: 80, ta: 75, d1: 90, d2: 85, d3: 88, d4: 70, l1: 92, l2: 81 },
        { nim: "N2", tp: 0, ta: 0, d1: 0, d2: 0, d3: 0, d4: 0, l1: 0, l2: 0 },
      ]),
    ).toEqual({
      N1: { tp: 80, ta: 75, praktikum: 83.25, jurnal: 86.5, presensi: true },
      N2: { tp: 0, ta: 0, praktikum: 0, jurnal: 0, presensi: false },
    });
  });
});

describe("barisBap", () => {
  it("reads each row's day and shift, per praktikum, and skips what it can't read", () => {
    expect(
      barisBap(
        [
          {
            praktikum: 237,
            hari: "Selasa",
            shift: "Shift 06.30 - 09.00",
            tanggal: "20 Oktober 2026",
          },
          {
            praktikum: 238,
            hari: "Rabu",
            shift: "Shift 09.30 - 12.00",
            tanggal: "21 Oktober 2026",
          },
          { praktikum: 237, hari: "?", shift: "Pagi", tanggal: "20 Oktober 2026" },
        ],
        237,
      ),
    ).toEqual({ baris: [{ tanggal: "2026-10-20", shift: 1 }], takTerbaca: 1 });
  });
});

describe("bacakuUntuk", () => {
  const grup = [
    { sesiId: 1, kelompokNomor: 1, status: "beda" as const, akunNim: "L", penilai: "S" },
    { sesiId: 1, kelompokNomor: 2, status: "sama" as const, akunNim: "S", penilai: "S" },
    { sesiId: 2, kelompokNomor: 1, status: "hilang" as const, akunNim: "S", penilai: "X" },
  ];
  it("gives a flag to the group's scorer, not to the lender read", () => {
    expect(bacakuUntuk(grup, "S").map((g) => `${g.sesiId}|${g.kelompokNomor}`)).toEqual(["1|1"]);
    expect(bacakuUntuk(grup, "L")).toEqual([]);
    expect(bacakuUntuk(grup, "X").map((g) => g.status)).toEqual(["hilang"]);
  });
});
