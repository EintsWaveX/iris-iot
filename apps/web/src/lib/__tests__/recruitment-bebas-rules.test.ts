/**
 * Free mode lifts the gate-only rule functions and leaves everything else alone: each gate refuses with the
 * switch off (the real behaviour, unchanged) and lets the action through with it on.
 */
import { afterEach, describe, expect, it } from "vitest";
import { setBebasHook } from "../recruitment/bebas";
import { attendEligible, pickEligible } from "../recruitment/standing";
import {
  canChange,
  judgeChange,
  judgePick,
  pickOpen,
  perubahanTerkunci,
  slotTerkunci,
  type SlotInfo,
} from "../recruitment/slots";
import {
  bukaKunciTampil,
  canLock,
  canUnlock,
  envelopeVisible,
  kunciTertutup,
} from "../recruitment/cutting";
import { absensiBuka, eventSegera, gateLive } from "../recruitment/gates";
import type { RecEvent } from "../recruitment/types";

const bebasOn = () => setBebasHook(() => true);
afterEach(() => setBebasHook(() => false));

const wib = (s: string) => new Date(`${s}+07:00`);
const now = wib("2026-11-06T04:15:00");

const slot = (over: Partial<SlotInfo> = {}): SlotInfo => ({
  id: 1,
  stage: "tes_tulis",
  eventId: 7,
  room: "R1",
  startsAt: "2026-11-03T18:30:00+07:00",
  endsAt: "2026-11-03T21:00:00+07:00",
  capacity: 3,
  ...over,
});

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
  gates: ["qr", "pick"],
  stage: "first_meet",
  color: null,
  sort: 1,
};

describe("lifts pickEligible and attendEligible in free mode", () => {
  it("refuses a CaAs who is out, or at another stage, with the switch off", () => {
    expect(pickEligible({ status: "out", stage: "berkas" }, "tes_tulis")).toBe(false);
    expect(attendEligible({ status: "accepted", stage: "penerimaan" }, "first_meet")).toBe(false);
    expect(attendEligible({ status: "approved", stage: "berkas" }, null)).toBe(false);
  });
  it("lets them through with it on", () => {
    bebasOn();
    expect(pickEligible({ status: "out", stage: "berkas" }, "tes_tulis")).toBe(true);
    expect(attendEligible({ status: "accepted", stage: "penerimaan" }, "first_meet")).toBe(true);
    expect(attendEligible({ status: "approved", stage: "berkas" }, null)).toBe(true);
  });
});

describe("lifts the pick window and the change cutoff in free mode", () => {
  it("pickOpen is closed with no pick event, open with the switch on", () => {
    expect(pickOpen([], "tes_tulis", now)).toBe(false);
    bebasOn();
    expect(pickOpen([], "tes_tulis", now)).toBe(true);
  });
  it("canChange is false once the slot's day began, true with the switch on", () => {
    expect(canChange({ startsAt: "2026-11-03T18:30:00+07:00" }, now)).toBe(false);
    bebasOn();
    expect(canChange({ startsAt: "2026-11-03T18:30:00+07:00" }, now)).toBe(true);
  });
});

describe("the picker's buttons in free mode", () => {
  it("slotTerkunci locks a full slot and the one you hold with the switch off", () => {
    expect(slotTerkunci(true, false)).toBe(true);
    expect(slotTerkunci(false, true)).toBe(true);
    expect(slotTerkunci(false, false)).toBe(false);
    expect(slotTerkunci(true, undefined)).toBe(true);
  });
  it("slotTerkunci opens a full slot in free mode but still not the one you hold", () => {
    bebasOn();
    expect(slotTerkunci(true, false)).toBe(false);
    expect(slotTerkunci(false, true)).toBe(true);
  });
  it("perubahanTerkunci follows the cutoff with the switch off and never locks in free mode", () => {
    expect(perubahanTerkunci(true)).toBe(true);
    expect(perubahanTerkunci(false)).toBe(false);
    bebasOn();
    expect(perubahanTerkunci(true)).toBe(false);
  });
});

describe("judgePick in free mode", () => {
  const dalam = {
    open: false,
    eligible: false,
    hasPick: true,
    slot: slot(),
    stage: "tes_tulis" as const,
    taken: 99,
  };
  it("refuses with the switch off", () => {
    expect(judgePick(dalam)).toBe("bukan_peserta");
    expect(judgePick({ ...dalam, eligible: true })).toBe("jendela_tutup");
    expect(judgePick({ ...dalam, eligible: true, open: true })).toBe("sudah_pilih");
    expect(judgePick({ ...dalam, eligible: true, open: true, hasPick: false })).toBe("penuh");
  });
  it("accepts a full slot, a held pick and a closed window with it on", () => {
    bebasOn();
    expect(judgePick(dalam)).toBe("ok");
  });
  it("still refuses a slot that does not exist or is of another stage", () => {
    bebasOn();
    expect(judgePick({ ...dalam, slot: null })).toBe("slot_salah");
    expect(judgePick({ ...dalam, slot: slot({ stage: "wawancara" }) })).toBe("slot_salah");
  });
});

