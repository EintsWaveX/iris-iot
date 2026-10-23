/**
 * Recruitment gates and visibility with a fixed clock in WIB (UTC+7). The
 * seed calendar is the fixture: it is the PRD section 3 table.
 */
import { describe, expect, it } from "vitest";
import { EVENT_SEED } from "../recruitment/seed";
import {
  eventEnded,
  eventLive,
  eventsToday,
  gateClosesAt,
  gateLive,
  gateOpen,
  nextPublicEvent,
  phaseOf,
  tahapSudahMulai,
  tanggalWib,
  visibleEvents,
} from "../recruitment/gates";
import type { RecEvent } from "../recruitment/types";

const EVENTS: RecEvent[] = EVENT_SEED.map((e, i) => ({ ...e, id: i + 1 }));
const wib = (s: string) => new Date(`${s}+07:00`);
const judul = (t: string) => EVENTS.find((e) => e.title === t)!;

describe("tanggalWib", () => {
  it("reads the date and time in WIB, not UTC", () => {
    // 17:30 UTC on the 31st is already 00:30 on 1 November in WIB.
    expect(tanggalWib(new Date("2026-10-31T17:30:00Z"))).toEqual({
      tanggal: "2026-11-01",
      jam: "00:30",
    });
  });
});

describe("gateOpen: Daftar", () => {
  it("is closed before Open Recruitment starts", () => {
    expect(gateOpen(EVENTS, "daftar", wib("2026-10-24T23:59:59"))).toBe(false);
  });
  it("opens at 00.00 WIB on 25 October", () => {
    expect(gateOpen(EVENTS, "daftar", wib("2026-10-25T00:00:00"))).toBe(true);
  });
  it("is still open at 23.59 on 31 October (the last Open day)", () => {
    expect(gateOpen(EVENTS, "daftar", wib("2026-10-31T23:59:00"))).toBe(true);
  });
  it("stays open into Extend at 00.00 on 1 November", () => {
    expect(gateOpen(EVENTS, "daftar", wib("2026-11-01T00:00:00"))).toBe(true);
  });
  it("closes at 00.00 on 3 November, after the last Extend day", () => {
    expect(gateOpen(EVENTS, "daftar", wib("2026-11-02T23:59:00"))).toBe(true);
    expect(gateOpen(EVENTS, "daftar", wib("2026-11-03T00:00:00"))).toBe(false);
  });
  it("counts the day in WIB: 17.00 UTC on 2 Nov is already 3 Nov", () => {
    expect(gateOpen(EVENTS, "daftar", new Date("2026-11-02T17:00:00Z"))).toBe(false);
    expect(gateOpen(EVENTS, "daftar", new Date("2026-11-02T16:59:00Z"))).toBe(true);
  });
  it("answers false when no event carries the gate", () => {
    expect(gateOpen([], "daftar", wib("2026-10-28T12:00:00"))).toBe(false);
  });
});

describe("gateLive: the daily window", () => {
  it("opens the First Meet QR at 18.30 and closes it at 21.00", () => {
    expect(gateLive(EVENTS, "qr", wib("2026-11-12T18:29:00"))).toBe(false);
    expect(gateLive(EVENTS, "qr", wib("2026-11-12T18:30:00"))).toBe(true);
    expect(gateLive(EVENTS, "qr", wib("2026-11-12T20:59:00"))).toBe(true);
    expect(gateLive(EVENTS, "qr", wib("2026-11-12T21:00:00"))).toBe(false);
  });
  it("ignores the window on an event that has none", () => {
    expect(gateLive(EVENTS, "daftar", wib("2026-10-28T03:00:00"))).toBe(true);
  });
  it("keeps the exam gate day-wide for gateOpen but window-bound for gateLive", () => {
    expect(gateOpen(EVENTS, "exam", wib("2026-11-18T10:00:00"))).toBe(true);
    expect(gateLive(EVENTS, "exam", wib("2026-11-18T10:00:00"))).toBe(false);
    expect(gateLive(EVENTS, "exam", wib("2026-11-18T19:00:00"))).toBe(true);
  });
  it("tells the two test evenings from the days between", () => {
    expect(gateOpen(EVENTS, "exam", wib("2026-11-21T19:00:00"))).toBe(false);
  });
});

