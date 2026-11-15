import { describe, expect, it } from "vitest";
import { hilangPersen } from "../../../src/lib/telemetri-ringkas.js";
import {
  TELEMETRI_KOSONG,
  dariBaris,
  hilangDariAgregat,
  kueriRingkas,
} from "../laporan-telemetri.js";

/** The aggregates the query returns for a list of seqs, worked out here the slow way. */
function agregat(seqs: number[]) {
  const unik = new Set(seqs);
  return { n: seqs.length, unik: unik.size, lo: Math.min(...unik), hi: Math.max(...unik) };
}

describe("hilangDariAgregat", () => {
  it("gives the same share as hilangPersen on the raw seqs", () => {
    const kasus = [
      [1, 2, 3, 4, 5],
      [1, 2, 4, 8],
      [5, 5, 5],
      [10, 11, 11, 13, 20],
      [1, 1_000_001],
      [7, 9],
    ];
    for (const seqs of kasus) {
      const a = agregat(seqs);
      expect(hilangDariAgregat(a.n, a.unik, a.lo, a.hi)).toBe(hilangPersen(seqs));
    }
  });

  it("is unknown for a single message or a range over a million", () => {
    expect(hilangDariAgregat(1, 1, 5, 5)).toBeNull();
    expect(hilangDariAgregat(2, 2, 1, 2_000_000)).toBeNull();
  });
});

describe("dariBaris", () => {
  it("shows delays only when some message had one", () => {
    const tanpa = dariBaris({
      nomor: 1,
      n: 3,
      unik: 3,
      lo: 1,
      hi: 3,
      nd: 0,
      dmin: null,
      dmax: null,
      drata: null,
      dmed: null,
    });
    expect(tanpa).toEqual({ ...TELEMETRI_KOSONG, count: 3, hilangPct: 0 });
    const dengan = dariBaris({
      nomor: 1,
      n: 4,
      unik: 4,
      lo: 1,
      hi: 4,
      nd: 4,
      dmin: 10,
      dmax: 90,
      drata: 40,
      dmed: 35,
    });
    expect(dengan).toMatchObject({
      count: 4,
      delayMinMs: 10,
      delayMedianMs: 35,
      delayMaxMs: 90,
      delayRataMs: 40,
    });
  });
});

describe("kueriRingkas", () => {
  it("binds the session id as a parameter, never into the text", () => {
    const q = kueriRingkas(42) as unknown as { queryChunks: unknown[] };
    const teks = JSON.stringify(q.queryChunks);
    expect(teks).toContain("42");
    expect(teks).toContain("telemetri_log");
  });
});
