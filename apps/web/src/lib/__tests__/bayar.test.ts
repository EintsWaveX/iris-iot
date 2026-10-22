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
  statusBalik,
  tarifPada,
  type Unit,
} from "../bayar";

describe("the transfer back's status", () => {
  it("is not Lunas when nothing is due, nor when nothing came back yet", () => {
    expect(statusBalik(0, 0)).toBe("tidak_ada");
    expect(statusBalik(3250, 0)).toBe("belum");
    expect(statusBalik(3250, 1000)).toBe("belum");
  });

  it("is Lunas once what came back covers the share", () => {
    expect(statusBalik(3250, 3250)).toBe("lunas");
    expect(statusBalik(3250, 4000)).toBe("lunas");
  });
});

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

describe("attendance cuts", () => {
  const u = (nim: string, tanggal: string): Unit => ({
    nimPenilai: nim,
    tanggal,
    kelas: "reguler",
    kasPersen: 10,
    ...pisah(32500, 10),
  });
  const A = [u("A", "2026-09-10"), u("A", "2026-09-17"), u("A", "2026-10-01")];

  it("takes a cut off kotor and bersih, leaving the kas alone", () => {
    const r = jumlahkan(A.slice(0, 2), [{ tanggal: "2026-09-10", jumlah: 8000 }]);
    expect(r).toEqual({
      reguler: 2,
      internasional: 0,
      kotor: 65000 - 8000,
      kas: 6500,
      bersih: 58500 - 8000,
    });
  });

  it("never takes a month below zero, and a cut never spills into another month", () => {
    const r = jumlahkan(A, [{ tanggal: "2026-10-05", jumlah: 99999 }]);
    expect(r.kotor).toBe(65000);
    expect(r.bersih).toBe(58500);
    const lone = jumlahkan([u("A", "2026-09-10")], [{ tanggal: "2026-09-12", jumlah: 99999 }]);
    expect(lone).toMatchObject({ kotor: 0, kas: 0, bersih: 0 });
  });

  it("caps the kas at the kotor left, so no kas is owed on money not received", () => {
    const one = [u("A", "2026-09-10")];
    expect(jumlahkan(one, [{ tanggal: "2026-09-11", jumlah: 20000 }])).toMatchObject({
      kotor: 12500,
      kas: 3250,
      bersih: 9250,
    });
    expect(jumlahkan(one, [{ tanggal: "2026-09-11", jumlah: 30000 }])).toMatchObject({
      kotor: 2500,
      kas: 2500,
      bersih: 0,
    });
    expect(jumlahkan(one, [{ tanggal: "2026-09-11", jumlah: 40000 }])).toMatchObject({
      kotor: 0,
      kas: 0,
      bersih: 0,
    });
  });

  it("sisaTransfer owes back at most what was received", () => {
    const one = [u("A", "2026-09-10")];
    const dua = (jumlah: number) =>
      sisaTransfer(one, [], null, [{ nim: "A", tanggal: "2026-09-11", jumlah }]);
    const baris = (r: ReturnType<typeof dua>, j: string) => r.find((x) => x.jenis === j)?.jumlah;
    expect(baris(dua(30000), "kotor")).toBe(2500);
    expect(baris(dua(30000), "balik")).toBe(2500);
    expect(dua(40000)).toEqual([]);
  });

  it("owes the kotor line minus that person's cuts of the month", () => {
    const rows = sisaTransfer([u("A", "2026-09-10"), u("B", "2026-09-10")], [], null, [
      { nim: "A", tanggal: "2026-09-03", jumlah: 8000 },
      { nim: "A", tanggal: "2026-09-04", jumlah: 4000 },
    ]);
    const kotor = (n: string) => rows.find((x) => x.nim === n && x.jenis === "kotor");
    expect(kotor("A")?.jumlah).toBe(32500 - 12000);
    expect(kotor("B")?.jumlah).toBe(32500);
    expect(rows.find((x) => x.nim === "A" && x.jenis === "balik")?.jumlah).toBe(3250);
  });

  it("a cut that eats the whole kotor removes the line", () => {
    const rows = sisaTransfer([u("A", "2026-09-10")], [], null, [
      { nim: "A", tanggal: "2026-09-11", jumlah: 50000 },
    ]);
    expect(rows.filter((x) => x.jenis === "kotor")).toEqual([]);
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
