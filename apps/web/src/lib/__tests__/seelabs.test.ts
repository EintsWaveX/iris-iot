import { describe, expect, it } from "vitest";
import {
  akunKelompok,
  bacaDaftarKlp,
  bacaPayload,
  buatPayload,
  cocokkanKlp,
  sidikPayload,
  statusSeelabs,
  teksSeelabs,
} from "../seelabs";

const BARIS = [
  { nim: "101022400015", nama: "Ferry Kennedy", skor: { TP: 85, TA: 90, L2: 70 } },
  { nim: "101022400090", nama: "Tsabib Akdam", skor: {} },
];

describe("seelabs export", () => {
  it("puts the scores in SeeLabs' field order, null where IRIS has none", () => {
    const p = bacaPayload(
      buatPayload({
        kelas: "reguler",
        klp: ["47"],
        modul: 3,
        kelompok: 1,
        bahasa: "id",
        baris: BARIS,
      }),
    );
    expect(p?.baris[0]).toEqual({
      nim: "101022400015",
      n: [85, 90, null, null, null, null, null, 70],
    });
    expect(p?.klp).toEqual(["47"]);
    expect(bacaPayload("hello")).toBeNull();
    expect(bacaPayload("IRIS-SEELABS/1 {broken")).toBeNull();
  });

  it("writes a TSV with a header line", () => {
    expect(teksSeelabs(BARIS).split("\n")).toEqual([
      "NIM\tNama\tTP\tTA\tD1\tD2\tD3\tD4\tL1\tL2",
      "101022400015\tFerry Kennedy\t85\t90\t\t\t\t\t\t70",
      "101022400090\tTsabib Akdam\t\t\t\t\t\t\t\t",
    ]);
  });

  it("fingerprints scores whatever the row order, and notices an edit", () => {
    const a = sidikPayload(BARIS, 3);
    expect(sidikPayload([...BARIS].reverse(), 3)).toBe(a);
    expect(sidikPayload(BARIS, 4)).not.toBe(a);
    expect(
      sidikPayload([{ ...BARIS[0], skor: { ...BARIS[0].skor, TP: 86 } }, BARIS[1]], 3),
    ).not.toBe(a);
  });
});

describe("KLP matching", () => {
  it("reads the bookmarklet's list and the page copied as text", () => {
    expect(
      bacaDaftarKlp(
        'IRIS-KLP/1 {"kelas":"reguler","kelompok":[{"klp":"47","nim":["101022400015"]}]}',
      ),
    ).toEqual([{ klp: "47", nim: ["101022400015"] }]);
    const halaman = `Kelompok\tAnggota Kelompok / NIM\tAksi
KLP
47
101022400015
FERRY KENNEDY
 Input Nilai
101022400090
TSABIB AKDAM ALKARNY
KLP 48
101022400248 MELSA SEPTYANTI`;
    expect(bacaDaftarKlp(halaman)).toEqual([
      { klp: "47", nim: ["101022400015", "101022400090"] },
      { klp: "48", nim: ["101022400248"] },
    ]);
  });

  it("gives each group the KLP sharing the most NIMs, and none when nothing overlaps", () => {
    const daftar = [
      { klp: "47", nim: ["a1", "a2", "a3"] },
      { klp: "48", nim: ["b1", "b2", "a4"] },
    ];
    expect(
      cocokkanKlp(
        [
          { nomor: 1, nim: ["a1", "a2", "a4"] },
          { nomor: 2, nim: ["b1"] },
          { nomor: 3, nim: ["z9"] },
        ],
        daftar,
      ),
    ).toEqual([
      { nomor: 1, klp: "47", cocok: 2, total: 3 },
      { nomor: 2, klp: "48", cocok: 1, total: 1 },
      { nomor: 3, klp: null, cocok: 0, total: 1 },
    ]);
  });
});

describe("whose SeeLabs account", () => {
  it("uses the Asisten's own account for their first group and a lender after that", () => {
    const pasangan = new Map<number, string | null>([
      [3, "NUE"],
      [1, "ADD"],
      [5, "NUE"],
      [4, null],
    ]);
    expect(akunKelompok(pasangan, new Map())).toEqual(
      new Map([
        [1, "ADD"],
        [3, "NUE"],
        [4, null],
        [5, null],
      ]),
    );
    expect(akunKelompok(pasangan, new Map([[5, "GAN"]])).get(5)).toBe("GAN");
  });

  it("reads the status", () => {
    const s = (o: Partial<Parameters<typeof statusSeelabs>[0]>) =>
      statusSeelabs({ akun: "NUE", adaNilai: true, sidikSekarang: "x", disimpan: null, ...o });
    expect(s({})).toBe("siap");
    expect(s({ akun: null })).toBe("butuh_akun");
    expect(s({ adaNilai: false })).toBe("kosong");
    expect(s({ disimpan: { sidik: "x" } })).toBe("terkirim");
    expect(s({ disimpan: { sidik: "y" } })).toBe("berubah");
  });
});
