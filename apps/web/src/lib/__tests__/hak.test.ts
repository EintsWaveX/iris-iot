import { describe, expect, it } from "vitest";
import {
  HAK,
  KATEGORI,
  asalHak,
  perubahanHak,
  PRESET_PERAN,
  boleh,
  bolehResetSandi,
  bolehPenuh,
  divisiKepala,
  hakDari,
  hakDasar,
  hakPenuh,
  isKategori,
  lihatHakOrang,
  lihatRpSemua,
  presetOrang,
  tierUntuk,
  type Orang,
} from "../hak";

const orang = (tier: Orang["tier"], badges: string[] = [], hakOverride = {}): Orang => ({
  tier,
  badges,
  hakOverride,
});

describe("positions and tiers", () => {
  it("has the ten head roles", () => {
    expect(KATEGORI).toHaveLength(10);
    expect(isKategori("kepala-ASO")).toBe(true);
    expect(isKategori("kepala-XYZ")).toBe(false);
    expect(isKategori("anggota")).toBe(false);
  });

  it("gives Inti Admin, Kepala Pengelola and members Asisten", () => {
    expect(tierUntuk("ketua")).toBe("admin");
    expect(tierUntuk("bendahara")).toBe("admin");
    expect(tierUntuk("kepala-ARD")).toBe("pengelola");
    expect(tierUntuk(null)).toBe("asisten");
    expect(divisiKepala("kepala-ADC")).toBe("ADC");
    expect(divisiKepala("wakil")).toBeNull();
  });
});

describe("the rights matrix", () => {
  it("lets an Asisten run only their own slot", () => {
    const a = orang("asisten");
    expect(hakDari(a, "own")).toBe(true);
    expect(hakDari(a, "pair")).toBe("own");
    expect(boleh(a, "pair")).toBe(true);
    expect(bolehPenuh(a, "pair")).toBe(false);
    expect(boleh(a, "jadwal")).toBe(false);
    expect(boleh(a, "server")).toBe(false);
    expect(boleh(a, "tim")).toBe(false);
  });

  it("gives a Pengelola the schedule and full Pair, not the server or the Team", () => {
    const p = orang("pengelola");
    expect(bolehPenuh(p, "pair")).toBe(true);
    expect(boleh(p, "jadwal")).toBe(true);
    expect(boleh(p, "server")).toBe(false);
    expect(boleh(p, "full")).toBe(false);
    expect(boleh(p, "tim")).toBe(false);
  });

  it("gives an Admin everything", () => {
    const a = orang("admin");
    for (const k of HAK) expect(bolehPenuh(a, k)).toBe(true);
  });

  it("gives a DEV the technical rights and Jadwal only", () => {
    for (const tier of ["asisten", "pengelola"] as const) {
      const d = orang(tier, ["dev"]);
      expect(bolehPenuh(d, "jadwal")).toBe(true);
      expect(bolehPenuh(d, "server")).toBe(true);
      expect(bolehPenuh(d, "full")).toBe(true);
      expect(boleh(d, "tim")).toBe(false);
      expect(boleh(d, "hadir")).toBe(false);
      expect(boleh(d, "audit")).toBe(false);
      expect(hakPenuh(d)).toBe(false);
    }
    expect(hakDari(orang("asisten", ["dev"]), "pair")).toBe("own");
  });

  it("applies an Admin's override, both ways", () => {
    expect(boleh(orang("asisten", [], { jadwal: true }), "jadwal")).toBe(true);
    expect(boleh(orang("pengelola", [], { jadwal: false }), "jadwal")).toBe(false);
    expect(boleh(orang("asisten", ["dev"], { server: false }), "server")).toBe(false);
    expect(boleh(orang("asisten", [], { audit: true }), "audit")).toBe(true);
  });

  it("gives the journal code to the ASO division and Admins only", () => {
    const di = (tier: Orang["tier"], divisi: string | null): Orang => ({
      ...orang(tier),
      divisi,
    });
    expect(boleh(di("asisten", "ASO"), "kode")).toBe(true);
    expect(boleh(di("pengelola", "ASO"), "kode")).toBe(true);
    expect(boleh(di("admin", null), "kode")).toBe(true);
    expect(boleh(di("pengelola", "ARD"), "kode")).toBe(false);
    expect(boleh(di("asisten", "ARM"), "kode")).toBe(false);
    expect(boleh({ ...di("asisten", "ARD"), hakOverride: { kode: true } }, "kode")).toBe(true);
    expect(boleh({ ...di("asisten", "ASO"), hakOverride: { kode: false } }, "kode")).toBe(false);
  });

  it("never reduces the Pencipta", () => {
    const n = orang("pengelola", ["pencipta", "dev"], { tim: false, server: false });
    expect(bolehPenuh(n, "tim")).toBe(true);
    expect(bolehPenuh(n, "server")).toBe(true);
  });

  it("never reduces an Admin either", () => {
    const semuaMati = Object.fromEntries(HAK.map((k) => [k, false]));
    const a = orang("admin", [], semuaMati);
    expect(hakPenuh(a)).toBe(true);
    for (const k of HAK) expect(bolehPenuh(a, k)).toBe(true);
    expect(hakPenuh(orang("asisten", ["dev"]))).toBe(false);
    expect(hakPenuh(orang("pengelola"))).toBe(false);
    expect(hakPenuh(orang("asisten"))).toBe(false);
  });
});

