/**
 * The rules for starting a session (Phase 9 Stage 3). Browser-safe: the
 * Console home shows the same window, length and group bounds the server
 * enforces in api/session/index.ts.
 *
 * A scheduled slot may start from its start window before the slot (the
 * slot's own jadwal.jendela_mulai_menit, else the general default) until
 * the slot's end, SESI_CAP_MENIT after its start. A Praktikum Susulan has
 * its own date and time and no window.
 */
import { KELOMPOK_DEFAULT, KELOMPOK_MAKS, SESI_CAP_MENIT, SESI_MIN_MENIT } from "./jadwal.js";

export const JENDELA_DEFAULT = 15;
export const JENDELA_MIN = 5;
export const JENDELA_MAX = 30;

/** "HH:MM" -> minutes after midnight; NaN for anything else. */
export function menitDariJam(jam: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(jam);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** Minutes after midnight -> "HH:MM" (wraps past midnight). */
export function jamDariMenit(menit: number): string {
  const m = ((Math.round(menit) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes after midnight now, on the lab's clock (WIB). */
export function menitSekarangWib(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** A start window in minutes, kept inside the bounds. */
export function jendelaValid(v: unknown, fallback = JENDELA_DEFAULT): number {
  const n = Number(v);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(JENDELA_MAX, Math.max(JENDELA_MIN, n));
}

export interface Jendela {
  /** "HH:MM" the slot opens and closes for starting. */
  buka: string;
  tutup: string;
  /** Where the slot is now: not open yet, open, or past. */
  posisi: "belum" | "buka" | "lewat";
}

/** Where `menitSekarang` stands against a slot starting at `mulai` with a
 *  `jendela`-minute start window. */
export function jendelaSlot(mulai: string, jendela: number, menitSekarang: number): Jendela {
  const m = menitDariJam(mulai);
  const buka = m - jendela;
  const tutup = m + SESI_CAP_MENIT;
  return {
    buka: jamDariMenit(buka),
    tutup: jamDariMenit(tutup),
    posisi: menitSekarang < buka ? "belum" : menitSekarang >= tutup ? "lewat" : "buka",
  };
}

/** Session length from a request: 30 to 150 whole minutes, default 150. */
export function bacaDurasi(v: unknown): number | null {
  if (v === undefined || v === null) return SESI_CAP_MENIT;
  const n = Number(v);
  return Number.isInteger(n) && n >= SESI_MIN_MENIT && n <= SESI_CAP_MENIT ? n : null;
}

/** Group count from a request: 1 to 10, or the fallback when absent. */
export function bacaJumlahKelompok(v: unknown, fallback = KELOMPOK_DEFAULT): number | null {
  if (v === undefined || v === null) return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= KELOMPOK_MAKS ? n : null;
}

/** The shortest a running session may be set to after `berjalan` minutes:
 *  15 minutes from now, never under SESI_MIN_MENIT or over the cap. */
export function durasiPalingPendek(berjalan: number): number {
  return Math.max(SESI_MIN_MENIT, Math.min(Math.ceil(berjalan) + 15, SESI_CAP_MENIT));
}

/** A new length for a running session (Extend), or null. Whole minutes
 *  from durasiPalingPendek up to SESI_CAP_MENIT. */
export function bacaDurasiBaru(v: unknown, berjalan: number): number | null {
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  return n >= durasiPalingPendek(berjalan) && n <= SESI_CAP_MENIT ? n : null;
}
