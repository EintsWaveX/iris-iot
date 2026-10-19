/**
 * The public Lab Profile (GET /api/profil/baca): only active Asisten, each
 * with name, code, position and photo, and never a NIM anywhere in the
 * answer. The semester's deletion leaves the profile alone.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  asisten,
  jabatanPemegang,
  profilAcara,
  profilAcaraFoto,
  profilDivisi,
  profilFotoBersama,
} from "../../../src/lib/schema.js";

const BLOB = "https://x.public.blob.vercel-storage.com";
const data = new Map<unknown, unknown[]>();

/** A stand-in for drizzle: every select of a table resolves to its rows. */
vi.mock("../../../src/lib/db.js", () => ({
  getDb: () => ({
    select: () => ({
      from: (t: unknown) => {
        const q = {
          where: () => q,
          orderBy: () => q,
          then: (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) =>
            Promise.resolve(data.get(t) ?? []).then(ok, no),
        };
        return q;
      },
    }),
  }),
}));

const { bacaProfil } = await import("../profil.js");
const { INFO_INTI } = await import("../../../src/lib/profil.js");

describe("the public Lab Profile", () => {
  it("shows active people with their position, and never a NIM", async () => {
    data.set(asisten, [
      {
        nim: "1101223001",
        nama: "Dewi",
        kode: "DEW",
        divisi: null,
        fotoUrl: null,
        fotoKecilUrl: null,
        status: "aktif",
        tampilProfil: false,
      },
      {
        nim: "1101223002",
        nama: "Citra",
        kode: "CIT",
        divisi: "ADC",
        fotoUrl: `${BLOB}/c.webp`,
        fotoKecilUrl: `${BLOB}/c-k.webp`,
        status: "aktif",
        tampilProfil: false,
      },
      {
        nim: "1101223003",
        nama: "Ayu",
        kode: "AYU",
        divisi: "ADC",
        fotoUrl: null,
        fotoKecilUrl: null,
        status: "aktif",
        tampilProfil: false,
      },
    ]);
    data.set(jabatanPemegang, [
      { nim: "1101223001", kategori: "ketua" },
      { nim: "1101223003", kategori: "kepala-ADC" },
    ]);
    data.set(profilDivisi, []);
    data.set(profilFotoBersama, []);
    data.set(profilAcara, []);
    data.set(profilAcaraFoto, []);

    const p = await bacaProfil();
    expect(p.inti).toEqual([{ nama: "Dewi", kode: "DEW", peran: "ketua", foto: null }]);
    const adc = p.divisi.find((d) => d.kode === "ADC")!;
    expect(adc.anggota.map((o) => [o.kode, o.peran])).toEqual([
      ["AYU", "kepala"],
      ["CIT", "anggota"],
    ]);
    expect(adc.anggota[1].foto).toEqual({ besar: `${BLOB}/c.webp`, kecil: `${BLOB}/c-k.webp` });
    expect(p.divisi.map((d) => d.kode)).toEqual(["ASO", "ARD", "ADS", "ADC", "AER", "ARM"]);
    expect(p.intiGrup.foto).toBeNull();
    expect(p.intiGrup.baris.id).toBe(INFO_INTI.baris.id);

    const teks = JSON.stringify(p);
    expect(teks).not.toMatch(/1101223/);
    expect(teks).not.toMatch(/"nim"/);
  });

  it("shows an inactive Asisten only when switched on, marked as such", async () => {
    const orang = (kode: string, status: string, tampilProfil: boolean) => ({
      nim: `11012230${kode.length}${status.length}${Number(tampilProfil)}`,
      nama: kode,
      kode,
      divisi: "ASO",
      fotoUrl: null,
      fotoKecilUrl: null,
      status,
      tampilProfil,
    });
    data.set(asisten, [
      orang("AKT", "aktif", false),
      orang("MAP", "nonaktif", true),
      orang("OFF", "nonaktif", false),
    ]);
    data.set(jabatanPemegang, []);
    data.set(profilDivisi, []);
    const aso = (await bacaProfil()).divisi.find((d) => d.kode === "ASO")!;
    expect(aso.anggota.map((o) => [o.kode, o.nonaktif ?? false])).toEqual([
      ["AKT", false],
      ["MAP", true],
    ]);
  });

  it("falls back to each division's and the Inti's own texts, and keeps an edition's photo order", async () => {
    data.set(asisten, []);
    data.set(jabatanPemegang, []);
    data.set(profilDivisi, [
      {
        divisi: "ARM",
        fotoUrl: `${BLOB}/arm.webp`,
        fotoKecilUrl: `${BLOB}/arm-k.webp`,
        baris: { id: "Baris", en: "Line", zh: "行" },
        deskripsi: { id: "D", en: "D", zh: "D" },
      },
      {
        divisi: "INTI",
        fotoUrl: `${BLOB}/inti.webp`,
        fotoKecilUrl: `${BLOB}/inti-k.webp`,
        baris: null,
        deskripsi: null,
      },
    ]);
    data.set(profilFotoBersama, [
      { id: 1, tahun: "2024/2025", fotoUrl: "a", fotoKecilUrl: "a", keterangan: {} },
      { id: 2, tahun: "2026/2027", fotoUrl: "b", fotoKecilUrl: "b", keterangan: {} },
    ]);
    data.set(profilAcara, [
      {
        id: 5,
        jenis: "tot",
        judul: {},
        tempat: {},
        ringkasan: {},
        tanggal: "2026-09-26",
        sampulId: 8,
      },
    ]);
    data.set(profilAcaraFoto, [
      { id: 7, acaraId: 5, fotoUrl: "p", fotoKecilUrl: "pk", alt: null, urutan: 0 },
      { id: 8, acaraId: 5, fotoUrl: "q", fotoKecilUrl: "qk", alt: null, urutan: 1 },
    ]);

    const p = await bacaProfil();
    expect(p.divisi.find((d) => d.kode === "ARM")!.baris.en).toBe("Line");
    expect(p.divisi.find((d) => d.kode === "ASO")!.baris.en).toBe(
      "Modules, prelabs, tests and journals.",
    );
    expect(p.intiGrup.foto).toEqual({ besar: `${BLOB}/inti.webp`, kecil: `${BLOB}/inti-k.webp` });
    expect(p.intiGrup.deskripsi).toEqual(INFO_INTI.deskripsi);
    expect(p.divisi.map((d) => d.kode)).not.toContain("INTI");
    expect(p.bersama.map((b) => b.tahun)).toEqual(["2026/2027", "2024/2025"]);
    expect(p.acara[0].foto.map((f) => f.id)).toEqual([7, 8]);
    expect(p.acara[0].sampulId).toBe(8);
  });
});

describe("the semester's deletion", () => {
  it("never touches the Lab Profile", () => {
    const src = readFileSync(resolve(__dirname, "..", "retensi.ts"), "utf8");
    expect(src).not.toMatch(/profil(Divisi|FotoBersama|Acara|AcaraFoto)|fotoUrl|foto_url/);
  });
});
