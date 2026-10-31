/**
 * Ringkasan's next step and funnel: where the edition stands comes from the
 * calendar, a division gets its own steps, a step loses its tab when the
 * person does not have that part, and the funnel counts the candidate list.
 */
import { describe, expect, it } from "vitest";
import { EVENT_SEED } from "../recruitment/seed";
import { berkasCounts, funnelOf } from "../recruitment/funnel";
import { nextSteps, roleOf, whereNow } from "../recruitment/next-step";
import type { CandidateRow, RecEvent } from "../recruitment/types";

const events = EVENT_SEED.map((e, i) => ({
  ...e,
  id: i + 1,
  editionId: 1,
  updatedBy: null,
  updatedAt: "2026-10-01T00:00:00Z",
})) as unknown as RecEvent[];
const at = (iso: string) => new Date(`${iso}T12:00:00+07:00`);

describe("whereNow", () => {
  it("is daftar while only the registration runs", () => {
    expect(whereNow(events, at("2026-10-28"))).toMatchObject({ stage: "daftar", phase: "open" });
  });
  it("stays in daftar while registration is open, even if a later stage has begun", () => {
    const early = events.map((e) =>
      e.stage === "first_meet" ? { ...e, startsOn: "2026-10-24", endsOn: "2026-10-24" } : e,
    );
    expect(whereNow(early, at("2026-10-28")).stage).toBe("daftar");
  });
  it("moves with the calendar", () => {
    expect(whereNow(events, at("2026-11-09")).stage).toBe("berkas");
    expect(whereNow(events, at("2026-11-12")).stage).toBe("first_meet");
    expect(whereNow(events, at("2026-11-17")).stage).toBe("tes_tulis");
  });
});

describe("after the gatherings", () => {
  const all = ["kandidat", "kalender", "bank", "plotting", "panitia", "cutting", "tes"] as const;
  it("marks First Meet over once its evening has ended, before the exam nights begin", () => {
    expect(whereNow(events, at("2026-11-12")).over).toBe(false);
    const w = whereNow(events, new Date("2026-11-14T10:00:00+07:00"));
    expect(w).toMatchObject({ stage: "first_meet", over: true });
    expect(nextSteps(w, "ketua", all).now.key).toBe("followPicking");
    expect(nextSteps(w, "admin", all).now.key).toBe("markAbsent");
    expect(nextSteps(w, "acara", all).now.key).toBe("prepTesNights");
  });
  it("keeps the First Meet steps while the evening is still on", () => {
    const w = whereNow(events, new Date("2026-11-12T19:00:00+07:00"));
    expect(w.over).toBe(false);
    expect(nextSteps(w, "acara", all).now.key).toBe("runFirstMeet");
  });
  it("moves to Cutting once the exam nights have ended", () => {
    const night = whereNow(events, new Date("2026-11-18T19:00:00+07:00"));
    expect(nextSteps(night, "ketua", all).now.key).toBe("followNight");
    const after = whereNow(events, new Date("2026-11-22T10:00:00+07:00"));
    expect(after).toMatchObject({ stage: "tes_tulis", over: true });
    expect(nextSteps(after, "ketua", all).now.key).toBe("lockCuttingTulis");
    expect(nextSteps(after, "akademik", all).now.key).toBe("proposeCutTulis");
  });
  it("points at the Calendar once the Tes Tulis result is announced", () => {
    const w = whereNow(events, new Date("2026-11-28T10:00:00+07:00"));
    expect(nextSteps(w, "ketua", all).now.key).toBe("watchCalendar");
  });
});

describe("nextSteps", () => {
  const all = ["kandidat", "kalender", "bank", "plotting", "panitia", "cutting", "tes"] as const;
  it("gives each division its own now step", () => {
    const w = whereNow(events, at("2026-10-28"));
    expect(nextSteps(w, "ketua", all).now.key).toBe("watchApplicants");
    expect(nextSteps(w, "admin", all).now.key).toBe("checkWaiting");
    expect(nextSteps(w, "akademik", all).now.key).toBe("buildBank");
  });
  it("drops the tab a person does not have", () => {
    const w = whereNow(events, at("2026-10-28"));
    expect(nextSteps(w, "admin", ["kalender"]).now.tab).toBeNull();
    expect(nextSteps(w, "admin", all).now.tab).toBe("kandidat");
  });
  it("falls back to the calendar for a stage not built yet", () => {
    const w = whereNow(events, at("2026-12-02"));
    expect(nextSteps(w, "ketua", all).now.key).toBe("watchCalendar");
  });
  it("reads the role from the seat, and hakPenuh as the Ketua", () => {
    expect(roleOf("wakil", false)).toBe("ketua");
    expect(roleOf(null, true)).toBe("ketua");
    expect(roleOf("pdd", false)).toBe("other");
    expect(nextSteps(whereNow(events, at("2026-10-28")), "other", all).now.key).toBe(
      "watchCalendar",
    );
  });
});

const cand = (id: number, stage: CandidateRow["stage"], status: CandidateRow["status"]) =>
  ({
    id,
    nim: String(id),
    nama: "x",
    kelas: null,
    angkatan: 2025,
    status,
    stage,
    appliedAt: "",
    docs: 6,
  }) as CandidateRow;

describe("funnel", () => {
  const rows = [
    cand(1, "berkas", "applied"),
    cand(2, "berkas", "revision"),
    cand(3, "berkas", "approved"),
    cand(4, "first_meet", "approved"),
    cand(5, "tes_tulis", "out"),
    cand(6, "berkas", "withdrawn"),
  ];
  it("counts reached, here, through and cut, and ignores the withdrawn", () => {
    const f = funnelOf(rows);
    expect(f[0]).toMatchObject({ stage: "berkas", reached: 5, here: 3, through: 2 });
    expect(f[1]).toMatchObject({ reached: 2, here: 1, through: 1 });
    expect(f[2]).toMatchObject({ reached: 1, here: 0, out: 1 });
  });
  it("splits the Berkas state", () => {
    expect(berkasCounts(rows)).toEqual({ total: 5, waiting: 1, fix: 1, verified: 3 });
  });
});
