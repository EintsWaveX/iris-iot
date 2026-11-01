/**
 * Mode Latihan (Practice Mode), the pure parts. Practice is a second edition
 * (status "latihan") that only a signed in Asisten reaches, through the
 * `iris_latihan` cookie: every recruitment request then reads and writes that
 * edition instead of the live one. The cookie says which side they act as:
 * Asisten (full Panitia rights on the practice edition) or CaAs (their own NIM
 * is a sample CaAs there). Real candidates, scores and envelopes are never
 * touched, and real CaAs never see the practice edition.
 */

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
 * How far to move the live calendar so the practice one starts today: the
 * first stage opens now and the rest follow on the same spacing.
 */
export function geseranKalender(startsOn: readonly string[], hariIni: string): number {
  if (startsOn.length === 0) return 0;
  const awal = [...startsOn].sort()[0]!;
  return selisihHari(awal, hariIni);
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
