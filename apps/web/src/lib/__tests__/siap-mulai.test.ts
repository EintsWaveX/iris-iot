import { describe, expect, it } from "vitest";
import { cekMulai, gagalMulai, type FaktaMulai } from "../siap-mulai";

const pcSehat = {
  umurDetik: 10,
  batasLuringDetik: 120,
  layanan: { "modul2-ws": "active", mosquitto: "active", modul4: "active" },
};
const dasar: FaktaMulai = {
  modul: 3,
  tot: false,
  modeTot: false,
  modulTerbuka: [1, 2, 3, 4],
  butuhAp: false,
  pc: pcSehat,
};
const status = (f: FaktaMulai) => Object.fromEntries(cekMulai(f).map((c) => [c.id, c.status]));

describe("cekMulai", () => {
  it("passes a healthy lab", () => {
    expect(gagalMulai(cekMulai(dasar))).toEqual({ keras: [], lunak: [] });
  });

  it("flags a stopped Mosquitto for Module 3 as forceable", () => {
    const f = {
      ...dasar,
      pc: { ...pcSehat, layanan: { ...pcSehat.layanan, mosquitto: "inactive" } },
    };
    const g = gagalMulai(cekMulai(f));
    expect(g.keras).toEqual([]);
    expect(g.lunak.map((c) => c.id)).toEqual(["layanan"]);
    expect(g.lunak[0].keadaan).toBe("inactive");
  });

  it("an offline PC fails once and skips what it can't know", () => {
    const s = status({ ...dasar, pc: { ...pcSehat, umurDetik: 600 } });
    expect(s.pc).toBe("gagal");
    expect(s.layanan).toBe("lewat");
  });

  it("no enrolled PC counts as offline", () => {
    expect(status({ ...dasar, pc: null }).pc).toBe("gagal");
  });

  it("Module 1 needs no PC", () => {
    const s = status({ ...dasar, modul: 1, pc: null });
    expect(s.pc).toBe("lewat");
    expect(s.layanan).toBe("lewat");
  });

  it("a closed module and the wrong TOT side are hard", () => {
    const g = gagalMulai(cekMulai({ ...dasar, modulTerbuka: [1], modeTot: true }));
    expect(g.keras.map((c) => c.id)).toEqual(["tot", "modul"]);
  });

  it("a TOT session may use a closed module", () => {
    const s = status({ ...dasar, tot: true, modeTot: true, modulTerbuka: [] });
    expect(s.tot).toBe("ok");
    expect(s.modul).toBe("ok");
  });

  it("the PC makes no hotspot, so no check ever mentions one", () => {
    const m4 = { ...dasar, modul: 4, butuhAp: true };
    expect(cekMulai(m4).map((c) => c.id)).toEqual(["tot", "modul", "pc", "layanan"]);
  });
});
