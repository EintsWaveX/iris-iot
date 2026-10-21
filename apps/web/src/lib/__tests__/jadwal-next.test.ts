import { describe, expect, it } from "vitest";
import { slotBerikutnya, type BarisJadwal } from "../jadwal-next";
import { pasanganTanggal, type MingguSlot } from "../penugasan-minggu";

const J: BarisJadwal[] = [
  {
    hari: 2,
    slot: 1,
    kelas: "reguler",
    status: "aktif",
    asisten: ["NAT", "ICA", "MCU", "LUV", "MCD"],
  },
  { hari: 4, slot: 2, kelas: "internasional", status: "aktif", asisten: ["TIR", "NUE", "OCU"] },
  {
    hari: 5,
    slot: 2,
    kelas: "reguler",
    status: "aktif",
    asisten: ["NAT", "DES", "GRY", "WIL", "NAT"],
  },
  { hari: 6, slot: 1, kelas: "reguler", status: "segera", asisten: ["NAT"] },
];

describe("slotBerikutnya", () => {
  it("finds today's slot while it has not ended yet", () => {
    // Selasa 07:00: slot 1 (06:30) is running.
    const s = slotBerikutnya(J, "nat", 2, 7 * 60);
    expect(s).toMatchObject({ hari: 2, slot: 1, hariLagi: 0, sedangBerjalan: true, kelompok: [1] });
  });

  it("moves on once today's slot has ended, and lists every group held", () => {
    // Selasa 09:05: 06:30 + 150 min = 09:00, so the next one is Jumat.
    const s = slotBerikutnya(J, "NAT", 2, 9 * 60 + 5);
    expect(s).toMatchObject({
      hari: 5,
      slot: 2,
      hariLagi: 3,
      sedangBerjalan: false,
      kelompok: [1, 5],
    });
  });

  it("ignores slots marked segera and wraps around the week", () => {
    // Sabtu: the segera slot is skipped, next is Selasa.
    const s = slotBerikutnya(J, "NAT", 6, 0);
    expect(s).toMatchObject({ hari: 2, hariLagi: 3 });
  });

  it("carries the class type and returns null for an unknown code", () => {
    expect(slotBerikutnya(J, "NUE", 4, 0)?.kelas).toBe("internasional");
    expect(slotBerikutnya(J, "ZZZ", 1, 0)).toBeNull();
    expect(slotBerikutnya(J, "", 1, 0)).toBeNull();
  });
});

describe("slotBerikutnya with that date's seats (user, 2026-10-21)", () => {
  // Rabu slot 4: NUE covers NAB's group 1, TRA is excused with nobody in.
  const R: BarisJadwal[] = [
    { id: 25, hari: 3, slot: 4, kelas: "reguler", status: "aktif", asisten: ["NAB", "MCU", "TRA"] },
    { id: 9, hari: 5, slot: 1, kelas: "reguler", status: "aktif", asisten: ["NAB"] },
  ];
  const tugas = [
    {
      id: 1,
      nim: "1",
      kode: "NUE",
      kelompokNomor: 1,
      jenis: "pengganti" as const,
      status: "diterima" as const,
      tag: null,
      dimintaOleh: "1",
      dikonfirmasiOleh: null,
    },
  ];
  const kursi = pasanganTanggal(["NAB", "MCU", "TRA"], 3, tugas, [
    { kode: "TRA", status: "aktif" },
  ]);
  const M: Record<string, MingguSlot> = {
    "25": { tanggal: "2026-10-21", status: "aktif", kursi, tugas, izin: [] },
  };
  it("a cover's slot is their next one, marked as a cover", () => {
    expect(slotBerikutnya(R, "NUE", 3, 10 * 60, M)).toMatchObject({
      hari: 3,
      slot: 4,
      kelompok: [1],
      ganti: true,
      kursi: [{ nomor: 1, ganti: { jenis: "pengganti", untuk: "NAB" }, lepas: null }],
    });
  });
  it("a Regular whose seats are all handed over or excused moves on", () => {
    expect(slotBerikutnya(R, "NAB", 3, 10 * 60, M)).toMatchObject({ hari: 5, slot: 1 });
    expect(slotBerikutnya(R, "TRA", 3, 10 * 60, M)).toBeNull();
    expect(slotBerikutnya(R, "MCU", 3, 10 * 60, M)).toMatchObject({ slot: 4, ganti: false });
  });
  it("without seats it reads the semester list as before", () => {
    expect(slotBerikutnya(R, "NUE", 3, 10 * 60)).toBeNull();
    expect(slotBerikutnya(R, "NAB", 3, 10 * 60)).toMatchObject({ slot: 4, kelompok: [1] });
  });
});
