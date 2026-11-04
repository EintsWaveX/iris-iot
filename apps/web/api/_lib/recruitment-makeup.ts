/**
 * What the Susulan offer needs from the database, shared by its routes
 * (recruitment-s6.ts), Penilaian and Cutting (recruitment-s4.ts): the stage's
 * Susulan day, the answer deadline and each CaAs's standing in the offer.
 * Kept apart from both so neither imports the other.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  recCandidate,
  recExamRoom,
  recExamSeat,
  recMakeup,
  recSlot,
  recSlotAssignment,
  type RecMakeupRow,
} from "../../src/lib/schema.js";
import { tanggalWib } from "../../src/lib/recruitment/gates.js";
import {
  makeupDeadline,
  makeupState,
  tulisTidakHadir,
  type MakeupStage,
  type MakeupStanding,
} from "../../src/lib/recruitment/makeup.js";
import type { RecEvent } from "../../src/lib/recruitment/types.js";
import { muatEvents, type Db } from "./recruitment-data.js";
import { bacaSetting } from "./recruitment-settings.js";

export interface MakeupCtx {
  /** The stage's Susulan event in the calendar, null when there is none */
  event: RecEvent | null;
  /** Every Susulan event of the stage (a slot on any of their days is a Susulan seat) */
  events: RecEvent[];
  deadline: Date | null;
}

export async function muatMakeupCtx(
  db: Db,
  edisiId: number,
  stage: MakeupStage,
): Promise<MakeupCtx> {
  const semua = await muatEvents(db, edisiId);
  const events = semua.filter((e) => e.stage === stage && e.kind === "makeup");
  const event = events[0] ?? null;
  if (!event) return { event, events, deadline: null };
  // Tes Tulis has no interview settings: its answer is due the day before, at noon (the same default).
  const t =
    stage === "tes_tulis" ? { makeupDays: 1, makeupHour: 12 } : await bacaSetting(db, stage);
  return { event, events, deadline: makeupDeadline(event.startsOn, t.makeupDays, t.makeupHour) };
}

/** A slot that starts on a Susulan day is a seat in the Susulan. */
export function diHariSusulan(ctx: MakeupCtx, startsAt: Date): boolean {
  const hari = tanggalWib(startsAt).tanggal;
  return ctx.events.some((e) => hari >= e.startsOn && hari <= e.endsOn);
}

export async function muatBarisMakeup(
  db: Db,
  stage: MakeupStage,
  kandidatIds: number[],
): Promise<Map<number, RecMakeupRow>> {
  if (!kandidatIds.length) return new Map();
  const rows = await db
    .select()
    .from(recMakeup)
    .where(and(inArray(recMakeup.candidateId, kandidatIds), eq(recMakeup.stage, stage)));
  return new Map(rows.map((r) => [r.candidateId, r]));
}

export const posisiMakeup = (
  ctx: MakeupCtx,
  row: RecMakeupRow | undefined,
  slotMulai: Date | null,
  now: Date,
): MakeupStanding =>
  makeupState({
    row: row ?? null,
    placed: !!slotMulai && diHariSusulan(ctx, slotMulai),
    deadline: ctx.deadline,
    now,
  });

/**
 * Tes Tulis has no sheet that says "offer the Susulan", so the ones who need it
 * are the CaAs who held a seat in a real room that has finished, and never
 * checked in or were never dealt a question: they did not come. A practice room
 * counts for nothing. Whoever the Panitia then offers sits in rec_makeup like
 * the interview stages.
 */
export async function muatTidakHadirTulis(db: Db, edisiId: number): Promise<Set<number>> {
  const rows = await db
    .select({
      candidateId: recSlotAssignment.candidateId,
      state: recExamRoom.state,
      seatId: recExamSeat.id,
      checkin: recExamSeat.checkin,
      draw: recExamSeat.draw,
    })
    .from(recSlotAssignment)
    .innerJoin(recSlot, eq(recSlot.id, recSlotAssignment.slotId))
    .innerJoin(recCandidate, eq(recCandidate.id, recSlotAssignment.candidateId))
    .innerJoin(
      recExamRoom,
      and(eq(recExamRoom.slotId, recSlot.id), eq(recExamRoom.rehearsal, false)),
    )
    .leftJoin(
      recExamSeat,
      and(
        eq(recExamSeat.roomId, recExamRoom.id),
        eq(recExamSeat.candidateId, recSlotAssignment.candidateId),
      ),
    )
    .where(and(eq(recSlotAssignment.stage, "tes_tulis"), eq(recCandidate.editionId, edisiId)));
  const out = new Set<number>();
  for (const r of rows) {
    const seat = r.seatId === null ? null : { checkin: r.checkin, draw: r.draw };
    if (tulisTidakHadir({ roomFinished: r.state.stage === "finished", seat }))
      out.add(r.candidateId);
  }
  return out;
}
