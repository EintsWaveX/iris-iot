/**
 * The exam's shared shapes (docs/recruitment/EXAM-ENGINE.md): questions in
 * their seven formats, the parts config, the draw, and the room state.
 * Browser safe and pure. Prompts 09 to 13 import these and change them only
 * additively (EXAM-ENGINE 10.4).
 */

/* ------------------------------------------------------------ vocabulary */

/** The written parts. Mikro (IoT) was dropped on 29 Oct 2026: the test is formal C only. */
import type { StrikeKind } from "./seat-lockdown.js";

export const PHASE1_PARTS = ["logika", "fitb", "kodingan"] as const;
export type Phase1Part = (typeof PHASE1_PARTS)[number];
export const PART_KEYS = [...PHASE1_PARTS, "livecode"] as const;
export type PartKey = (typeof PART_KEYS)[number];

/**
 * A written question's language: "c" for the code parts (FITB, Code Tracing), "text" for general
 * questions with no code (PU dan Dasar IoT: general knowledge and IoT theory, words only). Which
 * part takes which is LANGS_OF_PART; the field stays so the bank import keeps its shape.
 */
export const LANGS = ["c", "text"] as const;
export type Lang = (typeof LANGS)[number];
/** A question's code language: C, or plain text for output samples. */
export type CodeLang = "c" | "text";

/** The language a new question of each written part starts with: Logika (PU dan Dasar IoT) is general, words only. */
export const LANG_OF_PART: Record<Phase1Part, Lang> = {
  logika: "text",
  fitb: "c",
  kodingan: "c",
};
/** The languages each part allows: only FITB and Code Tracing are locked to C, Logika is not locked to any. */
export const LANGS_OF_PART: Record<Phase1Part, readonly Lang[]> = {
  logika: ["text", "c"],
  fitb: ["c"],
  kodingan: ["c"],
};

export const FORMATS = ["single", "multi", "lines", "fix", "order", "match", "fitb"] as const;
export type Format = (typeof FORMATS)[number];

/**
 * @deprecated The protocol reel belongs to the IoT Live Coding, which B7.7
 * deletes. Kept only so that dormant code still compiles until then.
 */
export const PROTOCOLS = ["ble", "httpws", "mqtt"] as const;
/** @deprecated see PROTOCOLS. */
export type Protocol = (typeof PROTOCOLS)[number];

/** The test is always out of 4000 (Cutting's `tes_tulis` cut is set on this scale). */
export const TOTAL_SCORE = 4000;

/** The three Live Coding tiers a problem can have: Mudah, Sedang, Susah. */
export const TIERS = ["easy", "medium", "hard"] as const;
export type Tier = (typeof TIERS)[number];

/* ------------------------------------------------------------- questions */

export interface Item {
  id: string;
  text: string;
}
export interface Code {
  lang: CodeLang;
  src: string;
}
export interface Image {
  id: string;
  key: string;
  alt: string;
  w: number;
  h: number;
}
interface BodyBase {
  prompt: string;
  images?: Image[];
  /**
   * What the question is worth, as a weight inside its part. Left out, it is the part's
   * default (Jatah divided by Tampil). Only the proportions matter to the score.
   */
  points?: number;
}

export interface SingleBody extends BodyBase {
  options: Item[];
  shuffle: boolean;
}
export type MultiBody = SingleBody;
export interface LinesBody extends BodyBase {
  code: Code;
}
export interface FixSlot {
  line: number;
  options: Item[];
}
export interface FixBody extends BodyBase {
  code: Code;
  slots: FixSlot[];
}
export interface OrderBody extends BodyBase {
  lang: CodeLang;
  lines: Item[];
}
export interface MatchBody extends BodyBase {
  left: Item[];
  right: Item[];
}
export interface Blank {
  n: number;
  width?: number;
  hint?: string;
}
export interface FitbBody extends BodyBase {
  code?: Code;
  blanks: Blank[];
}

export interface SingleAnswer {
  correct: string;
}
export interface MultiAnswer {
  correct: string[];
}
export interface LinesAnswer {
  lines: number[];
}
export interface FixAnswer {
  picks: Record<number, string>;
}
export interface OrderAnswer {
  order: string[];
  also: string[][];
}
export interface MatchAnswer {
  pairs: Record<string, string>;
}
export type BlankCase = "exact" | "ignore";
export type BlankSpace = "exact" | "trim" | "collapse" | "none";
export interface BlankKey {
  accept: string[];
  case?: BlankCase;
  space?: BlankSpace;
}
export interface FitbAnswer {
  blanks: Record<number, BlankKey>;
}

