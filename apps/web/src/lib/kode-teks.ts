/**
 * Code inside a sentence (2026-10-18): hints and explanations name code,
 * "getService() mencari layanan lewat UUID-nya ... GROUP_ID ...", and that
 * code reads in the code editor's font. pecahKode() splits a text into
 * plain runs and code runs; KodeTeks.tsx renders them.
 *
 * Code is what sits between backticks, and what could only be code: a call
 * (`readHumidity()`), a dotted name (`LoRa.beginPacket`, `umqtt.simple`),
 * a file ending (`.h`, `modul1_ble_central.ino`), a preprocessor line
 * (`#include`), a name with an underscore (`GROUP_ID`, `_PULLUP`), a
 * camelCase name (`digitalRead`), a class name with three capitals or more
 * (`BLEScan`), a hex number (`0xF`) and the Arduino pin constants. Plain
 * capitals (`BLE`, `UUID`) and two-capital names (`LoRa`, `WiFi`) are words
 * unless backticked.
 */

export type Potongan = { kode: boolean; teks: string };

const KONSTANTA = ["HIGH", "LOW", "INPUT", "OUTPUT", "NAN"];

/** Units and names shaped like code. */
const BUKAN_KODE = new Set(["LoRaWAN", "dBm", "dBi", "kHz", "mAh", "iOS", "iPhone", "macOS"]);

const POLA = new RegExp(
  [
    "`([^`\\n]+)`",
    "#(?:include|define)\\b",
    "(?<![\\w.])[A-Za-z_]\\w+(?:\\.[A-Za-z_]\\w*)+(?:\\(\\))?",
    "(?<![\\w.])\\.(?:h|ino|py|cpp)\\b",
    "(?<![\\w.])[A-Za-z_]\\w*\\(\\)",
    "\\b[A-Za-z0-9]*_[A-Za-z0-9_]*",
    "\\b[a-z]+[A-Z][A-Za-z0-9]*\\b",
    "\\b[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*\\b",
    "\\b0x[0-9A-Fa-f]+\\b",
    `\\b(?:${KONSTANTA.join("|")})\\b`,
  ].join("|"),
  "g",
);

/** Capitals in a word, for the class-name rule. */
function kapital(s: string): number {
  return (s.match(/[A-Z]/g) ?? []).length;
}

function kodeKah(m: string): boolean {
  if (BUKAN_KODE.has(m)) return false;
  if (/^[A-Z][A-Za-z0-9]*$/.test(m) && /[a-z]/.test(m) && !KONSTANTA.includes(m))
    return kapital(m) >= 3;
  if (/^_+$/.test(m)) return false;
  if (/^[0-9_]+$/.test(m)) return false;
  return true;
}

export function pecahKode(teks: string): Potongan[] {
  const out: Potongan[] = [];
  const tambah = (kode: boolean, s: string) => {
    if (!s) return;
    const akhir = out[out.length - 1];
    if (akhir && akhir.kode === kode && !kode) akhir.teks += s;
    else out.push({ kode, teks: s });
  };
  let dari = 0;
  for (const m of teks.matchAll(POLA)) {
    const i = m.index ?? 0;
    const isi = m[1] ?? m[0];
    const kode = m[1] !== undefined || kodeKah(m[0]);
    tambah(false, teks.slice(dari, i));
    if (kode) tambah(true, isi);
    else tambah(false, m[0]);
    dari = i + m[0].length;
  }
  tambah(false, teks.slice(dari));
  return out;
}