describe("division tools", () => {
  const di = (tier: Orang["tier"], divisi: string | null, badges: string[] = []): Orang => ({
    ...orang(tier, badges),
    divisi,
  });

  it("gives ASO the code, TP and LMS", () => {
    const a = di("asisten", "ASO");
    expect(boleh(a, "kode")).toBe(true);
    expect(boleh(a, "lms")).toBe(true);
    expect(boleh(a, "hadir")).toBe(false);
    expect(boleh(a, "server")).toBe(false);
  });

  it("gives ADS everyone's attendance and Rp", () => {
    const a = di("asisten", "ADS");
    expect(boleh(a, "hadir")).toBe(true);
    expect(boleh(a, "kode")).toBe(false);
    expect(boleh(a, "lms")).toBe(false);
    expect(boleh(a, "tim")).toBe(false);
  });

  it("gives ARM the server, not the full view", () => {
    const a = di("asisten", "ARM");
    expect(bolehPenuh(a, "server")).toBe(true);
    expect(boleh(a, "full")).toBe(false);
    expect(boleh(a, "jadwal")).toBe(false);
  });

  it("leaves ARD and AER as plain Anggota", () => {
    for (const d of ["ARD", "AER"]) {
      const a = di("asisten", d);
      for (const k of HAK) expect(hakDari(a, k)).toBe(hakDari(orang("asisten"), k));
    }
  });

  it("gives ADC the Lab Profile and nothing else", () => {
    const a = di("asisten", "ADC");
    expect(hakDari(a, "profil")).toBe(true);
    for (const k of HAK.filter((x) => x !== "profil"))
      expect(hakDari(a, k)).toBe(hakDari(orang("asisten"), k));
  });
});

describe("the eight presets", () => {
  const nyala = (o: Orang) => HAK.filter((k) => bolehPenuh(o, k));
  const di = (tier: Orang["tier"], divisi: string | null, badges: string[] = []): Orang => ({
    ...orang(tier, badges),
    divisi,
  });

  it("matches the matrix right for right", () => {
    expect(nyala(di("asisten", "ADC"))).toEqual(["own", "profil"]);
    expect(nyala(di("asisten", "ASO"))).toEqual(["own", "kode", "lms"]);
    expect(nyala(di("asisten", "ADS"))).toEqual(["own", "hadir"]);
    expect(nyala(di("asisten", "ARM"))).toEqual(["own", "server"]);
    expect(nyala(di("pengelola", "ADC"))).toEqual(["own", "pair", "jadwal", "profil"]);
    expect(nyala(di("pengelola", "ARM"))).toEqual(["own", "pair", "jadwal", "server"]);
    expect(nyala(di("asisten", "ARM", ["dev"]))).toEqual([
      "own",
      "jadwal",
      "server",
      "full",
      "profil",
    ]);
    expect(nyala(di("asisten", "ASO", ["dev"]))).toEqual([
      "own",
      "jadwal",
      "server",
      "full",
      "kode",
      "lms",
      "profil",
    ]);
    expect(nyala(di("admin", null))).toEqual([...HAK]);
  });

  it("builds each preset from hakDasar", () => {
    for (const p of PRESET_PERAN) {
      const o = presetOrang(p);
      expect(o.hakOverride).toEqual({});
      for (const k of HAK) expect(hakDari(o, k)).toBe(hakDasar(o, k));
    }
    expect(PRESET_PERAN).toHaveLength(8);
    expect(nyala(presetOrang("kepala-arm"))).toEqual(["own", "pair", "jadwal", "server"]);
    expect(nyala(presetOrang("dev"))).toEqual(["own", "jadwal", "server", "full", "profil"]);
    expect(nyala(presetOrang("admin"))).toEqual([...HAK]);
  });
});