describe("judgeChange in free mode", () => {
  const dari = slot({ id: 1 });
  const ke = slot({ id: 2 });
  const dalam = { now, from: dari, to: ke, hasOpen: true, takenTo: 99 };
  it("refuses with the switch off", () => {
    expect(judgeChange({ ...dalam, from: null })).toBe("belum_memilih");
    expect(judgeChange(dalam)).toBe("lewat_batas");
  });
  it("lets a late change, an open request, a full target and no current pick through with it on", () => {
    bebasOn();
    expect(judgeChange(dalam)).toBe("ok");
    expect(judgeChange({ ...dalam, from: null })).toBe("ok");
  });
  it("still refuses no target, another stage and the same slot", () => {
    bebasOn();
    expect(judgeChange({ ...dalam, to: null })).toBe("slot_salah");
    expect(judgeChange({ ...dalam, to: slot({ id: 2, stage: "wawancara" }) })).toBe("slot_salah");
    expect(judgeChange({ ...dalam, to: slot({ id: 1 }) })).toBe("slot_sama");
  });
});

describe("the Cutting buttons in free mode", () => {
  const penuh = { baris: 4, missing: 0, adaWaktu: true };
  it("kunciTertutup disables the lock for an empty board, a missing proposal or no Pengumuman", () => {
    expect(kunciTertutup(penuh)).toBe(false);
    expect(kunciTertutup({ ...penuh, baris: 0 })).toBe(true);
    expect(kunciTertutup({ ...penuh, missing: 2 })).toBe(true);
    expect(kunciTertutup({ ...penuh, adaWaktu: false })).toBe(true);
  });
  it("kunciTertutup never disables the lock in free mode", () => {
    bebasOn();
    expect(kunciTertutup({ baris: 0, missing: 2, adaWaktu: false })).toBe(false);
  });
  it("bukaKunciTampil shows Buka Kunci only before the reveal, and after it in free mode", () => {
    expect(bukaKunciTampil(true, false)).toBe(true);
    expect(bukaKunciTampil(true, true)).toBe(false);
    expect(bukaKunciTampil(false, false)).toBe(false);
    bebasOn();
    expect(bukaKunciTampil(true, true)).toBe(true);
    expect(bukaKunciTampil(false, true)).toBe(false);
  });
});

describe("lifts the lock rules in free mode", () => {
  it("canLock needs every proposal with the switch off; with it on it is ok and still counts what is missing", () => {
    expect(canLock([{ proposal: "lolos" }, { proposal: null }])).toEqual({ ok: false, missing: 1 });
    bebasOn();
    expect(canLock([{ proposal: "lolos" }, { proposal: null }])).toEqual({ ok: true, missing: 1 });
    expect(canLock([])).toEqual({ ok: true, missing: 0 });
  });
  it("canUnlock is only before the reveal with the switch off; with it on any locked row", () => {
    const row = { locked: true, revealAt: wib("2026-11-01T12:00:00") };
    expect(canUnlock(row, now)).toBe(false);
    bebasOn();
    expect(canUnlock(row, now)).toBe(true);
    expect(canUnlock({ locked: false, revealAt: null }, now)).toBe(false);
  });
  it("envelopeVisible needs the reveal time with the switch off; with it on any locked row", () => {
    const row = { locked: true, revealAt: wib("2026-11-20T12:00:00") };
    expect(envelopeVisible(row, now)).toBe(false);
    expect(envelopeVisible({ locked: true, revealAt: null }, now)).toBe(false);
    bebasOn();
    expect(envelopeVisible(row, now)).toBe(true);
    expect(envelopeVisible({ locked: true, revealAt: null }, now)).toBe(true);
    expect(envelopeVisible({ locked: false, revealAt: null }, now)).toBe(false);
  });
});

describe("eventSegera (the QR may be prepared) in free mode", () => {
  const lewat: RecEvent = { ...EVENT, startsOn: "2026-10-01", endsOn: "2026-10-01" };
  const jauh: RecEvent = { ...EVENT, startsOn: "2026-12-30", endsOn: "2026-12-30" };
  it("is only for an event that has not ended and starts within the lead days, with the switch off", () => {
    expect(eventSegera(lewat, now)).toBe(false);
    expect(eventSegera(jauh, now)).toBe(false);
    expect(eventSegera({ ...EVENT, startsOn: "2026-11-07", endsOn: "2026-11-07" }, now)).toBe(true);
  });
  it("is true for any event in free mode, past or far away", () => {
    bebasOn();
    expect(eventSegera(lewat, now)).toBe(true);
    expect(eventSegera(jauh, now)).toBe(true);
  });
});

describe("lifts the attendance and gate windows in free mode", () => {
  it("absensiBuka is false when the event is not running, true with the switch on", () => {
    expect(absensiBuka(EVENT, now, false)).toBe(false);
    bebasOn();
    expect(absensiBuka(EVENT, now, false)).toBe(true);
  });
  it("gateLive follows the day and window with the switch off; with it on any event that carries the gate", () => {
    expect(gateLive([EVENT], "pick", now)).toBe(false);
    bebasOn();
    expect(gateLive([EVENT], "pick", now)).toBe(true);
    expect(gateLive([EVENT], "pick", now, "wawancara")).toBe(false);
    expect(gateLive([EVENT], "submission", now)).toBe(false);
  });
});
