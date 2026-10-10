/**
 * The practicum's fixed daily schedule — shared between server (session
 * creation, auto-end at the cap) and client (the slot picker, the banner's
 * countdown), so the two can never silently disagree about either number.
 *
 * Four sessions a day, three hours apart starting 06:30, each cleared
 * after 150 minutes. `sesi.slot` stores which of the four a session
 * occupies; SLOT_MULAI is the only place that maps a slot number to its
 * clock time, so a schedule change is a one-line edit here rather than a
 * hunt through every place a time string got typed by hand.
 */
export const SLOT_MULAI: Record<number, string> = {
  1: "06:30",
  2: "09:30",
  3: "12:30",
  4: "15:30",
};

/** The longest a session may run (Phase 9: each session sets its own
 *  length, `sesi.durasi_menit`, from SESI_MIN_MENIT up to this; 150 leaves
 *  30 minutes before the next slot). Resume works until this much time
 *  has passed since the start. */
export const SESI_CAP_MENIT = 150;
export const SESI_CAP_DETIK = SESI_CAP_MENIT * 60;
export const SESI_MIN_MENIT = 30;

/** Groups per session (Phase 9: 1 to 10, set per slot in Preparation). */
export const KELOMPOK_MAKS = 10;
export const KELOMPOK_DEFAULT = 5;

/** A session's own length in minutes, kept inside the bounds. */
/** When a running session's time is up (ms), or null before it started */
export function akhirSesiPada(row: {
  mulaiPada?: string | Date | null;
  durasiMenit?: number | null;
}): number | null {
  if (!row.mulaiPada) return null;
  const t = new Date(row.mulaiPada).getTime();
  return Number.isNaN(t) ? null : t + durasiSesi(row) * 60_000;
}

export function durasiSesi(row: { durasiMenit?: number | null }): number {
  const d = row.durasiMenit ?? SESI_CAP_MENIT;
  return Math.min(SESI_CAP_MENIT, Math.max(SESI_MIN_MENIT, d));
}

export function slotToMulai(slot: number): string | null {
  return SLOT_MULAI[slot] ?? null;
}

/**
 * The hunt's session id for a Module 4 Praktikum Susulan (no slot of its
 * own): the slot whose start is nearest its own start, among the ids no
 * regular Module 4 session uses that day. The hunt knows four sessions a
 * day by slot id, so a susulan borrows a free one. Null when all four are
 * taken.
 */
export function idHuntSusulan(mulai: string, dipakai: ReadonlySet<number>): number | null {
  const menit = (hm: string) => {
    const [h, m] = hm.split(":").map(Number);
    return h * 60 + m;
  };
  const target = menit(mulai);
  let best: number | null = null;
  for (const [k, v] of Object.entries(SLOT_MULAI)) {
    const id = Number(k);
    if (dipakai.has(id)) continue;
    if (best === null || Math.abs(menit(v) - target) < Math.abs(menit(SLOT_MULAI[best]) - target)) {
      best = id;
    }
  }
  return best;
}

/**
 * Today's date as "YYYY-MM-DD" in the lab's own timezone (WIB, UTC+7,
 * matching `sesi.tanggal`'s convention) -- never the server's, since Vercel
 * runs serverless functions in UTC and a naive `new Date()` split would name
 * the wrong day for several hours around each UTC midnight (07:00-06:59
 * WIB). `Intl.DateTimeFormat` rather than manual +7 arithmetic because
 * Indonesia has no DST to get wrong either way, but the intent reads clearly
 * as "Jakarta's calendar day" rather than a magic offset.
 */
export function hariIniWib(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
