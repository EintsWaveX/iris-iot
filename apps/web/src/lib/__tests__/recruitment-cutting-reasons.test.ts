import { describe, expect, it } from "vitest";
import {
  NEAR_LINE,
  boardOrder,
  matchesReason,
  nearLine,
  reasonsOf,
  type ReasonRow,
} from "../recruitment/cutting";

const row = (over: Partial<ReasonRow> = {}): ReasonRow => ({
  id: 1,
  nama: "Ayu",
  total: 2400,
  fm: true,
  tt: true,
  berkas: null,
  iv: null,
  potensiCut: false,
  revisions: 0,
  hasPanitiaNote: false,
  note: null,
  ...over,
});

describe("the order of the board", () => {
  it("puts the best score first and breaks ties by name", () => {
    const out = boardOrder([
      row({ id: 1, nama: "Citra", total: 1000 }),
      row({ id: 2, nama: "Budi", total: 3000 }),
      row({ id: 3, nama: "Ayu", total: 1000 }),
    ]);
    expect(out.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("puts a candidate with no score after everyone who has one", () => {
    const out = boardOrder([
      row({ id: 1, nama: "Ayu", total: null }),
      row({ id: 2, nama: "Budi", total: 0 }),
    ]);
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });

  it("orders Berkas by its own score", () => {
    const out = boardOrder([
      row({ id: 1, nama: "Ayu", total: null, berkas: { status: "approved", score: 70 } }),
      row({ id: 2, nama: "Budi", total: null, berkas: { status: "approved", score: 90 } }),
      row({ id: 3, nama: "Citra", total: null, berkas: { status: "applied", score: null } }),
    ]);
    expect(out.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it("does not change the list it was given", () => {
    const rows = [row({ id: 1, total: 1 }), row({ id: 2, total: 2 })];
    boardOrder(rows);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe("near the cut line", () => {
  it("counts back from the last place inside and forward from the first place out", () => {
    expect(nearLine(10, 10)).toEqual({ side: "above", n: 1 });
    expect(nearLine(8, 10)).toEqual({ side: "above", n: 3 });
    expect(nearLine(11, 10)).toEqual({ side: "below", n: 1 });
    expect(nearLine(13, 10)).toEqual({ side: "below", n: 3 });
  });

  it("covers NEAR_LINE places on each side and nothing further", () => {
    expect(nearLine(10 - NEAR_LINE + 1, 10)).not.toBeNull();
    expect(nearLine(10 - NEAR_LINE, 10)).toBeNull();
    expect(nearLine(10 + NEAR_LINE, 10)).not.toBeNull();
    expect(nearLine(10 + NEAR_LINE + 1, 10)).toBeNull();
  });

  it("has no line when nobody passes or the stage has no line", () => {
    expect(nearLine(3, 0)).toBeNull();
    expect(nearLine(3, null)).toBeNull();
  });
});

describe("the reasons on a row", () => {
  const tes = { stage: "tes_tulis", ivStage: false, rank: 40, passN: null } as const;

  it("is empty for a candidate with nothing to flag", () => {
    expect(reasonsOf(row(), tes)).toEqual([]);
  });

  it("flags Potensi Cut, revisions and a note", () => {
    const r = reasonsOf(row({ potensiCut: true, revisions: 2, hasPanitiaNote: true }), tes);
    expect(r.map((x) => x.key)).toEqual(["potensiCut", "revisions", "hasNote"]);
    expect(r.find((x) => x.key === "revisions")?.n).toBe(2);
  });

  it("flags a missed First Meet and a missed test, and a missing score only if they sat the test", () => {
    expect(reasonsOf(row({ fm: false, tt: false }), tes).map((x) => x.key)).toEqual([
      "noFm",
      "noTt",
    ]);
    expect(reasonsOf(row({ total: null }), tes).map((x) => x.key)).toEqual(["noScore"]);
  });

  it("puts the distance to the line first", () => {
    const r = reasonsOf(row({ potensiCut: true }), { ...tes, rank: 12, passN: 10 });
    expect(r.map((x) => x.key)).toEqual(["nearBelow", "potensiCut"]);
    expect(r[0].n).toBe(2);
  });

  it("does not look at attendance in Berkas", () => {
    const r = reasonsOf(row({ fm: false, tt: false }), {
      stage: "berkas",
      ivStage: false,
      rank: 1,
      passN: null,
    });
    expect(r).toEqual([]);
  });

  it("reads the examiners' sheets in an interview stage", () => {
    const iv = (o: Partial<NonNullable<ReasonRow["iv"]>>) => ({
      wide: false,
      verdict: null,
      sheets: 2,
      expected: 2,
      case: null,
      ...o,
    });
    const o = { stage: "wawancara", ivStage: true, rank: 1, passN: null } as const;
    expect(
      reasonsOf(row({ iv: iv({ wide: true, verdict: "ragu" }) }), o).map((x) => x.key),
    ).toEqual(["wide", "ragu"]);
    expect(
      reasonsOf(row({ iv: iv({ case: { status: "susulan" } }) }), o).map((x) => x.key),
    ).toEqual(["susulan"]);
    expect(reasonsOf(row({ iv: iv({ case: { status: "gugur" } }) }), o).map((x) => x.key)).toEqual([
      "gugur",
    ]);
    const missing = reasonsOf(row({ iv: iv({ sheets: 1 }) }), o);
    expect(missing).toEqual([{ key: "sheetsMissing", n: 1 }]);
    // No First Meet or test flags in an interview stage.
    expect(reasonsOf(row({ fm: false, tt: false, iv: iv({}) }), o)).toEqual([]);
  });
});

describe("the extra filters", () => {
  const tes = { stage: "tes_tulis", ivStage: false, rank: 12, passN: 10 } as const;

  it("matches the same reasons the tags show", () => {
    const r = row({ potensiCut: true, hasPanitiaNote: true });
    const why = reasonsOf(r, tes);
    expect(matchesReason("potensi", why, r)).toBe(true);
    expect(matchesReason("catatan", why, r)).toBe(true);
    expect(matchesReason("dekat", why, r)).toBe(true);
    expect(matchesReason("ragu", why, r)).toBe(false);
  });

  it("counts the Cutting note as a note too", () => {
    const r = row({ note: "datang telat" });
    expect(matchesReason("catatan", reasonsOf(r, tes), r)).toBe(true);
  });

  it("does not call a far candidate near", () => {
    const r = row();
    expect(matchesReason("dekat", reasonsOf(r, { ...tes, rank: 40 }), r)).toBe(false);
  });
});
