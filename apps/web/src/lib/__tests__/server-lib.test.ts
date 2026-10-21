import { describe, it, expect } from "vitest";
import {
  batasLuringDetik,
  INTERVAL_AKTIF_SEC,
  TELEMETRI_MAX_PER_DENYUT,
  telemetriBaris,
  INTERVAL_IDLE_SEC,
  INTERVAL_MALAM_SEC,
  downsample,
  detectReboots,
  detectGaps,
  hitungKetersediaan,
  bangunTimelineLayanan,
  aksiValid,
  unitDiagValid,
  GAP_AMBANG_DETIK,
} from "../server-lib";

describe("batasLuringDetik", () => {
  const mulai = new Date("2026-09-24T02:30:00Z");

  it("allows the night interval for a beat in the quiet hours (WIB)", () => {
    // 03:00 WIB: the beat may have been told to wait 10 minutes.
    expect(batasLuringDetik(new Date("2026-09-24T03:00:00+07:00"), null)).toBeGreaterThan(
      INTERVAL_MALAM_SEC,
    );
    // 05:50 WIB and 00:14 WIB are the day's pace again.
    expect(batasLuringDetik(new Date("2026-09-24T05:50:00+07:00"), null)).toBeLessThan(
      INTERVAL_MALAM_SEC,
    );
    expect(batasLuringDetik(new Date("2026-09-24T00:14:00+07:00"), null)).toBeLessThan(
      INTERVAL_MALAM_SEC,
    );
  });

  it("allows the idle interval when no session is running", () => {
    // A flat window equal to the session pace would mark a healthy Pi offline
    // for most of every idle interval.
    const pada = new Date("2026-09-24T01:00:00Z");
    expect(batasLuringDetik(pada, null)).toBeGreaterThan(INTERVAL_IDLE_SEC);
  });

  it("uses the fast interval once a beat arrived during the running session", () => {
    const pada = new Date("2026-09-24T02:31:00Z");
    const batas = batasLuringDetik(pada, mulai);
    expect(batas).toBeGreaterThan(INTERVAL_AKTIF_SEC);
    expect(batas).toBeLessThan(batasLuringDetik(pada, null));
  });

  it("still allows the idle interval for the last beat before the session started", () => {
    // That beat was answered with the idle interval, so the next one can
    // legitimately be that far away even though a session runs now.
    const pada = new Date("2026-09-24T02:25:00Z");
    expect(batasLuringDetik(pada, mulai)).toBeGreaterThan(INTERVAL_IDLE_SEC);
  });
});

describe("P6.7 diag whitelist", () => {
  it("accepts the four new diagnostic actions", () => {
    expect(aksiValid("diag.ringkas")).toBe(true);
    expect(aksiValid("diag.log")).toBe(true);
    expect(aksiValid("diag.jaringan")).toBe(true);
    expect(aksiValid("diag.dmesg")).toBe(true);
  });

  it("rejects an unrelated string", () => {
    expect(aksiValid("diag.rm-rf")).toBe(false);
  });

  it("validates a diag.log unit name against a short allowlist pattern", () => {
    expect(unitDiagValid("mosquitto")).toBe(true);
    expect(unitDiagValid("iris-modul2-ws.service")).toBe(true);
    expect(unitDiagValid("hostapd@wlan0")).toBe(true);
    expect(unitDiagValid("../../etc/passwd")).toBe(false);
    expect(unitDiagValid("has space")).toBe(false);
    expect(unitDiagValid(123)).toBe(false);
  });
});

describe("downsample", () => {
  it("returns every row when there are fewer than the cap", () => {
    const rows = [1, 2, 3];
    expect(downsample(rows, 300)).toEqual(rows);
  });

  it("picks an evenly spaced subset that includes the first row and stays within the cap", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => i);
    const out = downsample(rows, 300);
    expect(out.length).toBe(300);
    expect(out[0]).toBe(0);
    // Strictly increasing -- no point picked out of order.
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
  });
});

describe("detectReboots", () => {
  it("flags a heartbeat whose uptime dropped below the previous one", () => {
    const rows = [
      { pada: "2026-09-24T00:00:00Z", uptimeSec: 1000 },
      { pada: "2026-09-24T00:15:00Z", uptimeSec: 1900 },
      { pada: "2026-09-24T00:30:00Z", uptimeSec: 120 }, // rebooted in between
      { pada: "2026-09-24T00:45:00Z", uptimeSec: 1020 },
    ];
    expect(detectReboots(rows)).toEqual([{ pada: "2026-09-24T00:30:00Z" }]);
  });

  it("ignores rows with a null uptime rather than false-flagging them", () => {
    const rows = [
      { pada: "2026-09-24T00:00:00Z", uptimeSec: 1000 },
      { pada: "2026-09-24T00:15:00Z", uptimeSec: null },
      { pada: "2026-09-24T00:30:00Z", uptimeSec: 500 },
    ];
    expect(detectReboots(rows)).toEqual([]);
  });
});

describe("detectGaps", () => {
  it("finds a gap longer than the threshold and reports none shorter", () => {
    const rows = [
      { pada: "2026-09-24T00:00:00Z" },
      { pada: "2026-09-24T00:00:15Z" }, // 15s, normal active cadence
      { pada: "2026-09-24T01:30:00Z" }, // ~90min silence, a real gap
    ];
    const gaps = detectGaps(rows, GAP_AMBANG_DETIK);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].dari).toBe("2026-09-24T00:00:15Z");
    expect(gaps[0].sampai).toBe("2026-09-24T01:30:00Z");
  });

  it("takes the night beat's 10 minutes in the quiet hours (WIB) as no gap", () => {
    const rows = [
      { pada: "2026-09-24T02:00:00+07:00" },
      { pada: "2026-09-24T02:10:00+07:00" }, // the night pace
      { pada: "2026-09-24T02:40:00+07:00" }, // 30 min: a real gap even at night
      { pada: "2026-09-24T09:00:00+07:00" },
      { pada: "2026-09-24T09:10:00+07:00" }, // 10 min in the day: a gap
    ];
    const gaps = detectGaps(rows, GAP_AMBANG_DETIK);
    expect(gaps.map((g) => g.dari)).toEqual([
      "2026-09-24T02:10:00+07:00",
      "2026-09-24T02:40:00+07:00",
      "2026-09-24T09:00:00+07:00",
    ]);
  });
});

