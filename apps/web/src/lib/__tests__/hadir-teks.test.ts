import { describe, expect, it } from "vitest";
import {
  daftarNomor,
  nilaiUntukTeks,
  ringkasHadir,
  teksLaporanHadir,
  type TeksHadirMasukan,
} from "../hadir-mengajar";

/** The mockup's sample session: Thursday 1 October 2026, Session 3. */
const contoh = (lang: "id" | "en" | "zh"): TeksHadirMasukan => ({
  lang,
  tanggal: {
    id: "Kamis, 1 Oktober 2026",
    en: "Thursday 1 October 2026",
    zh: "2026年10月1日星期四",
  }[lang],
  sesi: { id: "Sesi 3", en: "Session 3", zh: "第 3 节课" }[lang],
  modul: { id: "Modul 3", en: "Module 3", zh: "模块 3" }[lang],
  kelas: { id: "Reguler", en: "Regular", zh: "普通班" }[lang],
  mulaiOtomatis: "12:25",
  geser: null,
  orang: [
    { kode: "YEN", status: "tepat", menit: null, jam: "12:14", potong: 0 },
    { kode: "ADD", status: "telat", menit: 4, jam: "12:29", potong: 8000 },
    {
      kode: "REG",
      status: "mangkir",
      menit: null,
      jam: null,
      potong: 0,
      ambilAlih: [{ kode: "NUE", nomor: 3, jam: "12:40" }],
    },
    { kode: "NUE", status: "tepat", menit: null, jam: "12:09", potong: 0 },
    { kode: "MAP", status: "izin", menit: null, jam: null, potong: 0 },
  ],
  nilai: [
    { nomor: 1, lupa: false, menyusul: null },
    { nomor: 2, lupa: false, menyusul: null },
    { nomor: 3, lupa: false, menyusul: null },
    {
      nomor: 4,
      lupa: true,
      menyusul: { id: "Jumat 08:12", en: "Friday 08:12", zh: "周五 08:12" }[lang],
    },
    {
      nomor: 5,
      lupa: true,
      menyusul: { id: "Jumat 08:12", en: "Friday 08:12", zh: "周五 08:12" }[lang],
    },
  ],
});

describe("teksLaporanHadir", () => {
  it("writes the sample session as one report sentence in Indonesian", () => {
    expect(teksLaporanHadir(contoh("id"))).toBe(
      "Kehadiran Asisten, Kamis, 1 Oktober 2026, Sesi 3 (Modul 3, Reguler). " +
        "Dimulai otomatis oleh IRIS 12:25. Jam tidak digeser. " +
        "YEN tepat waktu 12:14. ADD telat 4 menit 12:29, potong Rp8.000. " +
        "REG Mangkir, kelompok 3 diambil alih NUE 12:40. NUE tepat waktu 12:09. MAP Izin. " +
        "Input Nilai: Kelompok 1 sampai 3 selesai hari itu; " +
        "Kelompok 4 dan 5 Lupa Input Nilai, diinput menyusul Jumat 08:12 dengan Token Khusus.",
    );
  });

  it("writes it in English and Mandarin too", () => {
    expect(teksLaporanHadir(contoh("en"))).toBe(
      "Asisten attendance, Thursday 1 October 2026, Session 3 (Module 3, Regular). " +
        "Started by IRIS at 12:25. Clock not moved. " +
        "YEN on time 12:14. ADD 4 minutes late 12:29, Rp8.000 off. " +
        "REG Mangkir, NUE took over group 3 at 12:40. NUE on time 12:09. MAP excused. " +
        "Scores: groups 1 to 3 done that day; " +
        "groups 4 and 5 Lupa Input Nilai, put in late Friday 08:12 with a Token Khusus.",
    );
    const zh = teksLaporanHadir(contoh("zh"));
    expect(zh).toContain("YEN 准时 12:14");
    expect(zh).toContain("ADD 迟到 4 分钟 12:29，扣 Rp8.000");
    expect(zh).toContain("REG Mangkir，NUE 12:40 接手了第 3 组");
    expect(zh).toContain("Lupa Input Nilai");
    expect(zh).toContain("周五 08:12 用 Token Khusus 补录");
  });

  it("contains no em or en dash in any language", () => {
    for (const l of ["id", "en", "zh"] as const) {
      expect(teksLaporanHadir(contoh(l))).not.toMatch(/[—–]/);
    }
  });

  it("says when the clock moved, when a Mangkir Mengajar counts, and who changed a status", () => {
    const m = contoh("id");
    m.mulaiOtomatis = null;
    m.geser = { dari: "12:25", ke: "12:40", alasan: "listrik padam" };
    m.orang = [
      { kode: "REG", status: "mm", menit: 10, jam: "12:41", potong: 0, hitungMangkir: true },
      { kode: "ADD", status: "mm", menit: 10, jam: "12:45", potong: 20000, hitungMangkir: false },
      {
        kode: "YEN",
        status: "telat",
        menit: 2,
        jam: "12:27",
        potong: 4000,
        ubah: { oleh: "NUE", alasan: "macet" },
      },
    ];
    m.nilai = null;
    const t = teksLaporanHadir(m);
    expect(t).toContain("Jam digeser dari 12:25 ke 12:40 (listrik padam).");
    expect(t).not.toContain("Dimulai otomatis");
    expect(t).toContain("REG Mangkir Mengajar 12:41, dihitung Mangkir.");
    expect(t).toContain("ADD Mangkir Mengajar 12:45, potong Rp20.000.");
    expect(t).toContain("Diubah PJ NUE: macet.");
    expect(t).not.toContain("Input Nilai");
  });

  it("names a group still open after the deadline", () => {
    const m = contoh("id");
    m.nilai = [
      { nomor: 1, lupa: false, menyusul: null },
      { nomor: 2, lupa: true, menyusul: null },
    ];
    expect(teksLaporanHadir(m)).toContain(
      "Input Nilai: Kelompok 1 selesai hari itu; Kelompok 2 Lupa Input Nilai, belum diinput.",
    );
  });
});

