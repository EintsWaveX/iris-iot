/**
 * The browser side of the Susulan offer (api/_lib/recruitment-s6.ts): the
 * response shapes and the polled reads. Writes go through recPost.
 */
import { usePoll } from "../hooks";
import { isFail, recGet } from "./client";
import type { MakeupStage, MakeupState } from "./makeup";

export interface MakeupRow {
  id: number;
  nim: string;
  nama: string;
  kind: string | null;
  /** The reason on the sheet (class, misfortune, an excuse) */
  why: string | null;
  state: MakeupState;
  /** Withdrawn only because the deadline passed */
  unanswered: boolean;
  via: string | null;
  note: string;
  by: string | null;
  answeredAt: string | null;
  slotId: number | null;
  room: string | null;
  startsAt: string | null;
}

export interface MakeupSlot {
  id: number;
  room: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  taken: number;
}

export interface MakeupListResponse {
  ok: true;
  day: string | null;
  from: string | null;
  to: string | null;
  deadline: string | null;
  now: string;
  slots: MakeupSlot[];
  rows: MakeupRow[];
}

export interface MakeupOffer {
  stage: MakeupStage;
  state: MakeupState;
  unanswered: boolean;
  day: string | null;
  from: string | null;
  to: string | null;
  place: string | null;
  deadline: string | null;
  /** The channel, only when Panitia wrote the answer */
  via: string | null;
  seat: { room: string; startsAt: string; endsAt: string } | null;
}

export interface MakeupMineResponse {
  ok: true;
  offers: MakeupOffer[];
  now: string;
}

async function leaf<T extends { ok: true }>(
  aksi: string,
  q?: Record<string, string>,
): Promise<T | null> {
  const r = await recGet<T>(aksi, q);
  if (!isFail(r)) return r;
  if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
  return null;
}

const TOPIK = ["recplotting", "reccutting", "reccandidates", "reccalendar"] as const;

/** Who needs the Susulan of a stage, and where they stand (Plotting right). */
export const useMakeupList = (stage: MakeupStage, enabled = true) =>
  usePoll(
    () => leaf<MakeupListResponse>("ms-list", { stage }),
    300_000,
    enabled,
    TOPIK,
    1_000,
    stage,
  );

/** The Susulan offers made to me. */
export const useMakeupMine = (enabled = true) =>
  usePoll(() => leaf<MakeupMineResponse>("ms-mine"), 300_000, enabled, TOPIK, 1_000);
