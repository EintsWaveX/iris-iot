/**
 * The shapes /api/recruitment answers for the exam rooms and the console
 * (EXAM-ENGINE 10.3, prompt 11). Types only, shared by the API and the pages.
 */
import type { ExamConfig, Lang, PartKey, RoomState, RoomViewName } from "./exam-types.js";
import type { HotspotPlan } from "./hotspot.js";
import type { HotspotView, KitBoard, SeatCheckin } from "./room-types.js";

export interface RoomSlotInfo {
  id: number;
  room: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
}

/** One line of the room list. */
export interface RoomRow {
  id: number;
  title: string;
  rehearsal: boolean;
  slot: RoomSlotInfo | null;
  view: RoomViewName;
  part: PartKey | null;
  /** Candidates assigned to it */
  seats: number;
  /** Seats that passed all three check-in steps */
  checkedIn: number;
  master: { nim: string; nama: string; kode: string } | null;
  pengawas: { nim: string; nama: string; kode: string }[];
  /** The caller is one of its pengawas */
  mine: boolean;
}

/** An evening slot that has no room yet (Plotting made it, nobody set the room up). */
export interface PendingSlot extends RoomSlotInfo {
  seats: number;
}

export interface RoomsResponse {
  ok: true;
  now: number;
  rooms: RoomRow[];
  /** Only for a caller who may set rooms up */
  pending: PendingSlot[];
  canSetup: boolean;
  /** The Asisten a pengawas can be picked from; only for those who set rooms up */
  people?: { nim: string; nama: string; kode: string }[];
}

export interface ConsoleKejadian {
  id: string;
  part: PartKey;
  kinds: string[];
  at: number;
  backAt: number | null;
}

export interface ConsoleSeat {
  candidateId: number;
  /** null until the candidate's first check-in step */
  seatId: number | null;
  /** The seat's number in the room: the candidate's place in NIM order */
  no: number;
  nim: string;
  nama: string;
  checkin: SeatCheckin;
  checkedIn: boolean;
  /** Parts handed in early (Kumpulkan) */
  done: Partial<Record<PartKey, number>>;
  /** Answers saved in the running part, of the questions drawn */
  answered: number;
  total: number;
  /** Extra time on the running part, ms */
  extraMs: number;
  count: number;
  awayMs: number;
  /** The seat is out now: since when (server ms) */
  outSince: number | null;
  kejadian: ConsoleKejadian[];
  kit: { code: string; boards: KitBoard[]; returnedAt: number | null } | null;
  lastSeenAt: number | null;
  /** Signed in for the evening (QR or by hand); null when the room has no event to count against */
  present: { via: "qr" | "manual"; by: string | null; reason: string | null } | null;
}

export interface ConsoleNote {
  candidateId: number;
  authorNim: string;
  authorNama: string;
  text: string;
  at: number;
  mine: boolean;
}

export interface ConsolePerson {
  nim: string;
  nama: string;
  kode: string;
  /** May press Jadi Master */
  canBeMaster: boolean;
}

export interface PoolCount {
  lang: Lang;
  shown: number;
  ready: number;
}

export interface ConsoleView {
  ok: true;
  now: number;
  room: {
    id: number;
    title: string;
    rehearsal: boolean;
    slot: RoomSlotInfo | null;
    isToday: boolean;
    /** The evening's event, the one a sign-in counts against (null for a practice room) */
    eventId: number | null;
  };
  state: RoomState;
  view: RoomViewName;
  part: PartKey | null;
  config: ExamConfig;
  budget: {
    elapsedMs: number;
    plannedLeftMs: number;
    projectedMs: number;
    budgetMs: number;
    overMs: number;
    segments: { part: PartKey; start: number; end: number | null }[];
  };
  /** Per part: what the bank has ready against what a room draws (the Start guard) */
  pool: Partial<Record<PartKey, { ok: boolean; counts: PoolCount[] }>>;
  seats: ConsoleSeat[];
  notes: ConsoleNote[];
  master: { nim: string; nama: string; kode: string; since: number; stale: boolean } | null;
  ask: { nim: string; nama: string; kode: string; at: number } | null;
  pengawas: ConsolePerson[];
  hotspots: HotspotView[];
  plan: HotspotPlan;
  me: {
    nim: string;
    isMaster: boolean;
    canBeMaster: boolean;
    isPengawas: boolean;
    canSetup: boolean;
    canKit: boolean;
    canMove: boolean;
  };
}

export interface RoomLogLine {
  id: number;
  at: number;
  who: string;
  nama: string;
  act: string;
  params: unknown;
  seq: number | null;
}

/** The fixed reasons for a Live Coding re-roll (EXAM-ENGINE 11.3); the page shows them in words. */
export const REROLL_REASONS = [
  "kit_rusak",
  "papan_tidak_cocok",
  "topik_terlalu_mirip",
  "lainnya",
] as const;
export type RerollReason = (typeof REROLL_REASONS)[number];

/** A seat never hears more than this: what changed for it. */
export interface KursiPesan {
  seq: number;
  extraMs?: number;
  done?: Partial<Record<PartKey, number>>;
  moved?: boolean;
  reroll?: { what: "topic" | "protocol"; reason: RerollReason };
  /** Live Coding changed for this seat (a hotspot moved, a re-roll): ask `lc` again */
  lc?: true;
  /** A check-in step passed (for the console's dots) */
  checkin?: SeatCheckin;
}
