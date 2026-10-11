/**
 * A module's pin table as the Asisten set it, and the code that follows it.
 * Browser-safe: the Persiapan editor, every Pin dan Skema card and the API
 * (api/_lib/kode-aktif.ts) share it.
 *
 * Each editable pin cell that a sketch declares is linked to its constant
 * (PB_PIN, LED_PIN, DHT_PIN, the Pico's ADC pin, Module 4's radio pins).
 * Saving the table rewrites those numbers, and the "GPIO16" mentions in the
 * file's comments, in every language of every linked file. Blanks never
 * change: a rewritten line holds no blank, and the blanks after it move
 * with the text.
 */
import type { BahasaKode, KodeBerkas } from "./kode-jurnal.js";

/** Saved under `pengaturan` as pin_modul_<N>: the table's rows, same shape as the bundled one */
export type BarisPin = string[][];

export const KUNCI_PIN = (modul: number) => `pin_modul_${modul}`;

type Jenis = "const" | "define" | "adc";

export interface TautanPin {
  /** Row and column of the pin cell in the module's table */
  baris: number;
  kolom: number;
  /** File slugs that declare it */
  berkas: string[];
  /** The constant's name in the code */
  nama: string;
  jenis: Jenis;
}

const M4 = ["modul4_hunter", "modul4_beacon"];

export const PIN_KODE: Record<number, TautanPin[]> = {
  1: [
    { baris: 1, kolom: 1, berkas: ["modul1_ble_central"], nama: "PB_PIN", jenis: "const" },
    { baris: 0, kolom: 3, berkas: ["modul1_ble_peripheral"], nama: "LED_PIN", jenis: "const" },
  ],
  2: [{ baris: 1, kolom: 1, berkas: ["modul2_websocket_esp32"], nama: "DHT_PIN", jenis: "const" }],
  3: [{ baris: 1, kolom: 1, berkas: ["modul3_mqtt_publish"], nama: "ADC", jenis: "adc" }],
  4: [
    { baris: 0, kolom: 1, berkas: M4, nama: "LORA_NSS", jenis: "define" },
    { baris: 1, kolom: 1, berkas: M4, nama: "LORA_DIO0", jenis: "define" },
    { baris: 2, kolom: 1, berkas: M4, nama: "LORA_RST", jenis: "define" },
    { baris: 3, kolom: 1, berkas: M4, nama: "SPI_SCK", jenis: "define" },
    { baris: 4, kolom: 1, berkas: M4, nama: "SPI_MISO", jenis: "define" },
    { baris: 5, kolom: 1, berkas: M4, nama: "SPI_MOSI", jenis: "define" },
    { baris: 6, kolom: 1, berkas: M4, nama: "LORA_EN", jenis: "define" },
  ],
};

/** The GPIO number in a pin label ("GPIO16", "GP26 (ADC0)"), or null */
export function angkaPin(label: string): number | null {
  const m = /\bGP(?:IO)?\s*(\d{1,2})\b/i.exec(label);
  return m ? Number(m[1]) : null;
}

/** The link for one cell, if the code declares it */
export function tautanSel(modul: number, baris: number, kolom: number): TautanPin | undefined {
  return (PIN_KODE[modul] ?? []).find((t) => t.baris === baris && t.kolom === kolom);
}

/** What is wrong with an edited table, as cell keys "row:col"; empty when fine */
export function cekBarisPin(modul: number, bawaan: BarisPin, baru: BarisPin): string[] {
  const salah: string[] = [];
  if (baru.length !== bawaan.length) return ["bentuk"];
  bawaan.forEach((row, r) => {
    if (!Array.isArray(baru[r]) || baru[r].length !== row.length) salah.push(`${r}`);
    row.forEach((_, k) => {
      const v = baru[r]?.[k];
      if (typeof v !== "string" || !v.trim() || v.length > 40) salah.push(`${r}:${k}`);
      else if (k % 2 === 1 && tautanSel(modul, r, k) && angkaPin(v) === null)
        salah.push(`${r}:${k}`);
    });
  });
  return salah;
}

