/**
 * TipLayer's explanations (2026-10-14): a label finds its sentence in each
 * language, a count or an empty line beside it doesn't hide it, labels made
 * from data match their patterns, and a tab, a choice or a switch without
 * its own entry still says what it does.
 */
import { describe, expect, it } from "vitest";
import { kunciTip, tipUntuk } from "../tips";
import { TIPS } from "../tips-data";

describe("tooltips for every action", () => {
  it("knows the same control in each language", () => {
    expect(tipUntuk("Kirim Nilai", "id")).toMatch(/SeeLabs/);
    expect(tipUntuk("Send Scores", "en")).toMatch(/SeeLabs/);
    expect(tipUntuk("Pengaturan TP", "id")).toBeTruthy();
    expect(tipUntuk("TP Settings", "en")).toBeTruthy();
  });

  it("reads past a count, an empty line or a shortcut hint", () => {
    expect(
      tipUntuk("\nDaftarkan Server Baru\n2 langkah, sekali tempel di PC Server", "id"),
    ).toMatch(/server baru/);
    expect(tipUntuk("Kelompokku\n3", "id")).toBe(TIPS.id["Kelompokku"]);
    expect(tipUntuk("3\nKelompokku", "id")).toBe(TIPS.id["Kelompokku"]);
    expect(kunciTip("Perpanjang · E")).toBe("Perpanjang");
  });

  it("matches labels made from data", () => {
    expect(tipUntuk("Senin · Slot 1 · 06:30", "id")).toMatch(/slot 1 hari Senin/);
    expect(tipUntuk("星期一 · 时段 1 · 06:30", "zh")).toMatch(/星期一时段 1/);
    expect(tipUntuk("打开 星期三 时段 2", "zh")).toMatch(/星期三时段 2/);
    expect(tipUntuk("Cek Modul 3", "id")).toMatch(/Modul 3/);
    expect(tipUntuk("Urutkan menurut Nilai", "id")).toMatch(/menurut Nilai/);
    expect(tipUntuk("NAT", "en")).toMatch(/NAT/);
  });

  it("says what a tab, a choice and a switch do without an entry", () => {
    expect(tipUntuk("Sambungan Baru", "id", { role: "tab" })).toBe(
      "Membuka bagian Sambungan Baru.",
    );
    expect(tipUntuk("Gelap", "id", { role: "radio", pilih: true })).toBe("Memilih Gelap.");
    expect(tipUntuk("Kirim nilai otomatis", "en", { role: "switch" })).toMatch(
      /^Turns this on or off/,
    );
    expect(tipUntuk("random words", "en")).toBeNull();
  });

  it("writes no em or en dashes (the copy rule)", () => {
    for (const lang of ["id", "en", "zh"] as const)
      for (const v of Object.values(TIPS[lang])) expect(v).not.toMatch(/[\u2013\u2014]/);
  });
});
