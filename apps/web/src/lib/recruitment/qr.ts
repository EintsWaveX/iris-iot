/**
 * Attendance QR, the parts that need no secret (06 build): the rotation and
 * the alphabet of the code a phone can type when it cannot scan. The
 * signing lives on the server (api/_lib/recruitment-attendance.ts).
 *
 * A token is good for its own 20 second period, plus the first 5 seconds of
 * the next one, so a scan that starts as the wall changes still lands (the
 * phone opens the hadir page before it sends the token). A screenshot of the
 * wall is dead 25 seconds at most after the code appeared (user, 2026-10-26).
 */

export const PERIOD_MS = 20_000;

/** How long the code just replaced still counts after the wall moves on. */
export const GRACE_MS = 5_000;

/** No I, L, O, 0 or 1: nothing to mistake when reading the wall aloud. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export const periodAt = (ms: number): number => Math.floor(ms / PERIOD_MS);

/** The instant a period stops being the current one. */
export const periodEnd = (period: number): number => (period + 1) * PERIOD_MS;

/** Periods a scan is accepted in at this moment: now, and the one before during the grace. */
export const acceptedPeriods = (ms: number): number[] => {
  const p = periodAt(ms);
  return ms - p * PERIOD_MS < GRACE_MS ? [p, p - 1] : [p];
};
