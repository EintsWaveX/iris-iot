/**
 * Mode Latihan (Practice Mode), the pure parts. Practice is a second edition
 * (status "latihan") that only a signed in Asisten reaches, through the
 * `iris_latihan` cookie: every recruitment request then reads and writes that
 * edition instead of the live one. The cookie says which side they act as:
 * Asisten (full Panitia rights on the practice edition) or CaAs (their own NIM
 * is a sample CaAs there). Real candidates, scores and envelopes are never
 * touched, and real CaAs never see the practice edition.
 */

import type { Biodata, StageKey } from "./types.js";

export const LATIHAN_COOKIE = "iris_latihan";
export const LATIHAN_MODES = ["asisten", "caas"] as const;
export type LatihanMode = (typeof LATIHAN_MODES)[number];

/** The practice edition's year is the live one's plus this, so `rec_edition.year` stays unique. */
export const LATIHAN_YEAR_GESER = 1000;

export const latihanTahun = (liveYear: number): number => liveYear + LATIHAN_YEAR_GESER;

export function bacaModeLatihan(v: unknown): LatihanMode | null {
  return (LATIHAN_MODES as readonly unknown[]).includes(v) ? (v as LatihanMode) : null;
}

const HARI = 86_400_000;

/** Whole days from a to b, both YYYY-MM-DD (UTC arithmetic, so no clock change skews it). */
export function selisihHari(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / HARI);
}

/** A YYYY-MM-DD moved by whole days. */
export function geserTanggal(iso: string, hari: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + hari * HARI).toISOString().slice(0, 10);
}

/**
 * The stage the calendar is at on `hariIni` (YYYY-MM-DD): the stage of the earliest public event that has
 * not ended yet; once every event is over, the last stage on the calendar; with no stages at all, Berkas.
 * A practice CaAs starts here, so a fresh practice stands where the real Oprec stands (or where the practice
 * calendar was jumped to), not always at the first stage.
 */
export function tahapHariIni(
  acara: readonly { stage: StageKey | null; internal: boolean; startsOn: string; endsOn: string }[],
  hariIni: string,
): StageKey {
  const publik = acara
    .filter((e) => e.stage && !e.internal)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.endsOn.localeCompare(b.endsOn));
  const jalan = publik.find((e) => e.endsOn >= hariIni);
  return (jalan ?? publik[publik.length - 1])?.stage ?? "berkas";
}

/**
 * A believable biodata for a sample CaAs, worked out from the NIM so it never changes between resets:
 * the entry year and class follow the NIM, the phone and Line id are made up but shaped like real ones.
 */
export function contohBiodata(nim: string, nama: string): Biodata {
  const digits = nim.replace(/\D/g, "");
  const n = Number(digits.slice(-4)) || 0;
  // A NIM reads faculty and program first, then the entry year: 1301220001 entered in 2022
  const tahun = Number(`20${digits.slice(4, 6)}`);
  return {
    angkatan: tahun >= 2015 && tahun <= 2035 ? tahun : 2025,
    kelas: `TT-${String(44 + (n % 8)).padStart(2, "0")}-${String(1 + (n % 6)).padStart(2, "0")}`,
    phone: `0812${String(10_000_000 + ((n * 7919) % 89_999_999)).padStart(8, "0")}`,
    lineId:
      nama
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.|\.$/g, "") || "latihan",
  };
}

/** The cookie the server sets (readable by the page, which only uses it to draw the bar). */
export function cookieLatihan(mode: LatihanMode | null): string {
  return mode
    ? `${LATIHAN_COOKIE}=${mode}; Path=/; Secure; SameSite=Lax; Max-Age=${12 * 3600}`
    : `${LATIHAN_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`;
}

/** What the page reads from document.cookie. */
export function modeDariCookie(cookie: string): LatihanMode | null {
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${LATIHAN_COOKIE}=([^;]*)`));
  return m ? bacaModeLatihan(m[1]) : null;
}

/** The sample CaAs' name list on the card: how many Asisten become a sample CaAs. */
export interface LatihanRingkas {
  /** The mode this browser is in, or null when practice is off for them */
  mode: LatihanMode | null;
  /** The practice edition exists */
  siap: boolean;
  /** Sample CaAs in it (one per Asisten who was active at the last reset) */
  caas: number;
  /** Asisten who may practice (everyone active) */
  asisten: number;
}