describe("gateOpen: a stage filter", () => {
  it("separates the Cutting of each stage", () => {
    expect(gateOpen(EVENTS, "cutting", wib("2026-11-25T10:00:00"), "tes_tulis")).toBe(true);
    expect(gateOpen(EVENTS, "cutting", wib("2026-11-25T10:00:00"), "wawancara")).toBe(false);
    expect(gateOpen(EVENTS, "cutting", wib("2026-12-09T10:00:00"), "wawancara")).toBe(true);
  });
});

describe("gateClosesAt", () => {
  it("runs Open and Extend together as one registration window", () => {
    expect(gateClosesAt(EVENTS, "daftar", wib("2026-10-28T12:00:00"))).toBe(
      "2026-11-02T17:00:00.000Z",
    );
  });
  it("is null when the gate is closed", () => {
    expect(gateClosesAt(EVENTS, "daftar", wib("2026-11-05T12:00:00"))).toBeNull();
  });
});

describe("phaseOf", () => {
  it("is before until the first event of the stage starts", () => {
    expect(phaseOf(EVENTS, "tes_tulis", wib("2026-11-15T12:00:00"))).toBe("before");
  });
  it("is open while the work runs", () => {
    expect(phaseOf(EVENTS, "tes_tulis", wib("2026-11-18T12:00:00"))).toBe("open");
  });
  it("moves to cutting when Cutting starts and stays there until the announcement", () => {
    expect(phaseOf(EVENTS, "tes_tulis", wib("2026-11-25T00:00:00"))).toBe("cutting");
    expect(phaseOf(EVENTS, "tes_tulis", wib("2026-11-26T23:59:00"))).toBe("cutting");
  });
  it("is announced from the Pengumuman day on", () => {
    expect(phaseOf(EVENTS, "tes_tulis", wib("2026-11-27T00:00:00"))).toBe("announced");
    expect(phaseOf(EVENTS, "tes_tulis", wib("2027-02-01T00:00:00"))).toBe("announced");
  });
  it("shows review for Berkas between the check and the announcement", () => {
    expect(phaseOf(EVENTS, "berkas", wib("2026-11-09T12:00:00"))).toBe("review");
    expect(phaseOf(EVENTS, "berkas", wib("2026-10-30T12:00:00"))).toBe("open");
  });
  it("is before for a stage without events", () => {
    expect(phaseOf(EVENTS, "penerimaan", wib("2026-12-30T12:00:00"))).toBe("before");
  });
});

describe("eventLive and eventEnded", () => {
  it("is live on a multi day event across its days, window or not", () => {
    expect(eventLive(judul("Tes Tulis & Program"), wib("2026-11-18T19:00:00"))).toBe(true);
    expect(eventLive(judul("Tes Tulis & Program"), wib("2026-11-18T22:00:00"))).toBe(false);
  });
  it("has ended at 21.00 on its last day when it has a window", () => {
    const e = judul("Tes Tulis & Program");
    expect(eventEnded(e, wib("2026-11-19T20:59:00"))).toBe(false);
    expect(eventEnded(e, wib("2026-11-19T21:00:00"))).toBe(true);
  });
  it("has ended at 00.00 after its last day when it has no window", () => {
    const e = judul("Open Recruitment");
    expect(eventEnded(e, wib("2026-10-31T23:59:00"))).toBe(false);
    expect(eventEnded(e, wib("2026-11-01T00:00:00"))).toBe(true);
  });
});

describe("eventsToday", () => {
  it("lists what falls on the date, whatever the hour", () => {
    const t = eventsToday(EVENTS, wib("2026-11-12T08:00:00")).map((e) => e.title);
    expect(t).toEqual(["First Meet"]);
  });
  it("lists overlapping events together", () => {
    const t = eventsToday(EVENTS, wib("2026-11-01T08:00:00")).map((e) => e.title);
    expect(t).toEqual(["Extend"]);
  });
});

