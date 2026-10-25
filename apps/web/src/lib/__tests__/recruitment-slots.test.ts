import { describe, expect, it } from "vitest";
import {
  autoFill,
  canChange,
  changeCutoff,
  judgeChange,
  judgeDecision,
  judgePick,
  pickEvent,
  pickOpen,
  pickWindow,
  seatsLeft,
  slotDate,
  tutupTampil,
  type SlotInfo,
} from "../recruitment/slots";
import { tanggalWib } from "../recruitment/gates";
import type { RecEvent } from "../recruitment/types";

const wib = (s: string) => new Date(`${s}+07:00`);

const PICK: RecEvent = {
  id: 30,
  kind: "pick",
  title: "Pilih Jadwal Tes Tulis",
  startsOn: "2026-11-11",
  endsOn: "2026-11-14",
  dayStart: "19:00",
  dayEnd: "23:59",
  place: null,
  internal: false,
  audience: "all",
  gates: ["pick"],
  stage: "tes_tulis",
  color: null,
  sort: 40,
};
const WAWANCARA: RecEvent = {
  ...PICK,
  id: 31,
  title: "Pilih Jadwal Wawancara",
  stage: "wawancara",
};

const slot = (id: number, over: Partial<SlotInfo> = {}): SlotInfo => ({
  id,
  stage: "tes_tulis",
  eventId: 7,
  room: `R${id}`,
  startsAt: "2026-11-17T18:30:00+07:00",
  endsAt: "2026-11-17T21:00:00+07:00",
  capacity: 3,
  ...over,
});

describe("the pick window", () => {
  it("opens at 19.00 on the first day, not at midnight", () => {
    const w = pickWindow(PICK);
    expect(w.opensAt.toISOString()).toBe(wib("2026-11-11T19:00:00").toISOString());
    expect(pickOpen([PICK], "tes_tulis", wib("2026-11-11T18:59:59"))).toBe(false);
    expect(pickOpen([PICK], "tes_tulis", wib("2026-11-11T19:00:00"))).toBe(true);
  });

  it("stays open through the nights between the first and last day", () => {
    expect(pickOpen([PICK], "tes_tulis", wib("2026-11-12T03:00:00"))).toBe(true);
    expect(pickOpen([PICK], "tes_tulis", wib("2026-11-13T10:00:00"))).toBe(true);
  });

  it("closes at the last day's end time, exclusive", () => {
    expect(pickOpen([PICK], "tes_tulis", wib("2026-11-14T23:58:59"))).toBe(true);
    expect(pickOpen([PICK], "tes_tulis", wib("2026-11-14T23:59:00"))).toBe(false);
    expect(pickOpen([PICK], "tes_tulis", wib("2026-11-15T00:00:00"))).toBe(false);
  });

  it("shows the close as the time people read: 23.59 stays 23.59, midnight reads 23.59 the day before", () => {
    expect(tanggalWib(tutupTampil(pickWindow(PICK).closesAt))).toEqual({
      tanggal: "2026-11-14",
      jam: "23:59",
    });
    const e = { ...PICK, dayStart: null, dayEnd: null };
    expect(tanggalWib(tutupTampil(pickWindow(e).closesAt))).toEqual({
      tanggal: "2026-11-14",
      jam: "23:59",
    });
  });

  it("without a window it runs whole days", () => {
    const e = { ...PICK, dayStart: null, dayEnd: null };
    expect(pickOpen([e], "tes_tulis", wib("2026-11-11T00:00:00"))).toBe(true);
    expect(pickOpen([e], "tes_tulis", wib("2026-11-14T23:59:59"))).toBe(true);
    expect(pickOpen([e], "tes_tulis", wib("2026-11-15T00:00:00"))).toBe(false);
  });

  it("belongs to its own stage only", () => {
    expect(pickOpen([PICK, WAWANCARA], "wawancara", wib("2026-11-12T10:00:00"))).toBe(true);
    expect(pickOpen([PICK], "wawancara", wib("2026-11-12T10:00:00"))).toBe(false);
    expect(pickEvent([PICK, WAWANCARA], "wawancara")?.id).toBe(31);
  });

  it("ignores events that are not a pick", () => {
    const e = { ...PICK, kind: "test" as const, gates: [] };
    expect(pickOpen([e], "tes_tulis", wib("2026-11-12T10:00:00"))).toBe(false);
  });
});

describe("the change cutoff", () => {
  const s = slot(1);
  it("is the start of the slot's own WIB day (H-1 23.59 is the last minute)", () => {
    expect(slotDate(s)).toBe("2026-11-17");
    expect(changeCutoff(s).toISOString()).toBe(wib("2026-11-17T00:00:00").toISOString());
    expect(canChange(s, wib("2026-11-16T23:59:59"))).toBe(true);
    expect(canChange(s, wib("2026-11-17T00:00:00"))).toBe(false);
  });
  it("reads the date in WIB, not UTC", () => {
    const late = slot(2, { startsAt: "2026-11-17T00:30:00+07:00" });
    expect(slotDate(late)).toBe("2026-11-17");
    expect(canChange(late, wib("2026-11-16T23:30:00"))).toBe(true);
  });
});

