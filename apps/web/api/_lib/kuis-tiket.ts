/**
 * Single use for the quiz hand-over ticket (src/lib/auth.ts, createKuisTiket).
 * The server is one process, so a map of nonces it has seen is enough; an entry
 * is kept only until its ticket would have expired anyway.
 */
const dipakai = new Map<string, number>();

/** True the first time a nonce is presented, false after. */
export function pakaiTiket(nonce: string, expDetik: number, nowMs = Date.now()): boolean {
  for (const [n, e] of dipakai) if (e < nowMs / 1000) dipakai.delete(n);
  if (dipakai.has(nonce)) return false;
  dipakai.set(nonce, expDetik);
  return true;
}

/** For tests. */
export function lupakanTiket(): void {
  dipakai.clear();
}
