import { describe, expect, it } from "vitest";
import { IV_DEFAULT, checkTemplate } from "../recruitment/interview";
import { checkRecord, makeupDeadline, makeupState, tulisTidakHadir } from "../recruitment/makeup";

const day = "2026-12-26";
const due = makeupDeadline(day, 1, 12);
const before = new Date(due.getTime() - 60_000);
const after = new Date(due.getTime() + 60_000);

describe("makeupDeadline", () => {
  it("is the day before at 12:00 WIB, which is 05:00 UTC", () => {
    expect(due.toISOString()).toBe("2026-12-25T05:00:00.000Z");
  });
  it("counts back over a month change", () => {
    expect(makeupDeadline("2027-01-01", 2, 0).toISOString()).toBe("2026-12-29T17:00:00.000Z");
  });
});

describe("makeupState", () => {
  const st = (row: "tawar" | "ya" | "mundur" | null, placed: boolean, now: Date) =>
    makeupState({ row: row ? { status: row } : null, placed, deadline: due, now });

  it("waits to be offered until there is a row", () => {
    expect(st(null, false, before).state).toBe("tunggu");
    expect(st(null, false, after).state).toBe("tunggu");
  });
  it("an offer is open until the deadline, then counts as withdrawn", () => {
    expect(st("tawar", false, before)).toEqual({ state: "tawar", unanswered: false });
    expect(st("tawar", false, after)).toEqual({ state: "mundur", unanswered: true });
  });
  it("a yes survives the deadline", () => {
    expect(st("ya", false, after).state).toBe("ya");
  });
  it("a decline is a decline, not an unanswered offer", () => {
    expect(st("mundur", false, before)).toEqual({ state: "mundur", unanswered: false });
  });
  it("a seat in the Susulan wins over an open offer, never over a decline", () => {
    expect(st("tawar", true, after).state).toBe("ditempatkan");
    expect(st("ya", true, before).state).toBe("ditempatkan");
    expect(st(null, true, before).state).toBe("ditempatkan");
    expect(st("mundur", true, before).state).toBe("mundur");
  });
  it("with no Susulan day in the calendar an offer never lapses", () => {
    expect(
      makeupState({ row: { status: "tawar" }, placed: false, deadline: null, now: after }).state,
    ).toBe("tawar");
  });
});

describe("checkRecord", () => {
  const rec = (ans: string, state: string, note = "", via: unknown = "line") =>
    checkRecord({ ans, state, via, note } as Parameters<typeof checkRecord>[0]);

  it("records a yes with no note", () => {
    expect(rec("ikut", "tawar")).toEqual({ ok: true, status: "ya", via: "line", note: "" });
  });
  it("a decline needs a note of 8 characters", () => {
    expect(rec("tidak", "tawar", "ada ujian")).toMatchObject({ ok: true, status: "mundur" });
    expect(rec("tidak", "tawar", "sakit")).toEqual({ ok: false, field: "note" });
  });
  it("reinstating needs a withdrawn CaAs and a note", () => {
    expect(rec("pulihkan", "mundur", "balas lewat LINE")).toMatchObject({
      ok: true,
      status: "ya",
    });
    expect(rec("pulihkan", "mundur", "")).toEqual({ ok: false, field: "note" });
    expect(rec("pulihkan", "tawar", "balas lewat LINE")).toEqual({ ok: false, field: "ans" });
  });
  it("cannot record an answer before the offer or after a withdrawal", () => {
    expect(rec("ikut", "tunggu")).toEqual({ ok: false, field: "ans" });
    expect(rec("ikut", "mundur")).toEqual({ ok: false, field: "ans" });
  });
  it("the web is not a channel Panitia can claim", () => {
    expect(rec("ikut", "tawar", "", "web")).toEqual({ ok: false, field: "via" });
  });
  it("trims the note", () => {
    expect(rec("ikut", "ya", "  ok dari LINE  ")).toMatchObject({ note: "ok dari LINE" });
  });
});

describe("template deadline", () => {
  it("defaults to one day before at 12:00", () => {
    expect(IV_DEFAULT.mengajar.makeupDays).toBe(1);
    expect(IV_DEFAULT.mengajar.makeupHour).toBe(12);
  });
  it("a template saved before the fields existed still checks, with the defaults", () => {
    const { makeupDays: _d, makeupHour: _h, ...old } = IV_DEFAULT.wawancara;
    expect(checkTemplate(old)).toMatchObject({ makeupDays: 1, makeupHour: 12 });
  });
  it("refuses an hour of 24", () => {
    expect(checkTemplate({ ...IV_DEFAULT.wawancara, makeupHour: 24 })).toBeNull();
  });
});

describe("tulisTidakHadir (Tes Tulis no-shows)", () => {
  const room = (roomFinished: boolean, seat: Parameters<typeof tulisTidakHadir>[0]["seat"]) =>
    tulisTidakHadir({ roomFinished, seat });
  it("is false while the room has not finished", () => {
    expect(room(false, null)).toBe(false);
  });
  it("is true with no seat, or a seat that never checked in nor was dealt a question", () => {
    expect(room(true, null)).toBe(true);
    expect(room(true, { checkin: {}, draw: {} })).toBe(true);
    expect(room(true, { checkin: null, draw: null })).toBe(true);
  });
  it("is false once the CaAs checked in or was dealt anything", () => {
    expect(room(true, { checkin: { name: 1 }, draw: {} })).toBe(false);
    expect(room(true, { checkin: {}, draw: { logika: [1] } })).toBe(false);
  });
});
