/**
 * PRD section 4 as a table, cell by cell: each division's row of rights.
 */
import { describe, expect, it } from "vitest";
import {
  bacaHakConfig,
  bolehAturHak,
  bolehJadiMaster,
  cekHakConfig,
  HAK_BAWAAN,
  hakRekrutmen,
  pelakuDari,
  type HakConfig,
} from "../recruitment/rights";
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
  calendar: ["ketua", "akademik", "admin", "acara"],
  board: ["ketua", "akademik", "admin"],
  seatKetua: [],
  candidates: ["ketua", "wakil", "acara", "akademik", "logistik", "admin", "pdd"],
  documents: ["ketua", "admin"],
  approve: ["ketua", "admin"],
  bank: ["ketua", "akademik"],
  plotting: ["ketua", "akademik", "admin"],
  plotPengawas: ["ketua", "akademik"],
  cuttingPropose: ["ketua", "acara", "akademik", "admin", "logistik", "pdd"],
  cuttingLock: ["ketua", "akademik", "admin"],
  attendance: ["ketua", "acara", "admin"],
  kitLoans: ["ketua", "akademik", "admin", "logistik"],
  accept: ["ketua", "akademik", "admin"],
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

describe("HakConfig (Hak Akses, 2026-11-09)", () => {
  const salin = (ubah: (c: HakConfig) => void = () => {}) => {
    const c = structuredClone(HAK_BAWAAN);
    ubah(c);
    return c;
  };

  it("starts as the PRD table, with nobody holding everything and nobody in the no-seat column", () => {
    expect(HAK_BAWAAN.semua).toBe(false);
    for (const k of RIGHTS_KEYS) {
      expect([...HAK_BAWAAN.peran[k]].sort(), k).toEqual([...TABEL[k]].sort());
      expect(HAK_BAWAAN.peran[k], k).not.toContain("tanpa");
    }
  });

  describe("hakRekrutmen with a config", () => {
    it("opens every right to an Asisten with no seat while the switch is on", () => {
      const hak = hakRekrutmen(
        pelakuDari(BIASA, null),
        salin((c) => (c.semua = true)),
      );
      for (const k of RIGHTS_KEYS) expect(hak[k], k).toBe(true);
    });
    it("opens every right to any seat while the switch is on, the Ketua seat included", () => {
      const hak = hakRekrutmen(
        pelakuDari(BIASA, kursi("pdd")),
        salin((c) => (c.semua = true)),
      );
      for (const k of RIGHTS_KEYS) expect(hak[k], k).toBe(true);
    });
    it("ignores the matrix while the switch is on", () => {
      const c = salin((x) => {
        x.semua = true;
        for (const k of RIGHTS_KEYS) x.peran[k] = [];
      });
      const hak = hakRekrutmen(pelakuDari(BIASA, null), c);
      for (const k of RIGHTS_KEYS) expect(hak[k], k).toBe(true);
    });
    it("follows the matrix once the switch is off", () => {
      const c = salin((x) => {
        x.peran.bank = ["pdd", "tanpa"];
        x.peran.calendar = [];
      });
      expect(hakRekrutmen(pelakuDari(BIASA, kursi("pdd")), c).bank).toBe(true);
      expect(hakRekrutmen(pelakuDari(BIASA, null), c).bank).toBe(true);
      expect(hakRekrutmen(pelakuDari(BIASA, kursi("akademik")), c).bank).toBe(false);
      expect(hakRekrutmen(pelakuDari(BIASA, kursi("ketua")), c).calendar).toBe(false);
    });
    it("lets the matrix grant the Ketua seat right to a role", () => {
      const c = salin((x) => (x.peran.seatKetua = ["ketua"]));
      expect(hakRekrutmen(pelakuDari(BIASA, kursi("ketua")), c).seatKetua).toBe(true);
      expect(hakRekrutmen(pelakuDari(BIASA, kursi("admin")), c).seatKetua).toBe(false);
    });
    it("never reduces hakPenuh, whatever the matrix says", () => {
      const c = salin((x) => {
        for (const k of RIGHTS_KEYS) x.peran[k] = [];
      });
      for (const o of [ADMIN_TIER, PENCIPTA])
        for (const k of RIGHTS_KEYS) expect(hakRekrutmen(pelakuDari(o, null), c)[k], k).toBe(true);
    });
    it("treats a Koordinator like their division", () => {
      const c = salin((x) => (x.peran.bank = ["acara"]));
      expect(hakRekrutmen(pelakuDari(BIASA, kursi("acara", true)), c).bank).toBe(true);
    });
  });

  describe("bacaHakConfig (reading what is saved)", () => {
    it("gives the default for anything that is not an object", () => {
      for (const v of [null, undefined, 7, "ya", true, [], [1, 2]])
        expect(bacaHakConfig(v), String(v)).toEqual(HAK_BAWAAN);
    });
    it("keeps a right that is missing or malformed at its default", () => {
      const c = bacaHakConfig({ semua: true, peran: { bank: ["pdd"], calendar: "acara" } });
      expect(c.semua).toBe(true);
      expect(c.peran.bank).toEqual(["pdd"]);
      expect(c.peran.calendar).toEqual(HAK_BAWAAN.peran.calendar);
      expect(c.peran.approve).toEqual(HAK_BAWAAN.peran.approve);
    });
    it("drops roles it does not know and repeats", () => {
      const c = bacaHakConfig({ semua: false, peran: { bank: ["pdd", "bos", "pdd", 3] } });
      expect(c.peran.bank).toEqual(["pdd"]);
    });
    it("counts the switch on only when it is exactly true", () => {
      expect(bacaHakConfig({ semua: "true", peran: {} }).semua).toBe(false);
      expect(bacaHakConfig({ semua: 1, peran: {} }).semua).toBe(false);
    });
  });

  describe("cekHakConfig (checking what is being saved)", () => {
    const lengkap = () => ({ semua: false, peran: structuredClone(HAK_BAWAAN.peran) });
    it("accepts a full config and removes repeats", () => {
      const v = lengkap();
      (v.peran as Record<string, string[]>).bank = ["pdd", "pdd", "tanpa"];
      expect(cekHakConfig(v)?.peran.bank).toEqual(["pdd", "tanpa"]);
    });
    it("refuses anything incomplete or wrong", () => {
      const kurang = lengkap();
      delete (kurang.peran as Record<string, unknown>).bank;
      expect(cekHakConfig(kurang)).toBeNull();
      expect(cekHakConfig({ ...lengkap(), semua: "ya" })).toBeNull();
      expect(cekHakConfig({ ...lengkap(), semua: undefined })).toBeNull();
      expect(cekHakConfig({ semua: true })).toBeNull();
      expect(cekHakConfig({ semua: true, peran: [] })).toBeNull();
      expect(cekHakConfig(null)).toBeNull();
      const salah = lengkap();
      (salah.peran as Record<string, unknown>).bank = ["bos"];
      expect(cekHakConfig(salah)).toBeNull();
    });
  });

  describe("bolehAturHak: who changes it", () => {
    it("is the Ketua seat and the Pencipta, nobody else", () => {
      expect(bolehAturHak(BIASA, { division: "ketua" })).toBe(true);
      expect(bolehAturHak(PENCIPTA, null)).toBe(true);
      expect(bolehAturHak(PENCIPTA, { division: "pdd" })).toBe(true);
      expect(bolehAturHak(BIASA, null)).toBe(false);
      for (const d of ["wakil", "acara", "akademik", "logistik", "admin", "pdd"] as const)
        expect(bolehAturHak(BIASA, { division: d }), d).toBe(false);
    });
    it("leaves out the Admin tier, and the all-Asisten switch does not grant it", () => {
      expect(bolehAturHak(ADMIN_TIER, null)).toBe(false);
      expect(bolehAturHak(ADMIN_TIER, { division: "admin" })).toBe(false);
    });
  });
});

describe("bolehJadiMaster", () => {
  it("lets the Pencipta be Master (2026-11-06; PRD 7.8 no longer excludes them)", () => {
    expect(bolehJadiMaster(PENCIPTA)).toBe(true);
  });
  it("lets an Admin or an ordinary Asisten be Master", () => {
    expect(bolehJadiMaster(ADMIN_TIER)).toBe(true);
    expect(bolehJadiMaster(BIASA)).toBe(true);
  });
  it("still excludes an inactive Pencipta", () => {
    expect(bolehJadiMaster({ ...PENCIPTA, status: "nonaktif" })).toBe(false);
  });
  it("excludes an inactive Asisten", () => {
    expect(bolehJadiMaster({ ...BIASA, status: "nonaktif" })).toBe(false);
    expect(bolehJadiMaster({ ...BIASA, status: "aktif" })).toBe(true);
  });
});
