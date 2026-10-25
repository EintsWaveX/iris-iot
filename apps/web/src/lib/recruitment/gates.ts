/**
 * The calendar drives the flow (ARCHITECTURE 4): every window recruitment
 * opens or closes is computed here from the events, never from a separate
 * switch. The API calls the same functions on every write that depends on a
 * window; the pages use them for display only.
 *
 * Time is WIB (UTC+7, no daylight saving). Dates are "YYYY-MM-DD" and times
 * "HH:MM", compared as strings.
 *
 * Two readings of a gate:
 * - gateOpen: the date alone. Daftar, Berkas review and the exam day.
 * - gateLive: the date and the event's daily window (First Meet's QR is
 *   only live 18.30 to 21.00). An event without a window is live all day.
 */
import { addDays } from "./calendar.js";
import type { GateKey, Phase, RecEvent, StageKey, Viewer } from "./types.js";

const WIB_MS = 7 * 3_600_000;

/** The date and the time of day in WIB. */
export function tanggalWib(now: Date): { tanggal: string; jam: string } {
  const iso = new Date(now.getTime() + WIB_MS).toISOString();
  return { tanggal: iso.slice(0, 10), jam: iso.slice(11, 16) };
}

type Rentang = Pick<RecEvent, "startsOn" | "endsOn">;
type Jendela = Rentang & Pick<RecEvent, "dayStart" | "dayEnd">;

const dalamRentang = (e: Rentang, tanggal: string) => e.startsOn <= tanggal && e.endsOn >= tanggal;

/** Running now: today is one of its days and, with a window, the time is inside it. */
export function eventLive(e: Jendela, now: Date): boolean {
  const { tanggal, jam } = tanggalWib(now);
  if (!dalamRentang(e, tanggal)) return false;
  return !e.dayStart || !e.dayEnd || (jam >= e.dayStart && jam < e.dayEnd);
}

/** The kinds that are an evening people come to; registration, announcements, picks, reviews, plenos and cuttings are not. */
const KIND_HADIR: readonly string[] = [
  "meeting",
  "test",
  "makeup",
  "interview",
  "work",
  "presentation",
  "teaching",
];

/** Whether a QR and a Kehadiran list make sense for the event: public, a gathering or opened with the qr gate. */
export const eventHadir = (e: Pick<RecEvent, "kind" | "gates" | "internal">): boolean =>
  !e.internal && (KIND_HADIR.includes(e.kind) || e.gates.includes("qr"));

/** Over: past its last day, or past its window's end on that day. */
export function eventEnded(e: Jendela, now: Date): boolean {
  const { tanggal, jam } = tanggalWib(now);
  if (tanggal > e.endsOn) return true;
  return tanggal === e.endsOn && !!e.dayEnd && jam >= e.dayEnd;
}

/** The events on today's date, in calendar order. */
export function eventsToday<T extends Rentang & Pick<RecEvent, "sort">>(
  events: readonly T[],
  now: Date,
): T[] {
  const { tanggal } = tanggalWib(now);
  return events.filter((e) => dalamRentang(e, tanggal)).sort((a, b) => a.sort - b.sort);
}

type DenganGerbang = Jendela & Pick<RecEvent, "gates" | "stage">;

function cocok(e: DenganGerbang, gate: GateKey, stage?: StageKey) {
  return e.gates.includes(gate) && (!stage || e.stage === stage);
}

/** True while an event carrying the gate has today among its days. */
export function gateOpen(
  events: readonly DenganGerbang[],
  gate: GateKey,
  now: Date,
  stage?: StageKey,
): boolean {
  const { tanggal } = tanggalWib(now);
  return events.some((e) => cocok(e, gate, stage) && dalamRentang(e, tanggal));
}

/** gateOpen, narrowed by the event's daily window. */
export function gateLive(
  events: readonly DenganGerbang[],
  gate: GateKey,
  now: Date,
  stage?: StageKey,
): boolean {
  return events.some((e) => cocok(e, gate, stage) && eventLive(e, now));
}

