/**
 * Small telemetry summaries for the console board (Phase 9): a row's
 * one-way delay from its send and receive stamps, and the share of
 * messages missing from a group's seq range.
 */

/** "HH:MM:SS:mmm" receive minus send, in ms (across midnight too), or null. */
export function selisihJamMs(tx: string | null, rx: string | null): number | null {
  const ms = (t: string | null) => {
    const m = t ? /^(\d{2}):(\d{2}):(\d{2}):(\d{3})$/.exec(t) : null;
    return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4] : null;
  };
  const a = ms(tx);
  const b = ms(rx);
  if (a === null || b === null) return null;
  const d = b - a;
  const out = d < -43_200_000 ? d + 86_400_000 : d;
  return out >= 0 && out < 60_000 ? out : null;
}

/** Share of messages missing from the seq range that arrived, in percent. */
export function hilangPersen(seqs: number[]): number | null {
  if (seqs.length < 2) return null;
  const unik = new Set(seqs);
  const lo = Math.min(...unik);
  const hi = Math.max(...unik);
  const harap = hi - lo + 1;
  if (harap <= 0 || harap > 1_000_000) return null;
  return Math.round(((harap - unik.size) / harap) * 1000) / 10;
}