describe("daftarNomor", () => {
  it("joins numbers, folding a run of three or more into a range", () => {
    expect(daftarNomor([1, 2, 3], "id")).toBe("1 sampai 3");
    expect(daftarNomor([4, 5], "id")).toBe("4 dan 5");
    expect(daftarNomor([2], "id")).toBe("2");
    expect(daftarNomor([1, 3, 5], "en")).toBe("1, 3 and 5");
    expect(daftarNomor([1, 2, 3, 5], "id")).toBe("1 sampai 3 dan 5");
    expect(daftarNomor([1, 2, 3], "en")).toBe("1 to 3");
  });
});

describe("ringkasHadir", () => {
  it("counts each status per person and sums the cuts", () => {
    const r = ringkasHadir([
      { nim: "A", status: "tepat", potong: 0, nolkanUnit: false },
      { nim: "A", status: "telat", potong: 4000, nolkanUnit: false },
      { nim: "A", status: "mm", potong: 0, nolkanUnit: true },
      { nim: "A", status: "mangkir", potong: 0, nolkanUnit: true },
      { nim: "A", status: "izin", potong: 0, nolkanUnit: false },
      { nim: "B", status: "tepat", potong: 0, nolkanUnit: false },
      { nim: "B", status: "lepas", potong: 0, nolkanUnit: false },
    ]);
    expect(r.get("A")).toEqual({
      tepat: 1,
      telat: 1,
      mm: 1,
      mangkir: 1,
      izin: 1,
      potong: 4000,
      sesiNol: 2,
    });
    expect(r.get("B")).toEqual({
      tepat: 1,
      telat: 0,
      mm: 0,
      mangkir: 0,
      izin: 0,
      potong: 0,
      sesiNol: 0,
    });
  });

  it("leaves a still-open group out of the score sentence", () => {
    const n = nilaiUntukTeks(
      [
        { nomor: 1, status: "tepat", menyusulPada: null },
        { nomor: 2, status: "terbuka", menyusulPada: null },
        { nomor: 3, status: "menyusul", menyusulPada: "2026-10-23T01:00:00Z" },
      ],
      () => "08:00",
    );
    expect(n).toEqual([
      { nomor: 1, lupa: false, menyusul: null },
      { nomor: 3, lupa: true, menyusul: "08:00" },
    ]);
  });
});
