/**
 * The Home banner (PRD 5.1), one shape per viewer, built from the calendar
 * and a few facts about the viewer. Pure: the API gathers the facts with a
 * handful of queries, this decides what to show.
 *
 * A signed out visitor gets the title and the dates and nothing else: no
 * names, no NIM, no internal event, and only while registration is open.
 */
import {
  eventEnded,
  eventsToday,
  gateClosesAt,
  gateOpen,
  nextPublicEvent,
  phaseOf,
  visibleEvents,
} from "./gates.js";
import type { BannerResponse, CandidateStatus, EventLite, RecEvent, StageKey } from "./types.js";

/** The thank-you line for a cut candidate shows this long after the reveal. */
export const SYUKUR_HARI = 7;

export type BannerViewer =
  | { kind: "visitor" }
  | {
      kind: "praktikan";
      candidate: {
        status: CandidateStatus;
        stage: StageKey;
        /** When a Gagal reveal became visible, if one did */
        cutAt: Date | null;
        /** Events the candidate is plotted into or offered */
        ownEventIds?: readonly number[];
        /** A reveal waits to be opened (S2) */
        envelope?: boolean;
      } | null;
    }
  | { kind: "asisten"; panitia: boolean; seat: string | null };

export interface BannerInput {
  /** The live edition, or null */
  edition: { title: string; status: "live" } | null;
  /** The next edition is announced (a draft exists) */
  segera: boolean;
  events: readonly RecEvent[];
  now: Date;
  viewer: BannerViewer;
}

export const lite = (e: RecEvent): EventLite => ({
  id: e.id,
  kind: e.kind,
  title: e.title,
  startsOn: e.startsOn,
  endsOn: e.endsOn,
  dayStart: e.dayStart,
  dayEnd: e.dayEnd,
  place: e.place,
});

/** The registration event to talk about: the one open now, else the next, else none. */
function acaraDaftar(events: readonly RecEvent[], now: Date): RecEvent | null {
  const daftar = events.filter((e) => e.gates.includes("daftar")).sort((a, b) => a.sort - b.sort);
  return (
    daftar.find((e) => gateOpen([e], "daftar", now)) ??
    daftar.find((e) => !eventEnded(e, now)) ??
    null
  );
}

export function susunBanner(i: BannerInput): BannerResponse {
  const kosong: BannerResponse = { ok: true, kind: "none", segera: i.segera };
  if (!i.edition) return kosong;
  const title = i.edition.title;
  const daftarBuka = gateOpen(i.events, "daftar", i.now);

  switch (i.viewer.kind) {
    case "visitor": {
      // Nothing outside the Panitia until registration opens (user, 2026-10-23).
      if (!daftarBuka) return kosong;
      const e = acaraDaftar(i.events, i.now);
      if (!e) return kosong;
      return {
        ok: true,
        kind: "visitor",
        title,
        opens: e.startsOn,
        closes: e.endsOn,
        daftarOpen: daftarBuka,
      };
    }
    case "praktikan": {
      const c = i.viewer.candidate;
      if (!c) {
        if (!daftarBuka) return kosong;
        return {
          ok: true,
          kind: "praktikan",
          title,
          daftarOpen: true,
          closesAt: gateClosesAt(i.events, "daftar", i.now),
        };
      }
      if (c.status === "withdrawn") return kosong;
      if (c.status === "out") {
        const batas = c.cutAt && c.cutAt.getTime() + SYUKUR_HARI * 86_400_000;
        if (c.cutAt && batas && i.now.getTime() <= batas)
          return { ok: true, kind: "cut", title, stage: c.stage };
        return kosong;
      }
      const lanjut = nextPublicEvent(i.events, i.now, c.ownEventIds ?? []);
      return {
        ok: true,
        kind: "candidate",
        title,
        status: c.status,
        stage: c.stage,
        phase: phaseOf(i.events, c.stage, i.now),
        next: lanjut ? lite(lanjut) : null,
        envelope: c.envelope ?? false,
      };
    }
    case "asisten": {
      if (i.viewer.panitia) {
        return {
          ok: true,
          kind: "panitia",
          title,
          today: eventsToday(i.events, i.now).map(lite),
          seat: i.viewer.seat,
        };
      }
      const hari = eventsToday(visibleEvents(i.events, { kind: "asisten" }), i.now).map(lite);
      return hari.length ? { ok: true, kind: "asisten", title, today: hari } : kosong;
    }
  }
}
