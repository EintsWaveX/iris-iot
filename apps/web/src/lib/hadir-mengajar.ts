/**
 * The teaching-attendance rule. The clock starts five minutes before the slot
 * (Friday slot 3 at 13:00): a check-in in the first minute is on time, 1 to 10
 * minutes late is cut per minute, 11 or more is Mangkir Mengajar (counted as 10
 * minutes), and never checking in is Mangkir; Izin is never cut.
 * Browser safe: pure functions, no database, no clock of its own.
 */
import { SESI_CAP_MENIT, SESI_MIN_MENIT, SLOT_MULAI } from "./jadwal";
import { hariDariTanggal } from "./jadwal-parser";
import { jamDariMenit, menitDariJam } from "./sesi-mulai";

/** Minutes counted for a Mangkir Mengajar check-in and the latest a Telat can be. */
export const TELAT_MAKS = 10;

export type Potongan = { perMenit: number; maks: number };
export const POTONGAN_AWAL: Potongan = { perMenit: 2000, maks: 10 };

export type StatusHadir = "tepat" | "telat" | "mm" | "mangkir" | "izin";
/** `lepas` = not expected in this session, never judged. */
export type StatusLive = StatusHadir | "belum" | "berjalan" | "lewat" | "lepas";

/** Reads the `potongan_telat` setting; each field falls back on its own. */
export function bacaPotongan(v: unknown): Potongan {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  return {
    perMenit: ok(o.perMenit) ? o.perMenit : POTONGAN_AWAL.perMenit,
    maks: ok(o.maks) ? Math.floor(o.maks) : POTONGAN_AWAL.maks,
  };
}

/** Base clock of a slot in minutes after 00:00: the start minus 5, Friday slot 3 at 13:00. */
export function baseSlot(tanggal: string, slot: number): number {
  if (hariDariTanggal(tanggal) === 5 && slot === 3) return 13 * 60;
  return menitDariJam(SLOT_MULAI[slot]) - 5;
}

/** Base clock of a susulan session: its own start minus 5. */
export function baseSusulan(mulai: string): number {
  return menitDariJam(mulai) - 5;
}

/** A WIB wall-clock minute on a date, as an instant (WIB is UTC+7, no DST). */
export function instanWib(tanggal: string, menit: number): Date {
  return new Date(`${tanggal}T${jamDariMenit(Math.max(0, menit))}:00+07:00`);
}

type Ubah = { status: StatusHadir; menit?: number | null };

/** Status of one Asisten in one session; a PJ override wins over the clock. */
export function hitungHadir(x: {
  hadir: Date | null;
  base: Date;
  izin: boolean;
  diharapkan: boolean;
  selesai: boolean;
  now: Date;
  ubah?: Ubah | null;
}): { status: StatusLive; menit: number | null } {
  if (x.izin) return { status: "izin", menit: null };
  if (!x.diharapkan) return { status: "lepas", menit: null };
  if (x.ubah) {
    const s = x.ubah.status;
    const menit = s === "telat" ? (x.ubah.menit ?? null) : s === "mm" ? TELAT_MAKS : null;
    return { status: s, menit };
  }
  const menitDari = (t: Date) => Math.floor((t.getTime() - x.base.getTime()) / 60000);
  if (x.hadir) {
    const m = menitDari(x.hadir);
    if (m < 1) return { status: "tepat", menit: null };
    if (m <= TELAT_MAKS) return { status: "telat", menit: m };
    return { status: "mm", menit: TELAT_MAKS };
  }
  if (x.selesai) return { status: "mangkir", menit: null };
  const m = menitDari(x.now);
  if (m < 1) return { status: "belum", menit: null };
  if (m <= TELAT_MAKS) return { status: "berjalan", menit: m };
  return { status: "lewat", menit: TELAT_MAKS };
}

/** What a status costs: a money cut, or all of the session's units set to zero. */
export function potonganHadir(
  h: { status: StatusLive; menit: number | null },
  hitungMangkir: boolean,
  p: Potongan,
): { nolkanUnit: boolean; potong: number } {
  if (h.status === "mangkir") return { nolkanUnit: true, potong: 0 };
  if (h.status === "mm") {
    return hitungMangkir
      ? { nolkanUnit: true, potong: 0 }
      : { nolkanUnit: false, potong: p.maks * p.perMenit };
  }
  if (h.status === "telat") {
    const m = Math.min(h.menit ?? 0, p.maks);
    return { nolkanUnit: false, potong: m * p.perMenit };
  }
  return { nolkanUnit: false, potong: 0 };
}

/** Minutes a session may run: until the next slot's base that day, at most 150, at least 30. */
export function akhirSesiMaks(tanggal: string, slot: number | null, mulaiPada: Date): number {
  if (slot === null || slot >= 4) return SESI_CAP_MENIT;
  const berikut = instanWib(tanggal, baseSlot(tanggal, slot + 1));
  const sisa = Math.floor((berikut.getTime() - mulaiPada.getTime()) / 60000);
  return Math.max(SESI_MIN_MENIT, Math.min(SESI_CAP_MENIT, sisa));
}
