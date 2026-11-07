/**
 * The pure rules of rollback: which stages come after which, what must be typed,
 * and which Asisten Batalkan Jadikan Asisten may delete.
 */
import { describe, expect, it } from "vitest";
import {
  HITUNGAN_KOSONG,
  asistenBelumDipakai,
  konfirmasiCocok,
  tahapMulai,
  tahapSesudah,
  type AsistenCek,
} from "../recruitment/rollback";
import { STAGES } from "../recruitment/types";

describe("tahapSesudah / tahapMulai", () => {
  it("lists the stages after one, in journey order", () => {
    expect(tahapSesudah("berkas")).toEqual([
      "first_meet",
      "tes_tulis",
      "wawancara",
      "tubes",
      "mengajar",
      "penerimaan",
    ]);
    expect(tahapSesudah("wawancara")).toEqual(["tubes", "mengajar", "penerimaan"]);
    expect(tahapSesudah("penerimaan")).toEqual([]);
  });
  it("starts from the stage itself", () => {
    expect(tahapMulai("tubes")).toEqual(["tubes", "mengajar", "penerimaan"]);
    expect(tahapMulai("berkas")).toEqual([...STAGES]);
  });
  it("splits the journey with no stage lost or doubled", () => {
    for (const s of STAGES)
      expect([...STAGES.slice(0, STAGES.indexOf(s) + 1), ...tahapSesudah(s)]).toEqual([...STAGES]);
  });
});

describe("konfirmasiCocok", () => {
  it("takes the exact word, trimmed", () => {
    expect(konfirmasiCocok("berkas", "berkas")).toBe(true);
    expect(konfirmasiCocok("  berkas ", "berkas")).toBe(true);
    expect(konfirmasiCocok("1010124202401", "1010124202401")).toBe(true);
  });
  it("refuses anything else, including a missing or non-text value", () => {
    expect(konfirmasiCocok("Berkas", "berkas")).toBe(false);
    expect(konfirmasiCocok("tes_tulis", "berkas")).toBe(false);
    expect(konfirmasiCocok("", "berkas")).toBe(false);
    expect(konfirmasiCocok(undefined, "berkas")).toBe(false);
    expect(konfirmasiCocok(true, "berkas")).toBe(false);
    expect(konfirmasiCocok(null, "")).toBe(false);
  });
});

describe("asistenBelumDipakai", () => {
  const bersih: AsistenCek = {
    passwordHash: null,
    passwordDiaturPada: null,
    terakhirAktif: null,
    divisi: null,
    tier: "asisten",
    badges: [],
    hakOverride: {},
  };
  it("accepts one nobody has touched", () => {
    expect(asistenBelumDipakai(bersih)).toBe(true);
  });
  it.each<[string, Partial<AsistenCek>]>([
    ["set a password", { passwordHash: "x" }],
    ["chose a password", { passwordDiaturPada: new Date() }],
    ["was active", { terakhirAktif: new Date() }],
    ["has a division", { divisi: "ADC" }],
    ["is Pengelola", { tier: "pengelola" }],
    ["is Admin", { tier: "admin" }],
    ["has a badge", { badges: ["dev"] }],
    ["has an override", { hakOverride: { tim: true } }],
  ])("refuses one that %s", (_n, ubah) => {
    expect(asistenBelumDipakai({ ...bersih, ...ubah })).toBe(false);
  });
});

describe("HITUNGAN_KOSONG", () => {
  it("starts every count at zero", () => {
    expect(Object.values(HITUNGAN_KOSONG).every((v) => v === 0)).toBe(true);
  });
});
