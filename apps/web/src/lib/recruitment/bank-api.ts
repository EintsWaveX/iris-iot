/**
 * The shapes the question bank's API answers (prompt 09, EXAM-ENGINE 10.3),
 * shared by api/_lib/recruitment-bank.ts and the Bank Soal tab.
 */
import type { ExamConfig, Format, Lang, Phase1Part, Question } from "./exam-types";
import type { PoolCount } from "./bank-rules";

export interface QuestionSummary {
  id: number;
  part: Phase1Part;
  lang: Lang;
  format: Format;
  title: string;
  status: "draft" | "ready";
  sample: boolean;
  version: number;
  /** A real seat has been dealt it: its structure is locked */
  shown: boolean;
  voided: boolean;
  updatedAt: string;
}

export interface QuestionFull extends QuestionSummary {
  body: Question["body"];
  answer: Question["answer"];
  voidNote: string | null;
}

export interface QuestionLogLine {
  id: number;
  who: string;
  nama: string | null;
  kind: "save" | "key" | "status" | "void" | "unvoid" | "delete";
  note: string | null;
  at: string;
}

export interface ExamConfigResponse {
  ok: true;
  config: ExamConfig;
  locked: boolean;
  pools: Record<Phase1Part, PoolCount[]>;
  /** A real room is in persiapan, a part or the spins */
  running: boolean;
}

export interface QuestionsResponse {
  ok: true;
  questions: QuestionSummary[];
}

export interface QuestionResponse {
  ok: true;
  question: QuestionFull;
  log: QuestionLogLine[];
}

export interface SaveResponse {
  ok: true;
  kind: "create" | "save" | "key" | "status" | "same";
  question: QuestionFull;
}

export interface ImportItem {
  index: number;
  line: number;
  title: string;
  action: "create" | "update" | "same" | "error";
  id?: number;
  errors: { line: number; kode: string; field?: string; detail?: string }[];
}

export interface ImportResponse {
  ok: true;
  dry: boolean;
  items: ImportItem[];
  counts: { create: number; update: number; same: number; error: number };
}
