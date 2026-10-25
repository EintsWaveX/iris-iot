/**
 * Where a candidate stands, worked out when it is read (S2).
 *
 * rec_candidate keeps the status Admin gave (applied, revision, approved,
 * withdrawn) and the first stage; a stage's result lives in rec_stage_result.
 * Nothing is written when the Ketua locks a stage or when the reveal time
 * passes, so nothing can leak early and no job has to run at the right
 * moment: a locked result only counts from its `revealAt`, and the journey
 * moves on from there. Gagal sets "out" and the journey stops at that stage;
 * Lolos moves the candidate to the next one.
 *
 * First Meet has no Cutting of its own: the candidate reads as First Meet
 * until the First Meet is over, then as Tes Tulis. Pilih Jadwal Tes Tulis
 * opens the evening before it (PRD 3), so the Tes Tulis slots are for those at
 * First Meet or Tes Tulis.
 */
import { eventEnded } from "./gates.js";
import type { CandidateStatus, Proposal, RecEvent, StageKey } from "./types.js";

export interface ResultLite {
  stage: StageKey;
  proposal: Proposal | null;
  locked: boolean;
  revealAt: Date | null;
  /** When the candidate opened the envelope; only the candidate's own views wait for it */
  openedAt?: Date | null;
}

export interface Standing {
  status: CandidateStatus;
  stage: StageKey;
}

/** How far along a stage is. First Meet and Tes Tulis share a rank on purpose. */
const RANK: Record<StageKey, number> = {
  berkas: 0,
  first_meet: 1,
  tes_tulis: 1,
  wawancara: 2,
  tubes: 3,
  mengajar: 4,
  penerimaan: 5,
};

/** What a Lolos moves on to. */
const NEXT: Partial<Record<StageKey, StageKey>> = {
  berkas: "first_meet",
  tes_tulis: "wawancara",
  wawancara: "tubes",
  tubes: "mengajar",
  mengajar: "penerimaan",
};

type PertemuanLite = Pick<
  RecEvent,
  "kind" | "stage" | "startsOn" | "endsOn" | "dayStart" | "dayEnd"
>;

export function standing(
  base: { status: CandidateStatus; currentStage?: StageKey; stage?: StageKey },
  results: readonly ResultLite[],
  events: readonly PertemuanLite[],
  now: Date,
  /** seen: count a result only once the candidate opened it (their own page and banner never spoil) */
  opts: { seen?: boolean } = {},
): Standing {
  let status = base.status;
  let stage = base.currentStage ?? base.stage ?? "berkas";
  const nampak = results
    .filter(
      (r) =>
        r.locked && r.proposal && r.revealAt && r.revealAt <= now && (!opts.seen || !!r.openedAt),
    )
    .sort((a, b) => RANK[a.stage] - RANK[b.stage] || (a.stage === "first_meet" ? -1 : 1));
  for (const r of nampak) {
    if (status === "out") break;
    if (r.proposal === "gagal") {
      if (status !== "withdrawn") status = "out";
      stage = r.stage;
      break;
    }
    const lanjut = NEXT[r.stage];
    if (lanjut && RANK[lanjut] > RANK[stage]) stage = lanjut;
  }
  if (stage === "first_meet" && status !== "out") {
    const fm = events.find((e) => e.kind === "meeting" && e.stage === "first_meet");
    if (fm && eventEnded(fm, now)) stage = "tes_tulis";
  }
  return { status, stage };
}

const hidup = (s: Pick<Standing, "status">) => s.status !== "out" && s.status !== "withdrawn";

/** In this stage and still going: may pick one of its slots. */
export function pickEligible(s: Standing, stage: StageKey): boolean {
  return hidup(s) && RANK[s.stage] === RANK[stage];
}

/** Has reached the event's stage and is not out: a QR scan counts for them. */
export function attendEligible(s: Standing, eventStage: StageKey | null): boolean {
  return !!eventStage && hidup(s) && s.status !== "accepted" && RANK[s.stage] >= RANK[eventStage];
}

/**
 * On a stage's Cutting board: everyone who got there, including those cut at
 * it, but not those cut earlier, and not someone who withdrew unless the
 * stage already holds a result for them.
 */
export function cuttingPool(s: Standing, stage: StageKey, hasResult: boolean): boolean {
  if (s.status === "withdrawn") return hasResult;
  return RANK[s.stage] >= RANK[stage];
}
