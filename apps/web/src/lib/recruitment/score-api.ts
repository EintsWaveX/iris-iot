/**
 * What the score actions send and receive (EXAM-ENGINE 4 and 10.3, prompt
 * 13): shared by api/_lib/recruitment-score.ts, the Cutting board and the
 * Penilaian tab. Types only, browser safe. Nothing here is ever sent to a
 * candidate: every score action needs an Asisten session.
 */
import type { Caps } from "./exam-config.js";
import type { Phase1Part } from "./exam-types.js";

/** `absent`: the seat never opened the part. `empty`: it did, but every question it drew was voided. */
export type PartFlag = "absent" | "empty";

export interface PartScore {
  score: number;
  flag?: PartFlag;
}

/**
 * Live Coding of one seat. `belum`: the seat got a topic but fewer than two
 * counted sheets are in, so the test total leaves it out for now. `tanpa`:
 * the seat never spun a topic (0). `rubrik`: a stored sheet no longer fits
 * the rubric (a row was changed after grading); needs a look.
 */
export type LiveFlag = "belum" | "tanpa" | "rubrik";

export interface ScoreRow {
  candidateId: number;
  seatId: number;
  roomId: number;
  nim: string;
  nama: string;
  parts: Record<Phase1Part, PartScore>;
  /** The three written parts added up (out of the written share, 1600 by default) */
  phase1: number;
  /** Out of the Live Coding share (2400 by default); null until it is scored */
  livecode: number | null;
  liveFlag?: LiveFlag;
  /** Out of 4000; a pending Live Coding counts as 0 and says so in liveFlag */
  total: number;
}

/** A question's numbers: fractions as text ("3/5"), decimals for display. */
export interface StatRow {
  id: number;
  part: Phase1Part;
  lang: string;
  format: string;
  title: string;
  voided: boolean;
  /** Seats that started the part and drew it (voided questions are out of every sum, so these are 0) */
  n: number;
  /** Of those, seats with credit 1 */
  m: number;
  p: string;
  w: string;
  pv: number;
  wv: number;
  /** The most picked wrong answer, when the format has options or text to count */
  wrong: WrongPick | null;
}

export interface WrongPick {
  /** How many seats picked it */
  n: number;
  /** The option id, the line number, "line:option" or the blank's number */
  id: string;
  kind: "option" | "line" | "slot" | "blank";
  /** The option's text, or the wrong text typed into a blank */
  text: string;
}

export interface FreezeInfo {
  id: number;
  at: string;
  by: string;
  byName: string | null;
  note: string | null;
}

export interface ScoresResponse {
  ok: true;
  /** The freeze the rows come from; null while they are provisional ("Sementara") */
  final: FreezeInfo | null;
  rows: ScoreRow[];
  /** What each score is out of, from the exam settings */
  caps: Caps;
  rooms: { id: number; title: string }[];
  /** The bank right: statistics, void and Finalkan */
  can: { bank: boolean };
  /** Why Finalkan would be refused right now, empty when it would go through */
  blockers: FinalBlocker[];
  now: string;
}

export type FinalBlocker =
  | { kode: "ruang_terbuka"; rooms: number }
  | { kode: "ruang_belum_selesai"; rooms: number }
  | { kode: "nilai_lc_kurang"; seats: number }
  | { kode: "slot_tanpa_ruang"; slots: number }
  | { kode: "peserta_tanpa_kursi"; candidates: number }
  | { kode: "tanpa_kursi" };

export interface StatsResponse {
  ok: true;
  final: FreezeInfo | null;
  stats: StatRow[];
  /** Seats that started at least one part, per part */
  started: Record<Phase1Part, number>;
}

export interface FreezeResponse {
  ok: true;
  freeze: FreezeInfo | null;
}

export interface VoidResponse {
  ok: true;
  question: { id: number; voided: boolean; voidNote: string | null };
}
