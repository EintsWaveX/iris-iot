import { POIN_MAKS } from "./types.js";

/**
 * A player's final TA score, 0 to 100. It is mostly about being right: each right answer is worth 80 and
 * answering fast adds up to 20 more (the same speed curve as the live points, left out of the streak
 * bonus). A wrong or empty answer is worth 0. The sum is divided by the number of questions and rounded up.
 *
 * Everything here is whole numbers ("units": 4000 for a right answer at the last moment, 5000 for an
 * instant one, so 50 units = 1 point of TA per question) so a clean 80 never turns into 81 through
 * floating point error.
 */
const UNIT_BENAR = 4000;
const UNIT_CEPAT = 1000;
/** Units of TA one question can give at most, and units per TA point per question. */
const UNIT_PER_NILAI = 50;

/** The TA units one right answer is worth, from the live points it scored (half to full speed points). */
export function unitTA(poin: number): number {
  const separuh = POIN_MAKS / 2;
  const p = Math.min(POIN_MAKS, Math.max(separuh, Math.round(poin)));
  return UNIT_BENAR + Math.round(((p - separuh) / separuh) * UNIT_CEPAT);
}

/** TA score, 0 to 100, from a player's summed units and the number of questions played. */
export function nilaiTA(unit: number, jumlahSoal: number): number {
  if (!(jumlahSoal > 0) || !(unit > 0)) return 0;
  const nilai = Math.ceil(Math.round(unit) / (jumlahSoal * UNIT_PER_NILAI));
  return Math.min(100, Math.max(0, nilai));
}
