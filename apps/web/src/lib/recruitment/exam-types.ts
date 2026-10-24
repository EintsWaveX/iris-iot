/**
 * The exam's shared shapes (docs/recruitment/EXAM-ENGINE.md): questions in
 * their seven formats, the parts config, the draw, and the room state.
 * Browser safe and pure. Prompts 09 to 13 import these and change them only
 * additively (EXAM-ENGINE 10.4).
 */

/* ------------------------------------------------------------ vocabulary */

export const PHASE1_PARTS = ["logika", "fitb", "kodingan", "mikro"] as const;
export type Phase1Part = (typeof PHASE1_PARTS)[number];
export const PART_KEYS = [...PHASE1_PARTS, "livecode"] as const;
export type PartKey = (typeof PART_KEYS)[number];

export const LANGS = ["cpp", "py", "any"] as const;
export type Lang = (typeof LANGS)[number];
/** A question's code language; `any` is only a count in the config. */
export type CodeLang = "cpp" | "py" | "text";

export const FORMATS = ["single", "multi", "lines", "fix", "order", "match", "fitb"] as const;
export type Format = (typeof FORMATS)[number];

/** The protocol reel's three outcomes (ruling 2026-10-24). */
export const PROTOCOLS = ["ble", "httpws", "mqtt"] as const;
export type Protocol = (typeof PROTOCOLS)[number];

/** PRD 7.4: Phase 1 is out of 3000, the test out of 4000. Not config. */
export const PART_CAP: Record<Phase1Part, number> = {
  logika: 1000,
  fitb: 1000,
  kodingan: 500,
  mikro: 500,
};
export const LIVECODE_CAP = 1000;

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

export interface PartCount {
  shown: number;
  pool: number;
}
export interface ExamConfig {
  v: 1;
  /** The room's budget bar, minutes (PRD 7.1: a budget, not a cap). */
  budgetMin: number;
  /** Phase 1 then Live Coding, in this order (PRD 7.8). */
  order: PartKey[];
  parts: Record<Phase1Part, { minutes: number; counts: Partial<Record<Lang, PartCount>> }>;
  livecode: { minutes: number; protocols: Protocol[]; graders: 2 };
}

export const DEFAULT_EXAM_CONFIG: ExamConfig = {
  v: 1,
  budgetMin: 120,
  order: ["logika", "fitb", "kodingan", "mikro", "livecode"],
  parts: {
    logika: { minutes: 15, counts: { cpp: { shown: 10, pool: 20 }, py: { shown: 5, pool: 10 } } },
    fitb: { minutes: 15, counts: { cpp: { shown: 10, pool: 20 }, py: { shown: 5, pool: 10 } } },
    kodingan: { minutes: 10, counts: { cpp: { shown: 5, pool: 10 }, py: { shown: 5, pool: 10 } } },
    mikro: { minutes: 20, counts: { any: { shown: 5, pool: 10 } } },
  },
  livecode: { minutes: 45, protocols: ["ble", "httpws", "mqtt"], graders: 2 },
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
