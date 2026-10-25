/**
 * Recruitment reads shared by the routes: the live edition, its calendar,
 * who sits where, and a candidate's own row. Rows become the shapes of
 * src/lib/recruitment/types.ts here and nowhere else.
 */
import { and, asc, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import type { ApiResponse } from "./http.js";
import {
  asisten,
  recCandidate,
  recCommittee,
  recDocument,
  recEdition,
  recEvent,
  recSlot,
  recSlotAssignment,
  recStageResult,
  type RecCandidateRow,
  type RecEventRow,
} from "../../src/lib/schema.js";
import type {
  CandidateSelf,
  CommitteeDivision,
  EditionInfo,
  BerkasFile,
  CutStage,
  EnvelopeView,
  RecDocument,
  RecEvent,
  SeatRow,
} from "../../src/lib/recruitment/types.js";
import { CUT_STAGES, STAGES } from "../../src/lib/recruitment/types.js";
import { envelopeVisible } from "../../src/lib/recruitment/cutting.js";
import { standing, type ResultLite, type Standing } from "../../src/lib/recruitment/standing.js";

export type Db = ReturnType<typeof getDb>;

/** Answers { ok: false, kode } with a status; the routes and the S2 modules share it. */
export const tolak = (
  res: ApiResponse,
  kode: string,
  status = 400,
  extra: Record<string, unknown> = {},
) => res.status(status).json({ ok: false, kode, ...extra });

/** The live edition, or a 404 answer and null. */
export async function wajibEdisi(res: ApiResponse, db: Db): Promise<EditionInfo | null> {
  const e = await muatEdisiHidup(db);
  if (!e) tolak(res, "tidak_ada_edisi", 404);
  return e;
}

/** The edition people are using now: the newest one that is live. */
export async function muatEdisiHidup(db: Db): Promise<EditionInfo | null> {
  const [r] = await db
    .select({
      id: recEdition.id,
      year: recEdition.year,
      title: recEdition.title,
      status: recEdition.status,
    })
    .from(recEdition)
    .where(eq(recEdition.status, "live"))
    .orderBy(desc(recEdition.year))
    .limit(1);
  return r ?? null;
}

/** A next edition has been created but not opened: the banner says "segera". */
export async function adaEdisiDraft(db: Db): Promise<boolean> {
  const [r] = await db
    .select({ id: recEdition.id })
    .from(recEdition)
    .where(eq(recEdition.status, "draft"))
    .limit(1);
  return !!r;
}

export function eventDariRow(r: RecEventRow): RecEvent {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    dayStart: r.dayStart,
    dayEnd: r.dayEnd,
    place: r.place,
    internal: r.internal,
    audience: r.audience,
    gates: Array.isArray(r.gates) ? r.gates : [],
    stage: r.stage,
    color: r.color,
    sort: r.sort,
  };
}

export async function muatEvents(db: Db, edisiId: number): Promise<RecEvent[]> {
  const rows = await db
    .select()
    .from(recEvent)
    .where(eq(recEvent.editionId, edisiId))
    .orderBy(asc(recEvent.startsOn), asc(recEvent.sort), asc(recEvent.id));
  return rows.map(eventDariRow);
}

export interface Kursi {
  division: CommitteeDivision;
  isKoor: boolean;
  title: string | null;
}

export async function muatKursi(db: Db, edisiId: number, nim: string): Promise<Kursi | null> {
  const [r] = await db
    .select({
      division: recCommittee.division,
      isKoor: recCommittee.isKoor,
      title: recCommittee.title,
    })
    .from(recCommittee)
    .where(and(eq(recCommittee.editionId, edisiId), eq(recCommittee.asistenNim, nim)))
    .limit(1);
  return r ?? null;
}

export async function muatKursiSemua(db: Db, edisiId: number): Promise<SeatRow[]> {
  const rows = await db
    .select({
      nim: recCommittee.asistenNim,
      nama: asisten.nama,
      kode: asisten.kode,
      division: recCommittee.division,
      isKoor: recCommittee.isKoor,
      title: recCommittee.title,
    })
    .from(recCommittee)
    .innerJoin(asisten, eq(asisten.nim, recCommittee.asistenNim))
    .where(eq(recCommittee.editionId, edisiId))
    .orderBy(asc(recCommittee.division), desc(recCommittee.isKoor), asc(asisten.kode));
  return rows;
}

