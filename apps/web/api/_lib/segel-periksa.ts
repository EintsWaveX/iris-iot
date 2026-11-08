/**
 * Does this machine's key open the SeeLabs seals? A read-only check for the
 * move off Vercel: DATA_KUNCI cannot be read back from Vercel, so before the
 * PC serves anything, `scripts/check-seals.ts` opens every seal in the
 * database with the PC's own DATA_KUNCI and reports how many open. Counts
 * only; the opened text is dropped on the spot and never printed.
 */
import { buka, masihLama } from "./rahasia.js";
import { LABEL_SEGEL } from "./rahasia-putar.js";

export interface HasilPeriksa {
  total: number;
  /** Still wrapped under the session secret (g1). */
  g1: number;
  /** Wrapped under DATA_KUNCI (g2). */
  g2: number;
  /** Opened with the key this process has. */
  terbuka: number;
  /** Did not open: another key, or altered. */
  tertutup: number;
}

export function periksaSegel(rows: { nim: string; segel: string }[]): HasilPeriksa {
  const h: HasilPeriksa = { total: rows.length, g1: 0, g2: 0, terbuka: 0, tertutup: 0 };
  for (const r of rows) {
    if (masihLama(r.segel)) h.g1++;
    else h.g2++;
    if (buka(r.segel, r.nim, LABEL_SEGEL) === null) h.tertutup++;
    else h.terbuka++;
  }
  return h;
}
