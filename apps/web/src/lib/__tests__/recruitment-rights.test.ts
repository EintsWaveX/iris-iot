/**
 * PRD section 4 as a table, cell by cell: each division's row of rights.
 */
import { describe, expect, it } from "vitest";
import { bolehJadiMaster, hakRekrutmen, pelakuDari } from "../recruitment/rights";
import { RIGHTS_KEYS, type CommitteeDivision, type RecRights } from "../recruitment/types";
import type { Orang } from "../hak";

const BIASA: Orang = { tier: "asisten", badges: [], hakOverride: {}, divisi: "ADC" };
const ADMIN_TIER: Orang = { tier: "admin", badges: [], hakOverride: {}, divisi: null };
const PENCIPTA: Orang = {
  tier: "asisten",
  badges: ["pencipta", "dev"],
  hakOverride: {},
  divisi: "ASO",
};

const kursi = (division: CommitteeDivision, isKoor = false) => ({ division, isKoor });

/** The PRD table: which divisions hold each right. */
const TABEL: Record<keyof RecRights, CommitteeDivision[]> = {
  calendar: ["ketua", "acara"],
  board: ["ketua"],
  seatKetua: [],
  candidates: ["ketua", "wakil", "acara", "akademik", "logistik", "admin", "pdd"],
  documents: ["ketua", "admin"],
  approve: ["ketua", "admin"],
  bank: ["ketua", "akademik"],
  plotting: ["ketua", "akademik", "admin"],
  plotPengawas: ["ketua", "akademik"],
  cuttingPropose: ["ketua", "acara", "akademik", "admin", "logistik", "pdd"],
  cuttingLock: ["ketua"],
  attendance: ["ketua", "acara", "admin"],
  kitLoans: ["ketua", "logistik"],
  accept: ["ketua"],
};

describe("hakRekrutmen: the PRD table", () => {
  for (const key of RIGHTS_KEYS) {
    for (const division of [
      "ketua",
      "wakil",
      "acara",
      "akademik",
      "logistik",
      "admin",
      "pdd",
    ] as const) {
      const harus = TABEL[key].includes(division);
      it(`${key}: ${division} ${harus ? "has it" : "does not"}`, () => {
        const hak = hakRekrutmen(pelakuDari(BIASA, kursi(division)));
        expect(hak[key]).toBe(harus);
      });
    }
  }
});

describe("hakRekrutmen: people outside the committee", () => {
  it("gives an Asisten without a seat nothing", () => {
    const hak = hakRekrutmen(pelakuDari(BIASA, null));
    for (const k of RIGHTS_KEYS) expect(hak[k], k).toBe(false);
  });
  it("gives a Koordinator exactly their division's rights", () => {
    const koor = hakRekrutmen(pelakuDari(BIASA, kursi("akademik", true)));
    const anggota = hakRekrutmen(pelakuDari(BIASA, kursi("akademik", false)));
    expect(koor).toEqual(anggota);
  });
});

describe("hakRekrutmen: hakPenuh", () => {
  it("gives the Admin tier everything, seated or not", () => {
    for (const k of RIGHTS_KEYS)
      expect(hakRekrutmen(pelakuDari(ADMIN_TIER, null))[k], k).toBe(true);
  });
  it("gives the Pencipta everything", () => {
    for (const k of RIGHTS_KEYS) expect(hakRekrutmen(pelakuDari(PENCIPTA, null))[k], k).toBe(true);
  });
  it("lets only hakPenuh seat the Ketua, even for a seated Ketua", () => {
    expect(hakRekrutmen(pelakuDari(BIASA, kursi("ketua"))).seatKetua).toBe(false);
    expect(hakRekrutmen(pelakuDari(ADMIN_TIER, null)).seatKetua).toBe(true);
  });
  it("does not let an override of another right widen recruitment", () => {
    const o: Orang = { ...BIASA, hakOverride: { tim: true, tp: true } };
    const hak = hakRekrutmen(pelakuDari(o, null));
    for (const k of RIGHTS_KEYS) expect(hak[k], k).toBe(false);
  });
});

describe("bolehJadiMaster", () => {
  it("excludes the Pencipta, even though they hold every other right", () => {
    expect(bolehJadiMaster(PENCIPTA)).toBe(false);
  });
  it("lets an Admin or an ordinary Asisten be Master", () => {
    expect(bolehJadiMaster(ADMIN_TIER)).toBe(true);
    expect(bolehJadiMaster(BIASA)).toBe(true);
  });
  it("excludes an inactive Asisten", () => {
    expect(bolehJadiMaster({ ...BIASA, status: "nonaktif" })).toBe(false);
    expect(bolehJadiMaster({ ...BIASA, status: "aktif" })).toBe(true);
  });
});
