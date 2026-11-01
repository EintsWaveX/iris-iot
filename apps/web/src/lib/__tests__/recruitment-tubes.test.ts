import { describe, expect, it } from "vitest";
import {
  TUBES_DEFAULT,
  TUBES_MAX_MB,
  canInviteMore,
  checkFile,
  checkLink,
  checkTubes,
  dealTeams,
  defaultSessions,
  drawTopic,
  groupLeftovers,
  nimBersih,
  sessionChangeOpen,
  sessionCutoff,
  sessionPickProblem,
  shareEvenly,
  submissionStatus,
  submitAllowed,
  submitState,
  teamSizeProblem,
  teamsLocked,
} from "../recruitment/tubes";
import type { RecEvent } from "../recruitment/types";

const ev = (o: Partial<RecEvent>): RecEvent =>
  ({
    id: 1,
    kind: "meeting",
    title: "x",
    startsOn: "2026-12-12",
    endsOn: "2026-12-12",
    dayStart: null,
    dayEnd: null,
    place: null,
    internal: false,
    audience: "all",
    gates: [],
    stage: "tubes",
    color: null,
    sort: 0,
    ...o,
  }) as RecEvent;

const WIB = (d: string, t: string) => new Date(`${d}T${t}:00+07:00`);

describe("team size", () => {
  const s = { teamMin: 2, teamMax: 3 };
  it("flags too few and too many", () => {
    expect(teamSizeProblem(1, s)).toBe("kurang");
    expect(teamSizeProblem(2, s)).toBeNull();
    expect(teamSizeProblem(3, s)).toBeNull();
    expect(teamSizeProblem(4, s)).toBe("lebih");
  });
  it("counts the ones still being asked against the maximum", () => {
    expect(canInviteMore([{ status: "joined" }, { status: "invited" }], s)).toBe(true);
    expect(
      canInviteMore([{ status: "joined" }, { status: "invited" }, { status: "invited" }], s),
    ).toBe(false);
  });
  it("tidies a NIM", () => {
    expect(nimBersih(" t8700002 ")).toBe("T8700002");
    expect(nimBersih("ab")).toBeNull();
    expect(nimBersih("12 34")).toBeNull();
  });
});

describe("the team lock", () => {
  const events = [ev({ kind: "meeting", startsOn: "2026-12-12" })];
  it("locks at the Techmeet's start (18.30 WIB when it has no window)", () => {
    expect(teamsLocked(events, null, WIB("2026-12-12", "18:29"))).toBe(false);
    expect(teamsLocked(events, null, WIB("2026-12-12", "18:30"))).toBe(true);
  });
  it("Panitia can force it either way", () => {
    expect(teamsLocked(events, "open", WIB("2026-12-20", "10:00"))).toBe(false);
    expect(teamsLocked(events, "closed", WIB("2026-12-01", "10:00"))).toBe(true);
  });
});

describe("the lab evening", () => {
  it("can be changed until the end of the day before (H-1 23.59)", () => {
    const start = WIB("2026-12-14", "18:30");
    expect(sessionCutoff(start).toISOString()).toBe(WIB("2026-12-14", "00:00").toISOString());
    expect(sessionChangeOpen(start, WIB("2026-12-13", "23:59"))).toBe(true);
    expect(sessionChangeOpen(start, WIB("2026-12-14", "00:00"))).toBe(false);
  });
  const x = {
    id: 1,
    startsAt: WIB("2026-12-14", "18:30").toISOString(),
    endsAt: WIB("2026-12-14", "22:00").toISOString(),
    capacity: 5,
  };
  const now = WIB("2026-12-12", "10:00");
  it("counts people, not teams", () => {
    expect(sessionPickProblem(x, 2, 3, 0, now)).toBeNull();
    expect(sessionPickProblem(x, 3, 3, 0, now)).toBe("penuh");
  });
  it("a team keeps its own seats when it re-picks the same evening", () => {
    expect(sessionPickProblem(x, 5, 3, 3, now)).toBeNull();
  });
  it("refuses an evening past its cutoff", () => {
    expect(sessionPickProblem(x, 0, 3, 0, WIB("2026-12-14", "09:00"))).toBe("lewat");
  });
  it("makes one evening per day of the event, with its window", () => {
    const d = defaultSessions(
      { startsOn: "2026-12-13", endsOn: "2026-12-17", dayStart: "18:30", dayEnd: "22:00" },
      12,
    );
    expect(d).toHaveLength(5);
    expect(d[0].startsAt.toISOString()).toBe(WIB("2026-12-13", "18:30").toISOString());
    expect(d[4].endsAt.toISOString()).toBe(WIB("2026-12-17", "22:00").toISOString());
    expect(d.every((x) => x.capacity === 12)).toBe(true);
  });
});

