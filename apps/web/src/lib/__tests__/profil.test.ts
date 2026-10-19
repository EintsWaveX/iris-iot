import { describe, expect, it } from "vitest";
import {
  DIVISI,
  INFO_DIVISI,
  bacaTeks,
  bacaTeksOpsional,
  bahasaKosong,
  sampulAcara,
  tahunValid,
  tanggalValid,
  teksDi,
  urutOrang,
  urutTahun,
} from "../profil";

describe("a Lab Profile text", () => {
  it("needs all three languages", () => {
    expect(bacaTeks({ id: " Halo ", en: "Hi", zh: "你好" }, 10)).toEqual({
      ok: true,
      teks: { id: "Halo", en: "Hi", zh: "你好" },
    });
    expect(bacaTeks({ id: "Halo", en: " ", zh: "" }, 10)).toEqual({
      ok: false,
      kode: "kurang",
      kurang: ["en", "zh"],
    });
    expect(bacaTeks(null, 10)).toMatchObject({ ok: false, kurang: ["id", "en", "zh"] });
  });

  it("refuses one past its limit", () => {
    expect(bacaTeks({ id: "x".repeat(11), en: "a", zh: "b" }, 10)).toEqual({
      ok: false,
      kode: "terlalu_panjang",
      bahasa: "id",
    });
  });

  it("may be left out entirely when optional, but not half filled", () => {
    expect(bacaTeksOpsional({ id: "", en: " ", zh: "" }, 10)).toEqual({ ok: true, teks: null });
    expect(bacaTeksOpsional(undefined, 10)).toEqual({ ok: true, teks: null });
    expect(bacaTeksOpsional({ id: "Foto", en: "", zh: "" }, 10)).toMatchObject({
      ok: false,
      kurang: ["en", "zh"],
    });
  });

  it("lists the empty languages while typing", () => {
    expect(bahasaKosong({ id: "a", en: "" })).toEqual(["en", "zh"]);
    expect(bahasaKosong(null)).toEqual(["id", "en", "zh"]);
  });

  it("reads in the reader's language, Indonesian as the fallback", () => {
    const t = { id: "Satu", en: "One", zh: "" };
    expect(teksDi(t, "en")).toBe("One");
    expect(teksDi(t, "zh")).toBe("Satu");
    expect(teksDi(null, "id")).toBe("");
  });
});

describe("years and dates", () => {
  it("takes a kepengurusan year only as two years in a row", () => {
    expect(tahunValid("2026/2027")).toBe(true);
    expect(tahunValid("2026/2028")).toBe(false);
    expect(tahunValid("2026-2027")).toBe(false);
    expect(tahunValid(2026)).toBe(false);
  });

  it("takes a real calendar date only", () => {
    expect(tanggalValid("2026-10-01")).toBe(true);
    expect(tanggalValid("2026-02-30")).toBe(false);
    expect(tanggalValid("1 Oktober 2026")).toBe(false);
  });

  it("puts the newest year first", () => {
    expect(urutTahun([{ tahun: "2024/2025" }, { tahun: "2026/2027" }]).map((x) => x.tahun)).toEqual(
      ["2026/2027", "2024/2025"],
    );
  });
});

describe("people and covers", () => {
  it("orders the Inti by position, then the Kepala, then members by name", () => {
    const list = urutOrang([
      { nama: "Zaki", peran: "anggota" as const },
      { nama: "Budi", peran: "bendahara" as const },
      { nama: "Ayu", peran: "anggota" as const },
      { nama: "Citra", peran: "kepala" as const },
      { nama: "Dewi", peran: "ketua" as const },
    ]);
    expect(list.map((o) => o.nama)).toEqual(["Dewi", "Budi", "Citra", "Ayu", "Zaki"]);
  });

  it("shows the chosen cover, else the first photo", () => {
    const foto = [
      { id: 4, besar: "a", kecil: "a", alt: null },
      { id: 9, besar: "b", kecil: "b", alt: null },
    ];
    expect(sampulAcara({ sampulId: 9, foto })?.id).toBe(9);
    expect(sampulAcara({ sampulId: 77, foto })?.id).toBe(4);
    expect(sampulAcara({ sampulId: null, foto: [] })).toBeNull();
  });

  it("has built-in texts in all three languages for all six divisions", () => {
    for (const d of DIVISI) {
      expect(bacaTeks(INFO_DIVISI[d].baris, 160).ok).toBe(true);
      expect(bacaTeks(INFO_DIVISI[d].deskripsi, 1200).ok).toBe(true);
    }
  });
});
