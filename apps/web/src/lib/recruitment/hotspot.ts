/**
 * Phone hotspots in an exam room (EXAM-ENGINE 9.6a). Pure: the console, the
 * room setup and the API read the same plan.
 *
 * Boards join phone hotspots brought into the room, not the building Wi-Fi.
 * A hotspot is a pengawas phone (the fallback, `cap` editable, 8 by default)
 * or a candidate's own phone (owned by their seat; its cap is that seat's
 * Wi-Fi boards). A BLE seat's boards need no phone.
 */
import type { FieldError, Protocol } from "./exam-types.js";
import type { HotspotView, KitBoard, RoomHotspot } from "./room-types.js";

/** A phone takes about 10 devices; 8 is the default room plan. */
export const CAP_BAWAAN = 8;

export interface SeatLoan {
  seatId: number;
  boards: KitBoard[];
  /** The protocol dealt to the seat; null until the spins */
  protocol: Protocol | null;
}

/** The hotspot id of a candidate's own phone. */
export const seatHotspotId = (seatId: number): string => `kursi-${seatId}`;

/** Boards that need Wi-Fi: all lent boards before the deal, none for a BLE seat. */
export const wifiBoards = (l: SeatLoan): number => (l.protocol === "ble" ? 0 : l.boards.length);

/** How many pengawas phones the Wi-Fi boards not on a candidate's phone need. */
export const neededHotspots = (rest: number, per = CAP_BAWAAN): number => Math.ceil(rest / per);

type Row = Pick<RoomHotspot, "id" | "owner" | "cap">;

export interface BoardAt {
  seatId: number;
  n: number;
  /** The hotspot id, or null when every phone is full */
  hotspot: string | null;
}

export interface HotspotPlan {
  assignments: BoardAt[];
  /** Per hotspot, its capacity and how many boards sit on it */
  groups: Record<string, { cap: number; used: number }>;
  /** Boards that need Wi-Fi */
  wifi: number;
  /** Of those, on a candidate's own phone */
  onPhones: number;
  rest: number;
  /** Butuh N hotspot */
  need: number;
  /** ada M: the pengawas phones */
  have: number;
  short: boolean;
  /** Boards with no phone with room */
  unplaced: number;
}

const ownerSeat = (r: Row): number | null =>
  typeof r.owner === "object" && r.owner !== null ? r.owner.seat : null;

/**
 * Where each Wi-Fi board goes. The Master's moves (`"seat:n" -> hotspot id`)
 * are honoured first. A seat with its own phone sends its boards there. The
 * rest go seat by seat to the pengawas phone with the most free places (ties
 * to the first in the list) that fits all of the seat's boards, so they share
 * a phone; when none fits, board by board.
 */
export function planHotspots(
  hotspots: readonly Row[],
  loans: readonly SeatLoan[],
  moves: Readonly<Record<string, string>> = {},
): HotspotPlan {
  const seats = [...loans].sort((a, b) => a.seatId - b.seatId);
  const wifiOf = new Map(seats.map((l) => [l.seatId, wifiBoards(l)]));
  const groups: HotspotPlan["groups"] = {};
  for (const h of hotspots) {
    const seat = ownerSeat(h);
    groups[h.id] = { cap: seat === null ? h.cap : (wifiOf.get(seat) ?? 0), used: 0 };
  }
  const pengawas = hotspots.filter((h) => ownerSeat(h) === null);
  const free = (id: string) => groups[id].cap - groups[id].used;

  const assignments: BoardAt[] = [];
  const set = (seatId: number, n: number, hotspot: string | null) => {
    assignments.push({ seatId, n, hotspot });
    if (hotspot) groups[hotspot].used++;
  };
  const bestFor = (k: number): Row | null => {
    let best: Row | null = null;
    for (const h of pengawas)
      if (free(h.id) >= k && (!best || free(h.id) > free(best.id))) best = h;
    return best;
  };

  for (const l of seats) {
    const own = hotspots.find((h) => ownerSeat(h) === l.seatId);
    const todo: number[] = [];
    for (const b of l.boards.slice(0, wifiOf.get(l.seatId))) {
      const to = moves[`${l.seatId}:${b.n}`];
      if (to && groups[to] && free(to) > 0) set(l.seatId, b.n, to);
      else todo.push(b.n);
    }
    if (own && free(own.id) >= todo.length) {
      for (const n of todo) set(l.seatId, n, own.id);
      continue;
    }
    const all = bestFor(todo.length);
    for (const n of todo) set(l.seatId, n, (all ?? bestFor(1))?.id ?? null);
  }

  assignments.sort((a, b) => a.seatId - b.seatId || a.n - b.n);
  const wifi = [...wifiOf.values()].reduce((x, y) => x + y, 0);
  const seatRows = new Set(hotspots.filter((h) => ownerSeat(h) !== null).map((h) => h.id));
  const onPhones = assignments.filter((a) => a.hotspot && seatRows.has(a.hotspot)).length;
  const rest = wifi - onPhones;
  const need = neededHotspots(rest);
  return {
    assignments,
    groups,
    wifi,
    onPhones,
    rest,
    need,
    have: pengawas.length,
    short: pengawas.length < need,
    unplaced: assignments.filter((a) => !a.hotspot).length,
  };
}

export type MoveCheck = { ok: true } | { ok: false; kode: "penuh" | "tanpa_wifi" | "tidak_ada" };

/** Whether the Master may move a board to a hotspot: it exists, the board needs Wi-Fi, a place is free. */
export function canMoveBoard(
  plan: HotspotPlan,
  hotspots: readonly Row[],
  loans: readonly SeatLoan[],
  seatId: number,
  n: number,
  toId: string,
): MoveCheck {
  if (!hotspots.some((h) => h.id === toId)) return { ok: false, kode: "tidak_ada" };
  const l = loans.find((x) => x.seatId === seatId);
  if (!l || n > wifiBoards(l) || !l.boards.some((b) => b.n === n))
    return { ok: false, kode: "tanpa_wifi" };
  if (plan.assignments.find((a) => a.seatId === seatId && a.n === n)?.hotspot === toId)
    return { ok: true };
  const g = plan.groups[toId];
  return g && g.cap - g.used > 0 ? { ok: true } : { ok: false, kode: "penuh" };
}

const KONTROL = /[\u0000-\u001f\u007f]/;
const bytes = (t: string) => new TextEncoder().encode(t).length;

/** An SSID of 1 to 32 bytes and, when one is sent, a password of 8 to 63; no control characters. */
export function validHotspot(ssid: string, pass: string | undefined): FieldError[] {
  const errs: FieldError[] = [];
  if (typeof ssid !== "string" || !ssid.trim() || bytes(ssid) > 32 || KONTROL.test(ssid))
    errs.push({ field: "ssid", kode: "ssid_salah" });
  if (
    pass !== undefined &&
    (typeof pass !== "string" || bytes(pass) < 8 || bytes(pass) > 63 || KONTROL.test(pass))
  )
    errs.push({ field: "pass", kode: "sandi_salah" });
  return errs;
}

/** A hotspot as the console and the room setup see it: never the password. */
export function toView(h: RoomHotspot): HotspotView {
  const { pass, ...rest } = h;
  return { ...rest, hasPass: pass !== "" };
}
