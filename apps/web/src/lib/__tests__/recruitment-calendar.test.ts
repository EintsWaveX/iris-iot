import { describe, expect, it } from "vitest";
import {
  KIND_PALETTE,
  addDays,
  daysBetween,
  eventColor,
  eventsOnDay,
  layoutMonth,
} from "../recruitment/calendar";
import { EVENT_KINDS, type RecEvent } from "../recruitment/types";

function ev(id: number, startsOn: string, endsOn: string, over: Partial<RecEvent> = {}): RecEvent {
  return {
    id,
    kind: "test",
    title: `E${id}`,
    startsOn,
    endsOn,
    dayStart: null,
    dayEnd: null,
    place: null,
    internal: false,
    audience: "all",
    gates: [],
    stage: null,
    color: null,
    sort: id,
    ...over,
  };
}

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("counts days between two dates", () => {
    expect(daysBetween("2026-10-25", "2026-10-31")).toBe(6);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
  });
});

describe("eventColor", () => {
  it("gives every kind a colour", () => {
    for (const k of EVENT_KINDS) expect(KIND_PALETTE[k]).toBeTruthy();
  });
  it("uses the event's own colour over the kind's", () => {
    expect(eventColor(ev(1, "2026-10-01", "2026-10-01", { color: "rose" }))).toBe("rose");
    expect(eventColor(ev(1, "2026-10-01", "2026-10-01"))).toBe(KIND_PALETTE.test);
  });
});

describe("eventsOnDay", () => {
  it("includes both end dates", () => {
    const e = [ev(1, "2026-10-25", "2026-10-31")];
    expect(eventsOnDay(e, "2026-10-25")).toHaveLength(1);
    expect(eventsOnDay(e, "2026-10-31")).toHaveLength(1);
    expect(eventsOnDay(e, "2026-11-01")).toHaveLength(0);
  });
});

describe("layoutMonth", () => {
  it("lays October 2026 out in full Monday weeks, 28 Sep to 1 Nov", () => {
    const m = layoutMonth([], "2026-10");
    expect(m.weeks).toHaveLength(5);
    expect(m.weeks[0].days[0]).toEqual({ date: "2026-09-28", inMonth: false });
    expect(m.weeks[0].days[3]).toEqual({ date: "2026-10-01", inMonth: true });
    expect(m.weeks[4].days[6]).toEqual({ date: "2026-11-01", inMonth: false });
  });
  it("puts a one day event in one cell", () => {
    const m = layoutMonth([ev(1, "2026-10-14", "2026-10-14")], "2026-10");
    const w = m.weeks.find((w) => w.bars.length)!;
    expect(w.bars).toEqual([
      { eventId: 1, col: 2, span: 1, lane: 0, startsHere: true, endsHere: true },
    ]);
  });
  it("draws Open Recruitment as one bar from Sunday the 25th to its Saturday", () => {
    // 25 Oct 2026 is a Sunday: it is column 6 of its week, then the bar
    // continues across the next week (26 to 31 Oct, columns 0 to 5).
    const m = layoutMonth([ev(1, "2026-10-25", "2026-10-31")], "2026-10");
    const bars = m.weeks.flatMap((w) => w.bars);
    expect(bars).toEqual([
      { eventId: 1, col: 6, span: 1, lane: 0, startsHere: true, endsHere: false },
      { eventId: 1, col: 0, span: 6, lane: 0, startsHere: false, endsHere: true },
    ]);
  });
  it("splits a long event at each week and marks where it starts and ends", () => {
    const m = layoutMonth([ev(1, "2026-10-14", "2026-10-28")], "2026-10");
    const bars = m.weeks.flatMap((w) => w.bars);
    expect(bars.map((b) => [b.col, b.span, b.startsHere, b.endsHere])).toEqual([
      [2, 5, true, false],
      [0, 7, false, false],
      [0, 3, false, true],
    ]);
  });
  it("stacks overlapping events into lanes and reuses a freed lane", () => {
    const events = [
      ev(1, "2026-10-12", "2026-10-16"),
      ev(2, "2026-10-14", "2026-10-15"),
      ev(3, "2026-10-17", "2026-10-18"),
    ];
    const m = layoutMonth(events, "2026-10");
    const w = m.weeks.find((w) => w.bars.length)!;
    const lane = (id: number) => w.bars.find((b) => b.eventId === id)!.lane;
    expect(lane(1)).toBe(0);
    expect(lane(2)).toBe(1);
    expect(lane(3)).toBe(0);
    expect(w.lanes).toBe(2);
  });
  it("puts the longer event first when two start on the same day", () => {
    const events = [ev(1, "2026-10-12", "2026-10-12"), ev(2, "2026-10-12", "2026-10-15")];
    const w = layoutMonth(events, "2026-10").weeks.find((w) => w.bars.length)!;
    expect(w.bars.find((b) => b.eventId === 2)!.lane).toBe(0);
    expect(w.bars.find((b) => b.eventId === 1)!.lane).toBe(1);
  });
  it("shows an event that began before the visible weeks", () => {
    const m = layoutMonth([ev(1, "2026-09-20", "2026-10-02")], "2026-10");
    expect(m.weeks[0].bars).toEqual([
      { eventId: 1, col: 0, span: 5, lane: 0, startsHere: false, endsHere: true },
    ]);
  });
  it("gives each week its own lane count", () => {
    const m = layoutMonth([ev(1, "2026-10-26", "2026-10-26")], "2026-10");
    expect(m.weeks.map((w) => w.lanes)).toEqual([0, 0, 0, 0, 1]);
  });
  it("skips events wholly outside the visible weeks", () => {
    const m = layoutMonth([ev(1, "2026-12-01", "2026-12-02")], "2026-10");
    expect(m.weeks.flatMap((w) => w.bars)).toEqual([]);
  });
  it("lays out a month needing six rows", () => {
    // March 2026 starts on a Sunday: 23 Feb to 5 Apr is six weeks.
    expect(layoutMonth([], "2026-03").weeks).toHaveLength(6);
  });
});
