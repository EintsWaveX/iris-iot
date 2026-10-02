import { describe, expect, it } from "vitest";
import {
  bacaHasilSiap,
  hotspotMenyala,
  LAYANAN_URUT,
  modulSiapValid,
  urutkanLayanan,
} from "../server-shared";
import { aksiValid, LAYANAN_DIKENAL } from "../server-lib";

describe("urutkanLayanan", () => {
  it("puts the practicum services in the fixed order whatever order jsonb returns", () => {
    const dariJsonb = { modul4: "berhenti", "modul2-ws": "aktif", mosquitto: "aktif" };
    expect(urutkanLayanan(dariJsonb).map(([k]) => k)).toEqual(["modul2-ws", "mosquitto", "modul4"]);
  });

  it("keeps unknown services, after the known ones, alphabetically", () => {
    const x = { zeta: "aktif", modul4: "aktif", alpha: "aktif", mosquitto: "galat" };
    expect(urutkanLayanan(x).map(([k]) => k)).toEqual(["mosquitto", "modul4", "alpha", "zeta"]);
  });

  it("keeps each service's status with it", () => {
    expect(urutkanLayanan({ modul4: "galat", mosquitto: "aktif" })).toEqual([
      ["mosquitto", "aktif"],
      ["modul4", "galat"],
    ]);
  });

  it("treats a missing snapshot as no services", () => {
    expect(urutkanLayanan(null)).toEqual([]);
    expect(urutkanLayanan(undefined)).toEqual([]);
  });

  it("is the same list the API validates layanan.* against", () => {
    expect(LAYANAN_DIKENAL).toEqual(LAYANAN_URUT);
  });
});

describe("hotspotMenyala", () => {
  it("reads both hotspot modes the agent sends as on", () => {
    expect(hotspotMenyala("ap-mandiri")).toBe(true);
    expect(hotspotMenyala("ap+uplink")).toBe(true);
  });

  it("still reads an older agent's plain ap as on", () => {
    expect(hotspotMenyala("ap")).toBe(true);
  });

  it("reads the router mode and unknown values as off", () => {
    expect(hotspotMenyala("ethernet-router")).toBe(false);
    expect(hotspotMenyala("apple")).toBe(false);
    expect(hotspotMenyala(null)).toBe(false);
    expect(hotspotMenyala(undefined)).toBe(false);
  });
});

describe("diag.siap allowlist", () => {
  it("is a queueable action", () => {
    expect(aksiValid("diag.siap")).toBe(true);
  });

  it("accepts only the modules the agent accepts", () => {
    for (const m of ["", "2", "3", "4"]) expect(modulSiapValid(m)).toBe(true);
    for (const m of ["1", "5", "04", " 4", "4;reboot", 4, null]) {
      expect(modulSiapValid(m)).toBe(false);
    }
  });
});

describe("bacaHasilSiap", () => {
  const doc = {
    versi: 1,
    modul: "4",
    waktu: "2026-10-02T10:00:00+07:00",
    lulus: false,
    gagal: 1,
    cek: [
      { id: "layanan", status: "ok", judul: "modul4 berjalan", perbaikan: "" },
      {
        id: "chrony",
        status: "gagal",
        judul: "Jam belum selaras",
        perbaikan: "sudo chronyc makestep",
      },
      { id: "layanan", status: "info", judul: "Agen 2.4.0", perbaikan: "" },
    ],
  };

  it("reads the preflight JSON, keeping repeated ids", () => {
    const h = bacaHasilSiap(JSON.stringify(doc));
    expect(h?.modul).toBe("4");
    expect(h?.lulus).toBe(false);
    expect(h?.gagal).toBe(1);
    expect(h?.cek.map((c) => c.status)).toEqual(["ok", "gagal", "info"]);
    expect(h?.cek[1].perbaikan).toBe("sudo chronyc makestep");
  });

  it("finds the document inside surrounding output", () => {
    const h = bacaHasilSiap(`warning: something\n${JSON.stringify(doc)}\n`);
    expect(h?.cek).toHaveLength(3);
  });

  it("never reports a pass while a check failed", () => {
    const h = bacaHasilSiap(JSON.stringify({ ...doc, lulus: true }));
    expect(h?.lulus).toBe(false);
  });

  it("drops malformed checks instead of showing them half-read", () => {
    const h = bacaHasilSiap(
      JSON.stringify({ lulus: true, cek: [{ status: "weird", judul: "x" }, { status: "ok" }, 3] }),
    );
    expect(h?.cek).toEqual([]);
    expect(h?.lulus).toBe(true);
  });

  it("returns null for output that is not the document", () => {
    expect(bacaHasilSiap(null)).toBeNull();
    expect(bacaHasilSiap("aksi tidak dikenal: 'diag.siap'")).toBeNull();
    expect(bacaHasilSiap("{not json}")).toBeNull();
    expect(bacaHasilSiap('{"lulus":true}')).toBeNull();
  });
});
