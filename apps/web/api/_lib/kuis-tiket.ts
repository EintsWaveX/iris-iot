/**
 * Single use for the quiz hand-over ticket (src/lib/auth.ts, createKuisTiket). The server may run as several
 * workers, so "seen before" is asked of `pakaiSekali` (api/_lib/bersama.ts), which they all share; an entry is
 * kept until its ticket would have expired anyway (and a minute more).
 */
import { lupakanBersama, pakaiSekali } from "./bersama.js";

/** True the first time a nonce is presented, false after. */
export function pakaiTiket(nonce: string, expDetik: number, nowMs = Date.now()): Promise<boolean> {
  return pakaiSekali(`kuis:${nonce}`, Math.max(0, expDetik * 1000 - nowMs) + 60_000, nowMs);
}

/** For tests. */
export function lupakanTiket(): void {
  lupakanBersama();
}
