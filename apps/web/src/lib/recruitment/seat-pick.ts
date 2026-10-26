/**
 * Which of a candidate's seats the runner serves (EXAM-ENGINE 5.5): a
 * candidate can have a real seat and a practice one. The seat whose room is
 * open now wins; with both or neither open the real seat does.
 */
import type { RoomState } from "./exam-types.js";

const OPEN: ReadonlySet<RoomState["stage"]> = new Set(["prep", "parts", "spin"]);

export function pickSeat<T extends { roomId: number; rehearsal: boolean }>(
  seats: readonly T[],
  stageOf: (roomId: number) => RoomState["stage"],
): T | null {
  if (!seats.length) return null;
  const open = seats.filter((s) => OPEN.has(stageOf(s.roomId)));
  const pool = open.length ? open : seats;
  return pool.find((s) => !s.rehearsal) ?? pool[0];
}
