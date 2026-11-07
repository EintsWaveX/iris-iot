/**
 * How many times a seat has said No to the bonus offer for one part (8 Nov 2026). The offer is made
 * at most BONUS_ASKS times; a reload must not start it over, so the count is kept in this browser.
 * Best effort: where storage is blocked the count lives only until the page closes.
 */
import { BONUS_ASKS } from "../../../lib/recruitment/bonus";

const k = (id: string) => `iris.bonusNo.${id}`;

export function readDeclines(id: string): number {
  try {
    const n = Number(localStorage.getItem(k(id)));
    return Number.isFinite(n) ? Math.max(0, Math.min(BONUS_ASKS, Math.floor(n))) : 0;
  } catch {
    return 0;
  }
}

export function writeDeclines(id: string, n: number): void {
  try {
    localStorage.setItem(k(id), String(n));
  } catch {
    /* blocked storage: the count stays in the page */
  }
}
