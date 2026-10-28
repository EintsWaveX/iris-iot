/**
 * Ringkasan's "Langkah Berikutnya untukmu" (mockup r1-panel): per stage and
 * per division, a few steps, one of them "now". Pure. The panel turns the
 * keys into words (components/recruitment/panel/nextStrings.ts) and fills the
 * numbers and dates from the real data, so nothing here is a sample.
 *
 * Built for the stages up to and including the Tes Tulis. Later stages fall
 * back to a single step that points at the Kalender until their slice lands.
 */
import { phaseOf, tanggalWib } from "./gates.js";
import type { PanelTab } from "./panel-tab.js";
import { STAGES, type CommitteeDivision, type RecEvent, type StageKey } from "./types.js";

export type StepKey =
  | "seatPanitia"
  | "watchApplicants"
  | "prepReview"
  | "decideExtend"
  | "backupFirstMeet"
  | "prepTesNights"
  | "buildBank"
  | "setPlotting"
  | "checkWaiting"
  | "addFromForm"
  | "tellFix"
  | "followReview"
  | "lockCuttingBerkas"
  | "plenoTulis"
  | "prepFirstMeet"
  | "openPilihJadwal"
  | "sendEnvelope"
  | "attendFirstMeet"
  | "runFirstMeet"
  | "lockBank"
  | "rehearseNight"
  | "recordFirstMeet"
  | "markAbsent"
  | "followNight"
  | "lockCuttingTulis"
  | "announceTulis"
  | "runNight"
  | "makeupTulis"
  | "superviseNight"
  | "proposeCutTulis"
  | "recordNight"
  | "watchCalendar"
  | "nothing";

export type StepState = "done" | "now" | "next";
export interface Step {
  key: StepKey;
  state: StepState;
  /** The panel part that does this step, or null when it is only to know. */
  tab: PanelTab | null;
}

/** Where the edition stands: one of the stages and how the registration is going. */
export interface Where {
  stage: StageKey | "daftar";
  /** The phase of that stage (gates.ts) */
  phase: ReturnType<typeof phaseOf>;
}

/**
 * The last stage that has begun. While the registration is the only thing
 * going on in Berkas, the answer is "daftar".
 */
export function whereNow(events: readonly RecEvent[], now: Date): Where {
  const hari = tanggalWib(now).tanggal;
  // Registration still open: the edition is in "daftar", whatever else has begun.
  if (events.some((e) => e.gates.includes("daftar") && e.startsOn <= hari && hari <= e.endsOn))
    return { stage: "daftar", phase: "open" };
  let hasil: Where = { stage: "daftar", phase: "before" };
  for (const stage of STAGES) {
    const phase = phaseOf(events, stage, now);
    if (phase === "before") continue;
    hasil = { stage, phase };
  }
  if (hasil.stage === "berkas" && hasil.phase === "open") return { stage: "daftar", phase: "open" };
  return hasil;
}

const s = (key: StepKey, state: StepState, tab: PanelTab | null): Step => ({ key, state, tab });

type Role = "ketua" | "acara" | "akademik" | "admin" | "other";
export const roleOf = (division: CommitteeDivision | null, penuh: boolean): Role => {
  if (penuh || division === "ketua" || division === "wakil") return "ketua";
  if (division === "acara" || division === "akademik" || division === "admin") return division;
  return "other";
};

type Table = Partial<Record<Role, Step[]>>;
const LAIN: Step[] = [s("watchCalendar", "now", "kalender")];

