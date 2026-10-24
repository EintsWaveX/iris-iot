/**
 * Recruitment calendar, pure: dates in WIB as "YYYY-MM-DD" strings (no
 * timezone maths), the colour of each kind, and the spanning-bar layout of a
 * month grid. Weeks start on Monday, like the TP calendar (tp-kalender.ts).
 *
 * An event is drawn as one bar per week it touches. `startsHere` and
 * `endsHere` tell the view where to round the corners and where to draw an
 * arrow that continues into the next or previous week.
 */
import type { EventKind, RecEvent } from "./types.js";

/** Colour tokens the view maps to the kosmik palette. */
export type PaletteKey =
  "violet" | "blue" | "teal" | "green" | "amber" | "orange" | "rose" | "slate" | "pink";

export const PALETTE_KEYS: readonly PaletteKey[] = [
  "violet",
  "blue",
  "teal",
  "green",
  "amber",
  "orange",
  "rose",
  "slate",
  "pink",
];

export const KIND_PALETTE: Record<EventKind, PaletteKey> = {
  registration: "green",
  review: "teal",
  announcement: "amber",
  meeting: "blue",
  pleno: "slate",
  test: "violet",
  makeup: "orange",
  cutting: "rose",
  interview: "violet",
  work: "teal",
  presentation: "blue",
  teaching: "violet",
  acceptance: "amber",
  // Pilih Jadwal has its own look (the S2 mockup, #f472b6).
  pick: "pink",
};

/** An event's own colour when set, else its kind's. */
export function eventColor(e: Pick<RecEvent, "kind" | "color">): string {
  return e.color ?? KIND_PALETTE[e.kind];
}

const DAY_MS = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** A date moved by n days. */
export function addDays(d: string, n: number): string {
  return new Date(utc(d) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b later is positive). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS);
}

/** 0 for Monday to 6 for Sunday. */
const dowSenin = (d: string) => (new Date(utc(d)).getUTCDay() + 6) % 7;

/** The events that fall on a date, in calendar order. */
export function eventsOnDay<T extends Pick<RecEvent, "startsOn" | "endsOn" | "sort">>(
  events: readonly T[],
  date: string,
): T[] {
  return events
    .filter((e) => e.startsOn <= date && e.endsOn >= date)
    .sort((a, b) => a.sort - b.sort);
}

export interface Bar {
  eventId: number;
  /** Column in the week, 0 (Monday) to 6 */
  col: number;
  span: number;
  lane: number;
  /** The event starts in this week (round the left edge) */
  startsHere: boolean;
  /** The event ends in this week (round the right edge) */
  endsHere: boolean;
}

export interface Week {
  days: { date: string; inMonth: boolean }[];
  bars: Bar[];
  /** How many lanes the bars of this week use */
  lanes: number;
}

export interface MonthLayout {
  /** "YYYY-MM" */
  month: string;
  weeks: Week[];
}

/** A month's weeks with every event as spanning bars. `bulan` is "2026-10". */
export function layoutMonth(
  events: readonly Pick<RecEvent, "id" | "startsOn" | "endsOn" | "sort">[],
  bulan: string,
): MonthLayout {
  const pertama = `${bulan}-01`;
  const [y, m] = bulan.split("-").map(Number);
  const terakhir = addDays(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), -1);
  const awal = addDays(pertama, -dowSenin(pertama));
  const akhir = addDays(terakhir, 6 - dowSenin(terakhir));
  const weeks: Week[] = [];
  for (let ws = awal; ws <= akhir; ws = addDays(ws, 7)) {
    const we = addDays(ws, 6);
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(ws, i);
      return { date, inMonth: date.startsWith(bulan) };
    });
    const sentuh = events
      .filter((e) => e.startsOn <= we && e.endsOn >= ws)
      .map((e) => {
        const col = Math.max(0, daysBetween(ws, e.startsOn));
        const ujung = Math.min(6, daysBetween(ws, e.endsOn));
        return {
          e,
          col,
          span: ujung - col + 1,
          startsHere: e.startsOn >= ws,
          endsHere: e.endsOn <= we,
        };
      })
      // Left to right, the longer first, then calendar order.
      .sort((a, b) => a.col - b.col || b.span - a.span || a.e.sort - b.e.sort || a.e.id - b.e.id);
    const lanePenuh: number[] = [];
    const bars: Bar[] = sentuh.map((s) => {
      let lane = lanePenuh.findIndex((end) => end < s.col);
      if (lane === -1) lane = lanePenuh.length;
      lanePenuh[lane] = s.col + s.span - 1;
      return {
        eventId: s.e.id,
        col: s.col,
        span: s.span,
        lane,
        startsHere: s.startsHere,
        endsHere: s.endsHere,
      };
    });
    weeks.push({ days, bars, lanes: lanePenuh.length });
  }
  return { month: bulan, weeks };
}
