/**
 * Phase 13's TP bank: the default bank's shape (ten numbers, number 1 with
 * its four parts, keys in every language), the random final set, the keys'
 * light markup and the editor's checks.
 */
import { describe, expect, it } from "vitest";
import {
  TP_NOMOR,
  acakPilih,
  blokTeks,
  isiSoal,
  nomorBeda,
  nomorUntuk,
  poinNomor,
  soalAkhir,
  totalTp,
  type VarianTp,
} from "../../../src/lib/tp.js";
import { PETUNJUK_BAWAAN, TP_BAWAAN } from "../tp-bawaan.js";
import { periksaPetunjuk, periksaPilih, periksaVarian } from "../tp.js";

const urut = (seq: number[]) => {
  let i = 0;
  return () => seq[i++ % seq.length];
};

describe("the default TP bank", () => {
  it("has ten numbers per variant, number 1 a group of four parts", () => {
    for (const [m, varian] of Object.entries(TP_BAWAAN)) {
      expect(varian.length, `modul ${m}`).toBe(m === "4" ? 2 : 1);
      for (const v of varian) {
        expect(v.soal).toHaveLength(TP_NOMOR);
        for (const b of ["id", "en", "zh"] as const) {
          expect(v.soal[0][b].bagian, `${m}${v.kode} ${b}`).toHaveLength(4);
          for (const [j, s] of v.soal.entries()) {
            expect(s[b].teks.trim(), `${m}${v.kode} ${b} ${j + 1}`).not.toBe("");
            expect(s[b].kunci.trim(), `${m}${v.kode} ${b} ${j + 1} key`).not.toBe("");
          }
        }
      }
    }
  });

  it("gives Module 4 LoRaWAN number 10 its two parts", () => {
    expect(TP_BAWAAN["4"][0].soal[9].id.bagian).toHaveLength(2);
  });

  it("shares Module 4's first five numbers between LoRaWAN and Peer to Peer", () => {
    expect(nomorBeda(TP_BAWAAN["4"])).toEqual([6, 7, 8, 9, 10]);
  });

  it("places every diagram a key names", () => {
    for (const varian of Object.values(TP_BAWAAN))
      for (const v of varian)
        for (const s of v.soal)
          for (const b of ["id", "en", "zh"] as const)
            for (const x of blokTeks(s[b].kunci))
              if (x.k === "gambar") expect(s.gambar?.[x.i]).toMatch(/^data:image\/png;base64,/);
  });

  it("has instructions in every language", () => {
    for (const b of ["id", "en", "zh"] as const) expect(PETUNJUK_BAWAAN[b]).toMatch(/1/);
  });
});

