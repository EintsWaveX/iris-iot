import { describe, expect, it } from "vitest";
import { ownNextSlot, pickedStages } from "../recruitment/gates";
import type { CandidateSlotsStage, SlotSeat } from "../recruitment/types";

const slot = (id: number, start: string, end: string, room = `R${id}`): SlotSeat => ({
  id,
  stage: "tes_tulis",
  eventId: 7,
  room,
  startsAt: start,
  endsAt: end,
  capacity: 15,
  taken: 3,
});
const stage = (
  st: "tes_tulis" | "wawancara",
  slots: SlotSeat[],
  mine: number | null,
): Pick<CandidateSlotsStage, "window" | "mine" | "slots"> => ({
  window: {
    stage: st,
    eventId: 1,
    opensAt: "2026-11-04T12:00:00.000Z",
    closesAt: "2026-11-08T17:00:00.000Z",
    open: true,
  },
  slots,
  mine: mine === null ? null : { slotId: mine, via: "self", at: "2026-11-06T16:41:00.000Z" },
});

describe("pickedStages", () => {
  it("lists the stages the candidate holds a slot in", () => {
    const s = [stage("tes_tulis", [], 1), stage("wawancara", [], null)];
    expect([...pickedStages(s)]).toEqual(["tes_tulis"]);
  });
});

describe("ownNextSlot", () => {
  const A = slot(1, "2026-11-10T11:30:00.000Z", "2026-11-10T14:00:00.000Z");
  const B = slot(2, "2026-11-11T11:30:00.000Z", "2026-11-11T14:00:00.000Z");
  const now = new Date("2026-11-07T00:00:00.000Z");

  it("is the slot the candidate picked", () => {
    expect(ownNextSlot([stage("tes_tulis", [A, B], 2)], now)?.slot.id).toBe(2);
  });
  it("is nothing for a candidate who has not picked", () => {
    expect(ownNextSlot([stage("tes_tulis", [A, B], null)], now)).toBeNull();
  });
  it("skips a slot that has ended and takes the earliest of those left", () => {
    const old = slot(3, "2026-11-06T11:30:00.000Z", "2026-11-06T14:00:00.000Z");
    const s = [stage("tes_tulis", [old], 3), stage("wawancara", [B, A], 1)];
    expect(ownNextSlot(s, now)?.slot.id).toBe(1);
    expect(ownNextSlot([stage("tes_tulis", [old], 3)], now)).toBeNull();
  });
  it("still counts a slot that is running now", () => {
    expect(
      ownNextSlot([stage("tes_tulis", [A], 1)], new Date("2026-11-10T12:00:00.000Z"))?.slot.id,
    ).toBe(1);
  });
});
