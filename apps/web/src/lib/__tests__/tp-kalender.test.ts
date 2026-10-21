import { describe, expect, it } from "vitest";
import { acaraKalender, acaraPada, bulanGrid, geserBulan } from "../tp-kalender";

// TP Modul 1 closes Saturday 24 October, so its week is 26 to 31 October.
const J1 = { buka: "2026-10-21T18:00:00+07:00", tutup: "2026-10-24T18:00:00+07:00" };
const J2 = { buka: "2026-10-28T18:00:00+07:00", tutup: "2026-10-31T18:00:00+07:00" };

describe("acaraKalender", () => {
  it("gives each module its window and its practicum week", () => {
    const a = acaraKalender({ jendela: { 1: J1, 2: null } });
    expect(a.map((x) => [x.kunci, x.dari, x.sampai])).toEqual([
      ["tp-1", "2026-10-21", "2026-10-24"],
      ["modul-1", "2026-10-26", "2026-10-31"],
    ]);
  });
  it("moves a module week past a postponed week, and shows that week", () => {
    const a = acaraKalender({ jendela: { 1: J1 }, tunda: ["2026-10-26"] });
    expect(a.find((x) => x.jenis === "modul")).toMatchObject({ dari: "2026-11-02" });
    expect(a.find((x) => x.jenis === "tunda")).toMatchObject({
      dari: "2026-10-26",
      sampai: "2026-10-31",
    });
  });
  it("takes a Praktikan's own extension for their close only", () => {
    const ext = "2026-10-26T12:00:00+07:00";
    const a = acaraKalender({ jendela: { 1: J1 }, pribadi: { perpanjang: new Map([[1, ext]]) } });
    expect(a[0]).toMatchObject({ jenis: "tp", sampai: "2026-10-26", tutup: ext, panjang: true });
    // The week stays where the window put it.
    expect(a[1]).toMatchObject({ jenis: "modul", dari: "2026-10-26" });
    // An extension before the close changes nothing.
    const b = acaraKalender({
      jendela: { 1: J1 },
      pribadi: { perpanjang: new Map([[1, "2026-10-23T12:00:00+07:00"]]) },
    });
    expect(b[0].panjang).toBeUndefined();
  });
  it("puts their practicum on their slot's day, struck when it's a holiday", () => {
    const a = acaraKalender({
      jendela: { 1: J1, 2: J2 },
      pribadi: { hari: 3, jam: "09:30", libur: ["2026-11-04"] },
    });
    const p = a.filter((x) => x.jenis === "praktikum");
    expect(p).toEqual([
      expect.objectContaining({ modul: 1, dari: "2026-10-28", jam: "09:30" }),
      expect.objectContaining({ modul: 2, dari: "2026-11-04", libur: true }),
    ]);
    expect(p[0].libur).toBeUndefined();
  });
  it("leaves the practicum out without a slot", () => {
    const a = acaraKalender({ jendela: { 1: J1 }, pribadi: { hari: null } });
    expect(a.some((x) => x.jenis === "praktikum")).toBe(false);
  });
  it("orders by start, then the week before the window", () => {
    const a = acaraKalender({ jendela: { 1: J1, 2: J2 }, pribadi: { hari: 1 } });
    expect(a.map((x) => x.kunci)).toEqual([
      "tp-1",
      "modul-1",
      "praktikum-1",
      "tp-2",
      "modul-2",
      "praktikum-2",
    ]);
  });
});

describe("the month", () => {
  it("finds the events on a date", () => {
    const a = acaraKalender({ jendela: { 1: J1, 2: J2 } });
    expect(acaraPada(a, "2026-10-28").map((x) => x.kunci)).toEqual(["modul-1", "tp-2"]);
    expect(acaraPada(a, "2026-10-25")).toEqual([]);
  });
  it("starts its weeks on Monday", () => {
    // 1 October 2026 is a Thursday; February 2027 has 28 days.
    expect(bulanGrid("2026-10")).toEqual({ y: 2026, m: 10, lead: 3, n: 31 });
    expect(bulanGrid("2027-02")).toMatchObject({ lead: 0, n: 28 });
  });
  it("moves across the year", () => {
    expect(geserBulan("2026-12", 1)).toBe("2027-01");
    expect(geserBulan("2026-01", -1)).toBe("2025-12");
  });
});
