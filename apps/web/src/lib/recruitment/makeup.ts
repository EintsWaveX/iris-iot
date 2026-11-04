/**
 * Susulan of Wawancara, Mengajar and Tes Tulis (R4, R6): where a CaAs stands in the
 * offer. Pure, so the Papan, the CaAs page and Penilaian all read the same
 * answer. The row (rec_makeup) only says what was last answered; whether the
 * deadline passed and whether the CaAs sits in the Susulan are worked out here
 * from the clock and the slot.
 */

export const MAKEUP_STAGES = ["wawancara", "mengajar", "tes_tulis"] as const;
export type MakeupStage = (typeof MAKEUP_STAGES)[number];
export const isMakeupStage = (v: unknown): v is MakeupStage =>
  (MAKEUP_STAGES as readonly unknown[]).includes(v);

/**
 * tunggu: the sheet says Susulan and Panitia have not offered it yet.
 * tawar: offered, no answer. ya: wants it, no seat yet. ditempatkan: has a seat
 * in the Susulan. mundur: declined, or nobody answered by the deadline.
 */
export const MAKEUP_STATES = ["tunggu", "tawar", "ya", "ditempatkan", "mundur"] as const;
export type MakeupState = (typeof MAKEUP_STATES)[number];

/** Channels a Panitia can record an answer through; "web" is the CaAs's own page. */
export const ANSWER_VIA = ["line", "wa", "telp", "langsung", "lain"] as const;
export type AnswerVia = (typeof ANSWER_VIA)[number];
export const isAnswerVia = (v: unknown): v is AnswerVia =>
  (ANSWER_VIA as readonly unknown[]).includes(v);

/** A note explaining a decline or a reinstatement has to say something. */
export const NOTE_MIN = 8;

/** The answer is due `days` before the Susulan day at `hour` WIB (UTC+7). */
export function makeupDeadline(day: string, days: number, hour: number): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days, hour - 7));
}

export interface MakeupRowLike {
  status: "tawar" | "ya" | "mundur";
}

export interface MakeupInput {
  /** Null while nobody offered it */
  row: MakeupRowLike | null;
  /** The CaAs holds a seat in a slot on the Susulan day */
  placed: boolean;
  /** Null when the stage has no Susulan day in the calendar */
  deadline: Date | null;
  now: Date;
}

export interface MakeupStanding {
  state: MakeupState;
  /** Withdrawn only because the deadline passed without an answer */
  unanswered: boolean;
}

export function makeupState(i: MakeupInput): MakeupStanding {
  if (i.row?.status === "mundur") return { state: "mundur", unanswered: false };
  if (i.placed) return { state: "ditempatkan", unanswered: false };
  if (!i.row) return { state: "tunggu", unanswered: false };
  if (i.row.status === "ya") return { state: "ya", unanswered: false };
  if (i.deadline && i.now.getTime() >= i.deadline.getTime())
    return { state: "mundur", unanswered: true };
  return { state: "tawar", unanswered: false };
}

/** Can the CaAs still answer on their own page? Only while offered and before the deadline. */
export const canAnswer = (s: MakeupStanding): boolean => s.state === "tawar";

export interface RecordInput {
  /** What Panitia heard from the CaAs, or "pulihkan" to bring back a withdrawn one */
  ans: "ikut" | "tidak" | "pulihkan";
  state: MakeupState;
  via: unknown;
  note: unknown;
}

export type RecordCheck =
  | { ok: true; status: "ya" | "mundur"; via: AnswerVia; note: string }
  | { ok: false; field: "ans" | "via" | "note" };

/**
 * What Panitia may write on a CaAs's behalf. Catat Jawaban and Ubah Jawaban
 * need the CaAs to have been offered; Pulihkan needs them withdrawn. A decline
 * and a reinstatement have to carry a note.
 */
export function checkRecord(i: RecordInput): RecordCheck {
  if (i.ans === "pulihkan") {
    if (i.state !== "mundur") return { ok: false, field: "ans" };
  } else if (i.ans === "ikut" || i.ans === "tidak") {
    if (i.state === "tunggu" || i.state === "mundur") return { ok: false, field: "ans" };
  } else return { ok: false, field: "ans" };
  if (!isAnswerVia(i.via)) return { ok: false, field: "via" };
  const note = typeof i.note === "string" ? i.note.trim() : "";
  if (i.ans !== "ikut" && note.length < NOTE_MIN) return { ok: false, field: "note" };
  if (note.length > 500) return { ok: false, field: "note" };
  return { ok: true, status: i.ans === "tidak" ? "mundur" : "ya", via: i.via, note };
}

/**
 * Tes Tulis: did a CaAs with a seat in a real room not come? Only once the
 * room has finished, and only when they have no seat at all, or a seat that
 * never checked in and was never dealt a question.
 */
export function tulisTidakHadir(i: {
  roomFinished: boolean;
  seat: { checkin: object | null; draw: object | null } | null;
}): boolean {
  if (!i.roomFinished) return false;
  if (!i.seat) return true;
  return (
    Object.keys(i.seat.checkin ?? {}).length === 0 && Object.keys(i.seat.draw ?? {}).length === 0
  );
}
