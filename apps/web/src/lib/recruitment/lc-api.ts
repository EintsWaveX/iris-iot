/**
 * What the Live Coding actions send and receive (EXAM-ENGINE 10.3, prompt
 * 12): shared by api/_lib/recruitment-livecode.ts and the page. Types only,
 * browser safe. Nothing here carries a hint, another seat's code, a password
 * or another grader's values.
 */
import type { Protocol, RubricRow } from "./exam-types.js";
import type { Endpoints } from "./lc-gateway.js";
import type { StoredSheet } from "./lc-grade.js";
import type {
  Chip,
  JobKode,
  JobStatus,
  LcRun,
  LcTopic,
  LcTopicSelf,
  LcVariant,
  QueueChip,
  RerollWhy,
  TemplateKey,
} from "./lc-types.js";

/** A board's hotspot as the seat sees it: the name, never the password. */
export interface BoardHotspot {
  ssid: string | null;
  /** The candidate's own phone (9.6a) or a pengawas phone */
  own: boolean;
  /** BLE boards need none */
  needed: boolean;
}

export interface SelfBoard {
  n: 1 | 2;
  chip: Chip;
  code: string;
  rev: number;
  hotspot: BoardHotspot;
  /** The addresses with the token left out (for the brief and the panels) */
  endpoints: Endpoints;
  /** The last good compile is older than the board's hotspot or account: Kompilasi Ulang */
  stale: boolean;
}

export interface SelfJob {
  id: number;
  board: 1 | 2;
  status: JobStatus;
  /** 0 while it compiles, N waiting, null when finished */
  position: number | null;
  ok: boolean | null;
  kode: JobKode | null;
  log: string | null;
  ms: number | null;
  size: number | null;
  requestedAt: number;
  finishedAt: number | null;
}

export interface LiveCodeSelf {
  /** Server ms */
  now: number;
  seatId: number;
  seatNo: number;
  phase: "spin" | "work";
  topic: LcTopicSelf | null;
  protocol: Protocol | null;
  variant: LcVariant | null;
  /** How each reel landed (the animation plays once per result) */
  landed: {
    topic: { at: number; by: "seat" | "auto" | "master"; reason?: RerollWhy } | null;
    protocol: { at: number; by: "seat" | "auto" | "master"; reason?: RerollWhy } | null;
  };
  /** The protocols the edition enables (the reel shows the real three) */
  protocols: Protocol[];
  boards: SelfBoard[];
  runs: LcRun[];
  /** The newest job of each board */
  jobs: SelfJob[];
  queue: QueueChip[];
  /** Median compile time per chip, null before three good jobs */
  typicalMs: Record<Chip, number | null>;
  /** The PC agent can build: false shows "belum ada agen" instead of a queue that never moves */
  agent: boolean;
  /** REC_GATEWAY_SECRET is set */
  gateway: boolean;
  /** Whether the editor is open (the Live Coding timer is running for this seat) */
  editable: boolean;
}

export interface SpinReply {
  ok: true;
  topic: LcTopicSelf | null;
  protocol: Protocol | null;
  by: "seat" | "auto" | "master";
  at: number;
}

export interface CompileReply {
  ok: true;
  job: number;
  position: number;
  rev: number;
}

/** One seat in the grading list (lc-room). */
export interface GradeSeat {
  seatId: number;
  no: number;
  nama: string;
  topic: string | null;
  protocol: Protocol | null;
  lastCompile: { at: number; ok: boolean } | null;
  lastFlash: { at: number; ok: boolean } | null;
  /** Who has sheeted this seat and when; never the values */
  sheets: { grader: string; name: string; at: number }[];
  mine: boolean;
}

export interface GradeRoom {
  roomId: number;
  title: string;
  seats: GradeSeat[];
  /** Grading opens when the Live Coding timer starts */
  open: boolean;
  me: { nim: string };
}

export interface RubricView {
  rows: RubricRow[];
  seatId: number;
  mine: StoredSheet | null;
  others: ({ grader: string; name: string; at: number } | StoredSheet)[];
  open: boolean;
  /** The seat's brief and the topic's hints, for graders only */
  topic: (LcTopicSelf & { hints: string }) | null;
}

/** The bank's Live Coding tab. */
export interface TopicsView {
  topics: LcTopic[];
}
export interface TemplatesView {
  templates: { key: TemplateKey; code: string; sample: boolean; updatedAt: number }[];
  rubric: { rows: RubricRow[] };
}
