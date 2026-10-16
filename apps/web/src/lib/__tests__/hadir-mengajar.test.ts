import { describe, expect, it } from "vitest";
import {
  POTONGAN_AWAL,
  akhirSesiMaks,
  bacaPotongan,
  potonganPada,
  riwayatBaru,
  baseSlot,
  baseSusulan,
  hitungHadir,
  instanWib,
  potonganHadir,
} from "../hadir-mengajar";

const TGL = "2026-10-01";
const base = instanWib(TGL, baseSlot(TGL, 3)); // 12:25 WIB
const at = (hms: string) => new Date(`${TGL}T${hms}+07:00`);
const dasar = {
  hadir: null as Date | null,
  base,
  izin: false,
  diharapkan: true,
  selesai: false,
  now: at("12:30:00"),
};

describe("baseSlot / baseSusulan / instanWib", () => {
  it("is the slot start minus five minutes, Friday slot 3 at 13:00", () => {
    expect(baseSlot("2026-10-01", 3)).toBe(745);
    expect(baseSlot("2026-10-02", 3)).toBe(780);
    expect(baseSlot("2026-10-02", 4)).toBe(925);
    expect(baseSusulan("10:00")).toBe(595);
  });
  it("gives the WIB instant", () => {
    expect(instanWib("2026-10-01", 745).toISOString()).toBe("2026-10-01T05:25:00.000Z");
  });
});

describe("hitungHadir", () => {
  it("judges the check-in against the base", () => {
    expect(hitungHadir({ ...dasar, hadir: at("12:25:59") })).toEqual({
      status: "tepat",
      menit: null,
    });
    expect(hitungHadir({ ...dasar, hadir: at("12:26:00") })).toEqual({ status: "telat", menit: 1 });
    expect(hitungHadir({ ...dasar, hadir: at("12:35:59") })).toEqual({
      status: "telat",
      menit: 10,
    });
    expect(hitungHadir({ ...dasar, hadir: at("12:36:00") })).toEqual({ status: "mm", menit: 10 });
  });
  it("tracks a session with no check-in", () => {
    expect(hitungHadir({ ...dasar, now: at("12:25:30") }).status).toBe("belum");
    expect(hitungHadir({ ...dasar, now: at("12:31:40") })).toEqual({
      status: "berjalan",
      menit: 6,
    });
    expect(hitungHadir({ ...dasar, now: at("12:44:00") })).toEqual({ status: "lewat", menit: 10 });
    expect(hitungHadir({ ...dasar, selesai: true }).status).toBe("mangkir");
  });
  it("lets izin and not-expected come first", () => {
    expect(hitungHadir({ ...dasar, hadir: at("12:40:00"), izin: true }).status).toBe("izin");
    expect(hitungHadir({ ...dasar, hadir: at("12:40:00"), diharapkan: false }).status).toBe(
      "lepas",
    );
    expect(hitungHadir({ ...dasar, selesai: true, diharapkan: false }).status).toBe("lepas");
  });
  it("is tepat when the base moves after the check-in", () => {
    const b = instanWib(TGL, 12 * 60 + 45);
    expect(hitungHadir({ ...dasar, base: b, hadir: at("12:29:31") }).status).toBe("tepat");
  });
  it("lets a PJ override win over the clock", () => {
    const x = { ...dasar, hadir: at("12:25:10"), ubah: { status: "telat" as const, menit: 3 } };
    expect(hitungHadir(x)).toEqual({ status: "telat", menit: 3 });
    expect(hitungHadir({ ...x, ubah: { status: "mm" } })).toEqual({ status: "mm", menit: 10 });
    expect(hitungHadir({ ...x, ubah: { status: "mangkir" } })).toEqual({
      status: "mangkir",
      menit: null,
    });
  });
});

