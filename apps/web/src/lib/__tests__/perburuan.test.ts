import { describe, expect, it } from "vitest";
import {
  bacaPerburuanSesi,
  keadaanPerburuan,
  perburuanBerjalan,
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
  const jalan = { mulai: "2026-10-08T13:00:00Z", selesai: null, oleh: "1101200009" };
  it("follows the round once the Asisten started the hunt", () => {
    expect(keadaanPerburuan(null, 1, jalan)).toBe("tunggu");
    expect(keadaanPerburuan({ ...r, sesi: null }, 1, jalan)).toBe("tunggu");
    expect(keadaanPerburuan({ ...r, mulai: false }, 1, jalan)).toBe("buka");
    expect(keadaanPerburuan(r, 1, jalan)).toBe("main");
    expect(keadaanPerburuan(r, 2, jalan)).toBe("selesai");
    expect(keadaanPerburuan({ ...r, selesai: true }, 1, jalan)).toBe("selesai");
  });

  it("stays locked until Mulai Perburuan, whatever the PC reports", () => {
    expect(keadaanPerburuan(r, 1)).toBe("belum");
    expect(keadaanPerburuan(r, 1, null)).toBe("belum");
    expect(keadaanPerburuan(r, 1, { mulai: null, selesai: null, oleh: null })).toBe("belum");
  });

  it("is over after Selesai Perburuan, the result still readable", () => {
    expect(keadaanPerburuan(r, 1, { ...jalan, selesai: "2026-10-08T14:00:00Z" })).toBe("selesai");
  });
});

describe("bacaPerburuanSesi and perburuanBerjalan", () => {
  it("reads the record and tells a running hunt apart", () => {
    const p = bacaPerburuanSesi({ mulai: "2026-10-08T13:00:00Z", selesai: null, oleh: "x" });
    expect(p).toEqual({ mulai: "2026-10-08T13:00:00Z", selesai: null, oleh: "x" });
    expect(perburuanBerjalan(p)).toBe(true);
    expect(perburuanBerjalan({ ...p!, selesai: "2026-10-08T14:00:00Z" })).toBe(false);
    expect(perburuanBerjalan(null)).toBe(false);
    expect(bacaPerburuanSesi(null)).toBeNull();
    expect(bacaPerburuanSesi({ mulai: 5 })).toEqual({ mulai: null, selesai: null, oleh: null });
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