describe("picking", () => {
  const base = {
    open: true,
    eligible: true,
    hasPick: false,
    slot: slot(1),
    stage: "tes_tulis" as const,
    taken: 0,
  };
  it("takes a seat while the window is open", () => {
    expect(judgePick(base)).toBe("ok");
  });
  it("refuses outside the window", () => {
    expect(judgePick({ ...base, open: false })).toBe("jendela_tutup");
  });
  it("refuses a second pick (a change is a request)", () => {
    expect(judgePick({ ...base, hasPick: true })).toBe("sudah_pilih");
  });
  it("refuses a full slot", () => {
    expect(judgePick({ ...base, taken: 3 })).toBe("penuh");
    expect(judgePick({ ...base, taken: 2 })).toBe("ok");
  });
  it("refuses a missing slot or one of another stage", () => {
    expect(judgePick({ ...base, slot: null })).toBe("slot_salah");
    expect(judgePick({ ...base, slot: slot(1, { stage: "wawancara" }) })).toBe("slot_salah");
  });
  it("refuses someone who is not in this stage", () => {
    expect(judgePick({ ...base, eligible: false })).toBe("bukan_peserta");
  });
  it("counts seats left, never below zero", () => {
    expect(seatsLeft(slot(1), 1)).toBe(2);
    expect(seatsLeft(slot(1), 5)).toBe(0);
  });
});

describe("a change request", () => {
  const from = slot(1);
  const to = slot(2, {
    startsAt: "2026-11-18T18:30:00+07:00",
    endsAt: "2026-11-18T21:00:00+07:00",
  });
  const now = wib("2026-11-14T10:00:00");
  const base = { now, from, to, hasOpen: false, takenTo: 0 };
  it("is fine before H-1 with room in the target", () => {
    expect(judgeChange(base)).toBe("ok");
  });
  it("needs a pick first", () => {
    expect(judgeChange({ ...base, from: null })).toBe("belum_memilih");
  });
  it("is refused after the cutoff of the current slot", () => {
    expect(judgeChange({ ...base, now: wib("2026-11-17T00:00:00") })).toBe("lewat_batas");
    expect(judgeChange({ ...base, now: wib("2026-11-16T23:59:59") })).toBe("ok");
  });
  it("is refused when one is already open", () => {
    expect(judgeChange({ ...base, hasOpen: true })).toBe("sudah_ada_permintaan");
  });
  it("is refused for the slot they already hold", () => {
    expect(judgeChange({ ...base, to: from })).toBe("slot_sama");
  });
  it("is refused for a full target (the seat is not held)", () => {
    expect(judgeChange({ ...base, takenTo: 3 })).toBe("penuh");
  });
  it("is refused for a slot of another stage or a missing one", () => {
    expect(judgeChange({ ...base, to: null })).toBe("slot_salah");
    expect(judgeChange({ ...base, to: slot(3, { stage: "wawancara" }) })).toBe("slot_salah");
  });
});

describe("deciding a request", () => {
  it("approves into a seat that is still there", () => {
    expect(judgeDecision({ approve: true, capacity: 3, taken: 2, over: false })).toBe("ok");
  });
  it("needs the over capacity confirmation when the target filled up meanwhile", () => {
    expect(judgeDecision({ approve: true, capacity: 3, taken: 3, over: false })).toBe("penuh");
    expect(judgeDecision({ approve: true, capacity: 3, taken: 3, over: true })).toBe("ok");
  });
  it("declining never cares about seats", () => {
    expect(judgeDecision({ approve: false, capacity: 3, taken: 9, over: false })).toBe("ok");
  });
});

describe("Auto Isi", () => {
  const slots = (...taken: number[]) =>
    taken.map((t, i) => ({ ...slot(i + 1, { capacity: 3 }), taken: t }));
  const cands = (...nims: string[]) => nims.map((nim, i) => ({ id: i + 1, nim }));

  it("fills the emptiest room first, in NIM order", () => {
    const r = autoFill(cands("30", "10", "20"), slots(2, 0, 1));
    expect(r.placed.map((p) => [p.candidateId, p.slotId])).toEqual([
      [2, 2], // nim 10: room 2 has 3 free, the most
      [3, 2], // nim 20: room 2 has 2 free, room 3 has 2 free; the earlier slot id wins the tie
      [1, 3], // nim 30: room 3 has 2 free, room 2 has 1
    ]);
    expect(r.left).toEqual([]);
  });

  it("is deterministic whatever order the candidates arrive in", () => {
    const list = cands("30", "10", "20", "40");
    const shuffled = [list[3], list[1], list[0], list[2]];
    const where = (r: ReturnType<typeof autoFill>) =>
      Object.fromEntries(
        list.map((c) => [c.nim, r.placed.find((p) => p.candidateId === c.id)?.slotId]),
      );
    expect(where(autoFill(shuffled, slots(0, 0)))).toEqual(where(autoFill(list, slots(0, 0))));
    expect(where(autoFill(list, slots(0, 0)))).toEqual({ "10": 1, "20": 2, "30": 1, "40": 2 });
  });

  it("never exceeds capacity and reports who is left over", () => {
    const r = autoFill(cands("1", "2", "3", "4"), slots(2, 2));
    expect(r.placed).toHaveLength(2);
    expect(r.left).toHaveLength(2);
    expect(r.left).toEqual([3, 4]);
  });

  it("uses the counts it is given, so earlier picks are left alone", () => {
    const r = autoFill(cands("1"), slots(3, 1));
    expect(r.placed).toEqual([{ candidateId: 1, slotId: 2 }]);
  });

  it("places no one when there are no slots", () => {
    expect(autoFill(cands("1"), [])).toEqual({ placed: [], left: [1] });
  });
});
