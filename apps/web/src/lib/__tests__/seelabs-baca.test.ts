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
  JEDA_BACA_MS,
  sidikStabil,
  nilaiTersimpan,
  rencanaTerima,
  tempatkan,
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

describe("JEDA_BACA_MS", () => {
  it("reads every connected account every minute, around the clock", () => {
    expect(JEDA_BACA_MS).toBe(60_000);
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
