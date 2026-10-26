import { describe, expect, it } from "vitest";
import type { RoomPublic, RunPublic } from "../recruitment/room-relay";
import { GRACE_MS } from "../recruitment/room";
import { hms, seatPhase, tone } from "../recruitment/seat-state";

const MIN = 60_000;
const run = (o: Partial<RunPublic> = {}): RunPublic => ({
  durMs: 15 * MIN,
  usedMs: 0,
  mark: 1_000_000,
  state: "running",
  pausedAt: null,
  maxExtraMs: 0,
  startedAt: 1_000_000,
  endedAt: null,
  endedBy: null,
  ...o,
});
const room = (o: Partial<RoomPublic> = {}): RoomPublic => ({
  seq: 3,
  stage: "parts",
  cur: "logika",
  runs: { logika: run() },
  startedAt: 1_000_000,
  finishedAt: null,
  now: 1_000_000,
  ...o,
});
const seat = { id: 7, extraMs: 0, done: {} as Record<string, number> };

describe("seatPhase", () => {
  it("is none without a room", () => {
    expect(seatPhase(null, seat, 0)).toEqual({ k: "none" });
  });
  it("maps the stages before and after the parts", () => {
    expect(seatPhase(room({ stage: "setup", cur: null, runs: {} }), seat, 0).k).toBe("setup");
    expect(seatPhase(room({ stage: "prep", cur: null, runs: {} }), seat, 0).k).toBe("prep");
    expect(seatPhase(room({ stage: "finished" }), seat, 0).k).toBe("finished");
    expect(seatPhase(room({ stage: "spin", cur: "livecode", runs: {} }), seat, 0).k).toBe("spin");
  });
  it("counts the time left from the running mark", () => {
    const p = seatPhase(room(), seat, 1_000_000 + 5 * MIN);
    expect(p).toMatchObject({ k: "work", part: "logika", paused: false, left: 10 * MIN });
  });
  it("adds the seat's own extra time", () => {
    const p = seatPhase(room(), { ...seat, extraMs: 3 * MIN }, 1_000_000 + 15 * MIN);
    expect(p).toMatchObject({ k: "work", left: 3 * MIN });
  });
  it("freezes while paused", () => {
    const r = room({
      runs: { logika: run({ state: "paused", mark: null, usedMs: 4 * MIN, pausedAt: 5 }) },
    });
    expect(seatPhase(r, seat, 99_999_999)).toMatchObject({
      k: "work",
      paused: true,
      left: 11 * MIN,
    });
  });
  it("says the seat's time is over when its own deadline passed, even if another seat still works", () => {
    const r = room({ runs: { logika: run({ maxExtraMs: 5 * MIN }) } });
    const p = seatPhase(r, seat, 1_000_000 + 16 * MIN);
    expect(p).toMatchObject({ k: "wait", part: "logika", why: "time" });
  });
  it("waits after Kumpulkan", () => {
    const p = seatPhase(room(), { ...seat, done: { logika: 1 } }, 1_000_000 + MIN);
    expect(p).toMatchObject({ k: "wait", why: "done" });
  });
  it("waits in the lobby once the part ended for everyone", () => {
    const r = room({
      runs: {
        logika: run({
          state: "ended",
          mark: null,
          usedMs: 15 * MIN,
          endedAt: 1_000_000 + 15 * MIN,
          endedBy: "time",
        }),
      },
    });
    expect(seatPhase(r, seat, 1_000_000 + 15 * MIN + GRACE_MS + 1)).toMatchObject({
      k: "wait",
      why: "lobby",
    });
  });
  it("a running part past the longest extra is in the lobby with no message needed", () => {
    const p = seatPhase(room(), seat, 1_000_000 + 40 * MIN);
    expect(p).toMatchObject({ k: "wait", why: "lobby" });
  });
  it("Live Coding running is its own phase with a timer", () => {
    const r = room({ cur: "livecode", runs: { livecode: run({ durMs: 45 * MIN }) } });
    expect(seatPhase(r, seat, 1_000_000 + 5 * MIN)).toMatchObject({
      k: "work",
      part: "livecode",
      left: 40 * MIN,
    });
  });
});

describe("hms and tone", () => {
  it("formats HH:MM:SS, rounding a part second up", () => {
    expect(hms(0)).toBe("00:00:00");
    expect(hms(8 * MIN + 42_000)).toBe("00:08:42");
    expect(hms(3_661_000)).toBe("01:01:01");
    expect(hms(500)).toBe("00:00:01");
    expect(hms(-5)).toBe("00:00:00");
  });
  it("turns gold under 2 minutes and red under 30 s", () => {
    expect(tone(3 * MIN)).toBe("");
    expect(tone(2 * MIN)).toBe("warn");
    expect(tone(30_000)).toBe("danger");
  });
});