describe("hitungKetersediaan", () => {
  const mulai = new Date("2026-09-24T00:00:00Z");
  const akhir = new Date("2026-09-24T01:00:00Z"); // 1h window

  it("is 0% with no heartbeats at all in the window", () => {
    expect(hitungKetersediaan([], mulai, akhir)).toBe(0);
  });

  it("is 100% with a steady beat throughout and no gaps", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      pada: new Date(mulai.getTime() + i * 2 * 60_000).toISOString(),
    }));
    expect(hitungKetersediaan(rows, mulai, akhir, 300)).toBe(100);
  });

  it("docks availability for a real mid-window gap", () => {
    const rows = [
      { pada: new Date(mulai.getTime()).toISOString() },
      { pada: new Date(mulai.getTime() + 2 * 60_000).toISOString() }, // normal cadence
      { pada: new Date(mulai.getTime() + 4 * 60_000).toISOString() },
      { pada: new Date(mulai.getTime() + 34 * 60_000).toISOString() }, // one 30min gap
      { pada: new Date(mulai.getTime() + 36 * 60_000).toISOString() },
      { pada: akhir.toISOString() },
    ];
    const pct = hitungKetersediaan(rows, mulai, akhir, 300);
    expect(pct).toBeLessThan(100);
    expect(pct).toBeGreaterThan(0);
  });
});

describe("bangunTimelineLayanan", () => {
  it("collapses consecutive identical statuses into one run per service", () => {
    const rows = [
      { pada: "2026-09-24T00:00:00Z", layanan: { mosquitto: "aktif" } },
      { pada: "2026-09-24T00:15:00Z", layanan: { mosquitto: "aktif" } },
      { pada: "2026-09-24T00:30:00Z", layanan: { mosquitto: "galat" } },
      { pada: "2026-09-24T00:45:00Z", layanan: { mosquitto: "aktif" } },
    ];
    const timeline = bangunTimelineLayanan(rows);
    expect(timeline).toEqual([
      {
        layanan: "mosquitto",
        status: "aktif",
        dari: "2026-09-24T00:00:00Z",
        sampai: "2026-09-24T00:30:00Z",
      },
      {
        layanan: "mosquitto",
        status: "galat",
        dari: "2026-09-24T00:30:00Z",
        sampai: "2026-09-24T00:45:00Z",
      },
      {
        layanan: "mosquitto",
        status: "aktif",
        dari: "2026-09-24T00:45:00Z",
        sampai: "2026-09-24T00:45:00Z",
      },
    ]);
  });

  it("returns nothing for rows with no layanan data", () => {
    expect(bangunTimelineLayanan([{ pada: "2026-09-24T00:00:00Z", layanan: null }])).toEqual([]);
  });
});

describe("telemetriBaris", () => {
  const row = (seq: number, extra: Record<string, unknown> = {}) => ({
    modul: 2,
    kelompokNomor: 1,
    seq,
    rx: "17:42:10:000",
    ...extra,
  });

  it("keeps a whole beat's worth of rows, not just the first five", () => {
    const rows = telemetriBaris(Array.from({ length: 40 }, (_, i) => row(i)));
    expect(rows).toHaveLength(40);
    expect(rows[39].seq).toBe(39);
  });

  it("caps one beat and drops malformed rows without failing the rest", () => {
    const many = Array.from({ length: TELEMETRI_MAX_PER_DENYUT + 20 }, (_, i) => row(i));
    expect(telemetriBaris(many)).toHaveLength(TELEMETRI_MAX_PER_DENYUT);
    const mixed = telemetriBaris([
      row(1),
      { modul: 1, kelompokNomor: 1, seq: 2 },
      row(3, { kelompokNomor: 11 }),
      "x",
    ]);
    expect(mixed.map((r) => r.seq)).toEqual([1]);
  });

  it("nulls fields of the wrong type", () => {
    const [r] = telemetriBaris([row(1, { delayMs: "12", rssi: -61.5, tx: 5 })]);
    expect(r.delayMs).toBeNull();
    expect(r.rssi).toBeNull();
    expect(r.tx).toBeNull();
    expect(r.rx).toBe("17:42:10:000");
  });

  it("keeps groups six to ten (Phase 9 allows ten)", () => {
    expect(telemetriBaris([row(1, { kelompokNomor: 10 })])).toHaveLength(1);
  });

  it("keeps a fractional SNR (the Hunter prints 7.5 dB)", () => {
    const [r] = telemetriBaris([row(1, { modul: 4, snr: 7.5, rssi: -70 })]);
    expect(r.snr).toBe(7.5);
    expect(r.rssi).toBe(-70);
  });

  it("keeps the reading's values and drops anything not a short-keyed number", () => {
    const [r] = telemetriBaris([
      row(1, { nilai: { suhu: 27.3, lembap: 61.2, "bad key": 1, teks: "x", besar: Infinity } }),
    ]);
    expect(r.nilai).toEqual({ suhu: 27.3, lembap: 61.2 });
    const [kosong] = telemetriBaris([row(2, { nilai: ["x"] })]);
    expect(kosong.nilai).toBeNull();
  });
});
