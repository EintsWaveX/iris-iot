import { describe, expect, it } from "vitest";
import {
  acakModul,
  asistenModul,
  benih,
  daftarModul,
  MODUL_MAKS,
  blok,
  kolam,
  listSah,
  modulTanggal,
  putar,
  saringModul,
  tugaskan,
  ulang,
} from "../penugasan-modul";
import { pasanganSemester } from "../penugasan-minggu";

const LIMA = ["MAP", "NUE", "REG", "GRY", "DES"];

/** How many times a group meets someone it had before, over all modules. */
function ulangan(lists: Record<number, string[]>): number {
  return Object.values(ulang(lists)).flat().filter(Boolean).length;
}

/** Each module's groups sit in contiguous blocks, front-loaded. */
function blokUtuh(list: string[], k: number): boolean {
  const n = list.length;
  const ukuran = blok(k, n).map((b) => b.length);
  let g = 0;
  for (const u of ukuran) {
    const k0 = list[g];
    for (let i = 0; i < u; i++) if (list[g++] !== k0) return false;
  }
  return true;
}

describe("asistenModul", () => {
  const j = { asisten: LIMA, asistenModul: { "2": ["DES", "MAP", "NUE", "REG", "GRY"] } };
  it("uses the default while the switch is off", () => {
    expect(asistenModul(j, 2, false)).toBe(LIMA);
  });
  it("uses the module's own list while on", () => {
    expect(asistenModul(j, 2, true)[0]).toBe("DES");
  });
  it("a module without a list, or no module, keeps the default", () => {
    expect(asistenModul(j, 3, true)).toBe(LIMA);
    expect(asistenModul(j, null, true)).toBe(LIMA);
  });
  it("a full list passes through pasanganSemester as it is", () => {
    expect(pasanganSemester(asistenModul(j, 2, true), 5)).toEqual(j.asistenModul["2"]);
  });
});

describe("kolam and listSah", () => {
  it("takes each default code once, blanks dropped", () => {
    expect(kolam(["map", "", "NUE", "MAP"])).toEqual(["MAP", "NUE"]);
  });
  it("refuses a code from outside the slot or a wrong length", () => {
    expect(listSah(["MAP", "NUE", ""], 3, ["MAP", "NUE"])).toBe(true);
    expect(listSah(["MAP", "TIR", ""], 3, ["MAP", "NUE"])).toBe(false);
    expect(listSah(["MAP", "NUE"], 3, ["MAP", "NUE"])).toBe(false);
    expect(listSah("MAP", 1, ["MAP"])).toBe(false);
  });
  it("saringModul drops lists that no longer fit the slot", () => {
    const r = saringModul({ "1": ["A", "B"], "2": ["A", "C"], "3": ["A"] }, 2, ["A", "B"]);
    expect(r.tetap).toEqual({ "1": ["A", "B"] });
    expect(r.dibuang).toBe(2);
  });
});

describe("modulTanggal", () => {
  // TP Modul 1 closes Sat 17 Oct, so Module 1 is taught 19 to 24 Oct.
  const jendela = {
    1: { buka: "2026-10-14T18:00:00+07:00", tutup: "2026-10-17T18:00:00+07:00" },
    2: { buka: "2026-10-21T18:00:00+07:00", tutup: "2026-10-24T18:00:00+07:00" },
  };
  const dasar = { hariIni: "2026-10-15", jendela, terbuka: [1] };
  it("a session already started wins", () => {
    expect(modulTanggal({ ...dasar, tanggal: "2026-10-20", sesiModul: 3 })).toEqual({
      modul: 3,
      sumber: "sesi",
    });
  });
  it("the practicum week after a TP window", () => {
    expect(modulTanggal({ ...dasar, tanggal: "2026-10-19" }).modul).toBe(1);
    expect(modulTanggal({ ...dasar, tanggal: "2026-10-24" }).modul).toBe(1);
    expect(modulTanggal({ ...dasar, tanggal: "2026-10-26" })).toEqual({ modul: 2, sumber: "tp" });
  });
  it("this week outside any window: the highest open module", () => {
    expect(modulTanggal({ ...dasar, tanggal: "2026-10-16", terbuka: [1, 2] })).toEqual({
      modul: 2,
      sumber: "terbuka",
    });
  });
  it("past every window and this week: not set yet", () => {
    expect(modulTanggal({ ...dasar, tanggal: "2026-11-02" })).toEqual({
      modul: null,
      sumber: null,
    });
  });
  it("on a Sunday the week ahead still counts as this week", () => {
    const r = modulTanggal({
      hariIni: "2026-10-18",
      jendela: {},
      terbuka: [1],
      tanggal: "2026-10-23",
    });
    expect(r.modul).toBe(1);
  });
  it("nothing open and no window: not set", () => {
    expect(
      modulTanggal({ hariIni: "2026-10-15", jendela: {}, terbuka: [], tanggal: "2026-10-16" })
        .modul,
    ).toBeNull();
  });
});

describe("ulang", () => {
  it("marks a group meeting someone again", () => {
    expect(ulang({ 1: ["A", "B"], 2: ["A", "A"] })[2]).toEqual([true, false]);
  });
  it("with the pool, only where someone new was left", () => {
    expect(ulang({ 1: ["A", "B"], 2: ["A", "A"] }, ["A", "B"])[2]).toEqual([true, false]);
    expect(ulang({ 1: ["A"], 2: ["A"] }, ["A"])[2]).toEqual([false]);
    expect(ulang({ 1: ["A"], 2: ["B"], 3: ["A"] }, ["A", "B"])[3]).toEqual([false]);
  });
});

