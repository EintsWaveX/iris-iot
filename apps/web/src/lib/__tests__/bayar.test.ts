import { describe, expect, it } from "vitest";
import {
  bacaTarifUnit,
  jumlahkan,
  kasPersenValid,
  namaPeriode,
  periodeDari,
  persenUntuk,
  pisah,
  rupiah,
  sisaTransfer,
  tarifPada,
  type Unit,
} from "../bayar";

describe("kas math", () => {
  it("splits kotor into kas and bersih, rounding the kas", () => {
    expect(pisah(32500, 10)).toEqual({ kotor: 32500, kas: 3250, bersih: 29250 });
    expect(pisah(32500, 15)).toEqual({ kotor: 32500, kas: 4875, bersih: 27625 });
    expect(pisah(65000, 0)).toEqual({ kotor: 65000, kas: 0, bersih: 65000 });
    const s = pisah(32501, 33);
    expect(s.kas + s.bersih).toBe(32501);
  });

  it("bounds the rate to 0..50 whole percent", () => {
    expect(kasPersenValid(10)).toBe(true);
    expect(kasPersenValid(0)).toBe(true);
    expect(kasPersenValid(50)).toBe(true);
    expect(kasPersenValid(51)).toBe(false);
    expect(kasPersenValid(-1)).toBe(false);
    expect(kasPersenValid(12.5)).toBe(false);
  });

  it("reads the unit rates, falling back on bad values", () => {
    expect(bacaTarifUnit({ reguler: 40000, internasional: 80000 })).toEqual({
      reguler: 40000,
      internasional: 80000,
    });
    expect(bacaTarifUnit({ reguler: "x" })).toEqual({ reguler: 32500, internasional: 65000 });
    expect(bacaTarifUnit(null)).toEqual({ reguler: 32500, internasional: 65000 });
  });
});

describe("which rate applies", () => {
  const tarif = [
    { id: 1, semester: "2026-ganjil", persen: 10, berlakuMulai: "2026-08-01" },
    { id: 2, semester: "2026-ganjil", persen: 15, berlakuMulai: "2026-10-05" },
  ];
  it("uses the newest rate started on or before the date", () => {
    expect(tarifPada(tarif, "2026-ganjil", "2026-10-04")?.persen).toBe(10);
    expect(tarifPada(tarif, "2026-ganjil", "2026-10-05")?.persen).toBe(15);
    expect(tarifPada(tarif, "2026-ganjil", "2026-07-30")).toBeNull();
  });

  it("an exception wins over the semester rate", () => {
    const exc = [{ semester: "2026-ganjil", nim: "X", persen: 5 }];
    expect(persenUntuk("X", "2026-ganjil", "2026-10-10", tarif, exc)).toBe(5);
    expect(persenUntuk("Y", "2026-ganjil", "2026-10-10", tarif, exc)).toBe(15);
  });

  it("a new semester without its own rate carries the last one", () => {
    expect(persenUntuk("Y", "2026-genap", "2027-02-10", tarif, [])).toBe(15);
    expect(persenUntuk("Y", "2025-genap", "2025-03-01", [], [])).toBe(10);
  });
});

describe("transfers still owed", () => {
  const u = (
    nim: string,
    tanggal: string,
    kelas: "reguler" | "internasional",
    persen = 10,
  ): Unit => {
    const kotor = kelas === "reguler" ? 32500 : 65000;
    return { nimPenilai: nim, tanggal, kelas, kasPersen: persen, ...pisah(kotor, persen) };
  };
  const units = [
    u("A", "2026-09-10", "reguler"),
    u("A", "2026-09-17", "internasional"),
    u("A", "2026-10-01", "reguler"),
    u("B", "2026-09-11", "reguler", 5),
  ];

  it("sums units per class", () => {
    expect(jumlahkan(units.filter((x) => x.nimPenilai === "A"))).toEqual({
      reguler: 2,
      internasional: 1,
      kotor: 130000,
      kas: 13000,
      bersih: 117000,
    });
  });

  it("lists kotor and balik per person and month, minus what was paid", () => {
    const rows = sisaTransfer(units, [
      { periode: "2026-09", jenis: "kotor", nim: "A", jumlah: 97500 },
      { periode: "2026-09", jenis: "balik", nim: "B", jumlah: 1000 },
    ]);
    expect(rows.map((r) => [r.periode, r.jenis, r.nim, r.jumlah])).toEqual([
      ["2026-10", "kotor", "A", 32500],
      ["2026-10", "balik", "A", 3250],
      ["2026-09", "kotor", "B", 32500],
      ["2026-09", "balik", "A", 9750],
      ["2026-09", "balik", "B", 625],
    ]);
  });

  it("a fully paid line disappears, and a later unit opens it again", () => {
    expect(
      sisaTransfer(
        [u("A", "2026-09-10", "reguler")],
        [{ periode: "2026-09", jenis: "kotor", nim: "A", jumlah: 32500 }],
      ).filter((r) => r.jenis === "kotor"),
    ).toEqual([]);
  });

  it("the Bendahara owes no transfer to or from themselves", () => {
    const rows = sisaTransfer(
      [u("A", "2026-09-10", "reguler"), u("BEN", "2026-09-10", "internasional")],
      [],
      "BEN",
    );
    expect(rows.map((r) => r.nim)).toEqual(["A", "A"]);
  });
});

describe("display", () => {
  it("writes rupiah the handbook way", () => {
    expect(rupiah(32500)).toBe("Rp32.500,00");
    expect(rupiah(1234567)).toBe("Rp1.234.567,00");
  });
  it("names the month", () => {
    expect(periodeDari("2026-09-24")).toBe("2026-09");
    expect(namaPeriode("2026-09", "id")).toBe("September 2026");
    expect(namaPeriode("2026-09", "en")).toBe("September 2026");
  });
});
