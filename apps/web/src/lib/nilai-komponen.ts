/** Stage 12's grading components, matching the real Seelabs "Input Nilai
 *  Praktikum" form's own column order exactly (its own legend: TP=Tugas
 *  Pendahuluan, TA=Tugas Awal, D1-D4=aktivitas selama modul, L1-L2=Laporan).
 *  Kept separate from schema.ts (which imports this, not the other way
 *  round) so client code -- the grading tab, the Seelabs helper generator --
 *  never needs to import schema.ts and pull drizzle-orm/pg-core into the
 *  browser bundle, the same separation blanks.ts already keeps from
 *  answer-keys.ts. */
export const NILAI_KOMPONEN = ["TP", "TA", "D1", "D2", "D3", "D4", "L1", "L2"] as const;
export type NilaiKomponen = (typeof NILAI_KOMPONEN)[number];
