import { describe, expect, it } from "vitest";
import {
  attentionReasons,
  countFilters,
  summarize,
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
    pending: false,
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
    expect(c).toEqual({
      semua: 5,
      keluar: 1,
      kejadian: 2,
      keputusan: 0,
      ditahan: 0,
      terputus: 1,
      belum: 1,
    });
  });
});

describe("a strike left open after its part ended (9 Nov 2026)", () => {
  it("stops counting at the part's end and is not shown as out now", () => {
    const s = kejadianPerSeat([row(1, 1000, null)], 100_000, { logika: 6000 });
    expect(s[1].awayMs).toBe(5000);
    expect(s[1].open).toBeNull();
    expect(s[1].count).toBe(1);
  });

  it("still counts up to now while its part is running", () => {
    const s = kejadianPerSeat([row(1, 1000, null)], 8000, { fitb: 6000 });
    expect(s[1].awayMs).toBe(7000);
    expect(s[1].open?.id).toBe("c1000");
    // an end in the future (a part not over yet) changes nothing
    expect(kejadianPerSeat([row(1, 1000, null)], 8000, { logika: 9000 })[1].open).not.toBeNull();
  });

  it("a strike that began after the end counts nothing", () => {
    const s = kejadianPerSeat([row(1, 9000, null)], 100_000, { logika: 6000 });
    expect(s[1].awayMs).toBe(0);
  });

  it("counts the forgiven ones apart but keeps them in the list", () => {
    const ex = {
      ...row(1, 1000, 2000),
      excused: { by: "13500001", reason: "Colokan lepas", at: 3000 },
    };
    const s = kejadianPerSeat([ex, row(1, 5000, 6000)], 9000);
    expect(s[1]).toMatchObject({ count: 2, excused: 1 });
    expect(s[1].list).toHaveLength(2);
  });
});

describe("the filter for decisions still to make (9 Nov 2026)", () => {
  const tile = (o: Partial<Tile>): Tile => ({
    checkedIn: true,
    connected: true,
    count: 0,
    open: false,
    pending: false,
    ...o,
  });
  it("shows only the seats with an undecided suggested cut", () => {
    expect(matchFilter("keputusan", tile({ pending: true, count: 4 }))).toBe(true);
    expect(matchFilter("keputusan", tile({ count: 4 }))).toBe(false);
  });
  it("is counted with the others", () => {
    const n = countFilters([tile({ pending: true }), tile({}), tile({ pending: true })]);
    expect(n.keputusan).toBe(2);
    expect(n.semua).toBe(3);
  });
});

describe("the room console's attention list and counters (9 Nov 2026)", () => {
  const tile = (o: Partial<Tile> = {}): Tile => ({
    checkedIn: true,
    connected: true,
    count: 0,
    open: false,
    pending: false,
    ...o,
  });

  it("lists why a seat needs a look, most urgent first", () => {
    expect(attentionReasons(tile())).toEqual([]);
    expect(attentionReasons(tile({ open: true }))).toEqual(["keluar"]);
    expect(
      attentionReasons(tile({ open: true, pending: true, held: true, connected: false, level: 3 })),
    ).toEqual(["keluar", "keputusan", "ditahan", "terputus", "peringatan"]);
  });
  it("a strong warning is worth a look, a notice is not", () => {
    expect(attentionReasons(tile({ level: 1 }))).toEqual([]);
    expect(attentionReasons(tile({ level: 2 }))).toEqual(["peringatan"]);
  });
  it("a seat that never came in is not offline", () => {
    expect(attentionReasons(tile({ checkedIn: false, connected: false }))).toEqual([]);
  });

  it("counts seats in, answering, handed in, away, offline, undecided and held", () => {
    const c = summarize([
      tile({}),
      tile({ handed: true }),
      tile({ open: true, count: 1 }),
      tile({ connected: false }),
      tile({ pending: true, held: true }),
      tile({ checkedIn: false, connected: null }),
    ]);
    expect(c).toEqual({
      total: 6,
      masuk: 5,
      mengerjakan: 3,
      kumpul: 1,
      keluar: 1,
      terputus: 1,
      keputusan: 1,
      ditahan: 1,
    });
  });
  it("the held filter lists held seats", () => {
    expect(matchFilter("ditahan", tile({ held: true }))).toBe(true);
    expect(matchFilter("ditahan", tile({}))).toBe(false);
  });
});
