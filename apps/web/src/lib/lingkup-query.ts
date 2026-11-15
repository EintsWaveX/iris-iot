/**
 * Counts the database queries one request makes and how long they take, without passing anything around:
 * the server runs each request inside `dalamLingkup`, the database layer (db.ts) calls `catatQuery` after
 * every query, and the numbers land on that request (server/metrik.ts reads them when it finishes).
 * Outside a request (a script, a test) `catatQuery` does nothing.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** What one request collects while it runs: queries asked and the time they took. */
export interface Lingkup {
  n: number;
  ms: number;
}

const als = new AsyncLocalStorage<Lingkup>();

/** Runs `fn` so every query it makes (and everything it awaits) counts into `lingkup`. */
export function dalamLingkup<T>(lingkup: Lingkup, fn: () => T): T {
  return als.run(lingkup, fn);
}

/** Called by the database layer after each query. A no-op outside a request. */
export function catatQuery(ms: number): void {
  const s = als.getStore();
  if (s) {
    s.n += 1;
    s.ms += ms;
  }
}
