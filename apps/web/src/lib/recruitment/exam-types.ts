/**
 * The exam's shared shapes (docs/recruitment/EXAM-ENGINE.md): questions in
 * their seven formats, the parts config, the draw, and the room state.
 * Browser safe and pure. Prompts 09 to 13 import these and change them only
 * additively (EXAM-ENGINE 10.4).
 */

/* ------------------------------------------------------------ vocabulary */

/** The written parts. Mikro (IoT) was dropped on 29 Oct 2026: the test is formal C only. */
export const PHASE1_PARTS = ["logika", "fitb", "kodingan"] as const;
export type Phase1Part = (typeof PHASE1_PARTS)[number];
export const PART_KEYS = [...PHASE1_PARTS, "livecode"] as const;
export type PartKey = (typeof PART_KEYS)[number];

/** Every written question is C. The word stays a field so the bank import keeps its shape. */
export const LANGS = ["c"] as const;
export type Lang = (typeof LANGS)[number];
/** A question's code language: C, or plain text for output samples. */
export type CodeLang = "c" | "text";

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

/** The two Live Coding tiers a problem can have. */
export const TIERS = ["easy", "medium"] as const;
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
}
export interface LivecodePlan {
  minutes: number;
  /** How many problems of each tier one seat is dealt (3 easy and 2 medium by default). */
  draw: Record<Tier, number>;
  /** What one problem of each tier is worth. The dealt problems must add up to the Live Coding share. */
  points: Record<Tier, number>;
  /** Submissions per problem; 0 means no limit (a wrong submission costs nothing). */
  runLimit: number;
  /** Tests the judge runs at once on the lab PC. */
  workers: number;
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
}

export const DEFAULT_EXAM_CONFIG: ExamConfig = {
  v: 2,
  budgetMin: 120,
  order: ["logika", "fitb", "kodingan", "livecode"],
  parts: {
    logika: { minutes: 15, shown: 15, pool: 20 },
    fitb: { minutes: 15, shown: 15, pool: 20 },
    kodingan: { minutes: 15, shown: 15, pool: 20 },
  },
  livecode: {
    minutes: 60,
    draw: { easy: 3, medium: 2 },
    points: { easy: 400, medium: 600 },
    runLimit: 0,
    workers: 4,
  },
  weights: { written: 40, livecode: 60 },
  shares: { logika: 40, fitb: 40, kodingan: 20 },
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
  Record<Phase1Part, { at: number; room: number; items: DrawnItem[] }>
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
