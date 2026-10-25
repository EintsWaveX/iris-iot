/**
 * The envelope's clock on the candidate's device (06 build, item 3).
 *
 * The page never decides that an envelope exists: the server's `me` answer
 * does, and it only lists a result once now is past reveal_at. This file
 * only works out when to ask again. The countdown uses the server's clock
 * from the last answer plus the time that has elapsed on the device since
 * (a monotonic reading such as performance.now), never Date.now, so a phone
 * set a day ahead neither shows an envelope early nor misses the moment.
 */

/** Longest single timer: browsers cap setTimeout near 2^31 ms; stay well under. */
export const MAX_WAIT_MS = 6 * 3_600_000;

/** Milliseconds until the reveal, by the server's clock. Negative once it has passed. */
export const msUntilReveal = (revealAtMs: number, serverNowMs: number, elapsedMs: number): number =>
  revealAtMs - (serverNowMs + elapsedMs);

/** How long to set the next timer for: the exact remaining time, in pieces for a far reveal. */
export const wakeDelay = (remainingMs: number): number =>
  Math.min(Math.max(0, remainingMs), MAX_WAIT_MS);

/** After the timer fired but the server said not yet (clocks differ by a hair): ask again. */
export const retryDelay = (attempt: number): number => Math.min(5000, 500 * 2 ** attempt);
