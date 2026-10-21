import { describe, expect, it } from "vitest";
import {
  akunKelompok,
  bedaKlp,
  cocokkanKlp,
  pilahPemberi,
  sidikPayload,
  statusSeelabs,
} from "../seelabs";

const BARIS = [
  { nim: "101022400015", nama: "Ferry Kennedy", skor: { TP: 85, TA: 90, L2: 70 } },
  { nim: "101022400090", nama: "Tsabib Akdam", skor: {} },
];

describe("seelabs export", () => {
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

describe("bedaKlp", () => {
  it("lists the NIMs on one side only, and where SeeLabs has IRIS's extra ones", () => {
    const daftar = [
      { klp: "47", nim: ["a1", "a2", "a3"] },
      { klp: "48", nim: ["b1", "b2", "a4"] },
    ];
    expect(bedaKlp(["a1", "a2", "a4", "z9"], "47", daftar)).toEqual({
      hanyaIris: [
        { nim: "a4", diKlp: "48" },
        { nim: "z9", diKlp: null },
      ],
      hanyaSeelabs: ["a3"],
    });
    expect(bedaKlp(["b1", "b2", "a4"], "48", daftar)).toEqual({ hanyaIris: [], hanyaSeelabs: [] });
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

  it("sends every group of a holder at the daily cap through a lender", () => {
    const pasangan = new Map<number, string | null>([
      [1, "NUE"],
      [2, "NUE"],
      [3, "ADD"],
    ]);
    const penuh = new Set(["NUE"]);
    expect(akunKelompok(pasangan, new Map(), penuh)).toEqual(
      new Map([
        [1, null],
        [2, null],
        [3, "ADD"],
      ]),
    );
    expect(
      akunKelompok(
        pasangan,
        new Map([
          [1, "GAN"],
          [2, "TWT"],
        ]),
        penuh,
      ).get(1),
    ).toBe("GAN");
    // Without the cap, group 1 is NUE's own again.
    expect(akunKelompok(pasangan, new Map()).get(1)).toBe("NUE");
  });

  it("tells who can lend and why the others can't", () => {
    const r = pilahPemberi({
      aktif: ["A", "B", "C", "D", "E"],
      pegang: new Set(["A"]),
      sesiLain: new Map([
        ["B", 2],
        ["C", 1],
        ["A", 2],
      ]),
      dipinjam: new Map([["D", 2]]),
    });
    expect(r.pemberi).toEqual(["C", "E"]);
    expect(r.tolak).toEqual([
      { nim: "A", alasan: "pegang" },
      { nim: "B", alasan: "dua_sesi" },
      { nim: "D", alasan: "dipinjam", kelompok: 2 },
    ]);
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
