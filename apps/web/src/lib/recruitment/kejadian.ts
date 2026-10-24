/**
 * What the console shows of a seat's kejadian, the UI word for a strike
 * (EXAM-ENGINE 7, 11.3): how many, the time away, whether one is open now,
 * and the filter chips over the seat grid. Pure.
 */
import type { PartKey } from "./exam-types.js";

export interface StrikeRow {
  /** The page's own id for it */
  id: string;
  seatId: number;
  part: PartKey;
  kinds: string[];
  at: number;
  /** When the seat was back; null while it is out */
  backAt: number | null;
}

export interface SeatKejadian {
  count: number;
  awayMs: number;
  /** The one still open: the seat is out right now */
  open: StrikeRow | null;
  list: StrikeRow[];
}

/** Per seat with at least one kejadian, an open one counted up to `now`. */
export function kejadianPerSeat(
  rows: readonly StrikeRow[],
  now: number,
): Record<number, SeatKejadian> {
  const out: Record<number, SeatKejadian> = {};
  for (const r of [...rows].sort((a, b) => a.at - b.at)) {
    const s = (out[r.seatId] ??= { count: 0, awayMs: 0, open: null, list: [] });
    s.count++;
    s.list.push(r);
    s.awayMs += Math.max(0, (r.backAt ?? now) - r.at);
    if (r.backAt === null) s.open = r;
  }
  return out;
}

export const FILTERS = ["semua", "keluar", "kejadian", "terputus", "belum"] as const;
export type Filter = (typeof FILTERS)[number];

/** A seat tile reduced to what the chips look at. */
export interface Tile {
  checkedIn: boolean;
  /** The relay says the seat's page is connected; null when unknown */
  connected: boolean | null;
  count: number;
  open: boolean;
}

export function matchFilter(f: Filter, t: Tile): boolean {
  switch (f) {
    case "semua":
      return true;
    case "keluar":
      return t.open;
    case "kejadian":
      return t.count > 0;
    case "terputus":
      return t.checkedIn && t.connected === false;
    case "belum":
      return !t.checkedIn;
  }
}

export function countFilters(tiles: readonly Tile[]): Record<Filter, number> {
  const out = {} as Record<Filter, number>;
  for (const f of FILTERS) out[f] = tiles.filter((t) => matchFilter(f, t)).length;
  return out;
}
