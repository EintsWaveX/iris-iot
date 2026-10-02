import { describe, expect, it } from "vitest";
import { dict, tanggalPanjang, waktuPilihan } from "../app";

describe("tanggalPanjang", () => {
  it("writes the date out in full in each language", () => {
    expect(tanggalPanjang("2026-10-01", "id")).toBe("Kamis, 1 Oktober 2026");
    expect(tanggalPanjang("2026-10-01", "en")).toContain("1 October 2026");
    expect(tanggalPanjang("2026-10-01", "en")).toContain("Thursday");
    expect(tanggalPanjang("2026-10-01", "zh")).toContain("2026年10月1日");
  });

  it("accepts a timestamp and leaves a bad value as it is", () => {
    expect(tanggalPanjang("2026-10-03T06:30:00Z", "id")).toBe("Sabtu, 3 Oktober 2026");
    expect(tanggalPanjang("bukan tanggal", "id")).toBe("bukan tanggal");
  });
});

describe("waktuPilihan", () => {
  it("lists the session times from 06:00 to 18:00 every 30 minutes", () => {
    const t = waktuPilihan(6, 18, 30);
    expect(t[0]).toBe("06:00");
    expect(t).toContain("06:30");
    expect(t).toContain("15:30");
    expect(t.at(-1)).toBe("18:00");
    expect(t).toHaveLength(25);
  });
});

describe("dict", () => {
  it("falls back to English when Mandarin is missing", () => {
    const T = dict({ id: "Kembali", en: "Back" });
    expect(T.zh).toBe("Back");
    expect(dict({ id: "a", en: "b", zh: "c" }).zh).toBe("c");
  });
});
