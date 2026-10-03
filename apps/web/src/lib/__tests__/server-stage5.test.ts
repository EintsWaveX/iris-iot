import { describe, expect, it } from "vitest";
import {
  AGEN_PROTOKOL_TERBARU,
  bacaBundel,
  bacaKondisi,
  bacaRinci,
  barisPembaruan,
  journalArgValid,
  saringKondisi,
} from "../server-shared";
import { AKSI_PERINTAH } from "../server-lib";

describe("Stage 5 agent actions", () => {
  it("allows the Full view reads and the info refresh", () => {
    for (const a of ["diag.rinci", "diag.journal", "info.segarkan"]) {
      expect(AKSI_PERINTAH as readonly string[]).toContain(a);
    }
  });

  it("checks diag.journal arguments against the fixed lists", () => {
    expect(journalArgValid({})).toBe(true);
    expect(journalArgValid({ unit: "modul4", tingkat: "galat" })).toBe(true);
    expect(journalArgValid({ unit: "kernel" })).toBe(true);
    expect(journalArgValid({ unit: "ssh" })).toBe(false);
    expect(journalArgValid({ tingkat: "debug" })).toBe(false);
    expect(journalArgValid({ unit: "modul4; reboot" })).toBe(false);
  });
});

describe("kondisi", () => {
  it("keeps known keys with the right types and drops the rest", () => {
    const k = saringKondisi({
      inti: 4,
      beban: [0.42, 0.51, 0.48],
      memori: [1600, 3800],
      swap: [0, 1024],
      disk: ["15", 29],
      jaringan: { antarmuka: "eth0", masuk: 31000, keluar: 7000 },
      jamSelisihMs: -3.1,
      rahasia: "x",
    });
    expect(k).toEqual({
      inti: 4,
      beban: [0.42, 0.51, 0.48],
      memori: [1600, 3800],
      swap: [0, 1024],
      jaringan: { antarmuka: "eth0", masuk: 31000, keluar: 7000 },
      jamSelisihMs: -3.1,
    });
  });

  it("is null for junk", () => {
    expect(saringKondisi("x")).toBeNull();
    expect(saringKondisi({ beban: ["a"] })).toBeNull();
    expect(bacaKondisi(null)).toBeNull();
  });
});

const RINCI = JSON.stringify({
  skema: 1,
  waktu: "2026-10-03T01:42:57+00:00",
  inti: [1, 1, 8, null],
  beban: [0.1, 0.06, 0.03],
  frekuensiMhz: 416,
  memori: [1017470976, 6149189632],
  swap: [0, 3074592768],
  mount: [{ m: "/", pakai: 7608500224, total: 15020589056 }, { m: "/bad" }],
  antarmuka: [
    {
      nama: "wlan0",
      alamat: ["10.48.147.102/24"],
      masuk: 120,
      keluar: 40,
      keadaan: "up",
      uplink: true,
    },
  ],
  hotspot: { menyala: false, klien: null },
  ntp: { sumber: "ntp.ubuntu.com", stratum: 3, selisihMs: -6.1, tersinkron: true },
  dns: { server: "10.48.147.94", ms: 54 },
  layanan: [
    { unit: "modul4.service", keadaan: "berhenti", sejak: "", mulaiUlang: 0, memori: null },
  ],
  proses: [{ pid: 812, cpu: 6.1, memori: 38912000, nama: "python3 agent.py" }],
  paket: { kernel: "6.6.98", os: "Orange Pi 1.1.0", angka: 3 },
  galatJurnal24j: 104,
  konfigAp: [
    ["SSID", "IRIS-IOT", false],
    ["PSK", "bocor", true],
  ],
  timer: [{ unit: "logrotate.timer", berikut: "Sun 2026-10-04 00:10:37" }],
});

describe("bacaRinci", () => {
  it("reads the document and drops what it cannot trust", () => {
    const r = bacaRinci(RINCI)!;
    expect(r.inti).toEqual([1, 1, 8, null]);
    expect(r.mount).toHaveLength(1);
    expect(r.antarmuka[0].uplink).toBe(true);
    expect(r.ntp.selisihMs).toBe(-6.1);
    expect(r.paket).toEqual({ kernel: "6.6.98", os: "Orange Pi 1.1.0" });
    expect(r.galatJurnal24j).toBe(104);
  });

  it("never shows a secret value even if the agent sent one", () => {
    const r = bacaRinci(RINCI)!;
    expect(r.konfigAp).toEqual([
      ["SSID", "IRIS-IOT", false],
      ["PSK", "", true],
    ]);
  });

  it("is null for an agent error or another document", () => {
    expect(bacaRinci("aksi tidak dikenal: 'diag.rinci' {}")).toBeNull();
    expect(bacaRinci('{"versi":1,"cek":[]}')).toBeNull();
    expect(bacaRinci(null)).toBeNull();
  });
});

describe("Updates card", () => {
  it("splits the bundle SHAs", () => {
    expect(bacaBundel("bdb8ef1 / acea86e (dirty)")).toEqual({ aso: "bdb8ef1", iot: "acea86e" });
    expect(bacaBundel(null)).toEqual({ aso: null, iot: null });
  });

  it("compares the agent protocol, the iris-iot SHA and apt", () => {
    const rows = barisPembaruan(
      { protokol: AGEN_PROTOKOL_TERBARU, apt: { bisa: 8, keamanan: 2 } },
      "bdb8ef1 / acea86e",
      "acea86e0123456789",
    );
    expect(rows.map((r) => [r.k, r.status])).toEqual([
      ["agen", "terbaru"],
      ["bundel", "terbaru"],
      ["modul4", "terbaru"],
      ["apt", "perlu"],
    ]);
    expect(rows[3].keamanan).toBe(2);
  });

  it("flags an old agent and a bundle behind the site", () => {
    const rows = barisPembaruan({ protokol: 1 }, "a / b123456", "c999999");
    expect(rows[0].status).toBe("perlu");
    expect(rows[2].status).toBe("beda");
    expect(rows[3].status).toBe("tidak_tahu");
  });

  it("treats an agent with no protocol field as needing an update", () => {
    expect(barisPembaruan({}, null, null)[0].status).toBe("perlu");
  });
});
