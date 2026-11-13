/**
 * The Module 4 quiz game ("Kuis", games.irisiotlab.com): a Kahoot-style live
 * game made from the Tes Awal (pre-test) questions. Shared by the server room
 * (server/kuis.ts) and the browser (components/kuis), so it stays free of
 * node and DOM imports.
 */
import type { BahasaKonten } from "../kelas.js";

/** The five Tes Awal types (Tipe A to E) of Module 4. */
export const TIPE_SOAL = ["A", "B", "C", "D", "E"] as const;
export type TipeSoal = (typeof TIPE_SOAL)[number];

/** One question. `pilihan` has 4 answers, or 2 for a Benar/Salah question. */
export interface SoalKuis {
  id: string;
  tipe: TipeSoal;
  nomor: number;
  /** Index into `pilihan` of the right answer. */
  benar: number;
  teks: Record<BahasaKonten, string>;
  pilihan: Record<BahasaKonten, readonly string[]>;
  /** The answer key's own words, shown after the reveal. */
  penjelasan: Record<BahasaKonten, string>;
}

/** The question as a player may see it: nothing about the right answer. */
export interface SoalPublik {
  id: string;
  tipe: TipeSoal;
  nomor: number;
  teks: string;
  pilihan: readonly string[];
}

/** The phases of one game, in order. */
export type Fase = "lobi" | "hitung" | "soal" | "buka" | "papan" | "podium";

/** What the host picks before pressing Mulai. */
export interface PengaturanKuis {
  /** "semua" = every question, or one Tipe. */
  sumber: "semua" | TipeSoal;
  /** How many questions to play (capped at what the source holds). */
  jumlah: number;
  /** Seconds to answer one question. */
  detik: number;
  /** Shuffle the question order. */
  acak: boolean;
}

export const BATAS_DETIK = { min: 10, max: 60 } as const;
export const PENGATURAN_AWAL: PengaturanKuis = {
  sumber: "semua",
  jumlah: 15,
  detik: 20,
  acak: true,
};

/** Points: Kahoot-style speed score plus a streak bonus. */
export const POIN_MAKS = 1000;
export const BONUS_STREAK = 100;
export const BONUS_STREAK_MAKS = 300;
export const MAKS_PEMAIN = 120;

/**
 * How many questions the bank holds, for the host's pickers. The browser must
 * never import the bank itself (it holds the right answers), so the sizes live
 * here and __tests__/kuis-soal.test.ts keeps them equal to the bank.
 */
export const JUMLAH_BANK = 25;
export const JUMLAH_PER_TIPE = 5;