describe("Reset Sandi", () => {
  it("is for the Tim right, never on oneself or the Pencipta", () => {
    expect(bolehResetSandi(true, false, orang("asisten"))).toBe(true);
    expect(bolehResetSandi(true, false, orang("admin"))).toBe(true);
    expect(bolehResetSandi(false, false, orang("asisten"))).toBe(false);
    expect(bolehResetSandi(true, true, orang("admin"))).toBe(false);
    expect(bolehResetSandi(true, false, orang("admin", ["pencipta"]))).toBe(false);
  });
});

describe("what others' data a person reads", () => {
  it("shows everyone's Rp to ADS and Admins only", () => {
    expect(lihatRpSemua(presetOrang("ads"))).toBe(true);
    expect(lihatRpSemua(presetOrang("admin"))).toBe(true);
    for (const p of ["anggota", "aso", "arm", "kepala", "kepala-arm", "dev"] as const)
      expect(lihatRpSemua(presetOrang(p))).toBe(false);
    expect(lihatRpSemua(null)).toBe(false);
  });

  it("shows others' rights and trails to Admins, or an audit or tim override", () => {
    expect(lihatHakOrang(presetOrang("admin"))).toBe(true);
    for (const p of ["anggota", "aso", "ads", "arm", "kepala", "kepala-arm", "dev"] as const)
      expect(lihatHakOrang(presetOrang(p))).toBe(false);
    expect(lihatHakOrang({ ...presetOrang("anggota"), hakOverride: { audit: true } })).toBe(true);
    expect(lihatHakOrang({ ...presetOrang("anggota"), hakOverride: { tim: true } })).toBe(true);
  });
});

describe("Hak Saya", () => {
  it("says where each right comes from", () => {
    const aso = presetOrang("aso");
    expect(asalHak(aso, "own", true)).toBeNull();
    expect(asalHak(aso, "kode", true)).toBe("divisi");
    expect(asalHak(aso, "server", false)).toBeNull();
    expect(asalHak(presetOrang("dev"), "full", true)).toBe("dev");
    expect(asalHak(presetOrang("kepala"), "jadwal", true)).toBe("kepala");
    expect(asalHak(presetOrang("kepala"), "pair", true)).toBe("kepala");
    expect(asalHak(presetOrang("kepala-arm"), "server", true)).toBe("divisi");
    expect(asalHak(presetOrang("admin"), "audit", true)).toBe("inti");
    expect(asalHak(presetOrang("anggota"), "jadwal", true)).toBe("admin");
    expect(asalHak(presetOrang("anggota"), "pair", "own")).toBeNull();
  });

  it("reads the changes to one's rights from the trail, newest first", () => {
    const baris = (pada: string, detail: unknown, aksi = "tim_ubah") => ({
      pada,
      aktorNim: "9",
      aksi,
      detail: JSON.stringify(detail),
    });
    const ubah = perubahanHak([
      baris("2026-10-03T02:00:00Z", { nim: "1", hakOverride: { server: false } }),
      baris("2026-10-01T02:00:00Z", { nim: "1", hakOverride: { jadwal: true } }),
      baris("2026-10-02T02:00:00Z", { nim: "1", status: "cuti" }),
      baris("2026-10-02T03:00:00Z", { nim: "1" }, "tim_tambah"),
    ]);
    expect(ubah).toEqual([
      { pada: "2026-10-03T02:00:00Z", oleh: "9", key: "jadwal", jadi: null },
      { pada: "2026-10-03T02:00:00Z", oleh: "9", key: "server", jadi: false },
      { pada: "2026-10-01T02:00:00Z", oleh: "9", key: "jadwal", jadi: true },
    ]);
    expect(perubahanHak([{ pada: "x", aktorNim: "9", aksi: "tim_ubah", detail: "{" }])).toEqual([]);
  });
});
