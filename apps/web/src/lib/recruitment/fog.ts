/**
 * The candidate's fog (mockup, 2026-10-27): a CaAs sees what they need now.
 * Stages passed are clear, the one they are on is lit, and everything ahead
 * stays under mist (the next stage clears when its envelope is opened and the
 * star moves). The API applies this to the
 * calendar it sends (never only CSS); the journey draws the same limit.
 */
import { STAGES, type CandidateStatus, type RecEvent, type StageKey } from "./types.js";

/**
 * The last stage, as an index into STAGES, whose dates this viewer may see.
 * Nobody signed in as a candidate (a visitor, a withdrawn CaAs) sees Berkas,
 * where registration lives. A cut CaAs sees up to the stage they reached.
 */
export function fogLimit(c: { status: CandidateStatus; stage: StageKey } | null): number {
  if (!c || c.status === "withdrawn") return 0;
  const i = STAGES.indexOf(c.stage);
  return i;
}

/** Events past the limit are dropped, except the ones this CaAs was plotted into. */
export function fogEvents<T extends Pick<RecEvent, "id" | "stage">>(
  events: readonly T[],
  limit: number,
  ownEventIds: readonly number[] = [],
): T[] {
  return events.filter(
    (e) => !e.stage || STAGES.indexOf(e.stage) <= limit || ownEventIds.includes(e.id),
  );
}
