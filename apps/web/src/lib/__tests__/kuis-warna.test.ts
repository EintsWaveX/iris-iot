import { describe, expect, it } from "vitest";
import { WARNA_PILIHAN, warnaUntuk } from "../kuis/warna";

function luminans(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const kontras = (a: string, b: string) => {
  const [x, y] = [luminans(a), luminans(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("quiz answer tiles", () => {
  it("keep 4.5:1 between tile and text in every theme (the pairs are fixed)", () => {
    for (const w of WARNA_PILIHAN) expect(kontras(w.bg, w.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it("give each tile its own shape and colour", () => {
    expect(new Set(WARNA_PILIHAN.map((w) => w.bentuk)).size).toBe(4);
    expect(new Set(WARNA_PILIHAN.map((w) => w.bg)).size).toBe(4);
  });

  it("uses blue then red for Benar/Salah", () => {
    expect(warnaUntuk(2, 0).bg).toBe(WARNA_PILIHAN[1].bg);
    expect(warnaUntuk(2, 1).bg).toBe(WARNA_PILIHAN[0].bg);
    expect(warnaUntuk(4, 2).bg).toBe(WARNA_PILIHAN[2].bg);
  });
});