interface QBase<F extends Format, B, A> {
  id: number;
  part: Phase1Part;
  lang: Lang;
  format: F;
  version: number;
  body: B;
  answer: A;
}
export type SingleQ = QBase<"single", SingleBody, SingleAnswer>;
export type MultiQ = QBase<"multi", MultiBody, MultiAnswer>;
export type LinesQ = QBase<"lines", LinesBody, LinesAnswer>;
export type FixQ = QBase<"fix", FixBody, FixAnswer>;
export type OrderQ = QBase<"order", OrderBody, OrderAnswer>;
export type MatchQ = QBase<"match", MatchBody, MatchAnswer>;
export type FitbQ = QBase<"fitb", FitbBody, FitbAnswer>;
export type Question = SingleQ | MultiQ | LinesQ | FixQ | OrderQ | MatchQ | FitbQ;

/** The seat's shuffle of one question. `null` for formats without one. */
export type Perm =
  | { options: string[] }
  | { slots: Record<number, string[]> }
  | { lines: string[] }
  | { left: string[]; right: string[] }
  | null;

/** What the candidate sends. `null` is unanswered (credit 0, still shown). */
export type Value =
  | { pick: string | null }
  | { picks: string[] }
  | { picks: number[] }
  | { picks: Record<number, string | null> }
  | { order: string[] }
  | { pairs: Record<string, string | null> }
  | { blanks: Record<number, string> }
  | null;

/** A question as the candidate's page gets it: perm applied, no key. */
export type View =
  | { format: "single" | "multi"; prompt: string; images?: Image[]; options: Item[] }
  | { format: "lines"; prompt: string; images?: Image[]; code: Code }
  | { format: "fix"; prompt: string; images?: Image[]; code: Code; slots: FixSlot[] }
  | { format: "order"; prompt: string; images?: Image[]; lang: CodeLang; lines: Item[] }
  | { format: "match"; prompt: string; images?: Image[]; left: Item[]; right: Item[] }
  | {
      format: "fitb";
      prompt: string;
      images?: Image[];
      code?: Code;
      blanks: { n: number; width: number; hint?: string }[];
    };

/** A source of uniform 32-bit integers (draw.ts builds the seeded one). */
export interface Rng {
  u32(): number;
}

export interface FieldError {
  field: string;
  kode: string;
}

/* ---------------------------------------------------------------- config */

/** One written part's plan: how long, how many questions a seat gets, and the bank size to aim for. */
export interface PartPlan {
  minutes: number;
  shown: number;
  pool: number;
  /**
   * The bonus round (4 Nov 2026): a seat that hands in with at least this many minutes left
   * is offered the part's other questions as bonus. 0 turns the bonus round off.
   */
  bonusMin: number;
}
export interface LivecodePlan {
  minutes: number;
  /** How many problems of each tier one seat is dealt (2 easy, 2 medium and 1 hard by default). */
  draw: Record<Tier, number>;
  /** The problem bank to aim for (Target); Tampil is the sum of `draw`. */
  pool: number;
  /** What one problem of each tier is worth. The dealt problems must add up to the Live Coding share. */
  points: Record<Tier, number>;
  /** The bonus round, as PartPlan.bonusMin. */
  bonusMin: number;
  /** Submissions per problem; 0 means no limit (a wrong submission costs nothing). */
  runLimit: number;
  /** Tests the judge runs at once on the lab PC. */
  workers: number;
  /**
   * The penalty for failed Submits (8 Nov 2026), per problem: the first `penaltyFree` failures are
   * forgiven, each one after takes `penaltyStep` percent off what the problem earned, never more
   * than `penaltyMax` percent in all. `penaltyStep` 0 turns it off. See c-problem.ts Penalty.
   */
  penaltyFree: number;
  penaltyStep: number;
  penaltyMax: number;
}
/** How one kind of violation counts: whether it counts at all, and how heavy one strike of it is. */
export interface KindRule {
  counts: boolean;
  /** 0 to 5 */
  weight: number;
}
/**
 * The violation rules (9 Nov 2026), see violations.ts: which kinds count and how much, how many
 * points are forgiven, the percent a point past that suggests as a score cut (never above `max`),
 * the points at which the candidate sees a notice, a strong and a final warning, and how many
 * strikes are stored per part before the rest are only counted.
 */
export interface ViolationRules {
  kinds: Record<StrikeKind, KindRule>;
  free: number;
  step: number;
  max: number;
  warnAt: [number, number, number];
  capPerPart: number;
}
export interface ExamConfig {
  v: 2;
  /** The room's budget bar, minutes (PRD 7.1: a budget, not a cap). */
  budgetMin: number;
  /** The written parts, then Live Coding, in this order. */
  order: PartKey[];
  parts: Record<Phase1Part, PartPlan>;
  livecode: LivecodePlan;
  /** Percent of TOTAL_SCORE for the written parts and for Live Coding. They add up to 100. */
  weights: { written: number; livecode: number };
  /** Percent of the written share each written part carries. They add up to 100. */
  shares: Record<Phase1Part, number>;
  /** What counts as a violation and what it costs (9 Nov 2026) */
  violations: ViolationRules;
}

