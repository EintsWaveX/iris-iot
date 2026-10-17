/**
 * The lab's official score rubric (rubrikasi nilai, user ruling 2026-10-17),
 * the rules both sides share. Browser safe.
 *
 * - D1 to D4 and L2 are levels: 0 (did not take part), 45, 65, 80 or 90.
 * - L1 (Jurnal Praktikum) is 0 to 90 and comes from the system: the group's
 *   correct blanks over all blanks times 90, rounded. The Asisten may type
 *   a different value, which then replaces it.
 * - TA (Tugas Awal) and TP are 0 to 100.
 */

export const TINGKAT = [0, 45, 65, 80, 90] as const;
export type Tingkat = (typeof TINGKAT)[number];

/** Components scored by picking a level. */
export const KOMPONEN_TINGKAT: readonly string[] = ["D1", "D2", "D3", "D4", "L2"];

export const adaTingkat = (komponen: string): boolean => KOMPONEN_TINGKAT.includes(komponen);

/** The highest score each component takes. */
const MAKS: Record<string, number> = { TP: 100, TA: 100, L1: 90 };

/** Is `skor` a score this component accepts? */
export function skorSah(komponen: string, skor: number): boolean {
  if (!Number.isInteger(skor)) return false;
  if (adaTingkat(komponen)) return (TINGKAT as readonly number[]).includes(skor);
  const maks = MAKS[komponen];
  return maks !== undefined && skor >= 0 && skor <= maks;
}

/** L1 from the journal: correct blanks over all blanks times 90, whole. */
export function l1Otomatis(benar: number, total: number): number {
  if (!(total > 0) || !(benar > 0)) return 0;
  return Math.min(90, Math.round((benar / total) * 90));
}

/** The L1 everything shows: the stored one, else 0 when Tidak Hadir, else
 *  the computed one. */
export function l1Tampil(
  tersimpan: number | null | undefined,
  absen: boolean,
  otomatis: number,
): number {
  if (tersimpan != null) return tersimpan;
  return absen ? 0 : otomatis;
}