describe("the submission", () => {
  const work = WIB("2026-12-13", "18:30");
  const close = WIB("2026-12-18", "18:30");
  it("opens with the Pengerjaan and closes when the Presentasi starts", () => {
    expect(submitState(close, work, WIB("2026-12-12", "12:00"), null)).toBe("belum");
    expect(submitState(close, work, WIB("2026-12-15", "12:00"), null)).toBe("buka");
    expect(submitState(close, work, WIB("2026-12-18", "18:30"), null)).toBe("tutup");
  });
  it("the Ketua's override lets a team through until its own time", () => {
    const ov = { until: WIB("2026-12-18", "21:00") };
    expect(submitState(close, work, WIB("2026-12-18", "19:00"), ov)).toBe("izin");
    expect(submitState(close, work, WIB("2026-12-18", "21:00"), ov)).toBe("tutup");
    expect(submitState(close, work, WIB("2026-12-19", "09:00"), { until: null })).toBe("izin");
    expect(submitAllowed("izin")).toBe(true);
    expect(submitAllowed("tutup")).toBe(false);
  });
  it("checks a file's extension and size against its part", () => {
    const code = TUBES_DEFAULT.parts[0];
    expect(checkFile(code, "kode.zip", 1000)).toBeNull();
    expect(checkFile(code, "KODE.ZIP", 1000)).toBeNull();
    expect(checkFile(code, "kode.rar", 1000)).toBe("ekstensi");
    expect(checkFile(code, "kode", 1000)).toBe("ekstensi");
    expect(checkFile(code, "kode.zip", 4)).toBe("kosong");
    expect(checkFile(code, "kode.zip", (code.mb + 1) * 1024 * 1024)).toBe("terlalu_besar");
    expect(checkFile(undefined, "a.zip", 100)).toBe("bagian_salah");
  });
  it("takes https links only", () => {
    expect(checkLink("https://youtu.be/abc123")).toBe("https://youtu.be/abc123");
    expect(checkLink("http://youtu.be/abc123")).toBeNull();
    expect(checkLink("javascript:alert(1)")).toBeNull();
    expect(checkLink("https://nodot/abc")).toBeNull();
    expect(checkLink("https://a.b/with space")).toBeNull();
  });
  it("tells how complete it is against the required parts", () => {
    const s = TUBES_DEFAULT;
    expect(submissionStatus(new Set(), s, "buka", false)).toBe("none");
    expect(submissionStatus(new Set(["code"]), s, "buka", false)).toBe("partial");
    expect(submissionStatus(new Set(["code", "report", "demo"]), s, "buka", false)).toBe(
      "complete",
    );
    expect(submissionStatus(new Set(["code"]), s, "tutup", false)).toBe("late");
    expect(submissionStatus(new Set(["code"]), s, "izin", true)).toBe("over");
    // A complete submission stays complete after the close.
    expect(submissionStatus(new Set(["code", "report", "demo"]), s, "tutup", false)).toBe(
      "complete",
    );
  });
});

describe("the setting", () => {
  it("accepts the default and keeps limits under the store's cap", () => {
    expect(checkTubes(TUBES_DEFAULT)).toEqual(TUBES_DEFAULT);
    const big = { ...TUBES_DEFAULT, parts: [{ ...TUBES_DEFAULT.parts[0], mb: TUBES_MAX_MB + 1 }] };
    expect(checkTubes(big)).toBeNull();
  });
  it("refuses a team minimum above the maximum, and duplicate parts", () => {
    expect(checkTubes({ ...TUBES_DEFAULT, teamMin: 4, teamMax: 3 })).toBeNull();
    expect(
      checkTubes({ ...TUBES_DEFAULT, parts: [TUBES_DEFAULT.parts[0], TUBES_DEFAULT.parts[0]] }),
    ).toBeNull();
    expect(checkTubes({ ...TUBES_DEFAULT, assign: "acak" })).toBeNull();
  });
});

describe("topics and the order", () => {
  const topics = [
    { id: 1, cap: 1 },
    { id: 2, cap: 2 },
  ];
  it("a draw lands on a topic that still has room", () => {
    expect(drawTopic(topics, new Map([[1, 1]]), 0)).toBe(2);
    expect(drawTopic(topics, new Map([[1, 1]]), 0.99)).toBe(2);
  });
  it("when every topic is full a draw still lands somewhere", () => {
    expect([1, 2]).toContain(
      drawTopic(
        topics,
        new Map([
          [1, 1],
          [2, 2],
        ]),
        0.5,
      ),
    );
    expect(drawTopic([], new Map(), 0.5)).toBeNull();
  });
  it("shares topics round robin", () => {
    const m = shareEvenly([10, 11, 12], [1, 2]);
    expect([m.get(10), m.get(11), m.get(12)]).toEqual([1, 2, 1]);
  });
  it("deals teams over the tables, level", () => {
    let i = 0;
    const out = dealTeams([1, 2, 3, 4, 5], 2, () => (i++ % 7) / 7);
    expect(out.flat().sort()).toEqual([1, 2, 3, 4, 5]);
    expect(Math.abs(out[0].length - out[1].length)).toBeLessThanOrEqual(1);
  });
  it("groups the ones left without a team into sizes within the limits", () => {
    expect(groupLeftovers([1, 2, 3, 4, 5], 2, 3).map((g) => g.length)).toEqual([3, 2]);
    expect(groupLeftovers([1, 2, 3, 4, 5, 6, 7], 2, 3).map((g) => g.length)).toEqual([3, 2, 2]);
    expect(groupLeftovers([1, 2, 3, 4, 5, 6], 2, 3).map((g) => g.length)).toEqual([3, 3]);
    expect(groupLeftovers([1], 2, 3).map((g) => g.length)).toEqual([1]);
    expect(groupLeftovers([], 2, 3)).toEqual([]);
  });
});
