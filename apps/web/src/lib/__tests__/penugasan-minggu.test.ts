import { describe, expect, it } from "vitest";
import {
  orangTanggal,
  pasanganSemester,
  pasanganTanggal,
  statusSlotTanggal,
  tanggalBerikut,
} from "../penugasan-minggu";

describe("pasanganSemester", () => {
  it("takes one code per group, blanks as empty seats", () => {
    expect(pasanganSemester(["nat", "", "gry", "NAT", "DES"], 5)).toEqual([
      "NAT",
      null,
      "GRY",
      "NAT",
      "DES",
    ]);
  });
  it("spreads a short list in blocks (3 for 5 is 2, 2, 1)", () => {
    expect(pasanganSemester(["A", "B", "C"], 5)).toEqual(["A", "A", "B", "B", "C"]);
  });
  it("cuts a long list to the group count", () => {
    expect(pasanganSemester(["A", "B", "C"], 2)).toEqual(["A", "B"]);
  });
  it("an empty list leaves every seat empty", () => {
    expect(pasanganSemester([], 3)).toEqual([null, null, null]);
  });
});

describe("pasanganTanggal", () => {
  const sem = ["MAP", "NUE", "REG", "MAP", "GRY"];
  it("an excused Asisten leaves all their groups open", () => {
    const k = pasanganTanggal(sem, 5, [], [{ kode: "map", status: "aktif" }]);
    expect(k.map((x) => x.kode)).toEqual([null, "NUE", "REG", null, "GRY"]);
    expect(k[0].izin && k[3].izin && k[0].tetap === "MAP").toBe(true);
  });
  it("an accepted cover takes the seat with its kind", () => {
    const k = pasanganTanggal(
      sem,
      5,
      [
        { kelompokNomor: 1, kode: "twt", jenis: "pengganti", status: "diterima" },
        { kelompokNomor: 4, kode: "GAN", jenis: "sukarela", status: "diminta" },
      ],
      [{ kode: "MAP", status: "dicari" }],
    );
    expect(k[0]).toMatchObject({ kode: "TWT", jenis: "pengganti", tetap: "MAP", izin: true });
    expect(k[3]).toMatchObject({ kode: null, izin: true });
  });
  it("a cancelled izin changes nothing", () => {
    const k = pasanganTanggal(sem, 5, [], [{ kode: "MAP", status: "dibatalkan" }]);
    expect(k[0].kode).toBe("MAP");
  });
  it("orangTanggal lists the seated and accepted helpers", () => {
    const tugas = [
      { kelompokNomor: null, kode: "GAN", jenis: "sukarela" as const, status: "diterima" as const },
      { kelompokNomor: null, kode: "XIN", jenis: "sukarela" as const, status: "diminta" as const },
    ];
    const s = orangTanggal(pasanganTanggal(sem, 5, tugas, []), tugas);
    expect([...s].sort()).toEqual(["GAN", "GRY", "MAP", "NUE", "REG"]);
  });
});

describe("tanggalBerikut", () => {
  // 2026-10-03 is a Saturday.
  it("today when it's that day", () => expect(tanggalBerikut(6, "2026-10-03")).toBe("2026-10-03"));
  it("later this week or next", () => {
    expect(tanggalBerikut(1, "2026-10-03")).toBe("2026-10-05");
    expect(tanggalBerikut(4, "2026-10-01")).toBe("2026-10-01");
    expect(tanggalBerikut(3, "2026-10-01")).toBe("2026-10-07");
  });
  it("crosses a month end", () => expect(tanggalBerikut(1, "2026-10-31")).toBe("2026-11-02"));
});

describe("statusSlotTanggal", () => {
  it("a holiday holds for its date only", () => {
    const j = { status: "aktif" as const, liburTanggal: "2026-10-03" };
    expect(statusSlotTanggal(j, "2026-10-03")).toBe("libur");
    expect(statusSlotTanggal(j, "2026-10-10")).toBe("aktif");
  });
  it("no practicum wins", () =>
    expect(statusSlotTanggal({ status: "kosong", liburTanggal: "2026-10-03" }, "2026-10-03")).toBe(
      "kosong",
    ));
});
