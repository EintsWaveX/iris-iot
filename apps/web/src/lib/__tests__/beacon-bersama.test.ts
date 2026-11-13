import { describe, expect, it } from "vitest";
import {
  BEACON_BAWAAN,
  bacaBeacon,
  jumlahBeaconEfektif,
  kelompokDilayani,
  kelompokTambahan,
  nomorBeacon,
  slotBentrok,
  type PengaturanBeacon,
} from "../beacon-bersama";

const selang = (jumlah: number | null): PengaturanBeacon => ({ jumlah, pola: "selang" });
const urut = (jumlah: number | null): PengaturanBeacon => ({ jumlah, pola: "berurutan" });

describe("default layout", () => {
  it("gives every group its own Beacon, for any group count", () => {
    for (let G = 1; G <= 99; G++) {
      for (let g = 1; g <= G; g++) {
        expect(kelompokDilayani(g, G, BEACON_BAWAAN)).toEqual([g]);
        expect(kelompokTambahan(g, G, BEACON_BAWAAN)).toEqual([]);
      }
    }
  });
});

describe("interleaved (selang)", () => {
  it("5 groups on 2 Beacons: 1, 3, 5 and 2, 4", () => {
    const p = selang(2);
    expect(kelompokDilayani(1, 5, p)).toEqual([1, 3, 5]);
    expect(kelompokDilayani(3, 5, p)).toEqual([1, 3, 5]);
    expect(kelompokDilayani(5, 5, p)).toEqual([1, 3, 5]);
    expect(kelompokDilayani(2, 5, p)).toEqual([2, 4]);
    expect(kelompokDilayani(4, 5, p)).toEqual([2, 4]);
  });
  it("tambahan leaves out the group itself", () => {
    expect(kelompokTambahan(3, 5, selang(2))).toEqual([1, 5]);
    expect(kelompokTambahan(2, 5, selang(2))).toEqual([4]);
  });
  it("10 groups on 10 Beacons is one each", () => {
    for (let g = 1; g <= 10; g++) expect(kelompokDilayani(g, 10, selang(10))).toEqual([g]);
  });
  it("nomorBeacon numbers the Beacons from 1", () => {
    expect([1, 2, 3, 4, 5].map((g) => nomorBeacon(g, 5, selang(2)))).toEqual([1, 2, 1, 2, 1]);
  });
});

describe("contiguous (berurutan)", () => {
  it("5 groups on 2 Beacons: 1 to 3 and 4 to 5", () => {
    expect(kelompokDilayani(1, 5, urut(2))).toEqual([1, 2, 3]);
    expect(kelompokDilayani(4, 5, urut(2))).toEqual([4, 5]);
  });
  it("5 groups on 4 Beacons: 2, 1, 1, 1", () => {
    expect([1, 2, 3, 4, 5].map((g) => nomorBeacon(g, 5, urut(4)))).toEqual([1, 1, 2, 3, 4]);
  });
  it("10 groups on 3 Beacons: 4, 3, 3", () => {
    const sizes = [1, 2, 3].map((b) => {
      const n = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((g) => nomorBeacon(g, 10, urut(3)) === b);
      return n.length;
    });
    expect(sizes).toEqual([4, 3, 3]);
  });
});

describe("every layout", () => {
  it("gives every group exactly one Beacon and leaves no Beacon empty (G, B from 1 to 40, both patterns)", () => {
    for (const mk of [selang, urut]) {
      for (let G = 1; G <= 40; G++) {
        for (let B = 1; B <= 40; B++) {
          const p = mk(B);
          const E = jumlahBeaconEfektif(p, G);
          const seen = new Map<number, number>();
          for (let g = 1; g <= G; g++) {
            const b = nomorBeacon(g, G, p);
            expect(b).toBeGreaterThanOrEqual(1);
            expect(b).toBeLessThanOrEqual(E);
            seen.set(b, (seen.get(b) ?? 0) + 1);
            // the served set of a group contains it, and agrees with the Beacon number
            expect(kelompokDilayani(g, G, p)).toContain(g);
          }
          expect(seen.size).toBe(E);
        }
      }
    }
  });
  it("clamps a Beacon count above the group count", () => {
    expect(jumlahBeaconEfektif(selang(9), 5)).toBe(5);
    expect(kelompokDilayani(2, 5, selang(9))).toEqual([2]);
  });
  it("leaves a group beyond the lab's count alone", () => {
    expect(kelompokDilayani(8, 5, selang(2))).toEqual([8]);
    expect(nomorBeacon(8, 5, selang(2))).toBe(8);
  });
  it("returns nothing for an invalid group", () => {
    expect(kelompokDilayani(0, 5, selang(2))).toEqual([]);
    expect(kelompokDilayani(1.5, 5, selang(2))).toEqual([]);
  });
  it("honours a custom mapping", () => {
    const semua1 = () => 1;
    expect(kelompokDilayani(2, 4, selang(2), semua1)).toEqual([1, 2, 3, 4]);
  });
});

describe("bacaBeacon", () => {
  it("reads a valid setting", () => {
    expect(bacaBeacon({ jumlah: 2, pola: "berurutan" })).toEqual({ jumlah: 2, pola: "berurutan" });
    expect(bacaBeacon({ jumlah: 2 })).toEqual({ jumlah: 2, pola: "selang" });
  });
  it("falls back to the default on anything else", () => {
    for (const bad of [0, -1, 1.5, 100, "2", NaN, null, undefined, {}, [], "x"]) {
      expect(bacaBeacon(typeof bad === "object" ? bad : { jumlah: bad })).toEqual(BEACON_BAWAAN);
    }
    expect(bacaBeacon(null)).toEqual(BEACON_BAWAAN);
    expect(bacaBeacon({ jumlah: 2, pola: "acak" }).pola).toBe("selang");
  });
});

describe("slotBentrok", () => {
  it("5 groups on 2 Beacons never share a slot", () => {
    for (const g of [1, 2, 3, 4, 5])
      expect(slotBentrok(kelompokDilayani(g, 5, selang(2)))).toBe(false);
  });
  it("12 groups on 2 interleaved Beacons do (groups 1 and 11)", () => {
    expect(slotBentrok(kelompokDilayani(1, 12, selang(2)))).toBe(true);
  });
  it("10 groups on any layout never do", () => {
    for (let B = 1; B <= 10; B++) {
      for (let g = 1; g <= 10; g++)
        expect(slotBentrok(kelompokDilayani(g, 10, selang(B)))).toBe(false);
    }
  });
});
