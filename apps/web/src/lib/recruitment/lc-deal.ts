/**
 * The Live Coding deal (EXAM-ENGINE 3.4, 9.1). Topics are dealt like cards
 * from the room's seed, the protocol goes to the least used one the topic
 * fits, and a re-roll never repeats what the seat has. The API owns the
 * counters; these are the choices. Pure.
 */
import type { Protocol } from "./exam-types.js";
import { pickProtocol, topicAt } from "./draw.js";

export const dealTopic = topicAt;

/** The next card after `k` that differs from `current`; `used` is how many cards it took. */
export function rerollTopic(
  seed: string,
  ready: readonly number[],
  k: number,
  current: number | null,
): { topicId: number; used: number } {
  const distinct = new Set(ready).size;
  for (let i = 0; i < Math.max(distinct, 1) * 2; i++) {
    const topicId = topicAt(seed, ready, k + i);
    if (topicId !== current || distinct <= 1) return { topicId, used: i + 1 };
  }
  return { topicId: topicAt(seed, ready, k), used: 1 };
}

/** The protocols a topic can use here: its fits, limited to what the edition enables. */
function open(fits: readonly Protocol[], enabled: readonly Protocol[]): Protocol[] {
  const both = fits.filter((p) => enabled.includes(p));
  return both.length ? both : [...enabled];
}

export function dealProtocol(
  fits: readonly Protocol[],
  enabled: readonly Protocol[],
  used: Partial<Record<Protocol, number>>,
  seed: string,
  k: number,
): Protocol {
  return pickProtocol(open(fits, enabled), used, seed, k);
}

/** Another protocol than `current`, if any fits. */
export function rerollProtocol(
  current: Protocol,
  fits: readonly Protocol[],
  enabled: readonly Protocol[],
  used: Partial<Record<Protocol, number>>,
  seed: string,
  k: number,
): Protocol {
  return pickProtocol(open(fits, enabled), used, seed, k, current);
}