describe("the final set", () => {
  const v = TP_BAWAAN["4"];

  it("takes each number from its picked variant", () => {
    const pilih = [0, 0, 0, 0, 0, 1, 0, 1, 0, 1];
    const s = soalAkhir(v, pilih);
    expect(s[5]).toBe(v[1].soal[5]);
    expect(s[6]).toBe(v[0].soal[6]);
  });

  it("draws only where the variants differ, mixes them, and changes", () => {
    const lama = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 30; k++) {
      const p = acakPilih(v, lama);
      expect(p.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
      expect(new Set(p.slice(5)).size).toBe(2);
      expect(p).not.toEqual(lama);
    }
  });

  it("keeps a one-variant module on A", () => {
    expect(acakPilih(TP_BAWAAN["1"])).toEqual(Array(TP_NOMOR).fill(0));
  });

  it("is driven by the random source it is given", () => {
    expect(acakPilih(v, undefined, urut([0.1, 0.9]))).toEqual([0, 0, 0, 0, 0, 0, 1, 0, 1, 0]);
  });

  it("falls back to English where Mandarin is empty", () => {
    const s = { ...v[0].soal[1], zh: { teks: "", kunci: "" } };
    expect(isiSoal(s, "zh")).toBe(s.en);
  });

  it("still gives six numbers to every NIM", () => {
    expect(nomorUntuk("1102220001")).toEqual([1, 3, 5, 7, 9, 10]);
    expect(nomorUntuk("1102220002")).toEqual([1, 2, 4, 6, 8, 10]);
  });

  it("makes every NIM's six numbers worth 100 together", () => {
    // The lab's rubric: No. 1 = 10, No. 2 & 3 = 10, then 20 for the rest.
    const tabel = { 1: 10, 2: 10, 3: 10, 4: 20, 5: 20, 6: 20, 7: 20, 8: 20, 9: 20, 10: 20 };
    for (const [no, poin] of Object.entries(tabel)) expect(poinNomor(Number(no))).toBe(poin);
    for (const nim of ["1102220001", "1102220002"]) {
      const nomor = nomorUntuk(nim);
      expect(nomor.reduce((a, no) => a + poinNomor(no), 0)).toBe(100);
      const penuh = Object.fromEntries(nomor.map((no) => [no, poinNomor(no)]));
      expect(totalTp(penuh, nomor)).toBe(100);
    }
    // Raw points are the score: 8 + 9 + 15 + 12 + 14 + 17.
    expect(totalTp({ 1: 8, 2: 9, 4: 15, 6: 12, 8: 14, 10: 17 }, [1, 2, 4, 6, 8, 10])).toBe(75);
  });
});

describe("the keys' light markup", () => {
  it("reads code, bullets, tables, parts and diagrams", () => {
    const b = blokTeks(
      [
        "Berikut:",
        "```",
        "void loop() {",
        "  x++;",
        "}",
        "```",
        "- satu",
        "- dua",
        "| A | B |",
        "| 1 | 2 |",
        "a) bagian a",
        "[[gambar 2]]",
      ].join("\n"),
    );
    expect(b.map((x) => x.k)).toEqual(["p", "kode", "butir", "tabel", "bagian", "gambar"]);
    expect(b[1]).toEqual({ k: "kode", teks: "void loop() {\n  x++;\n}" });
    expect(b[2]).toEqual({ k: "butir", teks: ["satu", "dua"] });
    expect(b[3]).toEqual({
      k: "tabel",
      baris: [
        ["A", "B"],
        ["1", "2"],
      ],
    });
    expect(b[5]).toEqual({ k: "gambar", i: 1 });
  });
});

describe("the editor's checks", () => {
  const salin = (): VarianTp[] => JSON.parse(JSON.stringify(TP_BAWAAN["4"]));

  it("takes the default bank as it is and names the variants A, B", () => {
    const v = periksaVarian(salin());
    expect(v?.map((x) => x.kode)).toEqual(["A", "B"]);
  });

  it("refuses an empty Indonesian or English question", () => {
    const v = salin();
    v[0].soal[3].en.teks = " ";
    expect(periksaVarian(v)).toBeNull();
  });

  it("refuses more than five variants or a wrong count", () => {
    const v = salin();
    expect(periksaVarian([...v, ...v, ...v])).toBeNull();
    v[1].soal.pop();
    expect(periksaVarian(v)).toBeNull();
  });

  it("refuses an image that is not a PNG or JPEG data URL", () => {
    const v = salin();
    v[0].soal[2].gambar = ["https://example.com/a.png"];
    expect(periksaVarian(v)).toBeNull();
  });

  it("checks the pick against the variants", () => {
    expect(periksaPilih(Array(10).fill(1), 2)).not.toBeNull();
    expect(periksaPilih(Array(10).fill(2), 2)).toBeNull();
    expect(periksaPilih(Array(9).fill(0), 2)).toBeNull();
  });

  it("needs the instructions as text", () => {
    expect(periksaPetunjuk({ id: "a", en: "b", zh: "" })).toEqual({ id: "a", en: "b", zh: "" });
    expect(periksaPetunjuk({ id: 1 })).toBeNull();
  });
});
