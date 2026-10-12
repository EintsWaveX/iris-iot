/**
 * The boards a module's pins can be set for (2026-10-12): every ESP32 the
 * lab uses and the Pico W. Browser-safe: the pin settings dialog, every Pin
 * dan Skema card and the API's check (pin-kode.ts) share it.
 *
 * Each board lists its two pin headers as printed on the real board, top to
 * bottom with the USB port down, and what each GPIO can do. A pin a module
 * needs is offered only where it can work:
 *
 * - never the SPI flash pins (ESP32 6..11, S2/S3 26..32, C3 11..17, C6
 *   24..30), the serial monitor's TX and RX, or the Pico W's radio pins;
 * - an output ("io") never on an input only pin (ESP32 34..39, S2 46);
 * - an analog input ("adc") only on ADC1, since ADC2 stops working while
 *   Wi-Fi is on, and on the Pico W only GP26..GP28;
 * - one GPIO per connection on a board; power and ground may be shared.
 *
 * Strapping pins stay usable, with a warning (they decide how the chip
 * boots, so a part pulling them at power on can stop the upload).
 */

export type PapanId = "esp32" | "esp32s2" | "esp32s3" | "esp32c3" | "esp32c6" | "picow";

export const PAPAN_ID: readonly PapanId[] = [
  "esp32",
  "esp32s2",
  "esp32s3",
  "esp32c3",
  "esp32c6",
  "picow",
];

/** What a connection needs from the pin it lands on */
export type Arah = "in" | "io" | "adc" | "3v3" | "5v" | "gnd";

/** One pad on a header: a GPIO number, or a power or other pin's name */
export type Pad = number | string;