/**
 * The instant a gate that is open now closes: 00.00 WIB after the last day
 * of the run of events that carry it back to back (Open then Extend count as
 * one registration). Null when the gate is closed.
 */
export function gateClosesAt(
  events: readonly DenganGerbang[],
  gate: GateKey,
  now: Date,
  stage?: StageKey,
): string | null {
  const { tanggal } = tanggalWib(now);
  const milik = events.filter((e) => cocok(e, gate, stage));
  const buka = milik.filter((e) => dalamRentang(e, tanggal));
  if (!buka.length) return null;
  let akhir = buka.reduce((m, e) => (e.endsOn > m ? e.endsOn : m), buka[0].endsOn);
  for (let lagi = true; lagi;) {
    lagi = false;
    for (const e of milik) {
      if (e.startsOn <= addDays(akhir, 1) && e.endsOn > akhir) {
        akhir = e.endsOn;
        lagi = true;
      }
    }
  }
  return new Date(`${addDays(akhir, 1)}T00:00:00+07:00`).toISOString();
}

/** How far along a stage the kind of event shows; pleno is internal talk and counts for none. */
const PERAN: Partial<Record<RecEvent["kind"], Phase>> = {
  registration: "open",
  meeting: "open",
  test: "open",
  makeup: "open",
  interview: "open",
  work: "open",
  presentation: "open",
  teaching: "open",
  review: "review",
  cutting: "cutting",
  announcement: "announced",
  acceptance: "announced",
};
const URUTAN: Phase[] = ["before", "open", "review", "cutting", "announced"];

/**
 * Where a stage stands: the furthest role among its events that have
 * started (open, then review, then cutting), or announced once the
 * Pengumuman has started. Before any of them starts, before.
 */
export function phaseOf(
  events: readonly Pick<RecEvent, "stage" | "kind" | "startsOn">[],
  stage: StageKey,
  now: Date,
): Phase {
  const { tanggal } = tanggalWib(now);
  let fase: Phase = "before";
  for (const e of events) {
    const peran = PERAN[e.kind];
    if (e.stage !== stage || !peran || e.startsOn > tanggal) continue;
    if (URUTAN.indexOf(peran) > URUTAN.indexOf(fase)) fase = peran;
  }
  return fase;
}

/**
 * What a viewer may see on the calendar. The Panitia (and hakPenuh) see
 * everything. Everyone else sees public events only, never an internal one;
 * a candidate also sees the events they are plotted into or were offered
 * (audience own and offered), by id.
 */
export function visibleEvents<T extends Pick<RecEvent, "id" | "internal" | "audience">>(
  events: readonly T[],
  viewer: Viewer,
): T[] {
  if (viewer.full || viewer.kind === "panitia") return [...events];
  const own = viewer.kind === "candidate" ? (viewer.ownEventIds ?? []) : [];
  return events.filter((e) => !e.internal && (e.audience === "all" || own.includes(e.id)));
}

/**
 * The next event a candidate (or anyone) can be told about: the first public
 * event, or own slot, that has not ended. One running now counts.
 */
export function nextPublicEvent<
  T extends Jendela & Pick<RecEvent, "id" | "internal" | "audience" | "sort">,
>(events: readonly T[], now: Date, ownEventIds?: readonly number[]): T | null {
  const viewer: Viewer = ownEventIds ? { kind: "candidate", ownEventIds } : { kind: "visitor" };
  const naik = visibleEvents(events, viewer)
    .filter((e) => !eventEnded(e, now))
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : a.sort - b.sort));
  return naik[0] ?? null;
}

/**
 * Has this event's stage begun? Then editing or deleting it needs a
 * confirmation and is written to rec_event_log (PRD 3). True once the event's
 * own first day came, or once its stage left "before".
 */
export function tahapSudahMulai(
  events: readonly Pick<RecEvent, "stage" | "kind" | "startsOn">[],
  e: Pick<RecEvent, "stage" | "startsOn">,
  now: Date,
): boolean {
  if (e.startsOn <= tanggalWib(now).tanggal) return true;
  return !!e.stage && phaseOf(events, e.stage, now) !== "before";
}
