/**
 * The candidate's fog: dates up to the next stage, nothing beyond, own slots kept.
 * The seed calendar is the fixture.
 */
import { describe, expect, it } from "vitest";
import { EVENT_SEED } from "../recruitment/seed";
import { fogEvents, fogLimit } from "../recruitment/fog";
import type { RecEvent } from "../recruitment/types";

const EVENTS: RecEvent[] = EVENT_SEED.map((e, i) => ({ ...e, id: i + 1 }));
const stages = (es: RecEvent[]) => new Set(es.map((e) => e.stage).filter(Boolean));

describe("fogLimit", () => {
  it("shows a visitor or a withdrawn CaAs the registration stage only", () => {
    expect(fogLimit(null)).toBe(0);
    expect(fogLimit({ status: "withdrawn", stage: "tes_tulis" })).toBe(0);
  });
  it("shows a live CaAs the stage after the one they are on", () => {
    expect(fogLimit({ status: "approved", stage: "berkas" })).toBe(1);
    expect(fogLimit({ status: "approved", stage: "tes_tulis" })).toBe(3);
  });
  it("stops a cut CaAs at the stage they reached", () => {
    expect(fogLimit({ status: "out", stage: "tes_tulis" })).toBe(2);
  });
  it("never goes past the last stage", () => {
    expect(fogLimit({ status: "approved", stage: "penerimaan" })).toBe(6);
  });
});

describe("fogEvents", () => {
  it("keeps only Berkas dates for a visitor", () => {
    expect([...stages(fogEvents(EVENTS, 0))]).toEqual(["berkas"]);
  });
  it("adds the next stage for a CaAs at Berkas, and nothing after it", () => {
    const s = stages(fogEvents(EVENTS, fogLimit({ status: "approved", stage: "berkas" })));
    expect(s.has("first_meet")).toBe(true);
    expect(s.has("tes_tulis")).toBe(false);
    expect(s.has("mengajar")).toBe(false);
  });
  it("keeps an event the CaAs was plotted into even past the limit", () => {
    const later = EVENTS.find((e) => e.stage === "wawancara")!;
    expect(fogEvents(EVENTS, 0).some((e) => e.id === later.id)).toBe(false);
    expect(fogEvents(EVENTS, 0, [later.id]).some((e) => e.id === later.id)).toBe(true);
  });
  it("keeps events that belong to no stage", () => {
    const loose = { id: 99, stage: null } as RecEvent;
    expect(fogEvents([loose], 0)).toHaveLength(1);
  });
});
