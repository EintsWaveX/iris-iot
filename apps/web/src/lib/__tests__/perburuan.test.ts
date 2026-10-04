import { describe, expect, it } from "vitest";
import {
  keadaanPerburuan,
  penghargaanKelompok,
  saringHotspot,
  saringPerburuan,
  wifiQr,
} from "../perburuan";

const contoh = {
  versi: 1,
  jam: "13:52:04:120",
  sesi: 2,
  mulai: true,
  selesai: false,
  berjalan: 120,
  grup: [
    {
      grup: 1,
      status: "berburu",
      heat: "hangat",
      rank: 2,
      durasi: null,
      klaim_ke: 0,
      anggota: [
        { nim: "1302010", peran: "pemandu", hadir: true },
        { nim: "1302011", peran: null, hadir: false },
        { nim: "", peran: "pemandu", hadir: true },
      ],
    },
    { grup: 2, status: "menang", heat: "membara", rank: 1, durasi: 640, klaim_ke: 1, anggota: [] },
    { grup: 99, status: "x", anggota: [] },
  ],
  penghargaan: {
    podium: [{ grup: 2, posisi: 1, durasi: 640 }],
    tautan_tercepat: { grup: 1, nilai: 38, satuan: "ms" },
    tautan_terandal: null,
  },
  peristiwa: [
    { kind: "zona", grup: 1, at: "13:58:12:004", t: 366, heat: "hangat" },
    { kind: "rahasia", grup: 1, at: "13:58:13:004", t: 367 },
    { kind: "ditemukan", grup: 2, at: "14:02:51:000", t: 640, durasi: 640, dari: "Raka" },
  ],
};

describe("saringPerburuan", () => {
  it("keeps the known shape and drops the rest", () => {
    const r = saringPerburuan(contoh)!;
    expect(r.sesi).toBe(2);
    expect(r.grup.map((g) => g.grup)).toEqual([1, 2]);
    expect(r.grup[0].anggota).toEqual([
      { nim: "1302010", peran: "pemandu", hadir: true },
      { nim: "1302011", peran: null, hadir: false },
    ]);
    expect(r.grup[1].klaimKe).toBe(1);
    expect(r.peristiwa.map((e) => e.kind)).toEqual(["zona", "ditemukan"]);
    expect(r.peristiwa[1]).not.toHaveProperty("dari");
  });

  it("reads its own stored copy back the same", () => {
    const r = saringPerburuan(contoh)!;
    expect(saringPerburuan(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it("rejects an unknown version or a missing group list", () => {
    expect(saringPerburuan({ ...contoh, versi: 2 })).toBeNull();
    expect(saringPerburuan({ versi: 1 })).toBeNull();
    expect(saringPerburuan("x")).toBeNull();
  });
});

describe("keadaanPerburuan", () => {
  const r = saringPerburuan(contoh)!;
  it("follows the round", () => {
    expect(keadaanPerburuan(null, 1)).toBe("tunggu");
    expect(keadaanPerburuan({ ...r, sesi: null }, 1)).toBe("tunggu");
    expect(keadaanPerburuan({ ...r, mulai: false }, 1)).toBe("buka");
    expect(keadaanPerburuan(r, 1)).toBe("main");
    expect(keadaanPerburuan(r, 2)).toBe("selesai");
    expect(keadaanPerburuan({ ...r, selesai: true }, 1)).toBe("selesai");
  });
});

describe("penghargaanKelompok", () => {
  const r = saringPerburuan(contoh)!;
  it("picks one group's awards", () => {
    expect(penghargaanKelompok(r.penghargaan, 2)).toEqual([{ kunci: "podium", posisi: 1 }]);
    expect(penghargaanKelompok(r.penghargaan, 1)).toEqual([
      { kunci: "tautan_tercepat", nilai: 38, satuan: "ms" },
    ]);
    expect(penghargaanKelompok(null, 1)).toEqual([]);
  });
});

describe("hotspot", () => {
  it("keeps only a named network", () => {
    expect(saringHotspot({ ssid: "LAB-AP", sandi: "contoh" })).toEqual({
      ssid: "LAB-AP",
      sandi: "contoh",
    });
    expect(saringHotspot({ ssid: "" })).toBeNull();
    expect(saringHotspot({ ssid: "LAB" })).toEqual({ ssid: "LAB", sandi: null });
  });

  it("escapes the Wi-Fi QR string", () => {
    expect(wifiQr("LAB;AP", "a:b")).toBe("WIFI:S:LAB\\;AP;T:WPA;P:a\\:b;;");
    expect(wifiQr("LAB", null)).toBe("WIFI:S:LAB;T:nopass;;");
  });
});
