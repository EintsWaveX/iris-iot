/**
 * Recruitment reads shared by the routes: the live edition, its calendar,
 * who sits where, and a candidate's own row. Rows become the shapes of
 * src/lib/recruitment/types.ts here and nowhere else.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  recCandidate,
  recCommittee,
  recDocument,
  recEdition,
  recEvent,
  recStageResult,
  type RecCandidateRow,
  type RecEventRow,
} from "../../src/lib/schema.js";
import type {
  CandidateSelf,
  CommitteeDivision,
  EditionInfo,
  EnvelopeSelf,
  RecDocument,
  RecEvent,
  SeatRow,
} from "../../src/lib/recruitment/types.js";

export type Db = ReturnType<typeof getDb>;

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

/** The envelopes a candidate may see: locked, and the reveal time has passed. */
export async function muatAmplop(db: Db, kandidatId: number, now: Date): Promise<EnvelopeSelf[]> {
  const rows = await db
    .select({
      stage: recStageResult.stage,
      proposal: recStageResult.proposal,
      revealAt: recStageResult.revealAt,
      openedAt: recStageResult.openedAt,
    })
    .from(recStageResult)
    .where(and(eq(recStageResult.candidateId, kandidatId), eq(recStageResult.locked, true)));
  return rows
    .filter((r) => r.revealAt && r.revealAt <= now)
    .map((r) => ({
      stage: r.stage,
      ready: true,
      opened: r.openedAt !== null,
      result: r.proposal,
    }));
}

/** When a Gagal reveal became visible to this candidate, for the thank-you line. */
export async function muatWaktuGagal(db: Db, kandidatId: number, now: Date): Promise<Date | null> {
  const [r] = await db
    .select({ at: sql<Date | null>`max(${recStageResult.revealAt})` })
    .from(recStageResult)
    .where(
      and(
        eq(recStageResult.candidateId, kandidatId),
        eq(recStageResult.locked, true),
        eq(recStageResult.proposal, "gagal"),
        sql`${recStageResult.revealAt} <= ${now.toISOString()}`,
      ),
    );
  return r?.at ? new Date(r.at) : null;
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
