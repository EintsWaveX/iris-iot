import { describe, expect, it } from "vitest";
import { LCC } from "../../components/recruitment/livecode/lccStrings";
import { LANE_MAX, laneOf } from "../recruitment/queue-lane";

describe("laneOf: the Live Coding queue as a row of squares", () => {
  it("puts the seat's own job at its place, with the rest of the queue behind it", () => {
    expect(laneOf(3, 7)).toEqual({ slots: 7, me: 3, hidden: 0 });
  });

  it("counts down to the front: 4, 3, 2, 1 moves the marker left one square at a time", () => {
    // each step the job ahead finishes, so the total shrinks with the place
    const steps = [laneOf(4, 4), laneOf(3, 3), laneOf(2, 2), laneOf(1, 1)];
    expect(steps.map((l) => l?.me)).toEqual([4, 3, 2, 1]);
    expect(steps.map((l) => l?.slots)).toEqual([4, 3, 2, 1]);
  });

  it("is the front, alone, when it is the only job", () => {
    expect(laneOf(1, 1)).toEqual({ slots: 1, me: 1, hidden: 0 });
  });

  it("never draws fewer squares than the seat's own place, even if the total lags", () => {
    expect(laneOf(5, 2)).toEqual({ slots: 5, me: 5, hidden: 0 });
    expect(laneOf(3, null)).toEqual({ slots: 3, me: 3, hidden: 0 });
  });

  it("caps a long queue and says how many jobs ahead are not drawn", () => {
    expect(laneOf(12, 20)).toEqual({ slots: LANE_MAX, me: LANE_MAX, hidden: 12 - LANE_MAX });
    expect(laneOf(2, 40)).toEqual({ slots: LANE_MAX, me: 2, hidden: 0 });
  });

  it("shows nothing for a job with no place", () => {
    expect(laneOf(null, 5)).toBeNull();
    expect(laneOf(0, 5)).toBeNull();
    expect(laneOf(-1, 5)).toBeNull();
    expect(laneOf(1.5, 5)).toBeNull();
  });
});

describe("the queue line says the place and the total, in every language", () => {
  it("adds 'of N' when the total is known", () => {
    expect(LCC.id.queued(3, 7)).toBe("Di queue, urutan ke-3 dari 7");
    expect(LCC.en.queued(3, 7)).toBe("In the queue, number 3 of 7");
    expect(LCC.zh.queued(3, 7)).toBe("排队中，第 3 位，共 7 位");
  });

  it("keeps the old wording without a total, and when the total is below the place", () => {
    expect(LCC.en.queued(3, null)).toBe("In the queue, number 3");
    expect(LCC.en.queued(3)).toBe("In the queue, number 3");
    expect(LCC.id.queued(3, 2)).toBe("Di queue, urutan ke-3");
    expect(LCC.en.queued(null, 5)).toBe("In the queue");
  });
});