export const DEFAULT_EXAM_CONFIG: ExamConfig = {
  v: 2,
  budgetMin: 120,
  order: ["logika", "fitb", "kodingan", "livecode"],
  parts: {
    logika: { minutes: 15, shown: 15, pool: 40, bonusMin: 5 },
    fitb: { minutes: 15, shown: 15, pool: 40, bonusMin: 5 },
    kodingan: { minutes: 15, shown: 15, pool: 40, bonusMin: 5 },
  },
  livecode: {
    minutes: 60,
    draw: { easy: 2, medium: 2, hard: 1 },
    pool: 24,
    points: { easy: 300, medium: 500, hard: 800 },
    bonusMin: 15,
    runLimit: 0,
    workers: 4,
    penaltyFree: 1,
    penaltyStep: 5,
    penaltyMax: 30,
  },
  weights: { written: 40, livecode: 60 },
  shares: { logika: 40, fitb: 40, kodingan: 20 },
  violations: {
    kinds: {
      layar: { counts: true, weight: 1 },
      tab: { counts: true, weight: 1 },
      fokus: { counts: true, weight: 1 },
      tempel: { counts: true, weight: 1 },
      alat: { counts: true, weight: 1 },
      // The second tab or device is made by the API from where answers come from, not by the page
      ganda: { counts: false, weight: 0 },
      foto: { counts: true, weight: 1 },
      layar2: { counts: true, weight: 1 },
      muat: { counts: true, weight: 1 },
      otomatis: { counts: true, weight: 1 },
      // Seen by staff, counted for nothing until someone turns the weight up (9 Nov 2026)
      salin: { counts: true, weight: 0 },
      putus: { counts: true, weight: 0 },
    },
    free: 2,
    step: 5,
    max: 30,
    warnAt: [1, 3, 5],
    capPerPart: 50,
  },
};

/* ------------------------------------------------------------------ draw */

export interface DrawnItem {
  q: number;
  /** The question's version at draw time, for the audit. */
  v: number;
  lang: Lang;
  perm: Perm;
}
/** `room`: where the part was started; answers to it are taken only there (EXAM-ENGINE 3.3). */
export type SeatDraw = Partial<
  Record<
    Phase1Part,
    {
      at: number;
      room: number;
      items: DrawnItem[];
      /** The bonus round: the part's other questions, dealt when the seat asked for them (`bonusAt`). */
      bonus?: DrawnItem[];
      bonusAt?: number;
      /**
       * Set when the seat asked how many bonus questions it gets. From then on the dealt questions
       * of the part take no new answers: the number it was shown (`quote`) reads its answers, so
       * changing one after seeing it would turn the offer into a way to find the right answers.
       */
      lockedAt?: number;
      quote?: { rest: number; time: number; correct: number; wrong: number; quota: number };
    }
  >
>;

/* ------------------------------------------------------------- the room */

export interface PartRun {
  durMs: number;
  usedMs: number;
  mark: number | null;
  state: "running" | "paused" | "ended";
  pausedAt: number | null;
  extra: Record<string, number>;
  startedAt: number;
  endedAt: number | null;
  endedBy: "time" | "skip" | null;
  leftAtSkip: number;
  reopened: number;
}

export interface RoomState {
  v: 1;
  seq: number;
  stage: "setup" | "prep" | "parts" | "spin" | "finished";
  cur: PartKey | null;
  runs: Partial<Record<PartKey, PartRun>>;
  startedAt: number | null;
  finishedAt: number | null;
  master: { nim: string; since: number } | null;
  ask: { nim: string; at: number } | null;
  /**
   * A practice room has no slot to hang pengawas on, so its pengawas live here
   * (NIMs). Real rooms never set it; their pengawas are the slot's examiners.
   */
  latihanPengawas?: string[];
}

export type RoomViewName =
  | "setup"
  | "persiapan"
  | "part-running"
  | "livecode-running"
  | "part-paused"
  | "part-ended"
  | "lobby"
  | "livecode-spin"
  | "finished";

/* --------------------------------------------------------------- scoring */

export interface RubricRow {
  key: string;
  label: string;
  max: number;
  weight: number;
  hint?: string;
}
export interface Rubric {
  id: number;
  stage: "tes_tulis";
  kind: "livecode";
  rows: RubricRow[];
}
export interface RubricSheet {
  grader: string;
  /** When it was submitted; the first two from two different people count. */
  at: number;
  values: Record<string, number>;
}
