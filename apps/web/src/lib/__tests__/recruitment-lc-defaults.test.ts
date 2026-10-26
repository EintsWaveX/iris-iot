/** What Live Coding ships with: six topics, four templates, five rubric rows (EXAM-ENGINE 9.2, 9.3, 9.8). */
import { describe, expect, it } from "vitest";
import { PROTOCOLS } from "../recruitment/exam-types";
import { DEFAULT_RUBRIC_ROWS, DEFAULT_TEMPLATES, DEFAULT_TOPICS } from "../recruitment/lc-defaults";
import { buildHeader } from "../recruitment/lc-header";
import { checkSketch } from "../recruitment/lc-sketch";
import { TEMPLATE_KEYS, templateKey } from "../recruitment/lc-types";
import { TODO_END, TODO_START } from "../recruitment/lc-templates";

describe("templates", () => {
  it("has one for each key", () => {
    expect(Object.keys(DEFAULT_TEMPLATES).sort()).toEqual([...TEMPLATE_KEYS].sort());
  });

  for (const key of TEMPLATE_KEYS) {
    const code = DEFAULT_TEMPLATES[key];
    it(`${key} starts with the seat header and passes the sketch rules`, () => {
      expect(code.startsWith('#include "iris_seat.h"')).toBe(true);
      expect(checkSketch(code)).toEqual({ ok: true });
    });
    it(`${key} has one send helper, one receive callback and a marked region`, () => {
      expect(code).toMatch(/\bkirim\s*\(/);
      expect(code).toMatch(/\bonTerima\s*\(/);
      expect(code.split(TODO_START).length - 1).toBeGreaterThanOrEqual(2);
      expect(code.split(TODO_END).length - 1).toBe(code.split(TODO_START).length - 1);
      expect(code).toContain("[INFO]");
    });
  }

  it("only the Wi-Fi protocols connect to the hotspot (BLE takes none)", () => {
    expect(DEFAULT_TEMPLATES.ble).not.toContain("WiFi");
    for (const k of ["http", "ws", "mqtt"] as const)
      expect(DEFAULT_TEMPLATES[k]).toContain("WiFi.begin(IRIS_WIFI_SSID, IRIS_WIFI_PASS)");
  });

  it("uses only names the header defines", () => {
    const header = buildHeader({
      ssid: "s",
      pass: "p",
      seatId: 1,
      board: 1,
      token: "t",
      mqtt: null,
    });
    const defined = new Set([...header.matchAll(/#define (IRIS_\w+)/g)].map((m) => m[1]));
    for (const code of Object.values(DEFAULT_TEMPLATES))
      for (const m of code.matchAll(/\bIRIS_[A-Z0-9_]+/g))
        expect(defined.has(m[0]), m[0]).toBe(true);
  });

  it("maps a protocol and variant to a template", () => {
    expect(templateKey("mqtt", null)).toBe("mqtt");
    expect(templateKey("ble", null)).toBe("ble");
    expect(templateKey("httpws", "ws")).toBe("ws");
    expect(templateKey("httpws", "http")).toBe("http");
    expect(templateKey("httpws", null)).toBe("http");
  });
});

describe("topics", () => {
  it("are the six of 9.2, each fitting a protocol the exam deals", () => {
    expect(DEFAULT_TOPICS.map((t) => t.title)).toEqual([
      "Lampu Jarak Jauh",
      "Monitor Suhu Ruang",
      "Dimmer Potensiometer",
      "Alarm Pintu",
      "Penghitung Pengunjung",
      "Lampu Lalu Lintas",
    ]);
    for (const t of DEFAULT_TOPICS) {
      expect(t.fits.length).toBeGreaterThan(0);
      for (const f of t.fits) expect(PROTOCOLS).toContain(f);
      expect(t.brief.length).toBeGreaterThan(40);
      expect(t.icon).toMatch(/^[a-z-]+$/);
    }
  });

  it("every protocol is fitted by at least one topic", () => {
    for (const p of PROTOCOLS) expect(DEFAULT_TOPICS.some((t) => t.fits.includes(p))).toBe(true);
  });
});

describe("rubric", () => {
  it("is the five rows of 9.8", () => {
    expect(DEFAULT_RUBRIC_ROWS.map((r) => [r.key, r.max, r.weight])).toEqual([
      ["jalan", 4, 3],
      ["protokol", 4, 2],
      ["data", 4, 2],
      ["kode", 4, 1],
      ["jelas", 4, 2],
    ]);
  });
});
