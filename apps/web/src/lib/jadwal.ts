/**
 * The practicum's fixed daily schedule — shared between server (session
 * creation, auto-end at the cap) and client (the slot picker, the banner's
 * countdown), so the two can never silently disagree about either number.
 *
 * Four sessions a day, three hours apart starting 06:30, each cleared
 * after 165 minutes. `sesi.slot` stores which of the four a session
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

export const SESI_CAP_MENIT = 165;
export const SESI_CAP_DETIK = SESI_CAP_MENIT * 60;

export function slotToMulai(slot: number): string | null {
  return SLOT_MULAI[slot] ?? null;
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