/**
 * The Asisten the Ketua may seat: everyone not inactive or alumni (on leave
 * is not special-cased, user 2026-10-23). Only a caller with the board or
 * seatKetua right ever gets this list.
 */
export async function muatKolam(db: Db): Promise<{ nim: string; nama: string; kode: string }[]> {
  return db
    .select({ nim: asisten.nim, nama: asisten.nama, kode: asisten.kode })
    .from(asisten)
    .where(notInArray(asisten.status, ["nonaktif", "alumni"]))
    .orderBy(asc(asisten.kode));
}

/** A candidate's row for one NIM. The caller names the NIM; nothing here widens it. */
export async function muatKandidat(
  db: Db,
  edisiId: number,
  nim: string,
): Promise<RecCandidateRow | null> {
  const [r] = await db
    .select()
    .from(recCandidate)
    .where(and(eq(recCandidate.editionId, edisiId), eq(recCandidate.nim, nim)))
    .limit(1);
  // A second look in code: whatever the query returned, it is this NIM's.
  return r && r.nim === nim ? r : null;
}

export function kandidatSendiri(r: RecCandidateRow): CandidateSelf {
  return {
    id: r.id,
    status: r.status,
    stage: r.currentStage,
    appliedAt: r.appliedAt.toISOString(),
    biodata: r.biodata,
    reviewNote: r.reviewNote,
  };
}

export async function muatDokumen(
  db: Db,
  kandidatId: number,
): Promise<(RecDocument & { id: number })[]> {
  const rows = await db
    .select({
      id: recDocument.id,
      kind: recDocument.kind,
      size: recDocument.size,
      uploadedAt: recDocument.uploadedAt,
      note: recDocument.note,
    })
    .from(recDocument)
    .where(eq(recDocument.candidateId, kandidatId))
    .orderBy(asc(recDocument.kind));
  return rows.map((d) => ({ ...d, uploadedAt: d.uploadedAt.toISOString() }));
}

/** Every stage result of one candidate, as the standing and the envelope read it. */
export async function muatHasil(
  db: Db,
  kandidatId: number,
): Promise<(ResultLite & { id: number })[]> {
  return db
    .select({
      id: recStageResult.id,
      stage: recStageResult.stage,
      proposal: recStageResult.proposal,
      locked: recStageResult.locked,
      revealAt: recStageResult.revealAt,
      openedAt: recStageResult.openedAt,
    })
    .from(recStageResult)
    .where(eq(recStageResult.candidateId, kandidatId));
}

/** The stage results of many candidates at once, by candidate id. */
export async function muatHasilBanyak(
  db: Db,
  ids: number[],
): Promise<Map<number, (ResultLite & { id: number })[]>> {
  const peta = new Map<number, (ResultLite & { id: number })[]>();
  if (!ids.length) return peta;
  const rows = await db
    .select({
      id: recStageResult.id,
      candidateId: recStageResult.candidateId,
      stage: recStageResult.stage,
      proposal: recStageResult.proposal,
      locked: recStageResult.locked,
      revealAt: recStageResult.revealAt,
      openedAt: recStageResult.openedAt,
    })
    .from(recStageResult)
    .where(inArray(recStageResult.candidateId, ids));
  for (const { candidateId, ...r } of rows) {
    const ada = peta.get(candidateId);
    if (ada) ada.push(r);
    else peta.set(candidateId, [r]);
  }
  return peta;
}

/**
 * Where a candidate stands. By default as the server sees it (a revealed
 * result counts), which authorises picking and attending. `seen` is for the
 * candidate's own page and banner: a result counts once they opened it.
 */
export async function muatStanding(
  db: Db,
  events: readonly RecEvent[],
  k: Pick<RecCandidateRow, "id" | "status" | "currentStage">,
  now: Date,
  seen = false,
): Promise<Standing> {
  return standing(k, await muatHasil(db, k.id), events, now, { seen });
}

