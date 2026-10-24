import { describe, expect, it } from "vitest";
import {
  attendEligible,
  cuttingPool,
  pickEligible,
  standing,
  type ResultLite,
} from "../recruitment/standing";
import type { RecEvent } from "../recruitment/types";

const wib = (s: string) => new Date(`${s}+07:00`);

const FIRST_MEET = {
  kind: "meeting",
  stage: "first_meet",
  startsOn: "2026-11-12",
  endsOn: "2026-11-12",
  dayStart: "18:30",
  dayEnd: "21:00",
} as Pick<RecEvent, "kind" | "stage" | "startsOn" | "endsOn" | "dayStart" | "dayEnd">;
const EVENTS = [FIRST_MEET];

const hasil = (
  stage: ResultLite["stage"],
  proposal: ResultLite["proposal"],
  over = {},
): ResultLite => ({
  stage,
  proposal,
  locked: true,
  revealAt: wib("2026-11-11T12:00:00"),
  ...over,
});
const dasar = (status = "approved", stage = "berkas") => ({ status, stage }) as never;

describe("what a candidate's standing is, and when it shows", () => {
  it("shows nothing of a locked result before its reveal time", () => {
    const s = standing(dasar(), [hasil("berkas", "gagal")], EVENTS, wib("2026-11-11T11:59:59"));
    expect(s).toEqual({ status: "approved", stage: "berkas" });
  });

  it("applies a Gagal at the exact reveal instant", () => {
    const s = standing(dasar(), [hasil("berkas", "gagal")], EVENTS, wib("2026-11-11T12:00:00"));
    expect(s).toEqual({ status: "out", stage: "berkas" });
  });

  it("moves a Lolos candidate on to the next stage", () => {
    const s = standing(dasar(), [hasil("berkas", "lolos")], EVENTS, wib("2026-11-11T13:00:00"));
    expect(s).toEqual({ status: "approved", stage: "first_meet" });
  });

  it("ignores an unlocked proposal", () => {
    const s = standing(
      dasar(),
      [hasil("berkas", "lolos", { locked: false })],
      EVENTS,
      wib("2026-11-12T00:00:00"),
    );
    expect(s.stage).toBe("berkas");
  });

  it("goes from First Meet to Tes Tulis once the First Meet is over", () => {
    const r = [hasil("berkas", "lolos")];
    expect(standing(dasar(), r, EVENTS, wib("2026-11-12T20:59:00")).stage).toBe("first_meet");
    expect(standing(dasar(), r, EVENTS, wib("2026-11-12T21:00:00")).stage).toBe("tes_tulis");
  });

  it("walks the whole journey and freezes where a Gagal lands", () => {
    const r = [hasil("berkas", "lolos"), hasil("tes_tulis", "lolos"), hasil("wawancara", "gagal")];
    expect(standing(dasar(), r, EVENTS, wib("2026-12-20T00:00:00"))).toEqual({
      status: "out",
      stage: "wawancara",
    });
  });

  it("holds the candidate's own view until they open the envelope", () => {
    const r = [hasil("berkas", "gagal")];
    const sesudah = wib("2026-11-11T13:00:00");
    expect(standing(dasar(), r, EVENTS, sesudah).status).toBe("out");
    expect(standing(dasar(), r, EVENTS, sesudah, { seen: true }).status).toBe("approved");
    const dibuka = [hasil("berkas", "gagal", { openedAt: wib("2026-11-11T12:30:00") })];
    expect(standing(dasar(), dibuka, EVENTS, sesudah, { seen: true }).status).toBe("out");
  });

  it("never brings a withdrawn candidate back", () => {
    const s = standing(
      dasar("withdrawn"),
      [hasil("berkas", "lolos")],
      EVENTS,
      wib("2026-11-12T00:00:00"),
    );
    expect(s.status).toBe("withdrawn");
  });
});

describe("who is in a stage", () => {
  const eff = (status: string, stage: string) => ({ status, stage }) as never;
  it("picks Tes Tulis slots: those through Berkas, at First Meet or Tes Tulis", () => {
    expect(pickEligible(eff("approved", "first_meet"), "tes_tulis")).toBe(true);
    expect(pickEligible(eff("approved", "tes_tulis"), "tes_tulis")).toBe(true);
    expect(pickEligible(eff("approved", "berkas"), "tes_tulis")).toBe(false);
    expect(pickEligible(eff("out", "berkas"), "tes_tulis")).toBe(false);
    expect(pickEligible(eff("withdrawn", "first_meet"), "tes_tulis")).toBe(false);
  });
  it("picks Wawancara slots: only those through Tes Tulis", () => {
    expect(pickEligible(eff("approved", "wawancara"), "wawancara")).toBe(true);
    expect(pickEligible(eff("approved", "tes_tulis"), "wawancara")).toBe(false);
    expect(pickEligible(eff("out", "wawancara"), "wawancara")).toBe(false);
  });
  it("attends an event only if the candidate has reached its stage", () => {
    expect(attendEligible(eff("approved", "first_meet"), "first_meet")).toBe(true);
    expect(attendEligible(eff("approved", "berkas"), "first_meet")).toBe(false);
    expect(attendEligible(eff("approved", "tes_tulis"), "first_meet")).toBe(true);
    expect(attendEligible(eff("out", "berkas"), "first_meet")).toBe(false);
    expect(attendEligible(eff("withdrawn", "first_meet"), "first_meet")).toBe(false);
    expect(attendEligible(eff("approved", "first_meet"), "wawancara")).toBe(false);
    expect(attendEligible(eff("approved", "first_meet"), null)).toBe(false);
  });
  it("lists a stage's Cutting: everyone who got there, including those since cut", () => {
    expect(cuttingPool(eff("approved", "berkas"), "berkas", false)).toBe(true);
    expect(cuttingPool(eff("withdrawn", "berkas"), "berkas", false)).toBe(false);
    expect(cuttingPool(eff("out", "berkas"), "tes_tulis", false)).toBe(false);
    expect(cuttingPool(eff("out", "tes_tulis"), "tes_tulis", false)).toBe(true);
    expect(cuttingPool(eff("approved", "wawancara"), "tes_tulis", false)).toBe(true);
    expect(cuttingPool(eff("approved", "first_meet"), "tes_tulis", false)).toBe(true);
    expect(cuttingPool(eff("withdrawn", "wawancara"), "tes_tulis", true)).toBe(true);
  });
});
