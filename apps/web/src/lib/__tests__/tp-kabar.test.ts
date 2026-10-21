import { describe, expect, it } from "vitest";
import {
  MEPET_MS,
  NILAI_TAMPIL_MS,
  kabarUntuk,
  templatKabar,
  waktuKabar,
  type KabarSimpan,
} from "../tp-kabar";

const J = { buka: "2026-10-21T18:00:00+07:00", tutup: "2026-10-24T18:00:00+07:00" };
const jam = (iso: string, h: number) => Date.parse(iso) + h * 3600_000;

const simpan = (x: Partial<KabarSimpan>): KabarSimpan => ({
  id: 1,
  modul: 2,
  jenis: "bebas",
  sasaran: "semua",
  judul: { id: "Judul", en: "Title" },
  isi: { id: "Isi", en: "" },
  mulai: "2026-10-21T10:00:00+07:00",
  sampai: "2026-10-25T10:00:00+07:00",
  ...x,
});

const dasar = {
  simpan: [] as KabarSimpan[],
  oto: { buka: false, mepet: false },
  jendela: new Map([[2, J]]),
  belum: new Set<number>(),
  kelas: "reguler" as const,
  now: jam(J.buka, 2),
};

describe("waktuKabar", () => {
  it("writes the full WIB date and time", () => {
    expect(waktuKabar(J.tutup, "id")).toBe("Sabtu, 24 Oktober 2026 · 18:00");
    expect(waktuKabar(J.tutup, "en")).toMatch(/^Saturday,? 24 October 2026 · 18:00$/);
  });
});

describe("templatKabar", () => {
  it("puts the module and the close in the opening notice", () => {
    const t = templatKabar("buka", 2, J);
    expect(t.judul.id).toBe("TP Modul 2 sudah dibuka");
    expect(t.isi.id).toContain("Sabtu, 24 Oktober 2026 · 18:00");
    expect(t.isi.en).toMatch(/Saturday,? 24 October 2026 · 18:00.$/);
    expect(t.sasaran).toBe("semua");
  });
  it("aims the reminder at those who haven't handed in", () => {
    expect(templatKabar("ingat", 3, J).sasaran).toBe("belum");
  });
  it("reads without a window too", () => {
    expect(templatKabar("ingat", 3, null).isi.id).toContain("sebelum jendelanya ditutup");
  });
  it("has no dashes in its copy", () => {
    for (const j of ["buka", "ingat", "tutup", "nilai"] as const) {
      const t = templatKabar(j, 1, J);
      expect(`${t.judul.id}${t.judul.en}${t.isi.id}${t.isi.en}`).not.toMatch(/[–—]/);
    }
  });
});

