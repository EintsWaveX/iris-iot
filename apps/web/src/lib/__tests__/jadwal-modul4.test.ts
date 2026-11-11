import { describe, expect, it } from "vitest";
import { satuSlotPerNim } from "../jadwal-modul4";

const orang = (nim: string) => ({ nim, nama: `TOT ${nim}` });
const slot = (id: number, nims: string[], extra: { berburu?: string } = {}) => ({
  id,
  mulai: "10:00",
  regu: { "1": { nama: "Vela", aktif: true, anggota: nims.map(orang) } },
  ...extra,
});

const nimDiSlot = (s: { regu: Record<string, { anggota: { nim: string }[] }> }) =>
  Object.values(s.regu).flatMap((k) => k.anggota.map((a) => a.nim));

describe("satuSlotPerNim", () => {
  it("leaves a day with one unfinished slot as it was", () => {
    const hari = [slot(1, []), slot(4, ["100000", "100001"])];
    expect(satuSlotPerNim(hari, new Set([4]))).toEqual(hari);
  });

  it("gives the people to the running slot, not to an earlier slot nobody ran", () => {
    const hasil = satuSlotPerNim(
      [slot(2, ["100000", "100001"]), slot(4, ["100000", "100001"])],
      new Set([4]),
    );
    expect(nimDiSlot(hasil[0])).toEqual([]);
    expect(nimDiSlot(hasil[1])).toEqual(["100000", "100001"]);
    expect(hasil.map((s) => s.id)).toEqual([2, 4]);
  });

  it("puts them where the hunt is on before a merely running slot", () => {
    const hasil = satuSlotPerNim(
      [slot(1, ["100000"]), slot(3, ["100000"], { berburu: "2026-11-11T13:23:52Z" })],
      new Set([1, 3]),
    );
    expect(nimDiSlot(hasil[0])).toEqual([]);
    expect(nimDiSlot(hasil[1])).toEqual(["100000"]);
  });

  it("falls back to the earliest slot when none is running", () => {
    const hasil = satuSlotPerNim([slot(3, ["100000"]), slot(2, ["100000"])], new Set());
    expect(nimDiSlot(hasil[0])).toEqual([]);
    expect(nimDiSlot(hasil[1])).toEqual(["100000"]);
  });

  it("keeps a group that never had members and drops one that lost them all", () => {
    const kosong = {
      id: 1,
      mulai: "10:00",
      regu: {
        "1": { nama: "A", aktif: true, anggota: [orang("100000")] },
        "2": { nama: "B", aktif: true, anggota: [] },
      },
    };
    const hasil = satuSlotPerNim([kosong, slot(4, ["100000"])], new Set([4]));
    expect(Object.keys(hasil[0].regu)).toEqual(["2"]);
  });

  it("never lists a NIM in two slots", () => {
    const hari = [
      slot(1, ["100000", "100001", "100002"]),
      slot(2, ["100001", "100002", "100003"]),
      slot(3, ["100002", "100003", "100004"]),
    ];
    const semua = satuSlotPerNim(hari, new Set([2])).flatMap(nimDiSlot);
    expect(new Set(semua).size).toBe(semua.length);
  });
});
