import { describe, expect, it } from "vitest";
import { l1Otomatis, l1Tampil, skorSah, TINGKAT } from "../nilai-rubrik";

describe("which scores a component accepts", () => {
  it("takes only the five rubric levels for D1 to D4 and L2", () => {
    for (const k of ["D1", "D2", "D3", "D4", "L2"]) {
      for (const v of TINGKAT) expect(skorSah(k, v)).toBe(true);
      for (const v of [1, 44, 50, 66, 91, 95, 100, -45, 45.5, NaN])
        expect(skorSah(k, v)).toBe(false);
    }
  });

  it("takes 0 to 90 for L1 and 0 to 100 for TA and TP", () => {
    expect(skorSah("L1", 0)).toBe(true);
    expect(skorSah("L1", 63)).toBe(true);
    expect(skorSah("L1", 90)).toBe(true);
    expect(skorSah("L1", 91)).toBe(false);
    expect(skorSah("L1", 95)).toBe(false);
    expect(skorSah("L1", 12.5)).toBe(false);
    for (const k of ["TA", "TP"]) {
      expect(skorSah(k, 100)).toBe(true);
      expect(skorSah(k, 101)).toBe(false);
      expect(skorSah(k, -1)).toBe(false);
    }
    expect(skorSah("XX", 10)).toBe(false);
  });
});

describe("L1 from the journal's blanks", () => {
  it("is correct blanks over all blanks times 90, rounded", () => {
    expect(l1Otomatis(7, 10)).toBe(63);
    expect(l1Otomatis(10, 10)).toBe(90);
    expect(l1Otomatis(0, 10)).toBe(0);
    expect(l1Otomatis(1, 3)).toBe(30);
    expect(l1Otomatis(2, 3)).toBe(60);
    expect(l1Otomatis(5, 12)).toBe(38);
  });

  it("is 0 with no blanks, and never above 90", () => {
    expect(l1Otomatis(0, 0)).toBe(0);
    expect(l1Otomatis(5, 0)).toBe(0);
    expect(l1Otomatis(14, 10)).toBe(90);
  });

  it("shows an override first, then 0 for a Tidak Hadir member, else the computed value", () => {
    expect(l1Tampil(80, false, 63)).toBe(80);
    expect(l1Tampil(0, false, 63)).toBe(0);
    expect(l1Tampil(undefined, false, 63)).toBe(63);
    expect(l1Tampil(undefined, true, 63)).toBe(0);
    expect(l1Tampil(null, true, 63)).toBe(0);
  });
});