describe("blok", () => {
  it("one group each with enough people", () => {
    expect(blok(5, 5)).toEqual([[0], [1], [2], [3], [4]]);
    expect(blok(6, 3)).toEqual([[0], [1], [2]]);
  });
  it("contiguous, front-loaded blocks like bagiKelompok", () => {
    expect(blok(3, 5)).toEqual([[0, 1], [2, 3], [4]]);
    expect(blok(4, 5)).toEqual([[0, 1], [2], [3], [4]]);
  });
});

describe("tugaskan", () => {
  it("finds the cheapest assignment", () => {
    expect(
      tugaskan([
        [4, 1, 3],
        [2, 0, 5],
        [3, 2, 2],
      ]),
    ).toEqual([1, 0, 2]);
  });
  it("fewer rows than columns", () => {
    expect(tugaskan([[5, 1, 9]])).toEqual([1]);
  });
});

describe("putar", () => {
  it("Module 1 is the default and nobody repeats with 5 for 5", () => {
    const r = putar(LIMA, 5);
    expect(r[1]).toEqual(LIMA);
    expect(r[2]).toEqual(["NUE", "REG", "GRY", "DES", "MAP"]);
    expect(ulangan(r)).toBe(0);
  });
  it("short slots rotate whole blocks", () => {
    const r = putar(["A", "B", "C"], 5);
    expect(r[1]).toEqual(["A", "A", "B", "B", "C"]);
    expect(r[2]).toEqual(["B", "B", "C", "C", "A"]);
    for (const m of [1, 2, 3, 4]) expect(blokUtuh(r[m], 3)).toBe(true);
  });
});

describe("acakModul", () => {
  const cek = (asisten: string[], n: number, seed: number) => acakModul(asisten, n, benih(seed));

  it("5 Asisten for 5 groups: no repeats over four modules", () => {
    for (let s = 1; s <= 40; s++) expect(ulangan(cek(LIMA, 5, s))).toBe(0);
  });
  it("3 for 3: the fourth module repeats exactly once per group", () => {
    for (let s = 1; s <= 40; s++) {
      const r = cek(["A", "B", "C"], 3, s);
      expect(ulangan({ 1: r[1], 2: r[2], 3: r[3] })).toBe(0);
      expect(ulangan(r)).toBe(3);
    }
  });
  it("4 or 3 for 5: blocks stay whole, repeats only where unavoidable", () => {
    for (let s = 1; s <= 40; s++) {
      const r4 = cek(["A", "B", "C", "D"], 5, s);
      const r3 = cek(["A", "B", "C"], 5, s);
      for (const m of [1, 2, 3, 4]) {
        expect(blokUtuh(r4[m], 4)).toBe(true);
        expect(blokUtuh(r3[m], 3)).toBe(true);
      }
      expect(ulangan(r4)).toBe(0);
      // Three blocks over four modules: each group repeats once.
      expect(ulangan(r3)).toBe(5);
    }
  });
  it("more people than groups: the one left out comes in next", () => {
    for (let s = 1; s <= 20; s++) {
      const r = cek(["A", "B", "C"], 2, s);
      const duduk = [r[1], r[2], r[3]].flat();
      expect(new Set(duduk).size).toBe(3);
    }
  });
  it("taught modules stay and count as history", () => {
    const tetap = { 1: ["GRY", "DES", "MAP", "NUE", "REG"] };
    for (let s = 1; s <= 20; s++) {
      const r = acakModul(LIMA, 5, benih(s), tetap);
      expect(r[1]).toEqual(tetap[1]);
      expect(ulangan(r)).toBe(0);
    }
  });
  it("the same seed draws the same lists, and seeds differ", () => {
    expect(cek(LIMA, 5, 7)).toEqual(cek(LIMA, 5, 7));
    const beda = new Set(Array.from({ length: 10 }, (_, s) => JSON.stringify(cek(LIMA, 5, s))));
    expect(beda.size).toBeGreaterThan(1);
  });
  it("every module uses only the slot's own people", () => {
    const r = cek(["map", "", "nue"], 3, 3);
    for (const m of [1, 2, 3, 4]) for (const k of r[m]) expect(["MAP", "NUE"]).toContain(k);
  });
  it("an empty slot leaves every seat open", () => {
    expect(acakModul([], 3, benih(1))[2]).toEqual(["", "", ""]);
  });
});

describe("daftarModul", () => {
  it("is 1 to 4 by default and follows the count", () => {
    expect(daftarModul()).toEqual([1, 2, 3, 4]);
    expect(daftarModul(6)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("holds the count between 1 and MODUL_MAKS", () => {
    expect(daftarModul(0)).toEqual([1]);
    expect(daftarModul(99)).toHaveLength(MODUL_MAKS);
    expect(daftarModul(2.5)).toEqual([1, 2, 3, 4]);
  });
  it("putar and acakModul fill every module of the count", () => {
    expect(Object.keys(putar(LIMA, 5, daftarModul(6)))).toHaveLength(6);
    const r = acakModul(LIMA, 5, benih(3), {}, daftarModul(5));
    expect(Object.keys(r)).toHaveLength(5);
    expect(ulangan(r)).toBe(0);
  });
});
