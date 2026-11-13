import { describe, expect, it } from "vitest";
import { SOAL_MODUL4 } from "../../content/kuis/modul4";
import { JUMLAH_BANK, JUMLAH_PER_TIPE, TIPE_SOAL } from "../kuis/types";

describe("Module 4 quiz questions", () => {
  it("has 25 questions, 5 for each Tipe A to E", () => {
    expect(SOAL_MODUL4).toHaveLength(25);
    for (const t of TIPE_SOAL) {
      const dari = SOAL_MODUL4.filter((s) => s.tipe === t);
      expect(dari.map((s) => s.nomor)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("matches the sizes the host's pickers use", () => {
    expect(SOAL_MODUL4).toHaveLength(JUMLAH_BANK);
    for (const t of TIPE_SOAL)
      expect(SOAL_MODUL4.filter((s) => s.tipe === t)).toHaveLength(JUMLAH_PER_TIPE);
  });

  it("has unique ids", () => {
    expect(new Set(SOAL_MODUL4.map((s) => s.id)).size).toBe(SOAL_MODUL4.length);
  });

  for (const s of SOAL_MODUL4) {
    it(`${s.id} is well formed in Indonesian and English`, () => {
      for (const b of ["id", "en"] as const) {
        const p = s.pilihan[b];
        expect([2, 4]).toContain(p.length);
        expect(new Set(p).size).toBe(p.length);
        for (const x of p) expect(x.trim().length).toBeGreaterThan(0);
        expect(s.teks[b].trim().length).toBeGreaterThan(0);
        expect(s.penjelasan[b].trim().length).toBeGreaterThan(0);
      }
      expect(s.pilihan.id).toHaveLength(s.pilihan.en.length);
      expect(Number.isInteger(s.benar)).toBe(true);
      expect(s.benar).toBeGreaterThanOrEqual(0);
      expect(s.benar).toBeLessThan(s.pilihan.id.length);
    });
  }

  it("keeps the right answer from always sitting in one place", () => {
    const empat = SOAL_MODUL4.filter((s) => s.pilihan.id.length === 4);
    const posisi = new Set(empat.map((s) => s.benar));
    expect(posisi.size).toBe(4);
    // No position holds more than 40% of the four-option questions.
    for (let i = 0; i < 4; i++) {
      expect(empat.filter((s) => s.benar === i).length / empat.length).toBeLessThanOrEqual(0.4);
    }
  });

  it("makes the Benar/Salah questions two-option with matching wording", () => {
    const tf = SOAL_MODUL4.filter((s) => s.pilihan.id.length === 2);
    expect(tf).toHaveLength(5);
    for (const s of tf) {
      expect(s.pilihan.id).toEqual(["Benar", "Salah"]);
      expect(s.pilihan.en).toEqual(["True", "False"]);
    }
  });
});