export interface Papan {
  id: PapanId;
  nama: string;
  /** The chip family's GPIO prefix in a pin label */
  awalan: "GPIO" | "GP";
  /** The two headers, top to bottom */
  kiri: Pad[];
  kanan: Pad[];
  /** GPIOs that can't be offered at all, with why */
  tolak: Record<number, "flash" | "uart" | "radio" | "usb">;
  /** Input only GPIOs */
  masukSaja: number[];
  /** ADC1 (or the Pico's ADC) GPIOs */
  adc: number[];
  /** Strapping pins */
  strap: number[];
  /** The power pads by voltage */
  v3: string[];
  v5: string[];
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const tolakDari = (
  flash: number[],
  uart: number[],
  lain: Record<number, "radio" | "usb"> = {},
): Papan["tolak"] => ({
  ...Object.fromEntries(flash.map((n) => [n, "flash" as const])),
  ...Object.fromEntries(uart.map((n) => [n, "uart" as const])),
  ...lain,
});

export const PAPAN: Record<PapanId, Papan> = {
  esp32: {
    id: "esp32",
    nama: "ESP32 DevKitC",
    awalan: "GPIO",
    kiri: ["3V3", "EN", 36, 39, 34, 35, 32, 33, 25, 26, 27, 14, 12, "GND", 13, 9, 10, 11, "5V"],
    kanan: ["GND", 23, 22, 1, 3, "GND", 21, "GND", 19, 18, 5, 17, 16, 4, 0, 2, 15, 8, 7, 6],
    tolak: tolakDari(range(6, 11), [1, 3]),
    masukSaja: [34, 35, 36, 39],
    adc: [32, 33, 34, 35, 36, 39],
    strap: [0, 2, 5, 12, 15],
    v3: ["3V3"],
    v5: ["5V"],
  },
  esp32s2: {
    id: "esp32s2",
    nama: "ESP32-S2 Saola-1",
    awalan: "GPIO",
    kiri: [
      "3V3",
      "3V3",
      "RST",
      4,
      5,
      6,
      7,
      15,
      16,
      17,
      18,
      8,
      3,
      46,
      9,
      10,
      11,
      12,
      13,
      14,
      "5V",
      "GND",
    ],
    kanan: [
      "GND",
      43,
      44,
      1,
      2,
      42,
      41,
      40,
      39,
      38,
      37,
      36,
      35,
      0,
      45,
      34,
      33,
      21,
      20,
      19,
      26,
      "GND",
    ],
    tolak: tolakDari(range(26, 32), [43, 44], { 19: "usb", 20: "usb" }),
    masukSaja: [46],
    adc: range(1, 10),
    strap: [0, 45, 46],
    v3: ["3V3"],
    v5: ["5V"],
  },
  esp32s3: {
    id: "esp32s3",
    nama: "ESP32-S3 DevKitC-1",
    awalan: "GPIO",
    kiri: [
      "3V3",
      "3V3",
      "RST",
      4,
      5,
      6,
      7,
      15,
      16,
      17,
      18,
      8,
      3,
      46,
      9,
      10,
      11,
      12,
      13,
      14,
      "5V",
      "GND",
    ],
    kanan: [
      "GND",
      43,
      44,
      1,
      2,
      42,
      41,
      40,
      39,
      38,
      37,
      36,
      35,
      0,
      45,
      48,
      47,
      21,
      20,
      19,
      "GND",
      "GND",
    ],
    // 35..37 carry the octal PSRAM on the N8R8 the lab uses.
    tolak: tolakDari([...range(26, 32), 35, 36, 37], [43, 44], { 19: "usb", 20: "usb" }),
    masukSaja: [],
    adc: range(1, 10),
    strap: [0, 3, 45, 46],
    v3: ["3V3"],
    v5: ["5V"],
  },
  esp32c3: {
    id: "esp32c3",
    nama: "ESP32-C3 DevKitM-1",
    awalan: "GPIO",
    kiri: ["GND", "3V3", "3V3", 2, 3, "GND", "RST", "GND", 0, 1, 10, "GND", "5V", "5V", "GND"],
    kanan: ["GND", 21, 20, "GND", 9, 8, "GND", 7, 6, 5, 4, "GND", 18, 19, "GND"],
    tolak: tolakDari(range(11, 17), [20, 21], { 18: "usb", 19: "usb" }),
    masukSaja: [],
    adc: range(0, 4),
    strap: [2, 8, 9],
    v3: ["3V3"],
    v5: ["5V"],
  },
  esp32c6: {
    id: "esp32c6",
    nama: "ESP32-C6 DevKitC-1",
    awalan: "GPIO",
    kiri: ["3V3", "RST", 4, 5, 6, 7, 0, 1, 8, 10, 11, 2, 3, "5V", "GND", "NC"],
    kanan: ["GND", 16, 17, 15, 23, 22, 21, 20, 19, 18, 9, "GND", 13, 12, "GND", "NC"],
    tolak: tolakDari(range(24, 30), [16, 17], { 12: "usb", 13: "usb" }),
    masukSaja: [],
    adc: range(0, 6),
    strap: [4, 5, 8, 9, 15],
    v3: ["3V3"],
    v5: ["5V"],
  },
  picow: {
    id: "picow",
    nama: "Raspberry Pi Pico W",
    awalan: "GP",
    kiri: [0, 1, "GND", 2, 3, 4, 5, "GND", 6, 7, 8, 9, "GND", 10, 11, 12, 13, "GND", 14, 15],
    kanan: [
      "VBUS",
      "VSYS",
      "GND",
      "3V3_EN",
      "3V3(OUT)",
      "ADC_VREF",
      28,
      "GND",
      27,
      26,
      "RUN",
      22,
      "GND",
      21,
      20,
      19,
      18,
      "GND",
      17,
      16,
    ],
    tolak: { 23: "radio", 24: "radio", 25: "radio", 29: "radio" },
    masukSaja: [],
    adc: [26, 27, 28],
    strap: [],
    v3: ["3V3(OUT)"],
    v5: ["VBUS", "VSYS"],
  },
};

export function isPapanId(v: unknown): v is PapanId {
  return typeof v === "string" && (PAPAN_ID as readonly string[]).includes(v);
}

/** The pin's label in a pin table: "GPIO16", "GP15", "GP26 (ADC0)", "3V3" */
export function labelPad(papan: Papan, pad: Pad): string {
  if (typeof pad === "string") return pad;
  if (papan.id === "picow" && pad >= 26 && pad <= 28) return `GP${pad} (ADC${pad - 26})`;
  return `${papan.awalan}${pad}`;
}

/** The short name drawn on the pad itself */
export function namaPad(pad: Pad): string {
  return typeof pad === "number" ? String(pad) : pad;
}

/** The pad a table label points at on this board, if it has one */
export function padDariLabel(papan: Papan, label: string): Pad | null {
  const m = /\bGP(?:IO)?\s*(\d{1,2})\b/i.exec(label);
  const semua = [...papan.kiri, ...papan.kanan];
  if (m) {
    const n = Number(m[1]);
    return semua.includes(n) ? n : null;
  }
  const s = label.trim().toUpperCase();
  return (semua.find((p) => typeof p === "string" && p.toUpperCase() === s) as string) ?? null;
}

/** What a table cell's current label asks of its pin, before any link */
export function arahDariLabel(label: string): Arah | null {
  const s = label.toUpperCase();
  if (s.includes("GND")) return "gnd";
  if (/3V3/.test(s)) return "3v3";
  if (/5V|VIN|VBUS|VSYS/.test(s)) return "5v";
  return null;
}

export type Alasan =
  "flash" | "uart" | "radio" | "usb" | "masuk" | "adc" | "dipakai" | "daya" | "bukan";

/** Why a pad can't take a connection that needs `arah`, or null when it can.
 *  `dipakai` holds the GPIOs other connections on the board already use. */
export function cekPad(papan: Papan, pad: Pad, arah: Arah, dipakai: Set<number>): Alasan | null {
  if (typeof pad === "string") {
    if (arah === "gnd") return pad === "GND" ? null : "bukan";
    if (arah === "3v3") return papan.v3.includes(pad) ? null : "bukan";
    if (arah === "5v") return papan.v5.includes(pad) ? null : "bukan";
    return "bukan";
  }
  if (arah === "gnd" || arah === "3v3" || arah === "5v") return "daya";
  if (!papan.kiri.includes(pad) && !papan.kanan.includes(pad)) return "bukan";
  const t = papan.tolak[pad];
  if (t) return t;
  if (arah === "io" && papan.masukSaja.includes(pad)) return "masuk";
  if (arah === "adc" && !papan.adc.includes(pad)) return "adc";
  if (dipakai.has(pad)) return "dipakai";
  return null;
}

/** Every pad that could take a connection needing `arah` (ignoring use) */
export function padBoleh(papan: Papan, arah: Arah): Pad[] {
  const kosong = new Set<number>();
  const seen = new Set<string>();
  return [...papan.kiri, ...papan.kanan].filter((p) => {
    const k = String(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return cekPad(papan, p, arah, kosong) === null;
  });
}

/** The board each module is wired on by default, one per board column pair */
export const PAPAN_BAWAAN: Record<number, PapanId[]> = {
  1: ["esp32", "esp32"],
  2: ["esp32"],
  3: ["picow"],
  4: ["esp32"],
};
