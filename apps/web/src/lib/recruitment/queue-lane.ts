/**
 * The Live Coding queue as a row of squares (livecode/QueueLane.tsx): one square per job in the judge's
 * queue, the front of the queue on the left, and the seat's own job a marker that slides left as the jobs
 * ahead finish. The row is capped so a long queue stays small; the jobs that do not fit are a count ("+3").
 */
export const LANE_MAX = 7;

export interface Lane {
  /** Squares drawn, from 1 up to LANE_MAX */
  slots: number;
  /** The square (1 is the front) the seat's own job is in */
  me: number;
  /** Jobs ahead of the seat that do not fit in the row */
  hidden: number;
}

/**
 * `position` counts from 1 (the job being judged is 1); `total` is every job waiting or being judged,
 * or null when the server did not say. The row never shows fewer jobs than the seat's own place.
 */
export function laneOf(position: number | null, total: number | null, max = LANE_MAX): Lane | null {
  if (position === null || !Number.isInteger(position) || position < 1) return null;
  const all = Math.max(position, total ?? position);
  const slots = Math.min(all, max);
  const me = Math.min(position, slots);
  return { slots, me, hidden: position - me };
}
