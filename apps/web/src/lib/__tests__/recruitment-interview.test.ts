import { describe, expect, it } from "vitest";
import {
  IV_DEFAULT,
  caseOutcome,
  checkTemplate,
  crewFor,
  crewNeed,
  levelsDone,
  meanScore,
  sheetMissing,
  sheetScore,
  spreadScore,
  turnsFit,
  verdictOf,
} from "../recruitment/interview";
import { SETTINGS } from "../recruitment/settings";

const W = IV_DEFAULT.wawancara;
const M = IV_DEFAULT.mengajar;
const all = (n: number) => Object.fromEntries(W.params.map((p) => [p.key, n]));

describe("the default templates", () => {
  it.each(["wawancara", "mengajar"] as const)("%s passes its own check", (k) => {
    expect(checkTemplate(IV_DEFAULT[k])).toEqual(IV_DEFAULT[k]);
  });

  it("the interview has the five parameters and the cards of the form", () => {
    expect(W.params.map((p) => p.key)).toEqual([
      "attitude",
      "komitmen",
      "profesional",
      "keaktifan",
      "konsisten",
    ]);
    expect(W.questions.length).toBe(42);
    expect(W.questions.filter((q) => q.only).map((q) => q.only)).toEqual(["fm", "lab"]);
    expect(W.questions.filter((q) => q.reveal)).toHaveLength(1);
    expect(new Set(W.questions.map((q) => q.id)).size).toBe(W.questions.length);
  });

  it("teaching has no question cards and a panel of three", () => {
    expect(M.questions).toEqual([]);
    expect(M.mode).toBe("panel");
    expect(M.per).toBe(3);
    expect(M.params.every((p) => p.example)).toBe(true);
  });

  it("are the registered settings, edited by the Ketua and the Akademik", () => {
    expect(SETTINGS.wawancara.def).toBe(W);
    expect(SETTINGS.mengajar.roles).toEqual(["ketua", "akademik"]);
  });
});

describe("checkTemplate", () => {
  it("refuses a template that cannot be used", () => {
    expect(checkTemplate(null)).toBeNull();
    expect(checkTemplate({ ...W, mode: "x" })).toBeNull();
    expect(checkTemplate({ ...W, params: [] })).toBeNull();
    expect(checkTemplate({ ...W, cut: [30, 60] })).toBeNull();
    expect(checkTemplate({ ...W, levels: W.levels.slice(0, 2) })).toBeNull();
    expect(checkTemplate({ ...W, minutes: 200, maxMinutes: 100 })).toBeNull();
    expect(
      checkTemplate({ ...W, params: [W.params[0], { ...W.params[1], key: W.params[0].key }] }),
    ).toBeNull();
  });

  it("refuses a question that points at a parameter or group that is gone", () => {
    expect(checkTemplate({ ...W, questions: [{ ...W.questions[0], p: "nope" }] })).toBeNull();
    expect(checkTemplate({ ...W, questions: [{ ...W.questions[0], g: "nope" }] })).toBeNull();
  });
});

describe("scoring", () => {
  it("is 0 at the lowest level and 100 at the highest", () => {
    expect(sheetScore(all(1), W.params)).toBe(0);
    expect(sheetScore(all(5), W.params)).toBe(100);
    expect(sheetScore(all(3), W.params)).toBe(50);
  });

  it("leaves out a parameter that is not set yet", () => {
    expect(sheetScore({ attitude: 5 }, W.params)).toBe(100);
    expect(sheetScore({}, W.params)).toBe(0);
  });

  it("weights count", () => {
    const params = [
      { ...W.params[0], weight: 3 },
      { ...W.params[1], weight: 1 },
    ];
    expect(sheetScore({ attitude: 5, komitmen: 1 }, params)).toBe(75);
  });

  it("is done only when every level is inside its range", () => {
    expect(levelsDone(all(4), W.params)).toBe(true);
    expect(levelsDone({ ...all(4), konsisten: 6 }, W.params)).toBe(false);
    expect(levelsDone({ ...all(4), konsisten: 2.5 }, W.params)).toBe(false);
    expect(levelsDone({ attitude: 4 }, W.params)).toBe(false);
  });

  it("averages the examiners and shows the spread", () => {
    const sheets = [
      { by: "NUE", levels: all(5) },
      { by: "GMW", levels: all(3) },
    ];
    expect(meanScore(sheets, W.params)).toBe(75);
    expect(spreadScore(sheets, W.params)).toBe(50);
    expect(spreadScore([sheets[0]], W.params)).toBeNull();
    expect(meanScore([], W.params)).toBeNull();
  });

  it("turns a mean into a verdict at the proposed thresholds", () => {
    expect(verdictOf(52, W.cut)).toBe("lolos");
    expect(verdictOf(51.9, W.cut)).toBe("ragu");
    expect(verdictOf(38, W.cut)).toBe("ragu");
    expect(verdictOf(37, W.cut)).toBe("cut");
  });
});

