/**
 * What the runner's API hands a candidate (EXAM-ENGINE 10.3, prompt 10):
 * GET test and the answers to the seat's writes. Types only, browser safe.
 * A seat only ever receives its own questions through toView (no key), its
 * own answers, and RoomPublic: no other seat, no Master, no roster.
 */
import type { Lang, PartKey, Phase1Part, Value, View } from "./exam-types.js";
import type { RoomPublic } from "./room-relay.js";
import type { SeatCheckin } from "./room-types.js";

export interface SeatSelf {
  id: number;
  roomId: number;
  rehearsal: boolean;
  checkin: SeatCheckin;
  /** True once all three steps passed */
  checkedIn: boolean;
  /** Parts handed in early, the server time */
  done: Partial<Record<PartKey, number>>;
  /** Extra time in the part running now, ms */
  extraMs: number;
  /** Parts this seat started, with the room each was started in (Susulan) */
  started: Partial<Record<Phase1Part, number>>;
}

/** The room as a seat may know it: the evening, never the roster or the Panitia */
export interface RoomInfo {
  id: number;
  title: string;
  rehearsal: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

/** Tonight's parts for the lobby bar and the rail */
export interface PlanPart {
  key: PartKey;
  minutes: number;
  /** Questions in the part; null for Live Coding */
  count: number | null;
}

export interface QuestionView {
  q: number;
  lang: Lang;
  /** Voided after the draw: the page says so and the question does not count */
  voided: boolean;
  view: View | null;
}

export interface PartView {
  key: Phase1Part;
  items: QuestionView[];
  answers: Record<number, { value: Value; rev: number }>;
}

export interface TestView {
  ok: true;
  /** The server clock when this was made */
  now: number;
  me: { nim: string; nama: string };
  room: RoomPublic | null;
  info: RoomInfo | null;
  seat: SeatSelf | null;
  plan: PlanPart[];
  /** The part to work, or null in the lobby, before the parts and after them */
  part: PartView | null;
  /** The candidate's own phone hotspot, if typed (the password never comes back) */
  hotspot: { ssid: string } | null;
  /** Parts the seat started in another room: closed here (bagian_ruang_lain) */
  closedElsewhere: Phase1Part[];
}

export interface CheckinBody {
  step: "fullscreen" | "connection" | "name";
  tab: string;
  info?: { rttMs?: number; offsetMs?: number; chromium?: boolean };
}
