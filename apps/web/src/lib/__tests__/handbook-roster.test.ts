import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseHandbookRoster } from "../handbook-roster";

const here = path.dirname(fileURLToPath(import.meta.url));
const typ = readFileSync(path.join(here, "../../../scripts/data_asisten.typ"), "utf-8");

describe("handbook roster (Tim Impor)", () => {
  const rows = parseHandbookRoster(typ);

  it("reads all 25 assistants with unique NIMs and three-letter codes", () => {
    expect(rows).toHaveLength(25);
    expect(new Set(rows.map((r) => r.nim)).size).toBe(25);
    for (const r of rows) expect(r.kode).toMatch(/^[A-Z]{3}$/);
  });

  it("applies the Phase 9 code and name rulings", () => {
    const kode = rows.map((r) => r.kode);
    expect(kode).toContain("REG");
    expect(kode).toContain("TIR");
    expect(kode).not.toContain("RGZ");
    expect(kode).not.toContain("FAT");
    expect(rows.find((r) => r.kode === "NUE")?.nama).toBe("Immanuel Eben Haezer Joseph Aletheia");
  });

  it("maps division keys: Inti has no division, heads keep theirs", () => {
    const nab = rows.find((r) => r.kode === "NAB")!;
    expect(nab.kunci).toBe("ketua");
    expect(nab.divisi).toBeNull();
    const kepala = rows.filter((r) => r.kunci.startsWith("k-"));
    expect(kepala.length).toBeGreaterThan(0);
    for (const k of kepala) expect(k.divisi).toBe(k.kunci.slice(2));
  });

  it("never reads phone numbers or Line IDs", () => {
    for (const r of rows)
      expect(Object.keys(r).sort()).toEqual([
        "divisi",
        "divisiEn",
        "divisiId",
        "kode",
        "kunci",
        "nama",
        "nim",
      ]);
  });

  it("refuses a file without the roster", () => {
    expect(() => parseHandbookRoster("#let divisions = ()")).toThrow();
  });
});
