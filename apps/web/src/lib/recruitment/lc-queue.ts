/**
 * The compile queue as a seat sees it (EXAM-ENGINE 9.4, 11.3 item 4): its
 * place in line, the chips of seat numbers, and the typical compile time.
 * Pure.
 */
import type { JobStatus, QueueChip } from "./lc-types.js";

export interface QueueJob {
  id: number;
  seatId: number | null;
  board: 1 | 2;
  status: JobStatus;
  requestedAt: number;
}

const order = (a: QueueJob, b: QueueJob) => a.requestedAt - b.requestedAt || a.id - b.id;

/** The median `ms` of the last 20 successful jobs (newest first), null before there are 3. */
export function typicalMs(successful: readonly number[]): number | null {
  const last = successful.slice(0, 20);
  if (last.length < 3) return null;
  const s = [...last].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** 1-based place among the waiting jobs, 0 while it compiles, null when it is not in the queue. */
export function positionOf(queue: readonly QueueJob[], id: number): number | null {
  const job = queue.find((j) => j.id === id);
  if (!job || (job.status !== "antre" && job.status !== "diambil")) return null;
  if (job.status === "diambil") return 0;
  return (
    queue
      .filter((j) => j.status === "antre")
      .sort(order)
      .findIndex((j) => j.id === id) + 1
  );
}

/** Seat numbers only, in line order, running ones first among equals; warm-up jobs have no seat. */
export function queueChips(
  queue: readonly QueueJob[],
  numbers: ReadonlyMap<number, number>,
  mySeatId: number,
): QueueChip[] {
  const out: QueueChip[] = [];
  for (const j of [...queue].sort(order)) {
    if (j.seatId === null || (j.status !== "antre" && j.status !== "diambil")) continue;
    const seat = numbers.get(j.seatId);
    if (seat === undefined) continue;
    out.push({ seat, board: j.board, state: j.status, mine: j.seatId === mySeatId });
  }
  return out;
}
