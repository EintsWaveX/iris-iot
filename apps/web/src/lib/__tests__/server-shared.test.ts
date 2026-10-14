import { describe, expect, it } from "vitest";
import {
  bacaHasilSiap,
  bacaKondisi,
  jamServer,
  JAM_TOLERANSI_DETIK,
  modulCek,
  hotspotMenyala,
  LAYANAN_URUT,
  modulSiapValid,
  urutkanLayanan,
  bacaPasang,
  LANGKAH_PASANG,
  posisiPasang,
  pengelolaPaket,
  catatanBatal,
  CATATAN_BATAL,
  tanpaKeluaran,
  bacaPulih,
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

describe("posisiPasang", () => {
  const p = (tahap: string, ubah: Record<string, unknown> = {}) =>
    bacaPasang({ tahap, mulai: "2026-10-08T08:00:00Z", pada: "2026-10-08T08:05:00Z", ...ubah });

  it("waits on the Pi before any report", () => {
    expect(posisiPasang(null, null, null).langkah).toBe(0);
  });

  it("follows the reported step", () => {
    expect(posisiPasang(p("mulai"), null, null).langkah).toBe(1);
    expect(posisiPasang(p("pasang"), null, null).langkah).toBe(2);
    expect(posisiPasang(p("daftar"), null, null).langkah).toBe(3);
  });

  it("skips the install rows for a Pi that already has an agent", () => {
    expect(posisiPasang(p("mulai", { ulang: true }), null, null)).toMatchObject({
      langkah: 3,
      lewati: true,
    });
  });

  it("carries the installer's failure", () => {
    expect(posisiPasang(p("pasang", { gagal: "provisioning berhenti" }), null, null).gagal).toBe(
      "provisioning berhenti",
    );
  });

  it("counts only an enrolment and heartbeat after this install began", () => {
    const old = "2026-10-07T08:00:00Z";
    expect(posisiPasang(p("daftar"), old, "2026-10-08T08:06:00Z").langkah).toBe(3);
    expect(posisiPasang(p("daftar"), "2026-10-08T08:06:00Z", null).langkah).toBe(4);
    expect(posisiPasang(p("daftar"), "2026-10-08T08:06:00Z", "2026-10-08T08:07:00Z").langkah).toBe(
      LANGKAH_PASANG,
    );
  });

  it("ignores an old enrolment while waiting on a new command", () => {
    const dibuat = Date.parse("2026-10-08T09:00:00Z");
    expect(posisiPasang(null, "2026-10-08T08:06:00Z", "2026-10-08T08:59:00Z", dibuat).langkah).toBe(
      0,
    );
    expect(posisiPasang(null, "2026-10-08T08:06:00Z", "2026-10-08T08:59:00Z").langkah).toBe(
      LANGKAH_PASANG,
    );
  });

  it("rejects a malformed record", () => {
    expect(bacaPasang({ tahap: "x", mulai: "a", pada: "b" })).toBeNull();
    expect(bacaPasang(null)).toBeNull();
  });
});

describe("modulCek", () => {
  it("puts each module's own checks on its card", () => {
    expect(modulCek("iris-modul2-ws.service")).toBe("2");
    expect(modulCek("mosquitto")).toBe("3");
    expect(modulCek("modul4.service")).toBe("4");
    expect(modulCek("Modul-4")).toBe("4");
  });

  it("keeps the checks every module shares together", () => {
    for (const id of ["disk", "suhu", "chrony", "agen", "versi-agen", "bundel", "venv", "Uplink"])
      expect(modulCek(id)).toBeNull();
    expect(modulCek("Hotspot-IRIS-IOT")).toBeNull();
    expect(modulCek("dnsmasq")).toBeNull();
  });
});

describe("agent reports in English (2026-10-14)", () => {
  it("names the Pi's own package manager, apt for agents that predate infoSistem.distro", () => {
    expect(pengelolaPaket({ distro: { keluarga: "redhat", pengelola: "dnf" } })).toBe("dnf");
    expect(pengelolaPaket({ distro: { keluarga: "arch", pengelola: "pacman" } })).toBe("pacman");
    expect(pengelolaPaket({})).toBe("apt");
    expect(pengelolaPaket(null)).toBe("apt");
    expect(pengelolaPaket({ distro: { pengelola: "rm -rf" } })).toBe("apt");
  });

  it("reads a cancelled command by the new English note and by the old Indonesian one", () => {
    expect(catatanBatal(CATATAN_BATAL)).toBe(true);
    expect(catatanBatal("dibatalkan oleh asisten")).toBe(true);
    expect(catatanBatal("Exited with code 1")).toBe(false);
  });

  it("treats the agent's placeholder as an empty output in either language", () => {
    expect(tanpaKeluaran("(no output)")).toBe(true);
    expect(tanpaKeluaran("(tidak ada keluaran)")).toBe(true);
    expect(tanpaKeluaran("  ")).toBe(true);
    expect(tanpaKeluaran(null)).toBe(true);
    expect(tanpaKeluaran("-- Journal begins --")).toBe(false);
  });
});

describe("bacaPulih", () => {
  it("reads the self-repair report and drops what it cannot trust", () => {
    const info = {
      pulih: { pada: 1760000000, diperbaiki: ["chronyd.service started", 7], gagal: "x" },
    };
    expect(bacaPulih(info)).toEqual({
      pada: 1760000000,
      diperbaiki: ["chronyd.service started"],
      gagal: [],
    });
    expect(bacaPulih({})).toBeNull();
    expect(bacaPulih(null)).toBeNull();
  });
});

describe("jamServer", () => {
  const k = (o: Record<string, unknown>) => bacaKondisi(o);

  it("trusts the site's measure over chrony serving its own clock (seen live: 58 s, 0 ms)", () => {
    expect(jamServer(k({ jamSelisihMs: 0, selisihDetik: 58 }))).toEqual({
      ms: 58_000,
      meleset: true,
    });
    expect(jamServer(k({ jamSelisihMs: 0, selisihDetik: -7 }))).toEqual({
      ms: -7_000,
      meleset: true,
    });
  });

  it("lets a heartbeat's trip pass", () => {
    expect(jamServer(k({ selisihDetik: JAM_TOLERANSI_DETIK - 1 })).meleset).toBe(false);
    expect(jamServer(k({ selisihDetik: JAM_TOLERANSI_DETIK })).meleset).toBe(true);
  });

  it("falls back to chrony's offset, off only from a minute", () => {
    expect(jamServer(k({ jamSelisihMs: -3.1 }))).toEqual({ ms: -3.1, meleset: false });
    expect(jamServer(k({ jamSelisihMs: 61_000 })).meleset).toBe(true);
    expect(jamServer(null)).toEqual({ ms: null, meleset: false });
  });
});