/** The bundled table with the saved pin cells over it (names never change) */
export function gabungPin(bawaan: BarisPin, simpan: BarisPin | null | undefined): BarisPin {
  if (!simpan || simpan.length !== bawaan.length) return bawaan;
  return bawaan.map((row, r) => row.map((c, k) => (k % 2 === 1 ? (simpan[r]?.[k] ?? c) : c)));
}

/** Replace each match in one language's text, moving the blanks after it */
function ganti(b: KodeBerkas, bahasa: BahasaKode, re: RegExp, ke: (m: RegExpExecArray) => string) {
  let teks = b.sumber[bahasa];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  let geser = 0;
  const hasil: { awal: number; akhir: number; baru: string }[] = [];
  while ((m = g.exec(teks)) !== null) {
    hasil.push({ awal: m.index, akhir: m.index + m[0].length, baru: ke(m) });
    if (m[0].length === 0) g.lastIndex++;
  }
  for (const h of hasil) {
    const awal = h.awal + geser;
    const akhir = h.akhir + geser;
    const tabrak = b.celah.some((c) => {
      const p = c.posisi[bahasa];
      return p !== null && p.awal < akhir && p.akhir > awal;
    });
    if (tabrak) continue;
    teks = teks.slice(0, awal) + h.baru + teks.slice(akhir);
    const d = h.baru.length - (h.akhir - h.awal);
    if (d)
      for (const c of b.celah) {
        const p = c.posisi[bahasa];
        if (p && p.awal >= akhir) c.posisi[bahasa] = { awal: p.awal + d, akhir: p.akhir + d };
      }
    geser += d;
  }
  b.sumber[bahasa] = teks;
}

/** One file with the module's pins applied; the input is never changed */
export function terapkanPin(
  modul: number,
  berkas: KodeBerkas,
  bawaan: BarisPin,
  baris: BarisPin | null | undefined,
): KodeBerkas {
  if (!baris) return berkas;
  const b: KodeBerkas = {
    ...berkas,
    sumber: { ...berkas.sumber },
    celah: berkas.celah.map((c) => ({ ...c, posisi: { ...c.posisi } })),
  };
  for (const t of PIN_KODE[modul] ?? []) {
    if (!t.berkas.includes(berkas.slug)) continue;
    const lama = angkaPin(bawaan[t.baris]?.[t.kolom] ?? "");
    const baru = angkaPin(baris[t.baris]?.[t.kolom] ?? "");
    if (lama === null || baru === null || lama === baru) continue;
    for (const bahasa of Object.keys(b.sumber) as BahasaKode[]) {
      // The declaration itself
      if (t.jenis === "const")
        ganti(
          b,
          bahasa,
          new RegExp(`(const\\s+int\\s+${t.nama}\\s*=\\s*)${lama}\\b`),
          (m) => `${m[1]}${baru}`,
        );
      else if (t.jenis === "define")
        ganti(
          b,
          bahasa,
          new RegExp(`(#define\\s+${t.nama}\\s+)${lama}\\b`),
          (m) => `${m[1]}${baru}`,
        );
      else ganti(b, bahasa, new RegExp(`(ADC\\()${lama}(\\))`), (m) => `${m[1]}${baru}${m[2]}`);
      // Its mentions in comments: GPIO16, GP26 and the Pico's ADC0
      ganti(b, bahasa, /^([ \t]*(?:\/\/|#|\*).*)$/m, (m) => {
        let s = m[1]
          .replace(new RegExp(`\\bGPIO${lama}\\b`, "g"), `GPIO${baru}`)
          .replace(new RegExp(`\\bGP${lama}\\b`, "g"), `GP${baru}`);
        if (t.jenis === "adc" && lama >= 26 && baru >= 26)
          s = s.replace(new RegExp(`\\bADC${lama - 26}\\b`, "g"), `ADC${baru - 26}`);
        return s;
      });
    }
  }
  return b;
}
