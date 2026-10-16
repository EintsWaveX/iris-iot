import { describe, expect, it } from "vitest";
import {
  aturLibur,
  daftarLibur,
  geserDari,
  mingguDepan,
  orangTanggal,
  pasanganSemester,
  pasanganTanggal,
  seninSah,
  statusSlotTanggal,
  tanggalBerikut,
  tanggalMinggu,
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

describe("mingguDepan", () => {
  // 2026-10-16 is a Friday; its week runs Monday 10-12 to Sunday 10-18.
  it("this week until Sunday", () => {
    expect(mingguDepan("2026-10-16", "2026-10-16")).toBe(false);
    expect(mingguDepan("2026-10-17", "2026-10-16")).toBe(false);
    expect(mingguDepan("2026-10-18", "2026-10-16")).toBe(false);
  });
  it("next week from Monday on", () => {
    expect(mingguDepan("2026-10-19", "2026-10-16")).toBe(true);
    expect(mingguDepan(tanggalBerikut(4, "2026-10-16"), "2026-10-16")).toBe(true);
  });
  it("on a Sunday every slot is next week", () =>
    expect(mingguDepan(tanggalBerikut(6, "2026-10-18"), "2026-10-18")).toBe(true));
  it("across a month end", () => expect(mingguDepan("2026-11-02", "2026-10-31")).toBe(true));
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

describe("weeks ahead (Penugasan Slot's week picker)", () => {
  it("tanggalMinggu steps whole weeks from the next date", () => {
    expect(tanggalMinggu(3, "2026-10-12", 0)).toBe("2026-10-14");
    expect(tanggalMinggu(3, "2026-10-12", 2)).toBe("2026-10-28");
    expect(tanggalMinggu(1, "2026-10-26", 1)).toBe("2026-11-02");
  });
  it("geserDari finds the week back, or null off the day or in the past", () => {
    expect(geserDari(3, "2026-10-12", "2026-10-28")).toBe(2);
    expect(geserDari(3, "2026-10-12", "2026-10-14")).toBe(0);
    expect(geserDari(3, "2026-10-12", "2026-10-15")).toBeNull();
    expect(geserDari(3, "2026-10-12", "2026-10-07")).toBeNull();
  });
});

describe("several holidays per slot", () => {
  it("reads a single date as before, and a list", () => {
    expect(daftarLibur(null)).toEqual([]);
    expect(daftarLibur("2026-10-14")).toEqual(["2026-10-14"]);
    expect(daftarLibur("2026-10-14,2026-10-28")).toEqual(["2026-10-14", "2026-10-28"]);
  });
  it("adds and drops a date, and lets past ones go", () => {
    const a = aturLibur("2026-10-07", "2026-10-28", true, "2026-10-12");
    expect(a).toBe("2026-10-28");
    const b = aturLibur(a, "2026-10-14", true, "2026-10-12");
    expect(b).toBe("2026-10-14,2026-10-28");
    expect(aturLibur(b, "2026-10-28", false, "2026-10-12")).toBe("2026-10-14");
    expect(aturLibur("2026-10-14", "2026-10-14", false, "2026-10-12")).toBeNull();
  });
  it("each listed date is a holiday", () => {
    const j = { status: "aktif" as const, liburTanggal: "2026-10-14,2026-10-28" };
    expect(statusSlotTanggal(j, "2026-10-28")).toBe("libur");
    expect(statusSlotTanggal(j, "2026-10-21")).toBe("aktif");
  });
});

describe("seninSah", () => {
  it("takes a real Monday only", () => {
    expect(seninSah("2026-10-19")).toBe(true);
    expect(seninSah("2026-10-20")).toBe(false);
    expect(seninSah("2026-02-30")).toBe(false);
    expect(seninSah("19-10-2026")).toBe(false);
  });
});