const CUT: readonly string[] = CUT_STAGES;
const urutTahap = (x: { stage: string }, y: { stage: string }) =>
  STAGES.indexOf(x.stage as CutStage) - STAGES.indexOf(y.stage as CutStage);

/** The envelopes a candidate may see (revealed), and the ones still waiting (no result). */
export async function muatAmplop(
  db: Db,
  kandidatId: number,
  now: Date,
): Promise<{ envelopes: EnvelopeView[]; pending: { stage: CutStage; revealAt: string }[] }> {
  const rows = (await muatHasil(db, kandidatId)).filter(
    (r) => r.locked && r.revealAt && CUT.includes(r.stage),
  );
  const envelopes: EnvelopeView[] = [];
  const pending: { stage: CutStage; revealAt: string }[] = [];
  for (const r of rows) {
    const stage = r.stage as CutStage;
    if (!envelopeVisible(r, now)) {
      pending.push({ stage, revealAt: r.revealAt!.toISOString() });
      continue;
    }
    const buka = !!r.openedAt;
    envelopes.push({
      stage,
      opened: buka,
      // A sealed envelope carries nothing about the result.
      result: buka ? r.proposal : null,
      revealAt: r.revealAt!.toISOString(),
      through: STAGES.slice(0, STAGES.indexOf(stage)),
    });
  }
  return { envelopes: envelopes.sort(urutTahap), pending: pending.sort(urutTahap) };
}

/** When the candidate's latest opened Gagal was revealed, for the thank-you line (7 days from it). */
export async function muatWaktuGagal(db: Db, kandidatId: number, now: Date): Promise<Date | null> {
  const [r] = await db
    .select({ at: sql<Date | null>`max(${recStageResult.revealAt})` })
    .from(recStageResult)
    .where(
      and(
        eq(recStageResult.candidateId, kandidatId),
        eq(recStageResult.locked, true),
        eq(recStageResult.proposal, "gagal"),
        isNotNull(recStageResult.openedAt),
        sql`${recStageResult.revealAt} <= ${now.toISOString()}`,
      ),
    );
  return r?.at ? new Date(r.at) : null;
}

/** The events a candidate sits in (their slots): the calendar shows these to them (audience own). */
export async function muatEventSendiri(db: Db, kandidatId: number): Promise<number[]> {
  const rows = await db
    .select({ eventId: recSlot.eventId })
    .from(recSlotAssignment)
    .innerJoin(recSlot, eq(recSlot.id, recSlotAssignment.slotId))
    .where(eq(recSlotAssignment.candidateId, kandidatId));
  return rows.map((r) => r.eventId).filter((v): v is number => v !== null);
}

/** The files as Admin checks them: with the verdict and whether a re-upload replaced an earlier one. */
export async function muatBerkas(db: Db, kandidatId: number): Promise<BerkasFile[]> {
  const rows = await db
    .select({
      id: recDocument.id,
      kind: recDocument.kind,
      size: recDocument.size,
      uploadedAt: recDocument.uploadedAt,
      note: recDocument.note,
      verdict: recDocument.verdict,
      prevR2Key: recDocument.prevR2Key,
      prevUploadedAt: recDocument.prevUploadedAt,
    })
    .from(recDocument)
    .where(eq(recDocument.candidateId, kandidatId))
    .orderBy(asc(recDocument.kind));
  return rows.map((d) => ({
    id: d.id,
    kind: d.kind,
    size: d.size,
    uploadedAt: d.uploadedAt.toISOString(),
    note: d.note,
    verdict: d.verdict,
    hasPrev: !!d.prevR2Key,
    prevUploadedAt: d.prevUploadedAt ? d.prevUploadedAt.toISOString() : null,
  }));
}

/** Counts of the required documents per candidate. */
export async function hitungDokumen(
  db: Db,
  ids: number[],
  jenis: readonly string[],
): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: recDocument.candidateId, n: sql<number>`count(*)::int` })
    .from(recDocument)
    .where(
      and(
        inArray(recDocument.candidateId, ids),
        inArray(recDocument.kind, jenis as (typeof recDocument.kind.enumValues)[number][]),
      ),
    )
    .groupBy(recDocument.candidateId);
  return new Map(rows.map((r) => [r.id, r.n]));
}
