/**
 * Shapes the exam room stores and shows beyond the pure modules (11 owns
 * them; 10 and 12 import them): the boards on loan, the phone hotspots of
 * EXAM-ENGINE 9.6a and a seat's check-in. Browser safe, types only.
 */

/** One board lent to a seat (9.3a): DevKit V1 or ESP32-S3. */
export interface KitBoard {
  n: 1 | 2;
  chip: "esp32" | "esp32s3";
  code?: string;
}

/**
 * Whose a hotspot is: a Panitia member's code (the pengawas fallback) or a
 * candidate's seat (`{ seat: seatId }`, their own phone).
 */
export type HotspotOwner = string | { seat: number };

/**
 * A phone hotspot as stored. `pass` is sealed with rahasia.ts and never
 * leaves the server; `by` says who typed a seat's row (a candidate's SSID is
 * read only in the room setup). A seat row's `cap` is computed from the
 * seat's Wi-Fi boards, so the stored one only counts for the pengawas rows.
 */
export interface RoomHotspot {
  id: string;
  owner: HotspotOwner;
  ssid: string;
  pass: string;
  cap: number;
  by?: "cand" | "master";
}

/** A hotspot as the console and the room setup see it: no password, ever. */
export type HotspotView = Omit<RoomHotspot, "pass"> & { hasPass: boolean };

/** A seat's three check-in steps (5.5), each the server time it passed. */
export interface SeatCheckin {
  fullscreen?: number;
  connection?: { at: number; rttMs?: number; offsetMs?: number; chromium?: boolean };
  name?: number;
}
