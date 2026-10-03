/**
 * Phase 9 Stage 8: Mandarin is complete. dict() already makes the zh half
 * required at type level; this checks what types can't:
 *
 * - a zh string still equal to its English one (left untranslated), unless
 *   every word in it is a name or a term the app keeps in English (GLOSSARY);
 * - an em or en dash in any language (the copy rule).
 *
 * It imports every interface module so each dict() table registers itself
 * (lib/app.ts dictTables), then walks id, en and zh side by side. Functions
 * are called with sample arguments; the ones that need a real value throw
 * and are skipped. A module that can't load under Node (astro: imports) is
 * skipped too; the type check still covers its tables.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { dictTables } from "../app";

const ROOT = join(__dirname, "..", "..");

/** Words that stay as they are in Mandarin: names, protocols, hardware,
 *  codes and the few English terms the zh copy keeps on purpose. */
const GLOSSARY = new Set(
  [
    "Live",
    "MQTT",
    "BLE",
    "LoRa",
    "P2P",
    "LoRaWAN",
    "WebSocket",
    "Mosquitto",
    "Orange",
    "Pi",
    "ESP32",
    "ESP32-S3",
    "Pico",
    "W",
    "NIM",
    "SeeLabs",
    "Wi-Fi",
    "WiFi",
    "IRIS",
    "IRIS-IOT",
    "IoT",
    "CSV",
    "XLSX",
    "PDF",
    "RSSI",
    "SNR",
    "dBm",
    "dB",
    "ms",
    "MB",
    "GB",
    "KB",
    "MHz",
    "GHz",
    "Beacon",
    "Hunter",
    "blank",
    "Blank",
    "Ngajar",
    "FIT",
    "Angkt",
    "KLP",
    "LDM",
    "HD",
    "GATT",
    "JSON",
    "TCP",
    "IP",
    "HTTP",
    "URL",
    "SSH",
    "Canva",
    "Wokwi",
    "Tinkercad",
    "Arduino",
    "IDE",
    "Thonny",
    "DEV",
    "BETA",
    "Bahasa",
    "Indonesia",
    "English",
    "Notify",
    "QoS",
    "topic",
    "modul3",
    "sync",
    "word",
    "Central",
    "Peripheral",
    "Subscriber",
    "Publisher",
    "Broker",
    "broker",
    "USB",
    "CDC",
    "On",
    "Boot",
    "Enabled",
    "x11vnc",
    "ttyd",
    "LAN",
    "AP",
    "NTP",
    "DNS",
    "CPU",
    "RAM",
    "OK",
    "IRIS-IoT",
    "Ctrl",
    "Alt",
    "Shift",
    "Enter",
    "Esc",
    "Tab",
    "TP",
    "TA",
    "D",
    "L1",
    "L2",
    "Δ",
    "UTC",
    "WIB",
    "NUE",
    "Low",
    "Detail",
    "High",
    "Normal",
    "Pencipta",
    "Kas",
    "main.py",
    "Sukarela",
    "NaN",
    "iris-agent",
  ].map((w) => w.toLowerCase()),
);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "__tests__" ? [] : files(p);
    return /\.tsx?$/.test(n) && !n.endsWith(".d.ts") ? [p] : [];
  });
}

const DASH = /[–—]/;
const SAMPLES: unknown[][] = [
  [],
  [3],
  [3, 5],
  [3, 5, 7],
  ["DES"],
  ["DES", "NAT"],
  ["DES", 3, "NAT"],
];

/** Every string a value can produce: strings, arrays, objects, and functions
 *  called with sample arguments of the same shape in each language. */
function leaves(v: unknown, path: string, out: Map<string, string>, depth = 0) {
  if (depth > 6 || v == null) return;
  if (typeof v === "string") out.set(path, v);
  else if (typeof v === "function") {
    for (const args of SAMPLES) {
      try {
        const r = (v as (...a: unknown[]) => unknown)(...args);
        if (typeof r === "string" || Array.isArray(r))
          leaves(r, `${path}(${args.length})`, out, depth + 1);
      } catch {
        /* needs a real value */
      }
    }
  } else if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${path}[${i}]`, out, depth + 1));
  else if (typeof v === "object" && !("$$typeof" in (v as object)))
    for (const [k, x] of Object.entries(v as object)) leaves(x, `${path}.${k}`, out, depth + 1);
}

/** True when an English string has a word Mandarin should have translated. */
function needsTranslation(en: string): boolean {
  const words = en
    .replace(/\$\{[^}]*\}/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .match(/[A-Za-z][A-Za-z0-9.'-]*/g);
  if (!words) return false;
  return words.some((w) => w.length >= 2 && !GLOSSARY.has(w.toLowerCase().replace(/[.']+$/, "")));
}

describe("Mandarin copy", async () => {
  const loaded: string[] = [];
  for (const f of [...files(join(ROOT, "components")), ...files(join(ROOT, "lib"))]) {
    try {
      await import(pathToFileURL(f).href);
      loaded.push(relative(ROOT, f));
    } catch (e) {
      /* astro: or browser-only import: covered by the type check */
      if (process.env.ZH_DEBUG) console.warn("skip", relative(ROOT, f), String(e).slice(0, 120));
    }
  }

  it("loads the interface modules and their tables", () => {
    expect(loaded.length).toBeGreaterThan(130);
    expect(dictTables().length).toBeGreaterThan(45);
  });

  const tables = dictTables();
  const untranslated: string[] = [];
  const dashes: string[] = [];
  tables.forEach((t, i) => {
    const id = new Map<string, string>();
    const en = new Map<string, string>();
    const zh = new Map<string, string>();
    leaves(t.id, "", id);
    leaves(t.en, "", en);
    leaves(t.zh, "", zh);
    const label = `table ${i} ${[...en.values()][0]?.slice(0, 30) ?? ""}`;
    for (const [m, name] of [
      [id, "id"],
      [en, "en"],
      [zh, "zh"],
    ] as const)
      for (const [p, s] of m) if (DASH.test(s)) dashes.push(`${label} ${name}${p}: ${s}`);
    for (const [p, e] of en) {
      const z = zh.get(p);
      if (z !== undefined && z === e && e !== id.get(p) && needsTranslation(e))
        untranslated.push(`${label}${p}: ${e}`);
      else if (z !== undefined && z === e && needsTranslation(e) && /[a-z]{3,} [a-z]{3,}/.test(e))
        untranslated.push(`${label}${p}: ${e}`);
    }
  });

  it("has no Mandarin string left in English", () => {
    expect(untranslated).toEqual([]);
  });

  it("has no em or en dashes in any language", () => {
    expect(dashes).toEqual([]);
  });
});
