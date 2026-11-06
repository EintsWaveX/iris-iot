/**
 * Rolling a stage back (5 Nov 2026). Pure rules for the rollback handlers in
 * api/_lib/recruitment-rollback.ts: which stages sit after another, and what
 * has to be typed to confirm. A candidate's standing is derived from their
 * stage results, so a rollback edits those and deletes what hangs off the
 * stages that came after.
 */
import { STAGES, type StageKey } from "./types.js";

/** Stages after `stage`, in journey order: what a Lolos at `stage` moved the CaAs on to. */
export const tahapSesudah = (stage: StageKey): StageKey[] =>
  STAGES.slice(STAGES.indexOf(stage) + 1);

/** `stage` and every stage after it. */
export const tahapMulai = (stage: StageKey): StageKey[] => STAGES.slice(STAGES.indexOf(stage));

/**
 * The typed confirmation: the stage key for a whole stage, the NIM for one
 * CaAs. Exact, after trimming; a missing or wrong word never rolls anything back.
 */
export const konfirmasiCocok = (given: unknown, expected: string): boolean =>
  typeof given === "string" && given.trim() === expected;

/** What Batalkan Jadikan Asisten checks on an Asisten row before it may delete it. */
export interface AsistenCek {
  passwordHash: string | null;
  passwordDiaturPada: Date | null;
  terakhirAktif: Date | null;
  divisi: string | null;
  tier: string;
  badges: readonly string[];
  hakOverride: Readonly<Record<string, boolean>>;
}

/**
 * An Asisten that Jadikan Asisten made and nobody has touched since: never
 * signed in, no password set, no division, badge or override, plain tier.
 * Only such a row may be deleted; anything else is kept and reported.
 */
export const asistenBelumDipakai = (a: AsistenCek): boolean =>
  !a.passwordHash &&
  !a.passwordDiaturPada &&
  !a.terakhirAktif &&
  !a.divisi &&
  a.tier === "asisten" &&
  a.badges.length === 0 &&
  Object.keys(a.hakOverride).length === 0;

/** What a rollback would delete, by kind. Shown as a preview before the typed confirm. */
export interface HitunganRollback {
  /** Stage results that go (later stages for a whole stage, from the chosen stage for one CaAs) */
  results: number;
  /** Envelopes a CaAs already opened among the results above or the stage itself */
  opened: number;
  picks: number;
  pickRequests: number;
  attendance: number;
  sheets: number;
  makeups: number;
  examSeats: number;
  kitLoans: number;
  seatNotes: number;
  teamMembers: number;
  teams: number;
  acceptance: number;
  /** Score freezes lifted (a whole stage only) */
  freezes: number;
}

export const HITUNGAN_KOSONG: HitunganRollback = {
  results: 0,
  opened: 0,
  picks: 0,
  pickRequests: 0,
  attendance: 0,
  sheets: 0,
  makeups: 0,
  examSeats: 0,
  kitLoans: 0,
  seatNotes: 0,
  teamMembers: 0,
  teams: 0,
  acceptance: 0,
  freezes: 0,
};

/** Why a rollback was refused, so the page can say it in words. */
export const ALASAN_BLOKIR = ["ruang_sudah_dipakai", "pemimpin_tim", "sudah_dijadikan"] as const;
export type AlasanBlokir = (typeof ALASAN_BLOKIR)[number];

export interface Blokir {
  kode: AlasanBlokir;
  /** How many rows (or the room or team) in the way */
  n: number;
}

/** The preview answer of cut-unlock-force and candidate-reset. */
export interface RollbackPreview {
  ok: true;
  preview: true;
  counts: HitunganRollback;
  blocked: Blokir[];
  /** cut-unlock-force: how many CaAs rows of the stage are locked */
  locked?: number;
}

/** The preview answer of pn-undo (Batalkan Jadikan Asisten). */
export interface PnUndoPreview {
  ok: true;
  preview: true;
  promoted: number;
  asistenDeleted: number;
  asistenKept: { nim: string; alasan: string }[];
  results: number;
  opened: number;
}
