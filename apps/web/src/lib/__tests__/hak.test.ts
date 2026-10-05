import { describe, expect, it } from "vitest";
import {
  KATEGORI,
  boleh,
  bolehPenuh,
  divisiKepala,
  hakDari,
  isKategori,
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

  it("gives a Pengelola the schedule and the server, not the Team", () => {
    const p = orang("pengelola");
    expect(bolehPenuh(p, "pair")).toBe(true);
    expect(boleh(p, "jadwal")).toBe(true);
    expect(boleh(p, "server")).toBe(true);
    expect(boleh(p, "full")).toBe(false);
    expect(boleh(p, "tim")).toBe(false);
  });

  it("gives an Admin everything", () => {
    const a = orang("admin");
    for (const k of ["own", "pair", "jadwal", "server", "full", "tim"] as const) {
      expect(bolehPenuh(a, k)).toBe(true);
    }
  });

  it("adds the full Server view for DEV", () => {
    expect(boleh(orang("asisten", ["dev"]), "full")).toBe(true);
    expect(boleh(orang("asisten", ["dev"]), "server")).toBe(false);
  });

  it("applies an Admin's override, both ways", () => {
    expect(boleh(orang("asisten", [], { jadwal: true }), "jadwal")).toBe(true);
    expect(boleh(orang("pengelola", [], { server: false }), "server")).toBe(false);
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
});
