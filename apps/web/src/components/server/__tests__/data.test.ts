import { describe, expect, it } from "vitest";
import { rinciUsang } from "../data";
import { S } from "../strings";

const unit = S.id.unit;
const hb = (pada: string, layanan: Record<string, string> | null) => ({
  pada,
  jamSelaras: true,
  modeJaringan: null,
  layanan,
});
const laporan = [
  { unit: "iris-modul2-ws.service", keadaan: "aktif" },
  { unit: "mosquitto.service", keadaan: "aktif" },
  { unit: "modul4.service", keadaan: "berhenti" },
];
const PADA = "2026-10-05T12:00:00.000Z";
const NANTI = "2026-10-05T12:00:15.000Z";

describe("rinciUsang", () => {
  it("asks again when a newer heartbeat disagrees on a service", () => {
    expect(
      rinciUsang(hb(NANTI, { "modul2-ws": "aktif", modul4: "aktif" }), laporan, PADA, unit),
    ).toBe(true);
    expect(rinciUsang(hb(NANTI, { mosquitto: "galat" }), laporan, PADA, unit)).toBe(true);
  });

  it("stays put when the newer heartbeat agrees", () => {
    expect(
      rinciUsang(
        hb(NANTI, { "modul2-ws": "aktif", mosquitto: "aktif", modul4: "berhenti" }),
        laporan,
        PADA,
        unit,
      ),
    ).toBe(false);
  });

  it("ignores a heartbeat older than the report, so a fresh report never asks twice", () => {
    expect(rinciUsang(hb(PADA, { modul4: "aktif" }), laporan, NANTI, unit)).toBe(false);
  });

  it("ignores empty states, unknown services and a missing heartbeat", () => {
    expect(rinciUsang(hb(NANTI, { modul4: "", lain: "galat" }), laporan, PADA, unit)).toBe(false);
    expect(rinciUsang(hb(NANTI, null), laporan, PADA, unit)).toBe(false);
    expect(rinciUsang(null, laporan, PADA, unit)).toBe(false);
  });
});
