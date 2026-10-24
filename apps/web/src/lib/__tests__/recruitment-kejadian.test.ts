import { describe, expect, it } from "vitest";
import {
  countFilters,
  kejadianPerSeat,
  matchFilter,
  type StrikeRow,
  type Tile,
} from "../recruitment/kejadian";

/** What the console shows of a seat's kejadian (strikes) and how its filter chips count them. */

const row = (
  seatId: number,
  at: number,
  backAt: number | null,
  kinds = ["layar"],
  id = `c${at}`,
): StrikeRow => ({
  id,
  seatId,
  part: "logika",
  kinds,
  at,
  backAt,
});

describe("a seat's kejadian", () => {
  it("counts them and adds up the time away", () => {
    const s = kejadianPerSeat([row(1, 1000, 4000), row(1, 10_000, 12_500)], 20_000);
    expect(s[1].count).toBe(2);
    expect(s[1].awayMs).toBe(5500);
    expect(s[1].open).toBeNull();
  });

  it("lists them in time order", () => {
    const s = kejadianPerSeat([row(1, 9000, 9500), row(1, 1000, 2000)], 20_000);
    expect(s[1].list.map((x) => x.at)).toEqual([1000, 9000]);
  });

  it("counts an open one up to now and says it is open", () => {
    const s = kejadianPerSeat([row(2, 5000, null)], 8000);
    expect(s[2].open?.at).toBe(5000);
    expect(s[2].awayMs).toBe(3000);
  });

  it("keeps seats apart and says nothing of a seat without any", () => {
    const s = kejadianPerSeat([row(1, 0, 1), row(2, 0, 1)], 5);
    expect(Object.keys(s).sort()).toEqual(["1", "2"]);
    expect(s[3]).toBeUndefined();
  });

  it("never counts negative time when a back time is earlier than the start", () => {
    expect(kejadianPerSeat([row(1, 5000, 4000)], 9000)[1].awayMs).toBe(0);
  });
});

describe("the console's filters", () => {
  const tile = (o: Partial<Tile>): Tile => ({
    checkedIn: true,
    connected: true,
    count: 0,
    open: false,
    ...o,
  });

  it("shows everyone under Semua", () => {
    expect(matchFilter("semua", tile({}))).toBe(true);
    expect(matchFilter("semua", tile({ checkedIn: false }))).toBe(true);
  });
  it("shows a seat with a strike open under Sedang Keluar", () => {
    expect(matchFilter("keluar", tile({ open: true, count: 1 }))).toBe(true);
    expect(matchFilter("keluar", tile({ count: 1 }))).toBe(false);
  });
  it("shows a seat with any kejadian under Ada Kejadian", () => {
    expect(matchFilter("kejadian", tile({ count: 2 }))).toBe(true);
    expect(matchFilter("kejadian", tile({}))).toBe(false);
  });
  it("shows a checked in seat that lost its connection under Terputus", () => {
    expect(matchFilter("terputus", tile({ connected: false }))).toBe(true);
    expect(matchFilter("terputus", tile({ connected: null }))).toBe(false);
    expect(matchFilter("terputus", tile({ checkedIn: false, connected: false }))).toBe(false);
  });
  it("shows a seat that never came in under Belum Masuk", () => {
    expect(matchFilter("belum", tile({ checkedIn: false, connected: null }))).toBe(true);
    expect(matchFilter("belum", tile({}))).toBe(false);
  });
  it("counts each chip", () => {
    const c = countFilters([
      tile({}),
      tile({ open: true, count: 1 }),
      tile({ count: 3 }),
      tile({ connected: false }),
      tile({ checkedIn: false, connected: null }),
    ]);
    expect(c).toEqual({ semua: 5, keluar: 1, kejadian: 2, terputus: 1, belum: 1 });
  });
});
