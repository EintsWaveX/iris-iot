import { describe, expect, it } from "vitest";
import { dict, tanggalPanjang } from "../app";

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

describe("dict", () => {
  it("falls back to English when Mandarin is missing", () => {
    const T = dict({ id: "Kembali", en: "Back" });
    expect(T.zh).toBe("Back");
    expect(dict({ id: "a", en: "b", zh: "c" }).zh).toBe("c");
  });
});
