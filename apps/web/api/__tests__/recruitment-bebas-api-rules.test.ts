/**
 * The two rule helpers that live beside their handlers: the QR window and the makeup deadline.
 * Free mode is the practice context, the same way the server sees it.
 */
import { describe, expect, it } from "vitest";
import { bisaDipindai } from "../_lib/recruitment-attendance";
import { posisiMakeup, type MakeupCtx } from "../_lib/recruitment-makeup";
import { jalankanLatihan, type KonteksLatihan } from "../_lib/recruitment-latihan-ctx";
import type { RecEvent } from "../../src/lib/recruitment/types";

const konteks: KonteksLatihan = {
  mode: "asisten",
  nim: "101022300001",
  nama: "Latih",
  edisi: { id: 2, year: 3026, title: "Latihan", status: "latihan" } as KonteksLatihan["edisi"],
};
const dalamLatihan = <T>(f: () => T): T => jalankanLatihan(konteks, f);

const wib = (s: string) => new Date(`${s}+07:00`);
const now = wib("2026-11-06T04:15:00");

const EVENT: RecEvent = {
  id: 5,
  kind: "meeting",
  title: "First Meet",
  startsOn: "2026-11-20",
  endsOn: "2026-11-20",
  dayStart: "18:30",
  dayEnd: "21:00",
  place: null,
  internal: false,
  audience: "all",
  gates: ["qr"],
  stage: "first_meet",
  color: null,
  sort: 1,
};

describe("bisaDipindai in free mode", () => {
  it("needs the event to be running outside practice", () => {
    expect(bisaDipindai(EVENT, now)).toBe(false);
    expect(bisaDipindai(EVENT, wib("2026-11-20T19:00:00"))).toBe(true);
  });
  it("is true for a gathering at any time in practice", () => {
    expect(dalamLatihan(() => bisaDipindai(EVENT, now))).toBe(true);
  });
  it("is still false in practice for an event that is not a gathering", () => {
    const daftar = { ...EVENT, kind: "registration", gates: ["daftar"] } as RecEvent;
    expect(dalamLatihan(() => bisaDipindai(daftar, now))).toBe(false);
  });
});

describe("posisiMakeup in free mode", () => {
  const ctx: MakeupCtx = {
    event: null,
    events: [],
    deadline: wib("2026-11-01T12:00:00"),
  };
  const tawar = { status: "tawar" } as never;
  it("withdraws an unanswered offer after the deadline outside practice", () => {
    expect(posisiMakeup(ctx, tawar, null, now)).toEqual({ state: "mundur", unanswered: true });
  });
  it("keeps the offer open past the deadline in practice", () => {
    expect(dalamLatihan(() => posisiMakeup(ctx, tawar, null, now))).toEqual({
      state: "tawar",
      unanswered: false,
    });
  });
});
