import { describe, expect, it } from "vitest";
import {
  JEDA_SINKRON_MS,
  TP_MENUNGGU,
  jendelaPribadi,
  masukPerpanjangan,
  sisaSinkron,
  statusTp,
  tanggalSama,
  telatMenit,
} from "../tp";

const pada = (iso: string) => Date.parse(iso);

describe("sisaSinkron", () => {
  it("counts 60 s from the last run, not to the clock's minute", () => {
    const lalu = pada("2026-10-17T08:30:57Z");
    expect(sisaSinkron(lalu, lalu)).toBe(60);
    expect(sisaSinkron(lalu, pada("2026-10-17T08:31:00Z"))).toBe(57);
    expect(sisaSinkron(lalu, pada("2026-10-17T08:31:56.500Z"))).toBe(1);
  });

  it("reads 0 from the due moment on", () => {
    const lalu = pada("2026-10-17T08:30:04.200Z");
    expect(sisaSinkron(lalu, lalu + JEDA_SINKRON_MS)).toBe(0);
    expect(sisaSinkron(lalu, lalu + JEDA_SINKRON_MS + 30_000)).toBe(0);
  });
});

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

describe("tanggalSama with the LMS cut-off (2026-10-17)", () => {
  const j = { buka: "2026-10-14T11:00:00Z", tutup: "2026-10-17T11:00:00Z" };
  it("needs the cut-off at the close as well", () => {
    expect(tanggalSama({ buka: j.buka, tutup: j.tutup, batas: j.tutup }, j)).toBe(true);
    expect(tanggalSama({ buka: j.buka, tutup: j.tutup, batas: null }, j)).toBe(false);
    expect(tanggalSama({ buka: j.buka, tutup: j.tutup }, j)).toBe(false);
  });
});
