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
import {
  arahDariLabel,
  cekPad,
  isPapanId,
  labelPad,
  PAPAN,
  PAPAN_BAWAAN,
  padBoleh,
  padDariLabel,
  type Arah,
  type PapanId,
} from "./papan.js";

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
  /** What the part needs from the pin: read only, read and write, analog */
  arah: Arah;
}

const M4 = ["modul4_hunter", "modul4_beacon"];

export const PIN_KODE: Record<number, TautanPin[]> = {
  1: [
    {
      baris: 1,
      kolom: 1,
      berkas: ["modul1_ble_central"],
      nama: "PB_PIN",
      jenis: "const",
      arah: "in",
    },
    {
      baris: 0,
      kolom: 3,
      berkas: ["modul1_ble_peripheral"],
      nama: "LED_PIN",
      jenis: "const",
      arah: "io",
    },
  ],
  2: [
    {
      baris: 1,
      kolom: 1,
      berkas: ["modul2_websocket_esp32"],
      nama: "DHT_PIN",
      jenis: "const",
      arah: "io",
    },
  ],
  3: [
    { baris: 1, kolom: 1, berkas: ["modul3_mqtt_publish"], nama: "ADC", jenis: "adc", arah: "adc" },
  ],
  4: [
    { baris: 0, kolom: 1, berkas: M4, nama: "LORA_NSS", jenis: "define", arah: "io" },
    { baris: 1, kolom: 1, berkas: M4, nama: "LORA_DIO0", jenis: "define", arah: "in" },
    { baris: 2, kolom: 1, berkas: M4, nama: "LORA_RST", jenis: "define", arah: "io" },
    { baris: 3, kolom: 1, berkas: M4, nama: "SPI_SCK", jenis: "define", arah: "io" },
    { baris: 4, kolom: 1, berkas: M4, nama: "SPI_MISO", jenis: "define", arah: "in" },
    { baris: 5, kolom: 1, berkas: M4, nama: "SPI_MOSI", jenis: "define", arah: "io" },
    { baris: 6, kolom: 1, berkas: M4, nama: "LORA_EN", jenis: "define", arah: "io" },
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

/** What a pin cell needs: its code link's direction, else what its bundled
 *  label says (3V3, 5V, GND), else a plain digital pin. */
export function arahSel(modul: number, bawaan: BarisPin, baris: number, kolom: number): Arah {
  return (
    tautanSel(modul, baris, kolom)?.arah ?? arahDariLabel(bawaan[baris]?.[kolom] ?? "") ?? "io"
  );
}

/** The boards a module's table is set for, one per column pair */
export function papanModul(modul: number, simpan?: unknown): PapanId[] {
  const dasar = PAPAN_BAWAAN[modul] ?? ["esp32"];
  if (!Array.isArray(simpan)) return dasar;
  return dasar.map((d, i) => (isPapanId(simpan[i]) ? simpan[i] : d));
}

/** What is wrong with an edited table, as cell keys "row:col"; empty when
 *  fine. With the boards given, every pin cell must be a pad of its board
 *  that can take the connection, and no GPIO is used twice on a board. */
export function cekBarisPin(
  modul: number,
  bawaan: BarisPin,
  baru: BarisPin,
  papan?: PapanId[],
): string[] {
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
  if (salah.length || !papan) return salah;
  papan.forEach((id, p) => {
    const b = PAPAN[id];
    const k = p * 2 + 1;
    bawaan.forEach((row, r) => {
      if (!row[k - 1]?.trim()) return;
      const pad = padDariLabel(b, baru[r]?.[k] ?? "");
      if (pad === null) return void salah.push(`${r}:${k}`);
      // The GPIOs the board's other connections use
      const lain = new Set<number>();
      bawaan.forEach((_, q) => {
        if (q === r) return;
        const x = padDariLabel(b, baru[q]?.[k] ?? "");
        if (typeof x === "number") lain.add(x);
      });
      if (cekPad(b, pad, arahSel(modul, bawaan, r, k), lain)) salah.push(`${r}:${k}`);
    });
  });
  return salah;
}

/**
 * The table moved onto other boards: each connection keeps its pin when the
 * new board can take it, else gets the first free pin that can; power and
 * ground take the new board's own names (3V3 becomes 3V3(OUT) on a Pico).
 */
export function pindahPapan(
  modul: number,
  bawaan: BarisPin,
  baris: BarisPin,
  ke: PapanId[],
): BarisPin {
  const out = baris.map((row) => [...row]);
  ke.forEach((id, p) => {
    const b = PAPAN[id];
    const k = p * 2 + 1;
    const pakai = new Set<number>();
    // Linked pins first, so the code's pins keep their numbers when they can.
    const urut = bawaan
      .map((_, r) => r)
      .filter((r) => bawaan[r]?.[k - 1]?.trim())
      .sort((a, c) => Number(!!tautanSel(modul, c, k)) - Number(!!tautanSel(modul, a, k)));
    for (const r of urut) {
      const arah = arahSel(modul, bawaan, r, k);
      const lama = padDariLabel(b, baris[r]?.[k] ?? "") ?? angkaPin(baris[r]?.[k] ?? "");
      const pad =
        lama !== null && cekPad(b, lama, arah, pakai) === null
          ? lama
          : (padBoleh(b, arah).find((x) => cekPad(b, x, arah, pakai) === null) ?? null);
      if (pad === null) continue;
      if (typeof pad === "number") pakai.add(pad);
      out[r][k] = labelPad(b, pad);
    }
  });
  return out;
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

type Aturan = [RegExp, (m: RegExpExecArray) => string];

/** The rewrites one link needs: the declaration, then its mentions in
 *  comments (GPIO16, GP26 and the Pico's ADC0). */
function aturan(t: TautanPin, lama: number, baru: number): Aturan[] {
  const deklarasi: Aturan =
    t.jenis === "const"
      ? [new RegExp(`(const\\s+int\\s+${t.nama}\\s*=\\s*)${lama}\\b`), (m) => `${m[1]}${baru}`]
      : t.jenis === "define"
        ? [new RegExp(`(#define\\s+${t.nama}\\s+)${lama}\\b`), (m) => `${m[1]}${baru}`]
        : [new RegExp(`(ADC\\()${lama}(\\))`), (m) => `${m[1]}${baru}${m[2]}`];
  const komentar: Aturan = [
    /^([ \t]*(?:\/\/|#|\*).*)$/m,
    (m) => {
      let s = m[1]
        .replace(new RegExp(`\\bGPIO${lama}\\b`, "g"), `GPIO${baru}`)
        .replace(new RegExp(`\\bGP${lama}\\b`, "g"), `GP${baru}`);
      if (t.jenis === "adc" && lama >= 26 && baru >= 26)
        s = s.replace(new RegExp(`\\bADC${lama - 26}\\b`, "g"), `ADC${baru - 26}`);
      return s;
    },
  ];
  return [deklarasi, komentar];
}

/**
 * A piece of code text with its pins moved from one table to another, for
 * the browser (a Praktikan's own wiring in the Pin dan Skema card). Only the
 * text between blanks comes in, and a pin line never holds a blank.
 */
export function gantiPinTeks(
  modul: number,
  slug: string,
  teks: string,
  dari: BarisPin,
  ke: BarisPin,
): string {
  let out = teks;
  for (const t of PIN_KODE[modul] ?? []) {
    if (!t.berkas.includes(slug)) continue;
    const lama = angkaPin(dari[t.baris]?.[t.kolom] ?? "");
    const baru = angkaPin(ke[t.baris]?.[t.kolom] ?? "");
    if (lama === null || baru === null || lama === baru) continue;
    for (const [re, fn] of aturan(t, lama, baru)) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
      let hasil = "";
      let dari0 = 0;
      let m: RegExpExecArray | null;
      while ((m = g.exec(out)) !== null) {
        hasil += out.slice(dari0, m.index) + fn(m);
        dari0 = m.index + m[0].length;
        if (m[0].length === 0) g.lastIndex++;
      }
      out = hasil + out.slice(dari0);
    }
  }
  return out;
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
    for (const bahasa of Object.keys(b.sumber) as BahasaKode[])
      for (const [re, fn] of aturan(t, lama, baru)) ganti(b, bahasa, re, fn);
  }
  return b;
}
