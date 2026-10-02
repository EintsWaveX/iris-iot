import { describe, expect, it } from "vitest";
import {
  bacaDurasi,
  bacaDurasiBaru,
  bacaJumlahKelompok,
  durasiPalingPendek,
  jamDariMenit,
  jendelaSlot,
  jendelaValid,
  menitDariJam,
  menitSekarangWib,
} from "../sesi-mulai";

describe("start window", () => {
  // Slot 3 starts 12:30; a 15-minute window opens at 12:15 and the slot
  // closes 150 minutes after its start, at 15:00.
  const at = (jam: string) => jendelaSlot("12:30", 15, menitDariJam(jam));

  it("opens the window minutes before the slot", () => {
    expect(at("12:14").posisi).toBe("belum");
    expect(at("12:15").posisi).toBe("buka");
    expect(at("12:15").buka).toBe("12:15");
  });

  it("stays open until 150 minutes after the start", () => {
    expect(at("14:59").posisi).toBe("buka");
    expect(at("15:00").posisi).toBe("lewat");
    expect(at("15:00").tutup).toBe("15:00");
  });

  it("follows a slot's own window", () => {
    expect(jendelaSlot("06:30", 30, menitDariJam("06:00")).posisi).toBe("buka");
    expect(jendelaSlot("06:30", 5, menitDariJam("06:20")).posisi).toBe("belum");
  });

  it("keeps windows inside 5 to 30 minutes", () => {
    expect(jendelaValid(2)).toBe(5);
    expect(jendelaValid(45)).toBe(30);
    expect(jendelaValid(20)).toBe(20);
    expect(jendelaValid("x")).toBe(15);
    expect(jendelaValid(undefined, 10)).toBe(10);
  });
});

describe("session length and groups", () => {
  it("takes 30 to 150 whole minutes, 150 when absent", () => {
    expect(bacaDurasi(undefined)).toBe(150);
    expect(bacaDurasi(90)).toBe(90);
    expect(bacaDurasi(30)).toBe(30);
    expect(bacaDurasi(29)).toBeNull();
    expect(bacaDurasi(151)).toBeNull();
    expect(bacaDurasi(60.5)).toBeNull();
  });

  it("takes 1 to 10 groups, the fallback when absent", () => {
    expect(bacaJumlahKelompok(undefined)).toBe(5);
    expect(bacaJumlahKelompok(undefined, 8)).toBe(8);
    expect(bacaJumlahKelompok(10)).toBe(10);
    expect(bacaJumlahKelompok(0)).toBeNull();
    expect(bacaJumlahKelompok(11)).toBeNull();
  });
});

describe("clock helpers", () => {
  it("converts between HH:MM and minutes", () => {
    expect(menitDariJam("15:30")).toBe(930);
    expect(Number.isNaN(menitDariJam("25:00"))).toBe(true);
    expect(jamDariMenit(930)).toBe("15:30");
    expect(jamDariMenit(-15)).toBe("23:45");
  });

  it("reads the lab's clock (WIB, UTC+7)", () => {
    expect(menitSekarangWib(new Date("2026-10-01T05:40:00Z"))).toBe(12 * 60 + 40);
    expect(menitSekarangWib(new Date("2026-10-01T17:05:00Z"))).toBe(5);
  });
});

describe("extending a running session", () => {
  it("allows 15 minutes from now up to 150", () => {
    expect(durasiPalingPendek(20)).toBe(35);
    expect(durasiPalingPendek(10)).toBe(30);
    expect(durasiPalingPendek(140)).toBe(150);
    expect(durasiPalingPendek(149.2)).toBe(150);
  });
  it("reads a new length", () => {
    expect(bacaDurasiBaru(135, 100)).toBe(135);
    expect(bacaDurasiBaru(150, 100)).toBe(150);
    expect(bacaDurasiBaru(110, 100)).toBe(null);
    expect(bacaDurasiBaru(165, 100)).toBe(null);
    expect(bacaDurasiBaru("120", 30)).toBe(120);
    expect(bacaDurasiBaru(120.5, 30)).toBe(null);
    expect(bacaDurasiBaru(undefined, 30)).toBe(null);
  });
  it("can shorten, but not below 15 minutes from now", () => {
    expect(bacaDurasiBaru(60, 40)).toBe(60);
    expect(bacaDurasiBaru(50, 40)).toBe(null);
  });
});
