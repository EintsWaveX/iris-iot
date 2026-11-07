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
  /** Staff forgave it: it counts for nothing (9 Nov 2026) */
  excused?: { by: string; reason: string | null; at: number } | null;
}

export interface SeatKejadian {
  count: number;
  /** Strikes staff forgave, already in `count` */
  excused: number;
  awayMs: number;
  /** The one still open: the seat is out right now */
  open: StrikeRow | null;
  list: StrikeRow[];
}

/**
 * Per seat with at least one kejadian, an open one counted up to `now`. `ends` is when each part's
 * run ended (9 Nov 2026): a strike still open after its part ended was left open by a page that
 * closed or crashed, so its time stops at the part's end and the seat is not shown as out now.
 */
export function kejadianPerSeat(
  rows: readonly StrikeRow[],
  now: number,
  ends: Partial<Record<PartKey, number>> = {},
): Record<number, SeatKejadian> {
  const out: Record<number, SeatKejadian> = {};
  for (const r of [...rows].sort((a, b) => a.at - b.at)) {
    const s = (out[r.seatId] ??= { count: 0, excused: 0, awayMs: 0, open: null, list: [] });
    s.count++;
    if (r.excused) s.excused++;
    s.list.push(r);
    const end = ends[r.part];
    const stale = r.backAt === null && end !== undefined && end <= now;
    s.awayMs += Math.max(0, (r.backAt ?? (stale ? Math.max(r.at, end) : now)) - r.at);
    if (r.backAt === null && !stale) s.open = r;
  }
  return out;
}

export const FILTERS = [
  "semua",
  "keluar",
  "kejadian",
  "keputusan",
  "ditahan",
  "terputus",
  "belum",
] as const;
export type Filter = (typeof FILTERS)[number];

/** A seat tile reduced to what the chips look at. */
export interface Tile {
  checkedIn: boolean;
  /** The relay says the seat's page is connected; null when unknown */
  connected: boolean | null;
  count: number;
  open: boolean;
  /** A suggested violation cut nobody has decided yet (9 Nov 2026) */
  pending: boolean;
  /** The Master holds this seat */
  held?: boolean;
  /** The worst violation warning level across parts, 0 to 3 */
  level?: number;
  /** Handed in the part that is running */
  handed?: boolean;
}

export function matchFilter(f: Filter, t: Tile): boolean {
  switch (f) {
    case "semua":
      return true;
    case "keluar":
      return t.open;
    case "kejadian":
      return t.count > 0;
    case "keputusan":
      return t.pending;
    case "ditahan":
      return !!t.held;
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

/** Why a seat needs a pengawas' look, most urgent first (9 Nov 2026). */
export type Reason = "keluar" | "keputusan" | "ditahan" | "terputus" | "peringatan";

export function attentionReasons(t: Tile): Reason[] {
  const out: Reason[] = [];
  if (t.open) out.push("keluar");
  if (t.pending) out.push("keputusan");
  if (t.held) out.push("ditahan");
  if (t.checkedIn && t.connected === false) out.push("terputus");
  if ((t.level ?? 0) >= 2) out.push("peringatan");
  return out;
}

export interface Summary {
  total: number;
  /** Signed in */
  masuk: number;
  /** Signed in, not handed in, not out right now */
  mengerjakan: number;
  kumpul: number;
  keluar: number;
  terputus: number;
  keputusan: number;
  ditahan: number;
}

export function summarize(tiles: readonly Tile[]): Summary {
  const masuk = tiles.filter((t) => t.checkedIn);
  return {
    total: tiles.length,
    masuk: masuk.length,
    mengerjakan: masuk.filter((t) => !t.handed && !t.open).length,
    kumpul: masuk.filter((t) => t.handed).length,
    keluar: tiles.filter((t) => t.open).length,
    terputus: masuk.filter((t) => t.connected === false).length,
    keputusan: tiles.filter((t) => t.pending).length,
    ditahan: tiles.filter((t) => t.held).length,
  };
}
