import { describe, expect, it } from "vitest";
import { isiGaris, tetangga, titikLangkah } from "../langkah-garis";
import type { StepId } from "../../components/module/useLangkah";

/**
 * The module page's line stepper (Phase 21, f1): each step's dot and how far
 * the line is filled.
 */

const SESI: StepId[] = ["modul", "brief", "tp", "setup", "code", "live"];

describe("titikLangkah", () => {
  it("marks finished, waiting, current and locked steps in a session", () => {
    const selesai = new Set<StepId>(["modul", "brief", "setup"]);
    const terbuka = new Set<StepId>(["modul", "brief", "tp", "setup", "code"]);
    expect(
      titikLangkah(SESI, "code", {
        selesai: (s) => selesai.has(s),
        terbuka: (s) => terbuka.has(s),
        tunggu: (s) => s === "tp",
      }),
    ).toEqual(["selesai", "selesai", "tunggu", "selesai", "kini", "kunci"]);
  });

  it("never lets a waiting TP lock the step after it", () => {
    const selesai = new Set<StepId>(["modul", "brief"]);
    const terbuka = new Set<StepId>(["modul", "brief", "tp", "setup"]);
    const t = titikLangkah(SESI, "brief", {
      selesai: (s) => selesai.has(s),
      terbuka: (s) => terbuka.has(s),
      tunggu: (s) => s === "tp",
    });
    expect(t[2]).toBe("tunggu");
    expect(t[3]).toBe("buka");
  });

  it("leaves every browse step open", () => {
    expect(
      titikLangkah(["modul", "brief", "praktikum"], "brief", {
        selesai: () => false,
        terbuka: () => true,
        tunggu: () => false,
      }),
    ).toEqual(["buka", "kini", "buka"]);
  });
});

describe("isiGaris", () => {
  it("fills up to the current dot past the finished ones", () => {
    expect(isiGaris(["selesai", "selesai", "tunggu", "selesai", "kini", "kunci"])).toBeCloseTo(
      4 / 5,
    );
  });

  it("is empty on the first step with nothing finished", () => {
    expect(isiGaris(["kini", "buka", "buka"])).toBe(0);
  });

  it("reaches the current dot when it is past the finished ones", () => {
    expect(isiGaris(["selesai", "buka", "kini", "buka"])).toBeCloseTo(2 / 3);
  });

  it("reaches the step after the last finished one when that is further", () => {
    expect(isiGaris(["kini", "selesai", "selesai", "buka", "buka"])).toBeCloseTo(3 / 4);
  });

  it("is empty for a single step", () => {
    expect(isiGaris(["kini"])).toBe(0);
  });
});

describe("tetangga", () => {
  const PRA: StepId[] = ["modul", "brief", "tp", "praktikum"];
  const tpTunggu = (s: StepId) => s === "tp";

  it("gives the steps either side when nothing is passed over", () => {
    expect(tetangga(SESI, "setup", () => false)).toEqual({ prev: "tp", next: "code" });
  });

  it("names the step Next really opens when a waiting TP is passed over", () => {
    expect(tetangga(PRA, "brief", tpTunggu)).toEqual({ prev: "modul", next: "praktikum" });
  });

  it("names the step Prev really opens when a waiting TP is passed over", () => {
    expect(tetangga(PRA, "praktikum", tpTunggu)).toEqual({ prev: "brief", next: null });
  });

  it("has no Prev on the first step and no Next on the last", () => {
    expect(tetangga(SESI, "modul", () => false).prev).toBeNull();
    expect(tetangga(SESI, "live", () => false).next).toBeNull();
  });
});