const DAFTAR: Table = {
  ketua: [
    s("seatPanitia", "done", "panitia"),
    s("watchApplicants", "now", "kandidat"),
    s("prepReview", "next", "kalender"),
  ],
  acara: [
    s("decideExtend", "now", "kalender"),
    s("backupFirstMeet", "next", "kalender"),
    s("prepTesNights", "next", "kalender"),
  ],
  akademik: [
    s("buildBank", "now", "bank"),
    s("setPlotting", "next", "plotting"),
    s("watchCalendar", "next", "kalender"),
  ],
  admin: [
    s("checkWaiting", "now", "kandidat"),
    s("addFromForm", "next", "kandidat"),
    s("tellFix", "next", "kandidat"),
  ],
};
const BERKAS: Table = {
  ketua: [
    s("followReview", "now", "kandidat"),
    s("lockCuttingBerkas", "next", "cutting"),
    s("plenoTulis", "next", "kalender"),
  ],
  acara: [
    s("prepFirstMeet", "now", "kalender"),
    s("openPilihJadwal", "next", "kalender"),
    s("prepTesNights", "next", "kalender"),
  ],
  akademik: [
    s("buildBank", "now", "bank"),
    s("setPlotting", "next", "plotting"),
    s("watchCalendar", "next", "kalender"),
  ],
  admin: [
    s("checkWaiting", "now", "kandidat"),
    s("lockCuttingBerkas", "next", "cutting"),
    s("sendEnvelope", "next", "cutting"),
  ],
};
const FIRST_MEET: Table = {
  ketua: [
    s("attendFirstMeet", "now", "kalender"),
    s("plenoTulis", "next", "kalender"),
    s("watchCalendar", "next", "kalender"),
  ],
  acara: [
    s("runFirstMeet", "now", "kalender"),
    s("prepTesNights", "next", "tes"),
    s("watchCalendar", "next", "kalender"),
  ],
  akademik: [
    s("lockBank", "now", "bank"),
    s("setPlotting", "next", "plotting"),
    s("rehearseNight", "next", "tes"),
  ],
  admin: [
    s("recordFirstMeet", "now", "kalender"),
    s("markAbsent", "next", "kalender"),
    s("watchCalendar", "next", "kalender"),
  ],
};
const TES_TULIS: Table = {
  ketua: [
    s("followNight", "now", "tes"),
    s("lockCuttingTulis", "next", "cutting"),
    s("announceTulis", "next", "kalender"),
  ],
  acara: [
    s("runNight", "now", "tes"),
    s("makeupTulis", "next", "kalender"),
    s("watchCalendar", "next", "kalender"),
  ],
  akademik: [
    s("superviseNight", "now", "tes"),
    s("proposeCutTulis", "next", "cutting"),
    s("setPlotting", "next", "plotting"),
  ],
  admin: [
    s("recordNight", "now", "tes"),
    s("proposeCutTulis", "next", "cutting"),
    s("sendEnvelope", "next", "cutting"),
  ],
};

/**
 * The steps for a division at a place in the edition. A step is only
 * offered with its tab when the person has that tab (`has`), otherwise it is
 * kept as a thing to know.
 */
export function nextSteps(
  where: Where,
  role: Role,
  has: readonly PanelTab[],
): { now: Step; others: Step[] } {
  const table =
    where.stage === "daftar"
      ? DAFTAR
      : where.stage === "berkas"
        ? BERKAS
        : where.stage === "first_meet"
          ? FIRST_MEET
          : where.stage === "tes_tulis"
            ? TES_TULIS
            : null;
  const list = (table?.[role] ?? LAIN).map((x) => ({
    ...x,
    tab: x.tab && has.includes(x.tab) ? x.tab : null,
  }));
  const now = list.find((x) => x.state === "now") ?? list[0] ?? s("nothing", "now", null);
  return { now, others: list.filter((x) => x !== now) };
}

/** The first event of a stage and kind, for the dates in the step text. */
export function eventOf(
  events: readonly RecEvent[],
  stage: StageKey,
  kind: RecEvent["kind"],
): RecEvent | null {
  return (
    [...events]
      .filter((e) => e.stage === stage && e.kind === kind)
      .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1))[0] ?? null
  );
}

/** Today's WIB date, for callers that only have a Date. */
export const hariWib = (now: Date) => tanggalWib(now).tanggal;