describe("the crew", () => {
  const roster = ["A", "B", "C", "D", "E", "F"];

  it("splits into pairs by booth in the interview", () => {
    expect(crewFor(roster, 0, W)).toEqual(["A", "B"]);
    expect(crewFor(roster, 2, W)).toEqual(["E", "F"]);
    expect(crewFor(roster, 3, W)).toEqual([]);
  });

  it("is the whole panel for every turn in teaching", () => {
    expect(crewFor(["A", "B", "C"], 5, M)).toEqual(["A", "B", "C"]);
  });

  it("needs a pair per booth, or one panel for the room", () => {
    expect(crewNeed(4, W)).toBe(8);
    expect(crewNeed(0, W)).toBe(0);
    expect(crewNeed(8, M)).toBe(3);
    expect(crewNeed(0, M)).toBe(0);
  });

  it("fits eight 15 minute turns with 3 minute changeovers in a 2h30 evening", () => {
    expect(turnsFit(150, M)).toBe(8);
    expect(turnsFit(1, M)).toBe(1);
  });
});

describe("special cases", () => {
  it("lateness inside the grace changes nothing", () => {
    expect(caseOutcome({ kind: "telat", minutes: 10 }, W)).toEqual({
      status: null,
      end: false,
      code: "grace",
    });
  });

  it("past the grace: the makeup with a reason, gugur without", () => {
    expect(caseOutcome({ kind: "telat", minutes: 12, why: "akademik" }, W).status).toBe("susulan");
    expect(caseOutcome({ kind: "telat", minutes: 12, why: "musibah" }, W).status).toBe("susulan");
    const g = caseOutcome({ kind: "telat", minutes: 12, why: "lain" }, W);
    expect(g).toEqual({ status: "gugur", end: true, code: "late_gugur" });
  });

  it("an absence with proof is offered the makeup, without it is gugur", () => {
    expect(caseOutcome({ kind: "absen", why: "kuliah" }, W).status).toBe("susulan");
    expect(caseOutcome({ kind: "absen", why: "tanpa" }, W).status).toBe("gugur");
  });

  it("illness stops the interview and offers the makeup; the rest carry on", () => {
    expect(caseOutcome({ kind: "sakit" }, W)).toEqual({
      status: "susulan",
      end: true,
      code: "sakit",
    });
    expect(caseOutcome({ kind: "nametag" }, W).end).toBe(false);
    expect(caseOutcome({ kind: "keluar" }, W).end).toBe(false);
  });

  it("follows the template's own grace", () => {
    expect(
      caseOutcome({ kind: "telat", minutes: 15, why: "lain" }, { late: 20 }).status,
    ).toBeNull();
  });
});

describe("a sheet ready to send", () => {
  it("lists what is still missing", () => {
    expect(sheetMissing({ levels: {}, concl: {}, verdict: null }, W.params)).toHaveLength(11);
    const full = {
      levels: all(4),
      concl: Object.fromEntries(W.params.map((p) => [p.key, "ok"])),
      verdict: "lolos" as const,
    };
    expect(sheetMissing(full, W.params)).toEqual([]);
    expect(sheetMissing({ ...full, verdict: null }, W.params)).toEqual(["verdict"]);
    expect(sheetMissing({ ...full, concl: { ...full.concl, attitude: "  " } }, W.params)).toEqual([
      "cl-attitude",
    ]);
  });
});
