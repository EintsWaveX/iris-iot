/**
 * The Tubes rules that gate an action (team lock, team size, invite room, the lab evening's cutoff and room, the
 * submission window) lift in free mode and are unchanged with the switch off.
 */
import { afterEach, describe, expect, it } from "vitest";
import { setBebasHook } from "../recruitment/bebas";
import {
  canInviteMore,
  sessionPickProblem,
  submitState,
  teamSizeProblem,
  teamsLocked,
  tubesDibuka,
} from "../recruitment/tubes";

const bebasOn = () => setBebasHook(() => true);
afterEach(() => setBebasHook(() => false));

const wib = (s: string) => new Date(`${s}+07:00`);
const now = wib("2026-12-08T04:15:00");

describe("teamsLocked", () => {
  it("follows the forced mode with the switch off", () => {
    expect(teamsLocked([], "closed", now)).toBe(true);
    expect(teamsLocked([], "open", now)).toBe(false);
  });
  it("is never locked in free mode, even when forced closed", () => {
    bebasOn();
    expect(teamsLocked([], "closed", now)).toBe(false);
  });
});

describe("teamSizeProblem", () => {
  const s = { teamMin: 3, teamMax: 5 };
  it("flags too few and too many with the switch off", () => {
    expect(teamSizeProblem(1, s)).toBe("kurang");
    expect(teamSizeProblem(6, s)).toBe("lebih");
    expect(teamSizeProblem(4, s)).toBeNull();
  });
  it("flags nothing in free mode", () => {
    bebasOn();
    expect(teamSizeProblem(1, s)).toBeNull();
    expect(teamSizeProblem(6, s)).toBeNull();
  });
});

describe("canInviteMore", () => {
  const penuh = [
    { id: 1, status: "joined" },
    { id: 2, status: "joined" },
  ] as never;
  it("stops at the maximum with the switch off", () => {
    expect(canInviteMore(penuh, { teamMax: 2 })).toBe(false);
  });
  it("always has room in free mode", () => {
    bebasOn();
    expect(canInviteMore(penuh, { teamMax: 2 })).toBe(true);
  });
});

describe("sessionPickProblem", () => {
  const malam = { id: 1, startsAt: wib("2026-12-07T18:30:00").toISOString(), capacity: 3 } as never;
  it("says the evening has passed, or is full, with the switch off", () => {
    expect(sessionPickProblem(malam, 0, 2, 0, now)).toBe("lewat");
    const depan = {
      id: 1,
      startsAt: wib("2026-12-20T18:30:00").toISOString(),
      capacity: 3,
    } as never;
    expect(sessionPickProblem(depan, 3, 2, 0, now)).toBe("penuh");
  });
  it("takes any evening and any size in free mode", () => {
    bebasOn();
    expect(sessionPickProblem(malam, 3, 5, 0, now)).toBeNull();
  });
});

describe("submitState", () => {
  it("is not open before the work starts and closed after the close, with the switch off", () => {
    expect(submitState(wib("2026-12-11T18:30:00"), wib("2026-12-10T18:30:00"), now, null)).toBe(
      "belum",
    );
    expect(submitState(wib("2026-12-07T18:30:00"), wib("2026-12-06T18:30:00"), now, null)).toBe(
      "tutup",
    );
  });
  it("is always open in free mode", () => {
    bebasOn();
    expect(submitState(wib("2026-12-11T18:30:00"), wib("2026-12-10T18:30:00"), now, null)).toBe(
      "buka",
    );
    expect(submitState(wib("2026-12-07T18:30:00"), wib("2026-12-06T18:30:00"), now, null)).toBe(
      "buka",
    );
  });
});

describe("tubesDibuka (the Tubes tile on the CaAs page)", () => {
  it("opens from the first day of the Tubes window, for a CaAs at Tubes, with the switch off", () => {
    expect(tubesDibuka("tubes", "2026-12-03", "2026-12-02")).toBe(false);
    expect(tubesDibuka("tubes", "2026-12-03", "2026-12-03")).toBe(true);
    expect(tubesDibuka("tubes", null, "2026-12-03")).toBe(false);
    expect(tubesDibuka("tes_tulis", "2026-12-03", "2026-12-04")).toBe(false);
  });
  it("opens before the window and with no window in free mode, still for a CaAs at Tubes", () => {
    bebasOn();
    expect(tubesDibuka("tubes", "2026-12-03", "2026-11-06")).toBe(true);
    expect(tubesDibuka("tubes", null, "2026-11-06")).toBe(true);
    expect(tubesDibuka("tes_tulis", "2026-12-03", "2026-11-06")).toBe(false);
  });
});
