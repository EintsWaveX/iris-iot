/**
 * Which modules' practicum history Praktikan may read (ruled 2026-10-06),
 * browser-safe so the server gate (akses.ts statusRiwayat) and the pages
 * share one rule: module N once a later module is open, so nobody who
 * hasn't done N yet can learn it from someone who has; Module 4, the last,
 * only once the practicum is finalized (Selesaikan Praktikum), which opens
 * all four.
 */
export function riwayatTerbuka(terbuka: number[], final: boolean): number[] {
  return [1, 2, 3, 4].filter((n) => final || terbuka.some((m) => m > n));
}
