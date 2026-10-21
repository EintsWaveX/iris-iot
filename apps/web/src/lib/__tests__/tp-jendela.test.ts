import { describe, expect, it } from "vitest";
import {
  TP_MENUNGGU,
  jendelaPribadi,
  masukPerpanjangan,
  statusTp,
  tanpaAsisten,
  telatMenit,
} from "../tp";

describe("a Praktikan's own extension (2026-10-17)", () => {
  const j = { buka: "2026-10-14T18:00:00+07:00", tutup: "2026-10-17T18:00:00+07:00" };
  const sampai = "2026-10-18T12:00:00+07:00";

  it("moves only their own close, and only later", () => {
    expect(jendelaPribadi(j, sampai).tutup).toBe(sampai);
    expect(jendelaPribadi(j, "2026-10-17T10:00:00+07:00")).toBe(j);
    expect(jendelaPribadi(j, null)).toBe(j);
  });

  it("reads a file after the window but by their date as Diperpanjang, not late", () => {
    const pada = "2026-10-18T09:00:00+07:00";
    expect(telatMenit(pada, j)).not.toBeNull();
    expect(masukPerpanjangan(pada, j, sampai)).toBe(true);
    expect(telatMenit(pada, jendelaPribadi(j, sampai))).toBeNull();
    expect(
      statusTp({ adaBerkas: true, tanda: null, telat: false, panjang: true, lengkap: false }),
    ).toBe("panjang");
  });

  it("keeps a file after their own date late, and one in time plain", () => {
    expect(masukPerpanjangan("2026-10-18T13:00:00+07:00", j, sampai)).toBe(false);
    expect(telatMenit("2026-10-18T13:00:00+07:00", jendelaPribadi(j, sampai))).toBe(60);
    expect(masukPerpanjangan("2026-10-17T17:00:00+07:00", j, sampai)).toBe(false);
    expect(masukPerpanjangan("2026-10-18T09:00:00+07:00", j, null)).toBe(false);
  });

  it("counts an extended file as waiting for its Asisten", () => {
    expect(TP_MENUNGGU).toContain("panjang");
  });
});

describe("tanpaAsisten", () => {
  it("leaves out the Asisten who are registered as Praktikan too", () => {
    const daftar = [
      { nim: "101022400111", nama: "TIR" },
      { nim: "1032231301", nama: "Raka" },
      { nim: "101022400222", nama: "WIL" },
    ];
    const asisten = new Set(["101022400111", "101022400222", "101022300999"]);
    expect(tanpaAsisten(daftar, asisten).map((p) => p.nama)).toEqual(["Raka"]);
    expect(tanpaAsisten(daftar, new Set())).toHaveLength(3);
  });
});
