import { describe, expect, it } from "vitest";
import {
  canLock,
  canUnlock,
  envelopeVisible,
  revealAtFor,
  tally,
  thresholdProposals,
  type CutRow,
} from "../recruitment/cutting";
import type { RecEvent } from "../recruitment/types";

const wib = (s: string) => new Date(`${s}+07:00`);

const rows = (...t: (number | null)[]): CutRow[] =>
  t.map((total, i) => ({ id: i + 1, total, present: true, proposal: null }));

describe("the tally", () => {
  it("counts Lolos, Gagal and not yet", () => {
    expect(
      tally([
        { proposal: "lolos" },
        { proposal: "lolos" },
        { proposal: "gagal" },
        { proposal: null },
      ]),
    ).toEqual({ lolos: 2, gagal: 1, belum: 1, total: 4 });
  });
});

describe("threshold proposals", () => {
  const opsi = { noShowsFail: true, replaceExisting: false };

  it("top N passes the N highest totals", () => {
    const r = thresholdProposals(rows(900, 3000, 2500, 1200), { mode: "top", n: 2 }, opsi);
    expect(r.get(2)).toBe("lolos");
    expect(r.get(3)).toBe("lolos");
    expect(r.get(1)).toBe("gagal");
    expect(r.get(4)).toBe("gagal");
  });

  it("a tie at the boundary passes everyone tied, so equal scores never split", () => {
    const r = thresholdProposals(rows(3000, 2500, 2500, 100), { mode: "top", n: 2 }, opsi);
    expect([...r].filter(([, v]) => v === "lolos").map(([id]) => id)).toEqual([1, 2, 3]);
  });

  it("a minimum score passes everyone at or above it", () => {
    const r = thresholdProposals(rows(2000, 1999, 2500), { mode: "min", min: 2000 }, opsi);
    expect(r.get(1)).toBe("lolos");
    expect(r.get(2)).toBe("gagal");
    expect(r.get(3)).toBe("lolos");
  });

  it("no-shows fail, and with the option off they are left alone", () => {
    const list: CutRow[] = [
      { id: 1, total: 3000, present: true, proposal: null },
      { id: 2, total: null, present: false, proposal: null },
    ];
    expect(thresholdProposals(list, { mode: "min", min: 1000 }, opsi).get(2)).toBe("gagal");
    expect(
      thresholdProposals(list, { mode: "min", min: 1000 }, { ...opsi, noShowsFail: false }).has(2),
    ).toBe(false);
  });

  it("a present candidate with no score yet is left alone, not failed", () => {
    const r = thresholdProposals(rows(3000, null), { mode: "min", min: 1000 }, opsi);
    expect(r.has(2)).toBe(false);
  });

  it("leaves existing proposals unless asked to replace them", () => {
    const list: CutRow[] = [
      { id: 1, total: 3000, present: true, proposal: "gagal" },
      { id: 2, total: 100, present: true, proposal: null },
    ];
    const keep = thresholdProposals(list, { mode: "min", min: 1000 }, opsi);
    expect(keep.has(1)).toBe(false);
    expect(keep.get(2)).toBe("gagal");
    const over = thresholdProposals(
      list,
      { mode: "min", min: 1000 },
      { ...opsi, replaceExisting: true },
    );
    expect(over.get(1)).toBe("lolos");
  });

  it("top N with N at or above the field passes everyone with a score", () => {
    const r = thresholdProposals(rows(1, 2), { mode: "top", n: 9 }, opsi);
    expect([...r.values()]).toEqual(["lolos", "lolos"]);
  });
});

describe("locking", () => {
  it("needs a proposal for every candidate", () => {
    expect(canLock([{ proposal: "lolos" }, { proposal: null }])).toEqual({ ok: false, missing: 1 });
    expect(canLock([{ proposal: "lolos" }, { proposal: "gagal" }])).toEqual({
      ok: true,
      missing: 0,
    });
  });
  it("refuses an empty board", () => {
    expect(canLock([])).toEqual({ ok: false, missing: 0 });
  });
});

describe("the reveal gate", () => {
  const revealAt = wib("2026-11-11T12:00:00");
  it("shows an envelope only when locked and the time has come", () => {
    expect(envelopeVisible({ locked: true, revealAt }, wib("2026-11-11T11:59:59"))).toBe(false);
    expect(envelopeVisible({ locked: true, revealAt }, wib("2026-11-11T12:00:00"))).toBe(true);
    expect(envelopeVisible({ locked: false, revealAt }, wib("2026-11-12T12:00:00"))).toBe(false);
    expect(envelopeVisible({ locked: true, revealAt: null }, wib("2026-11-12T12:00:00"))).toBe(
      false,
    );
  });
  it("lets the Ketua unlock only before the reveal", () => {
    expect(canUnlock({ locked: true, revealAt }, wib("2026-11-11T11:59:59"))).toBe(true);
    expect(canUnlock({ locked: true, revealAt }, wib("2026-11-11T12:00:00"))).toBe(false);
    expect(canUnlock({ locked: false, revealAt: null }, wib("2026-11-01T00:00:00"))).toBe(false);
  });
});

describe("the reveal time", () => {
  const ann = (over: Partial<RecEvent>): RecEvent => ({
    id: 4,
    kind: "announcement",
    title: "Pengumuman Berkas",
    startsOn: "2026-11-11",
    endsOn: "2026-11-11",
    dayStart: null,
    dayEnd: null,
    place: null,
    internal: false,
    audience: "all",
    gates: ["reveal"],
    stage: "berkas",
    color: null,
    sort: 3,
    ...over,
  });
  it("is the Pengumuman's start, 12.00 WIB when it has no time (user, 2026-10-23)", () => {
    expect(revealAtFor([ann({})], "berkas")?.toISOString()).toBe(
      wib("2026-11-11T12:00:00").toISOString(),
    );
  });
  it("follows a time the Ketua set", () => {
    const e = ann({ dayStart: "09:30", dayEnd: "10:00" });
    expect(revealAtFor([e], "berkas")?.toISOString()).toBe(
      wib("2026-11-11T09:30:00").toISOString(),
    );
  });
  it("is null when the stage has no Pengumuman", () => {
    expect(revealAtFor([ann({})], "tes_tulis")).toBeNull();
  });
});