describe("visibleEvents", () => {
  const titles = (v: Parameters<typeof visibleEvents>[1]) =>
    visibleEvents(EVENTS, v).map((e) => e.title);

  it("shows a visitor only the public ones, never an internal or slot event", () => {
    const t = titles({ kind: "visitor" });
    expect(t).toContain("Open Recruitment");
    expect(t).toContain("Pengumuman Berkas");
    expect(t).not.toContain("Pengecekan Berkas");
    expect(t).not.toContain("Pleno Tes Tulis");
    expect(t).not.toContain("Cutting Tes Tulis");
    expect(t).not.toContain("Tes Tulis & Program");
    expect(t).not.toContain("Susulan Tes Tulis");
  });
  it("shows a candidate the public events plus their own slots", () => {
    const tulis = judul("Tes Tulis & Program").id;
    const t = titles({ kind: "candidate", ownEventIds: [tulis] });
    expect(t).toContain("Tes Tulis & Program");
    expect(t).not.toContain("Susulan Tes Tulis");
    expect(t).not.toContain("Tes Wawancara");
    expect(t).toContain("First Meet");
  });
  it("shows a Susulan only to someone it was offered to", () => {
    const susulan = judul("Susulan Tes Tulis").id;
    expect(titles({ kind: "candidate", ownEventIds: [susulan] })).toContain("Susulan Tes Tulis");
    expect(titles({ kind: "candidate", ownEventIds: [] })).not.toContain("Susulan Tes Tulis");
  });
  it("never leaks an internal event to a candidate even if its id is listed", () => {
    const pleno = judul("Pleno Tes Tulis").id;
    expect(titles({ kind: "candidate", ownEventIds: [pleno] })).not.toContain("Pleno Tes Tulis");
  });
  it("shows the Panitia everything", () => {
    expect(visibleEvents(EVENTS, { kind: "panitia" })).toHaveLength(EVENTS.length);
    expect(visibleEvents(EVENTS, { kind: "candidate", full: true })).toHaveLength(EVENTS.length);
  });
  it("shows other Asisten the public events only", () => {
    const t = titles({ kind: "asisten" });
    expect(t).toContain("Open Recruitment");
    expect(t).not.toContain("Cutting Tes Tulis");
  });
});

describe("nextPublicEvent", () => {
  it("is the one running now when something public is on", () => {
    expect(nextPublicEvent(EVENTS, wib("2026-10-28T12:00:00"))?.title).toBe("Open Recruitment");
  });
  it("skips the internal events in the gap", () => {
    // 3 to 8 Nov has nothing public; Pengecekan Berkas is internal.
    expect(nextPublicEvent(EVENTS, wib("2026-11-05T12:00:00"))?.title).toBe("Pengumuman Berkas");
  });
  it("moves on once an evening event has ended for the day", () => {
    expect(nextPublicEvent(EVENTS, wib("2026-11-12T20:00:00"))?.title).toBe("First Meet");
    expect(nextPublicEvent(EVENTS, wib("2026-11-12T21:00:00"))?.title).not.toBe("First Meet");
  });
  it("includes a candidate's own slot but not other slots", () => {
    const tulis = judul("Tes Tulis & Program").id;
    expect(nextPublicEvent(EVENTS, wib("2026-11-13T12:00:00"), [tulis])?.title).toBe(
      "Tes Tulis & Program",
    );
    expect(nextPublicEvent(EVENTS, wib("2026-11-13T12:00:00"))?.title).toBe("Pengumuman Tes Tulis");
  });
  it("is null after the last public event", () => {
    expect(nextPublicEvent(EVENTS, wib("2027-03-01T12:00:00"))).toBeNull();
  });
});

describe("tahapSudahMulai", () => {
  it("is false before the stage's first event", () => {
    expect(tahapSudahMulai(EVENTS, judul("Cutting Tes Tulis"), wib("2026-11-10T12:00:00"))).toBe(
      false,
    );
  });
  it("is true for a later event of a stage that already started", () => {
    expect(tahapSudahMulai(EVENTS, judul("Cutting Tes Tulis"), wib("2026-11-18T12:00:00"))).toBe(
      true,
    );
  });
  it("is true on the event's own first day", () => {
    expect(tahapSudahMulai(EVENTS, judul("Open Recruitment"), wib("2026-10-25T00:00:00"))).toBe(
      true,
    );
  });
  it("uses the event's own days when it has no stage", () => {
    const tanpa: RecEvent = { ...judul("Extend"), stage: null };
    expect(tahapSudahMulai([tanpa], tanpa, wib("2026-10-31T12:00:00"))).toBe(false);
    expect(tahapSudahMulai([tanpa], tanpa, wib("2026-11-01T12:00:00"))).toBe(true);
  });
});
