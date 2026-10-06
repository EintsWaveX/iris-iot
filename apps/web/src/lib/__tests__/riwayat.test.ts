import { describe, expect, it } from "vitest";
import { riwayatTerbuka } from "../riwayat";

describe("practicum history (2026-10-06)", () => {
  it("opens module N once a later module is open", () => {
    expect(riwayatTerbuka([1], false)).toEqual([]);
    expect(riwayatTerbuka([1, 2], false)).toEqual([1]);
    expect(riwayatTerbuka([3], false)).toEqual([1, 2]);
  });
  it("keeps Module 4 closed until the practicum is finished", () => {
    expect(riwayatTerbuka([1, 2, 3, 4], false)).toEqual([1, 2, 3]);
    expect(riwayatTerbuka([], true)).toEqual([1, 2, 3, 4]);
  });
});
