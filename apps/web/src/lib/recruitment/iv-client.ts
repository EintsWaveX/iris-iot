/**
 * The browser side of Wawancara and Mengajar (api/_lib/recruitment-s4.ts):
 * the response shapes and the polled reads. Writes go through recPost.
 */
import { usePoll } from "../hooks";
import { isFail, recGet } from "./client";
import type { Bi, IvParam, IvStage, IvTemplate, Verdict, SheetLevels } from "./interview";

export interface IvCandidate {
  id: number;
  nim: string;
  nama: string;
  kelas: string;
}

export interface IvCrewSlot {
  id: number;
  room: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  booths: IvCandidate[];
  penguji: string[];
  pjOut: string[];
  pjIn: string[];
}

export interface IvCrewResponse {
  ok: true;
  template: Pick<IvTemplate, "mode" | "per" | "pjOut" | "pjIn" | "minutes" | "maxMinutes" | "gap">;
  slots: IvCrewSlot[];
  pool: { nim: string; nama: string; kode: string }[];
}

export interface IvBooth {
  index: number;
  candidate: IvCandidate | null;
  mine: boolean;
  pair: string[];
  here: string | null;
  sent: number;
  need: number;
  mineSent: boolean;
  verdict: Verdict | null;
  case: { kind: string; status: "susulan" | "gugur" | null } | null;
}

export interface IvMineSlot {
  id: number;
  room: string;
  startsAt: string;
  endsAt: string;
  role: "penguji" | "pj_luar" | "pj_dalam";
  penguji: { nim: string; kode: string }[];
  pjOut: string[];
  pjIn: string[];
  booths: IvBooth[];
}

export interface IvMineResponse {
  ok: true;
  me: { nim: string; kode: string | null };
  template: Pick<IvTemplate, "mode" | "per" | "minutes" | "maxMinutes" | "gap">;
  slots: IvMineSlot[];
}

export interface IvSharedView {
  answers: Record<string, string>;
  skipped: string[];
  concl: Record<string, string>;
  other: string;
  verdict: Verdict | null;
  ba: string;
  recording: boolean;
  startedAt: string | null;
  case: {
    kind: string;
    minutes?: number;
    why?: string;
    status: "susulan" | "gugur" | null;
    note: string;
  } | null;
  version: number;
}

export interface IvSheetResponse {
  ok: true;
  template: IvTemplate;
  candidate: IvCandidate;
  slot: { id: number; room: string; startsAt: string; endsAt: string; booth: number };
  pair: { nim: string; kode: string; sent: boolean }[];
  me: string;
  cond: { fm: boolean };
  scores: {
    total: number | null;
    parts: (number | null)[];
    /** Rank by Tes Tulis total among the candidates that have one */
    rank: number | null;
    of: number;
  } | null;
  /** The Susulan day of this stage from the Kalender (YYYY-MM-DD), or null */
  makeup: string | null;
  /** The day the Cutting of this stage starts (YYYY-MM-DD), until when a sheet can change */
  cutting: string | null;
  /** When the CaAs scanned in for this stage */
  here: string | null;
  /** The files the examiner may open (the Berkas button) */
  files: { id: number; kind: string; label: Bi }[];
  locked: boolean;
  shared: IvSharedView | null;
  mine: { levels: Record<string, number>; sentAt: string | null };
  others: { kode: string; levels: SheetLevels["levels"]; sentAt: string | null }[];
}

export interface IvNilaiRow {
  id: number;
  nim: string;
  nama: string;
  slotId: number | null;
  sheets: { by: string; score: number }[];
  expected: number;
  mean: number | null;
  spread: number | null;
  wide: boolean;
  verdict: Verdict | null;
  suggested: Verdict | null;
  case: { kind: string; status: "susulan" | "gugur" | null } | null;
  /** Where and when this CaAs sat, the Tes Tulis total (Wawancara only, context), and the Rincian */
  room: string | null;
  startsAt: string | null;
  booth: number | null;
  total: number | null;
  detail: { by: string; levels: Record<string, number>; at: string | null }[];
  concl: Record<string, string>;
  ba: string;
  /** The examiners of this booth who have not sent yet */
  waiting: string[];
}

export interface IvNilaiResponse {
  ok: true;
  /** My own code, to mark my chips */
  me: string | null;
  cut: [number, number];
  wide: number;
  per: number;
  params: IvParam[];
  levels: Bi[];
  rows: IvNilaiRow[];
  penguji: { by: string; n: number; avg: number }[];
  avg: number | null;
}

/** What an examiner without the Penilaian right sees: only the sheets they sent themselves (Lembarku). */
export interface IvLembarkuRow {
  id: number;
  nama: string;
  room: string | null;
  startsAt: string | null;
  score: number;
  verdict: Verdict | null;
  /** Partner codes that have sent too; their levels stay hidden */
  others: string[];
}
export interface IvLembarkuResponse {
  ok: true;
  mine: true;
  rows: IvLembarkuRow[];
}

async function leaf<T extends { ok: true }>(
  aksi: string,
  q: Record<string, string>,
): Promise<T | null> {
  const r = await recGet<T>(aksi, q);
  if (!isFail(r)) return r;
  if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
  return null;
}

const TOPIK = ["reciv", "recplotting", "reccandidates"] as const;

/** The examiners and PJ of every slot of a stage, and the pool to pick from. */
export const useIvCrew = (stage: IvStage, enabled = true) =>
  usePoll(() => leaf<IvCrewResponse>("iv-crew", { stage }), 300_000, enabled, TOPIK, 1_000, stage);

/** My own slots of a stage. */
export const useIvMine = (stage: IvStage, enabled = true) =>
  usePoll(() => leaf<IvMineResponse>("iv-mine", { stage }), 300_000, enabled, TOPIK, 1_000, stage);

/** Penilaian of a stage (Ketua, Akademik, Admin), or Lembarku (my own sent sheets) for any other examiner. */
export const useIvNilai = (stage: IvStage, enabled = true) =>
  usePoll(
    () => leaf<IvNilaiResponse | IvLembarkuResponse>("iv-nilai", { stage }),
    300_000,
    enabled,
    TOPIK,
    1_000,
    stage,
  );

/** One CaAs's sheet. Fetched on open and after a send; typing is local until it is saved. */
export const fetchIvSheet = (stage: IvStage, id: number) =>
  recGet<IvSheetResponse>("iv-sheet", { stage, id: String(id) });
