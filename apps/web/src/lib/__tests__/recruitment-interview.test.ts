import { describe, expect, it } from "vitest";
import {
  CATATAN_EMPTY,
  IV_DEFAULT,
  caseKindsFor,
  caseOutcome,
  checkCatatan,
  checkTemplate,
  boothSize,
  cleanSizes,
  crewFor,
  crewNeed,
  labelOf,
  levelsDone,
  meanScore,
  redFlag,
  sheetMissing,
  sheetScore,
  spreadScore,
  suggestVerdict,
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

  it("the interview has the five parameters, by importance, and the 33 cards of the workbook", () => {
    expect(W.params.map((p) => p.key)).toEqual([
      "attitude",
      "komitmen",
      "profesional",
      "konsisten",
      "keaktifan",
    ]);
    expect(W.params.map((p) => p.weight)).toEqual([30, 25, 20, 15, 10]);
    expect(W.questions.length).toBe(33);
    expect(W.questions.filter((q) => q.only).map((q) => q.only)).toEqual([
      "fm",
      "lab",
      "a24",
      "te",
    ]);
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

describe("the interview workbook (Wawancara_CaAs_IRIS)", () => {
  const lv = (a: number, k: number, p: number, c: number, e: number) => ({
    attitude: a,
    komitmen: k,
    profesional: p,
    konsisten: c,
    keaktifan: e,
  });
  const score = (levels: Record<string, number>) => sheetScore(levels, W.params, W.floor);

  it("takes the session length, crew and decision lines from the sheet", () => {
    expect(W.floor).toBe("zero");
    expect([W.minutes, W.maxMinutes, W.per, W.pjOut]).toEqual([90, 120, 2, 1]);
    expect(W.cut).toEqual([52, 38]);
    expect(W.wide).toBe(20);
    expect(W.flag).toEqual({ keys: ["attitude", "komitmen"], max: 2 });
    expect(W.tags?.red).toHaveLength(6);
    expect(W.tags?.plus).toHaveLength(6);
    expect([W.tags?.many, W.tags?.jago]).toEqual([3, 3]);
  });

  it("scores (sum of weight x level) / 5 x 100, so level 1 everywhere is 20", () => {
    expect(score(all(1))).toBe(20);
    expect(score(all(3))).toBe(60);
    expect(score(all(5))).toBe(100);
  });

  it("matches the workbook's own example: 78 and 75, mean 76.5, Fix Lolos", () => {
    const a = lv(4, 4, 3, 4, 5);
    const b = lv(4, 3, 4, 4, 4);
    expect(score(a)).toBe(78);
    expect(score(b)).toBe(75);
    const sheets = [
      { by: "LYY", levels: a },
      { by: "OCU", levels: b },
    ];
    expect(meanScore(sheets, W.params, W.floor)).toBe(76.5);
    expect(spreadScore(sheets, W.params, W.floor)).toBe(3);
    expect(suggestVerdict(76.5, sheets, W)).toEqual({ verdict: "lolos", flag: false });
  });

  it("keeps the old scale for a template that does not say (floor min)", () => {
    expect(sheetScore(all(1), W.params)).toBe(0);
    expect(sheetScore(all(1), W.params, "min")).toBe(0);
  });

  it("the weights decide: a weak Attitude hurts more than a weak Keaktifan", () => {
    expect(score(lv(1, 5, 5, 5, 5))).toBeLessThan(score(lv(5, 5, 5, 5, 1)));
  });

  it("cuts at 52 and 38 on the workbook's scale", () => {
    // 52 = a weighted level of 2.6; 38 = 1.9
    expect(suggestVerdict(52, [], W).verdict).toBe("lolos");
    expect(suggestVerdict(51.9, [], W).verdict).toBe("ragu");
    expect(suggestVerdict(38, [], W).verdict).toBe("ragu");
    expect(suggestVerdict(37.9, [], W).verdict).toBe("cut");
  });

  it("a level of 2 or less on Attitude or Komitmen, from either examiner, is a red flag", () => {
    const fine = { by: "A", levels: lv(4, 4, 4, 4, 4) };
    expect(redFlag([fine], W.flag)).toBe(false);
    expect(redFlag([fine, { by: "B", levels: lv(2, 5, 5, 5, 5) }], W.flag)).toBe(true);
    expect(redFlag([fine, { by: "B", levels: lv(5, 2, 5, 5, 5) }], W.flag)).toBe(true);
    expect(redFlag([fine, { by: "B", levels: lv(5, 3, 1, 1, 1) }], W.flag)).toBe(false);
    expect(redFlag([{ by: "B", levels: lv(2, 5, 5, 5, 5) }], null)).toBe(false);
  });

  it("a red flag stops a Fix Lolos at Ragu-ragu, but never lifts a verdict", () => {
    const flagged = [{ by: "B", levels: lv(2, 5, 5, 5, 5) }];
    expect(suggestVerdict(80, flagged, W)).toEqual({ verdict: "ragu", flag: true });
    expect(suggestVerdict(45, flagged, W)).toEqual({ verdict: "ragu", flag: true });
    expect(suggestVerdict(20, flagged, W)).toEqual({ verdict: "cut", flag: true });
  });

  it("names a label from the red notes and plus points, or the one picked by hand", () => {
    const t = { many: 3, jago: 3 };
    const c = (red: number, plus: number, label: null | "jago" = null) => ({
      red: Array.from({ length: red }, (_, i) => `r${i}`),
      plus: Array.from({ length: plus }, (_, i) => `p${i}`),
      label,
    });
    expect(labelOf(c(0, 0), t)).toBe("standar");
    expect(labelOf(c(1, 0), t)).toBe("perhatian");
    expect(labelOf(c(2, 5), t)).toBe("perhatian");
    expect(labelOf(c(3, 0), t)).toBe("banyak");
    expect(labelOf(c(0, 3), t)).toBe("jago");
    expect(labelOf(c(0, 2), t)).toBe("standar");
    expect(labelOf(c(3, 3), t)).toBe("banyak");
    expect(labelOf(c(3, 0, "jago"), t)).toBe("jago");
  });

  it("gives every card a priority and adds up to the workbook's minutes", () => {
    expect(W.questions.every((q) => q.prio)).toBe(true);
    const sum = (f: (q: (typeof W.questions)[number]) => boolean) =>
      W.questions.filter(f).reduce((a, q) => a + q.m, 0);
    expect(sum((q) => !q.only)).toBe(55.5);
    expect(sum(() => true)).toBe(64);
    expect(sum((q) => q.prio === "wajib")).toBe(24);
    expect(sum((q) => q.prio === "penting")).toBe(40);
    expect(sum((q) => q.prio === "lewat")).toBe(0);
  });

  it("keeps a template saved before these fields existed, and its old scale", () => {
    const { floor: _f, flag: _g, tags: _t, rev: _r, ...old } = W;
    const oldQuestions = old.questions.map(({ prio: _p, ...q }) => q);
    const got = checkTemplate({ ...old, questions: oldQuestions });
    expect(got).toMatchObject({ floor: "min", flag: null, tags: null, rev: 0 });
    expect(got?.questions.every((q) => q.prio === undefined)).toBe(true);
  });

  it("refuses a flag, a priority or a checklist it cannot use", () => {
    expect(checkTemplate({ ...W, floor: "x" })).toBeNull();
    expect(checkTemplate({ ...W, flag: { keys: ["nope"], max: 2 } })).toBeNull();
    expect(checkTemplate({ ...W, flag: { keys: [], max: 2 } })).toBeNull();
    expect(checkTemplate({ ...W, flag: { keys: ["attitude"], max: 12 } })).toBeNull();
    expect(checkTemplate({ ...W, questions: [{ ...W.questions[0], prio: "x" }] })).toBeNull();
    expect(checkTemplate({ ...W, tags: { ...W.tags, many: 0 } })).toBeNull();
    const dup = W.tags!;
    expect(
      checkTemplate({ ...W, tags: { ...dup, plus: [{ ...dup.plus[0], key: dup.red[0].key }] } }),
    ).toBeNull();
  });

  it("cleans a Catatan: unknown keys out, label and notes checked, empty notes dropped", () => {
    const got = checkCatatan(
      {
        red: ["jujur", "nope", "jujur"],
        plus: ["skill", "jujur"],
        label: "jago",
        notes: { NUE: "  rapi  ", pjDalam: "", "bad key!": "x", lain: 5 },
        final: "  disarankan lolos  ",
      },
      W.tags,
    );
    expect(got).toEqual({
      red: ["jujur"],
      plus: ["skill"],
      label: "jago",
      notes: { NUE: "rapi" },
      final: "disarankan lolos",
    });
    expect(checkCatatan({ label: "x" }, W.tags).label).toBeNull();
    expect(checkCatatan(null, null)).toEqual(CATATAN_EMPTY);
    expect(checkCatatan({ red: ["jujur"] }, null).red).toEqual([]);
  });
});

describe("the crew", () => {
  const roster = ["A", "B", "C", "D", "E", "F"];

  it("splits into pairs by booth in the interview", () => {
    expect(crewFor(roster, 0, W)).toEqual(["A", "B"]);
    expect(crewFor(roster, 2, W)).toEqual(["E", "F"]);
    expect(crewFor(roster, 3, W)).toEqual([]);
  });

  it("lets a slot seat one examiner with a CaAs and two with the next", () => {
    const sizes = [1, 2, 1];
    expect(crewFor(roster, 0, W, sizes)).toEqual(["A"]);
    expect(crewFor(roster, 1, W, sizes)).toEqual(["B", "C"]);
    expect(crewFor(roster, 2, W, sizes)).toEqual(["D"]);
    // booths past the list follow the template
    expect(crewFor(roster, 3, W, sizes)).toEqual(["E", "F"]);
    expect(crewNeed(4, W, sizes)).toBe(6);
    expect(crewNeed(3, W, [1, 1, 1])).toBe(3);
    expect(boothSize(sizes, 1, 2)).toBe(2);
    expect(boothSize(null, 0, 2)).toBe(2);
  });

  it("ignores sizes in panel mode", () => {
    expect(crewFor(["A", "B", "C"], 1, M, [1, 1])).toEqual(["A", "B", "C"]);
    expect(crewNeed(8, M, [1, 1])).toBe(3);
  });

  it("cleans the sizes to store: 1 to 8, cut to the booths, the template's size trimmed off the end", () => {
    expect(cleanSizes([1, 2, 2], 3, 2)).toEqual([1]);
    expect(cleanSizes([2, 2, 2], 3, 2)).toBeNull();
    expect(cleanSizes([1, 3, 1, 1], 2, 2)).toEqual([1, 3]);
    expect(cleanSizes(null, 3, 2)).toBeNull();
    expect(cleanSizes([0, 2], 2, 2)).toBeUndefined();
    expect(cleanSizes([9], 1, 2)).toBeUndefined();
    expect(cleanSizes([1.5], 1, 2)).toBeUndefined();
    expect(cleanSizes("1", 1, 2)).toBeUndefined();
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

describe("the cases of the teaching test", () => {
  it("offers the teaching test's own cases and the interview's own", () => {
    expect(caseKindsFor("mengajar")).toEqual([
      "telat",
      "absen",
      "sakit",
      "teknis",
      "lewat",
      "nametag",
    ]);
    expect(caseKindsFor("wawancara")).toEqual(["telat", "absen", "sakit", "nametag", "keluar"]);
  });
  it("carries on after a technical problem or when the time ran out, never ending the turn", () => {
    expect(caseOutcome({ kind: "teknis" }, { late: 10 })).toEqual({
      status: null,
      end: false,
      code: "teknis",
    });
    expect(caseOutcome({ kind: "lewat" }, { late: 10 })).toEqual({
      status: null,
      end: false,
      code: "lewat",
    });
  });
});
