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
