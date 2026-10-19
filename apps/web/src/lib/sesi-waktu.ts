/**
 * The Praktikan session row (Phase 21, f2) draws the time gone as its own
 * underline instead of a meter and "x of 150 minutes".
 */

/** The part of a session gone, 0 to 1: empty without a start or a length. */
export function porsiSesi(mulaiPada: string | null, durasiMenit: number, now: number): number {
  const t = mulaiPada ? Date.parse(mulaiPada) : NaN;
  if (Number.isNaN(t) || !(durasiMenit > 0)) return 0;
  return Math.min(1, Math.max(0, (now - t) / (durasiMenit * 60_000)));
}