describe("kabarUntuk", () => {
  it("shows a kept notice inside its time, in the class's language", () => {
    const k = simpan({});
    expect(kabarUntuk({ ...dasar, simpan: [k] })).toMatchObject([
      { id: "k1", judul: "Judul", isi: "Isi" },
    ]);
    // INT reads English, and Indonesian where the English is empty.
    expect(kabarUntuk({ ...dasar, simpan: [k], kelas: "inter" })).toMatchObject([
      { judul: "Title", isi: "Isi" },
    ]);
  });
  it("hides one before it starts and after it ends", () => {
    const k = simpan({});
    expect(kabarUntuk({ ...dasar, simpan: [k], now: Date.parse(k.mulai) - 1 })).toEqual([]);
    expect(kabarUntuk({ ...dasar, simpan: [k], now: Date.parse(k.sampai!) })).toEqual([]);
  });
  it("shows a belum notice only while its module has no file", () => {
    const k = simpan({ sasaran: "belum" });
    expect(kabarUntuk({ ...dasar, simpan: [k] })).toEqual([]);
    expect(kabarUntuk({ ...dasar, simpan: [k], belum: new Set([2]) })).toHaveLength(1);
  });
  it("keeps one module's and the general ones on a module page", () => {
    const ks = [
      simpan({ id: 1, modul: 2 }),
      simpan({ id: 2, modul: 3 }),
      simpan({ id: 3, modul: null }),
    ];
    expect(
      kabarUntuk({ ...dasar, simpan: ks, modul: 2 })
        .map((k) => k.id)
        .sort(),
    ).toEqual(["k1", "k3"]);
    expect(kabarUntuk({ ...dasar, simpan: ks })).toHaveLength(3);
  });
  it("makes nothing automatic while the switches are off", () => {
    expect(kabarUntuk({ ...dasar, belum: new Set([2]), now: jam(J.tutup, -1) })).toEqual([]);
  });
  it("shows the opening notice for the window's first day", () => {
    const oto = { buka: true, mepet: false };
    expect(kabarUntuk({ ...dasar, oto }).map((k) => k.id)).toEqual(["buka-2"]);
    expect(kabarUntuk({ ...dasar, oto, now: jam(J.buka, 25) })).toEqual([]);
    expect(kabarUntuk({ ...dasar, oto, now: jam(J.buka, -1) })).toEqual([]);
  });
  it("reminds only those without a file in the last three hours", () => {
    const oto = { buka: false, mepet: true };
    const t = Date.parse(J.tutup);
    const tanpa = { ...dasar, oto, belum: new Set([2]) };
    expect(kabarUntuk({ ...tanpa, now: t - MEPET_MS - 1 })).toEqual([]);
    expect(kabarUntuk({ ...tanpa, now: t - MEPET_MS })).toMatchObject([
      { id: "ingat-2", jenis: "ingat" },
    ]);
    expect(kabarUntuk({ ...tanpa, now: t })).toEqual([]);
    expect(kabarUntuk({ ...dasar, oto, now: t - 60_000 })).toEqual([]);
  });
  it("follows their own window, so an extension moves the reminder", () => {
    const oto = { buka: false, mepet: true };
    const ext = { ...J, tutup: "2026-10-26T18:00:00+07:00" };
    const p = { ...dasar, oto, belum: new Set([2]), jendela: new Map([[2, ext]]) };
    expect(kabarUntuk({ ...p, now: jam(J.tutup, -1) })).toEqual([]);
    expect(kabarUntuk({ ...p, now: jam(ext.tutup, -1) })).toHaveLength(1);
  });
  it("lists the newest first", () => {
    const ks = [
      simpan({ id: 1, mulai: "2026-10-21T08:00:00+07:00" }),
      simpan({ id: 2, mulai: "2026-10-21T19:00:00+07:00" }),
    ];
    const now = jam(J.buka, 2);
    expect(
      kabarUntuk({ ...dasar, simpan: ks, oto: { buka: true, mepet: false }, now }).map((k) => k.id),
    ).toEqual(["k2", "buka-2", "k1"]);
  });
});

describe("kabarUntuk, their own", () => {
  const sampai = "2026-10-26T18:00:00+07:00";
  const pribadi = (x: Partial<Parameters<typeof kabarUntuk>[0]["pribadi"] & object> = {}) => ({
    panjang: new Map([[2, { sampai, pada: "2026-10-24T20:00:00+07:00" }]]),
    nilai: new Map<number, { total: number; pada: string }>(),
    ...x,
  });
  it("tells them about their extension while it runs and they have no file", () => {
    const now = jam(J.tutup, 5);
    const ids = kabarUntuk({ ...dasar, now, belum: new Set([2]), pribadi: pribadi() });
    expect(ids).toMatchObject([{ jenis: "panjang", modul: 2 }]);
    expect(ids[0].isi).toContain("Senin, 26 Oktober 2026 · 18:00");
    expect(kabarUntuk({ ...dasar, now, pribadi: pribadi() })).toEqual([]);
    expect(
      kabarUntuk({ ...dasar, now: Date.parse(sampai), belum: new Set([2]), pribadi: pribadi() }),
    ).toEqual([]);
  });
  it("shows their score for three days, on the Dasbor only", () => {
    const pada = "2026-10-28T12:00:00+07:00";
    const p = pribadi({ panjang: new Map(), nilai: new Map([[2, { total: 85, pada }]]) });
    const t = Date.parse(pada);
    expect(kabarUntuk({ ...dasar, now: t + 1, pribadi: p })).toMatchObject([
      { id: "nilai-2", judul: "Nilai TP Modul 2: 85" },
    ]);
    expect(kabarUntuk({ ...dasar, now: t + NILAI_TAMPIL_MS, pribadi: p })).toEqual([]);
    expect(kabarUntuk({ ...dasar, now: t + 1, modul: 2, pribadi: p })).toEqual([]);
    expect(kabarUntuk({ ...dasar, now: t + 1, kelas: "inter", pribadi: p })[0].judul).toBe(
      "TP Modul 2 score: 85",
    );
  });
});
