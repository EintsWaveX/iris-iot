import { describe, expect, it } from "vitest";
import {
  MODE_TOT_MATI,
  PRAKTIKAN_TOT,
  TOT_JUMLAH_KELOMPOK,
  bacaNilaiTot,
  divisiKelompokTot,
  isNimTot,
  praktikanBolehMasuk,
  rosterTot,
} from "../tot";
import { NIM_PATTERN } from "../auth";

describe("Mode TOT dummy accounts", () => {
  it("has ten per division, six divisions, sixty in all", () => {
    expect(PRAKTIKAN_TOT).toHaveLength(60);
    expect(TOT_JUMLAH_KELOMPOK).toBe(6);
    for (let g = 1; g <= 6; g++) {
      expect(PRAKTIKAN_TOT.filter((p) => p.kelompokNomor === g)).toHaveLength(10);
    }
  });

  it("numbers them X00000 to X00009 with X = 1 ASO .. 6 ARM", () => {
    const nim = PRAKTIKAN_TOT.map((p) => p.nim);
    expect(nim[0]).toBe("100000");
    expect(nim[9]).toBe("100009");
    expect(nim[59]).toBe("600009");
    expect(new Set(nim).size).toBe(60);
    expect(PRAKTIKAN_TOT.find((p) => p.nim === "300004")).toMatchObject({
      divisi: "ADS",
      kelompokNomor: 3,
      nama: "TOT ADS 05",
    });
    expect(
      ["ASO", "ARD", "ADS", "ADC", "AER", "ARM"].map((_, i) => divisiKelompokTot(i + 1)),
    ).toEqual(["ASO", "ARD", "ADS", "ADC", "AER", "ARM"]);
    for (const n of nim) expect(NIM_PATTERN.test(n)).toBe(true);
  });

  it("recognises only the sixty", () => {
    expect(isNimTot("100000")).toBe(true);
    expect(isNimTot(" 600009 ")).toBe(true);
    expect(isNimTot("100010")).toBe(false);
    expect(isNimTot("700000")).toBe(false);
    expect(isNimTot("101022300172")).toBe(false);
  });

  it("lets only dummies in while on, only real Praktikan while off", () => {
    expect(praktikanBolehMasuk("100000", true)).toBe(true);
    expect(praktikanBolehMasuk("1301220001", true)).toBe(false);
    expect(praktikanBolehMasuk("100000", false)).toBe(false);
    expect(praktikanBolehMasuk("1301220001", false)).toBe(true);
  });
});

describe("Mode TOT roster", () => {
  it("fills groups 1..6 and switches off every group past them", () => {
    const r = rosterTot([{ nomor: 1 }, { nomor: 5 }, { nomor: 7 }, { nomor: 10 }]);
    expect(r.kelompok.map((k) => k.nomor)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.kelompok.every((k) => k.aktif && k.klpSeelabs === null)).toBe(true);
    expect(r.matikan).toEqual([7, 10]);
    expect(r.anggota).toHaveLength(60);
  });

  it("reads the stored value back exactly, and anything odd as off", () => {
    const nilai = {
      aktif: true,
      sejak: "2026-10-05T14:00:00.000Z",
      oleh: "101022300172",
      cadangan: {
        kelompok: [{ id: 3, nomor: 1, nama: "Kelompok 1", aktif: true, klpSeelabs: "12" }],
        anggota: [{ id: 9, kelompokId: 3, nim: "1301220001", nama: "Budi" }],
      },
    };
    expect(bacaNilaiTot(JSON.parse(JSON.stringify(nilai)))).toEqual(nilai);
    expect(bacaNilaiTot(undefined)).toEqual(MODE_TOT_MATI);
    expect(bacaNilaiTot("on")).toEqual(MODE_TOT_MATI);
    expect(bacaNilaiTot({ aktif: "yes" }).aktif).toBe(false);
  });
});
