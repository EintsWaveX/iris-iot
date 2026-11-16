import { POIN_MAKS } from "./types";

/**
 * A player's final TA score, 0 to 100: their total points over the most the whole quiz could have given
 * (every question at full speed, `POIN_MAKS` each), as a percentage, rounded up.
 * Done in whole numbers (points times 100, then over the maximum) so a clean 60% never turns into 61
 * through floating point error.
 */
export function nilaiTA(skor: number, jumlahSoal: number): number {
  if (!(jumlahSoal > 0) || !(skor > 0)) return 0;
  const persen = Math.ceil((Math.round(skor) * 100) / (jumlahSoal * POIN_MAKS));
  return Math.min(100, Math.max(0, persen));
}
