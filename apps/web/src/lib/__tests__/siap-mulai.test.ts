import { describe, expect, it } from "vitest";
import { cekMulai, gagalMulai, type FaktaMulai } from "../siap-mulai";

const piSehat = {
  umurDetik: 10,
  batasLuringDetik: 120,
  layanan: { "modul2-ws": "active", mosquitto: "active", modul4: "active" },
  modeJaringan: "ap-mandiri",
};
const dasar: FaktaMulai = {
  modul: 3,
  tot: false,
  modeTot: false,
  modulTerbuka: [1, 2, 3, 4],
  butuhAp: false,
  pi: piSehat,
};
const status = (f: FaktaMulai) => Object.fromEntries(cekMulai(f).map((c) => [c.id, c.status]));

describe("cekMulai", () => {
  it("passes a healthy lab", () => {
    expect(gagalMulai(cekMulai(dasar))).toEqual({ keras: [], lunak: [] });
  });

  it("flags a stopped Mosquitto for Module 3 as forceable", () => {
    const f = {
      ...dasar,
      pi: { ...piSehat, layanan: { ...piSehat.layanan, mosquitto: "inactive" } },
    };
    const g = gagalMulai(cekMulai(f));
    expect(g.keras).toEqual([]);
    expect(g.lunak.map((c) => c.id)).toEqual(["layanan"]);
    expect(g.lunak[0].keadaan).toBe("inactive");
  });

  it("an offline Pi fails once and skips what it can't know", () => {
    const s = status({ ...dasar, pi: { ...piSehat, umurDetik: 600 } });
    expect(s.pi).toBe("gagal");
    expect(s.layanan).toBe("lewat");
  });

  it("no enrolled Pi counts as offline", () => {
    expect(status({ ...dasar, pi: null }).pi).toBe("gagal");
  });

  it("Module 1 needs no Pi", () => {
    const s = status({ ...dasar, modul: 1, pi: null });
    expect(s.pi).toBe("lewat");
    expect(s.layanan).toBe("lewat");
    expect(s.hotspot).toBeUndefined();
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

  it("Module 4: hotspot off fails unless it is queued with the start", () => {
    const off = { ...dasar, modul: 4, pi: { ...piSehat, modeJaringan: "ethernet-router" } };
    expect(status(off).hotspot).toBe("gagal");
    const q = cekMulai({ ...off, butuhAp: true }).find((c) => c.id === "hotspot");
    expect(q).toMatchObject({ status: "ok", diantre: true });
  });
});
