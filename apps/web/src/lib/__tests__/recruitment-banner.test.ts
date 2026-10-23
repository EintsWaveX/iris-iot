/**
 * The Home banner is one shape per viewer (PRD 5.1). It is built from the
 * calendar and a few facts about the viewer, with a fixed clock in WIB.
 */
import { describe, expect, it } from "vitest";
import { susunBanner, type BannerInput } from "../recruitment/banner";
import { EVENT_SEED } from "../recruitment/seed";
import type { RecEvent } from "../recruitment/types";

const EVENTS: RecEvent[] = EVENT_SEED.map((e, i) => ({ ...e, id: i + 1 }));
const wib = (s: string) => new Date(`${s}+07:00`);
const EDISI = { title: "Open Recruitment Asisten IRIS 2026", status: "live" as const };

function banner(over: Partial<BannerInput>) {
  return susunBanner({
    edition: EDISI,
    segera: false,
    events: EVENTS,
    now: wib("2026-10-28T12:00:00"),
    viewer: { kind: "visitor" },
    ...over,
  });
}

describe("visitor", () => {
  it("sees the title and the Open dates", () => {
    expect(banner({})).toEqual({
      ok: true,
      kind: "visitor",
      title: EDISI.title,
      opens: "2026-10-25",
      closes: "2026-10-31",
      daftarOpen: true,
    });
  });
  it("sees the Extend dates once Open is over", () => {
    expect(banner({ now: wib("2026-11-01T09:00:00") })).toMatchObject({
      kind: "visitor",
      opens: "2026-11-01",
      closes: "2026-11-02",
      daftarOpen: true,
    });
  });
  it("sees nothing before registration opens (user, 2026-10-23)", () => {
    expect(banner({ now: wib("2026-10-24T23:59:00") })).toEqual({
      ok: true,
      kind: "none",
      segera: false,
    });
    expect(banner({ now: wib("2026-10-25T00:00:00") })).toMatchObject({ kind: "visitor" });
  });
  it("sees nothing once registration is over", () => {
    expect(banner({ now: wib("2026-11-05T09:00:00") })).toEqual({
      ok: true,
      kind: "none",
      segera: false,
    });
  });
  it("carries no names, no NIM and no internal event title", () => {
    const text = JSON.stringify(banner({}));
    expect(text).not.toMatch(/nim|nama|Pleno|Cutting|Pengecekan/i);
  });
  it("sees nothing without a live edition", () => {
    expect(banner({ edition: null })).toEqual({ ok: true, kind: "none", segera: false });
    expect(banner({ edition: null, segera: true })).toEqual({
      ok: true,
      kind: "none",
      segera: true,
    });
  });
});

describe("Praktikan", () => {
  const praktikan = { kind: "praktikan", candidate: null } as const;
  it("gets a Daftar button and the countdown target while Open runs", () => {
    expect(banner({ viewer: praktikan })).toEqual({
      ok: true,
      kind: "praktikan",
      title: EDISI.title,
      daftarOpen: true,
      closesAt: "2026-11-02T17:00:00.000Z",
    });
  });
  it("gets nothing when registration is not running", () => {
    expect(banner({ viewer: praktikan, now: wib("2026-11-05T09:00:00") })).toEqual({
      ok: true,
      kind: "none",
      segera: false,
    });
  });
  it("says segera when the next edition is announced", () => {
    expect(banner({ viewer: praktikan, edition: null, segera: true })).toEqual({
      ok: true,
      kind: "none",
      segera: true,
    });
  });
});

describe("candidate", () => {
  const caas = (status: "applied" | "approved" = "applied", stage = "berkas" as const) =>
    ({ kind: "praktikan", candidate: { status, stage, cutAt: null } }) as const;

  it("sees the current stage, its phase and the next public date", () => {
    const b = banner({ viewer: caas(), now: wib("2026-11-05T12:00:00") });
    expect(b).toMatchObject({
      kind: "candidate",
      status: "applied",
      stage: "berkas",
      phase: "open",
      envelope: false,
      next: { title: "Pengumuman Berkas", startsOn: "2026-11-11" },
    });
  });
  it("shows the review phase while Admin checks the files", () => {
    expect(banner({ viewer: caas(), now: wib("2026-11-09T12:00:00") })).toMatchObject({
      phase: "review",
    });
  });
  it("includes the next event as a lite row, with no gates or internal flags", () => {
    const b = banner({ viewer: caas(), now: wib("2026-11-05T12:00:00") });
    expect(b.kind === "candidate" && Object.keys(b.next!).sort()).toEqual(
      ["dayEnd", "dayStart", "endsOn", "id", "kind", "place", "startsOn", "title"].sort(),
    );
  });
  it("tells a withdrawn candidate nothing", () => {
    const viewer = {
      kind: "praktikan",
      candidate: { status: "withdrawn", stage: "berkas", cutAt: null },
    } as const;
    expect(banner({ viewer }).kind).toBe("none");
  });
  it("keeps a thank-you line for 7 days after a Gagal reveal, then hides it", () => {
    const viewer = {
      kind: "praktikan",
      candidate: { status: "out", stage: "tes_tulis", cutAt: wib("2026-11-27T08:00:00") },
    } as const;
    expect(banner({ viewer, now: wib("2026-12-03T07:59:00") })).toEqual({
      ok: true,
      kind: "cut",
      title: EDISI.title,
      stage: "tes_tulis",
    });
    expect(banner({ viewer, now: wib("2026-12-04T08:00:01") }).kind).toBe("none");
  });
  it("shows no thank-you before the reveal", () => {
    const viewer = {
      kind: "praktikan",
      candidate: { status: "out", stage: "tes_tulis", cutAt: null },
    } as const;
    expect(banner({ viewer }).kind).toBe("none");
  });
});

describe("Panitia and other Asisten", () => {
  it("gives the Panitia a shortcut and today's events, internal ones included", () => {
    const b = banner({
      viewer: { kind: "asisten", panitia: true, seat: "Akademik" },
      now: wib("2026-11-16T10:00:00"),
    });
    expect(b).toMatchObject({ kind: "panitia", seat: "Akademik" });
    expect(b.kind === "panitia" && b.today.map((e) => e.title)).toEqual(["Pleno Tes Tulis"]);
  });
  it("gives other Asisten the public events of the day only", () => {
    const hari = banner({
      viewer: { kind: "asisten", panitia: false, seat: null },
      now: wib("2026-11-16T10:00:00"),
    });
    expect(hari.kind).toBe("none");
    const buka = banner({
      viewer: { kind: "asisten", panitia: false, seat: null },
      now: wib("2026-11-12T10:00:00"),
    });
    expect(buka.kind === "asisten" && buka.today.map((e) => e.title)).toEqual(["First Meet"]);
  });
  it("shows the Panitia their shortcut even on a quiet day", () => {
    const b = banner({
      viewer: { kind: "asisten", panitia: true, seat: null },
      now: wib("2026-11-14T10:00:00"),
    });
    expect(b).toMatchObject({ kind: "panitia", today: [] });
  });
});