describe("potonganHadir", () => {
  const P = POTONGAN_AWAL;
  it("cuts per minute for telat", () => {
    expect(potonganHadir({ status: "telat", menit: 4 }, true, P)).toEqual({
      nolkanUnit: false,
      potong: 8000,
    });
  });
  it("zeroes units for mm and mangkir, or cuts the max when mm is not counted", () => {
    expect(potonganHadir({ status: "mm", menit: 10 }, true, P)).toEqual({
      nolkanUnit: true,
      potong: 0,
    });
    expect(potonganHadir({ status: "mm", menit: 10 }, false, P)).toEqual({
      nolkanUnit: false,
      potong: 20000,
    });
    expect(potonganHadir({ status: "mangkir", menit: null }, true, P)).toEqual({
      nolkanUnit: true,
      potong: 0,
    });
  });
  it("never cuts izin, tepat or lepas", () => {
    for (const status of ["izin", "tepat", "lepas"] as const) {
      expect(potonganHadir({ status, menit: null }, true, P)).toEqual({
        nolkanUnit: false,
        potong: 0,
      });
    }
  });
});

describe("akhirSesiMaks", () => {
  it("stops at the next slot's base or 150 minutes", () => {
    expect(akhirSesiMaks("2026-10-02", 3, instanWib("2026-10-02", 780))).toBe(145);
    expect(akhirSesiMaks("2026-10-01", 3, instanWib("2026-10-01", 745))).toBe(150);
    expect(akhirSesiMaks("2026-10-01", null, instanWib("2026-10-01", 745))).toBe(150);
    expect(akhirSesiMaks("2026-10-01", 4, instanWib("2026-10-01", 925))).toBe(150);
  });
  it("never goes below 30", () => {
    expect(akhirSesiMaks("2026-10-01", 3, instanWib("2026-10-01", 900))).toBe(30);
  });
});

describe("bacaPotongan", () => {
  it("falls back on bad values and keeps good ones", () => {
    expect(bacaPotongan({ perMenit: -1 })).toEqual(POTONGAN_AWAL);
    expect(bacaPotongan(null)).toEqual(POTONGAN_AWAL);
    expect(bacaPotongan({ perMenit: 2000, maks: 0.5 })).toEqual({ perMenit: 2000, maks: 10 });
    expect(bacaPotongan({ perMenit: 2500, maks: 15 })).toEqual({ perMenit: 2500, maks: 15 });
  });
});

describe("potongan rate history", () => {
  const nilai = {
    perMenit: 3000,
    maks: 8,
    riwayat: [
      { berlakuMulai: "2026-08-01", perMenit: 2000, maks: 10 },
      { berlakuMulai: "2026-10-05", perMenit: 3000, maks: 8 },
    ],
  };
  it("picks the entry in force on the session's date", () => {
    expect(potonganPada(nilai, "2026-10-04")).toEqual({ perMenit: 2000, maks: 10 });
    expect(potonganPada(nilai, "2026-10-05")).toEqual({ perMenit: 3000, maks: 8 });
    expect(potonganPada(nilai, "2026-07-01")).toEqual({ perMenit: 2000, maks: 10 });
    expect(potonganPada(nilai)).toEqual({ perMenit: 3000, maks: 8 });
  });
  it("reads a value saved before the history as in force from the start", () => {
    expect(potonganPada({ perMenit: 2500, maks: 6 }, "2020-01-01")).toEqual({ perMenit: 2500, maks: 6 });
    expect(potonganPada(null, "2026-10-01")).toEqual(POTONGAN_AWAL);
  });
  it("appends a change, replaces a same-day one, and allows a rate of 0", () => {
    const a = riwayatBaru({ perMenit: 2000, maks: 10 }, "2026-10-17", { perMenit: 0, maks: 10 });
    expect(a.riwayat).toHaveLength(2);
    expect(potonganPada(a, "2026-10-16")).toEqual({ perMenit: 2000, maks: 10 });
    expect(potonganPada(a, "2026-10-17")).toEqual({ perMenit: 0, maks: 10 });
    const b = riwayatBaru(a, "2026-10-17", { perMenit: 1500, maks: 5 });
    expect(b.riwayat).toHaveLength(2);
    expect(potonganPada(b, "2026-10-17")).toEqual({ perMenit: 1500, maks: 5 });
    // an older session keeps the rate it had
    expect(potonganPada(b, "2026-10-01")).toEqual({ perMenit: 2000, maks: 10 });
  });
});
