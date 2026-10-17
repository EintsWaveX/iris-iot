/**
 * Tugas Pendahuluan (Phase 13), the rules both sides share. Browser safe.
 *
 * - Each module's TP has ten numbered questions; number 1 is a group of
 *   parts a to d (the TP files' own layout). Everyone answers 1 and 10; an
 *   even NIM answers 2, 4, 6 and 8, an odd one 3, 5, 7 and 9 (user ruling
 *   2026-10-12). Six numbers each.
 * - The points follow the lab's rubric (user ruling 2026-10-17): No. 1 and
 *   the 2 / 3 pair are 10 each, the 4 / 5, 6 / 7, 8 / 9 pairs and No. 10
 *   are 20 each, so a NIM's six add up to 100. The TP score goes into the
 *   session's TP component.
 * - The window is IRIS's own (Wednesday 18:00 to Saturday 18:00 by
 *   default), the submission window for next week's practicum. A file that
 *   arrives after it closes is late.
 */
import type { Kelas } from "./kelas.js";

export const TP_NOMOR = 10;

export type KelasTp = "reguler" | "inter";
export type Sasaran = "semua" | "genap" | "ganjil";
export type Paritas = "genap" | "ganjil";

/** Who answers question `no`. */
export function sasaranNomor(no: number): Sasaran {
  if (no === 1 || no === TP_NOMOR) return "semua";
  return no % 2 === 0 ? "genap" : "ganjil";
}

/** What question `no` is worth: 10 for No. 1, 2 and 3, else 20. */
export function poinNomor(no: number): number {
  return no <= 3 ? 10 : 20;
}

export function paritas(nim: string): Paritas {
  const d = Number(nim.trim().slice(-1));
  return Number.isInteger(d) && d % 2 === 0 ? "genap" : "ganjil";
}

/** The questions this NIM answers, in order. */
export function nomorUntuk(nim: string): number[] {
  const p = paritas(nim);
  return Array.from({ length: TP_NOMOR }, (_, i) => i + 1).filter((no) => {
    const s = sasaranNomor(no);
    return s === "semua" || s === p;
  });
}

export function kelasTp(kelas: Kelas | null | undefined): KelasTp {
  return kelas === "internasional" ? "inter" : "reguler";
}

/* ------------------------------------------------------------ the bank */

/**
 * Each module's TP is a bank of variants (Module 4 starts with LoRaWAN and
 * Peer to Peer); every variant has the ten questions in Indonesian (the
 * Reguler class), English (Internasional) and Mandarin (Beta), each with its
 * answer key. The final set takes each number from one variant (`pilih`),
 * drawn at random and drawn again on request (user, 2026-10-12).
 */
export type BahasaTp = "id" | "en" | "zh";
export const BAHASA_TP: readonly BahasaTp[] = ["id", "en", "zh"];

/** The most variants a module's bank holds, named A to E. */
export const MAKS_VARIAN = 5;
export const KODE_VARIAN = "ABCDE";

/** One question in one language: the question, its parts (a, b, ...) and
 *  its answer key in light markup (see blokTeks). */
export interface IsiSoal {
  teks: string;
  bagian?: string[];
  kunci: string;
}

/** One question of a variant; `gambar` holds its key's diagrams (data
 *  URLs), placed by [[gambar N]] in any language's key. */
export interface SoalTp {
  id: IsiSoal;
  en: IsiSoal;
  zh: IsiSoal;
  gambar?: string[];
}

export interface VarianTp {
  kode: string;
  nama: string;
  soal: SoalTp[];
}

/** What a Praktikan sees of a question. */
export interface SoalTampil {
  teks: string;
  bagian?: string[];
}

export function bahasaKelas(k: KelasTp): BahasaTp {
  return k === "inter" ? "en" : "id";
}

/** A question in one language; Mandarin (Beta) falls back to English where
 *  it is still empty. */
export function isiSoal(s: SoalTp, b: BahasaTp): IsiSoal {
  return b === "zh" && !s.zh?.teks.trim() ? s.en : s[b];
}

export function tampilSoal(s: SoalTp, b: BahasaTp): SoalTampil {
  const x = isiSoal(s, b);
  return x.bagian?.length ? { teks: x.teks, bagian: x.bagian } : { teks: x.teks };
}

/** The final set: number n comes from variant pilih[n - 1]. */
export function soalAkhir(varian: readonly VarianTp[], pilih: readonly number[]): SoalTp[] {
  return Array.from({ length: TP_NOMOR }, (_, i) => (varian[pilih[i]] ?? varian[0]).soal[i]);
}

const sidik = (s: SoalTp) =>
  JSON.stringify([s.id.teks, s.id.bagian ?? [], s.en.teks, s.en.bagian ?? []]);

/** The numbers where the variants' questions differ. */
export function nomorBeda(varian: readonly VarianTp[]): number[] {
  return Array.from({ length: TP_NOMOR }, (_, i) => i + 1).filter(
    (no) => new Set(varian.map((v) => sidik(v.soal[no - 1]))).size > 1,
  );
}

/**
 * A fresh draw: every number where the variants differ takes a random
 * variant (the rest stay on A, it reads the same). With two or more such
 * numbers the set mixes at least two variants, and it differs from `lama`
 * whenever it can.
 */
export function acakPilih(
  varian: readonly VarianTp[],
  lama?: readonly number[],
  acak: () => number = Math.random,
): number[] {
  const n = varian.length;
  const beda = n > 1 ? nomorBeda(varian) : [];
  let p: number[] = Array(TP_NOMOR).fill(0);
  for (let coba = 0; coba < 60 && beda.length; coba++) {
    p = Array(TP_NOMOR).fill(0);
    for (const no of beda) p[no - 1] = Math.floor(acak() * n) % n;
    const campur = beda.length < 2 || new Set(beda.map((no) => p[no - 1])).size > 1;
    const baru = !lama || beda.some((no) => lama[no - 1] !== p[no - 1]);
    if (campur && baru) break;
  }
  return p;
}

/* ------------------------------------------------- the keys' light markup */

/**
 * Answer keys are plain text with a little markup, shown the same way on
 * the page and in the PDF: a ``` fence for code, "- " for a bullet, rows
 * starting with "|" for a table (the first row is the head), "a) " opening
 * a part's answer and [[gambar N]] for the question's Nth diagram. Any
 * other line is a paragraph.
 */
export type BlokTeks =
  | { k: "p"; teks: string }
  | { k: "butir"; teks: string[] }
  | { k: "bagian"; huruf: string; teks: string }
  | { k: "kode"; teks: string }
  | { k: "tabel"; baris: string[][] }
  | { k: "gambar"; i: number };

export function blokTeks(md: string): BlokTeks[] {
  const out: BlokTeks[] = [];
  const baris = md.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < baris.length; i++) {
    const t = baris[i].trim();
    if (t.startsWith("```")) {
      const isi: string[] = [];
      for (i++; i < baris.length && !baris[i].trim().startsWith("```"); i++) isi.push(baris[i]);
      out.push({ k: "kode", teks: isi.join("\n").replace(/\s+$/, "") });
      continue;
    }
    if (!t) continue;
    const g = t.match(/^\[\[gambar (\d+)\]\]$/);
    if (g) {
      out.push({ k: "gambar", i: Number(g[1]) - 1 });
      continue;
    }
    if (t.startsWith("|")) {
      const rows: string[][] = [];
      for (; i < baris.length && baris[i].trim().startsWith("|"); i++)
        rows.push(
          baris[i]
            .trim()
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((c) => c.trim()),
        );
      i--;
      out.push({ k: "tabel", baris: rows });
      continue;
    }
    if (/^[-•]\s/.test(t)) {
      const items: string[] = [];
      for (; i < baris.length && /^[-•]\s/.test(baris[i].trim()); i++)
        items.push(baris[i].trim().replace(/^[-•]\s+/, ""));
      i--;
      out.push({ k: "butir", teks: items });
      continue;
    }
    const b = t.match(/^([a-h])\)\s+(.*)$/);
    out.push(b ? { k: "bagian", huruf: b[1], teks: b[2] } : { k: "p", teks: t });
  }
  return out;
}

/** The TP score out of 100 from the scored questions, or null before any. */
export function totalTp(
  skor: Partial<Record<number, number | null | undefined>>,
  nomor: readonly number[],
): number | null {
  if (!nomor.some((no) => skor[no] != null)) return null;
  const sum = nomor.reduce((a, no) => a + (skor[no] ?? 0), 0);
  const maks = nomor.reduce((a, no) => a + poinNomor(no), 0);
  return Math.round((sum / maks) * 100);
}

export function tpLengkap(
  skor: Partial<Record<number, number | null | undefined>>,
  nomor: readonly number[],
): boolean {
  return nomor.length > 0 && nomor.every((no) => skor[no] != null);
}

/* --------------------------------------------------------------- window */

export interface JendelaTp {
  /** ISO instants, with the WIB offset. */
  buka: string;
  tutup: string;
}

export type KeadaanJendela = "belum" | "buka" | "tutup";

export function keadaanJendela(j: JendelaTp | null, now = Date.now()): KeadaanJendela | null {
  if (!j) return null;
  if (now < Date.parse(j.buka)) return "belum";
  if (now < Date.parse(j.tutup)) return "buka";
  return "tutup";
}

/** A weekday (1 Senin to 7 Minggu) and a time, the semester's default. */
export interface PolaJendela {
  hariBuka: number;
  jamBuka: string;
  hariTutup: number;
  jamTutup: string;
}

export const POLA_BAWAAN: PolaJendela = {
  hariBuka: 3,
  jamBuka: "18:00",
  hariTutup: 6,
  jamTutup: "18:00",
};

export const JAM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-14" + "18:00" in WIB, as an ISO instant. */
export function isoWib(tanggal: string, jam: string): string {
  return `${tanggal}T${jam}:00+07:00`;
}

/** An instant's WIB date and time. */
export function bagiWib(iso: string): { tanggal: string; jam: string } {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000);
  return { tanggal: d.toISOString().slice(0, 10), jam: d.toISOString().slice(11, 16) };
}

/** A date `n` days after `tanggal` (both "YYYY-MM-DD"). */
export function tambahHari(tanggal: string, n: number): string {
  const [y, m, d] = tanggal.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 1 Senin to 7 Minggu. */
export function hariKe(tanggal: string): number {
  const [y, m, d] = tanggal.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/** The default window that opens on or after `dari` (a date). */
export function jendelaBerikut(pola: PolaJendela, dari: string): JendelaTp {
  const buka = tambahHari(dari, (pola.hariBuka - hariKe(dari) + 7) % 7);
  const jarak = (pola.hariTutup - pola.hariBuka + 7) % 7 || 7;
  return {
    buka: isoWib(buka, pola.jamBuka),
    tutup: isoWib(tambahHari(buka, jarak), pola.jamTutup),
  };
}

/** The practicum week a window is for: Monday to Saturday after it closes. */
export function mingguPraktikum(j: JendelaTp): { senin: string; sabtu: string } {
  const { tanggal } = bagiWib(j.tutup);
  const senin = tambahHari(tanggal, (8 - hariKe(tanggal)) % 7 || 7);
  return { senin, sabtu: tambahHari(senin, 5) };
}

/** A slot's date (hari 1 Senin to 6 Sabtu) in the practicum week. */
export function tanggalSlot(j: JendelaTp, hari: number): string {
  return tambahHari(mingguPraktikum(j).senin, hari - 1);
}

/** Minutes a file came in after the window closed (null: on time). */
export function telatMenit(dikirimPada: string | null, j: JendelaTp | null): number | null {
  if (!dikirimPada || !j) return null;
  const d = (Date.parse(dikirimPada) - Date.parse(j.tutup)) / 60_000;
  return d > 0 ? Math.ceil(d) : null;
}

/**
 * One Praktikan's own window: the module's, closing at their extension
 * instead when they were given one that ends later (LMS › Tugas ›
 * Perpanjangan, user 2026-10-17). Moving the whole window extends everyone
 * and needs nothing here.
 */
export function jendelaPribadi(j: JendelaTp, sampai: string | null | undefined): JendelaTp {
  return sampai && Date.parse(sampai) > Date.parse(j.tutup) ? { ...j, tutup: sampai } : j;
}

/** A file that came after the window but within the Praktikan's own
 *  extension: Diperpanjang, not Terlambat. */
export function masukPerpanjangan(
  dikirimPada: string | null,
  j: JendelaTp | null,
  sampai: string | null | undefined,
): boolean {
  if (!j || telatMenit(dikirimPada, j) === null) return false;
  return telatMenit(dikirimPada, jendelaPribadi(j, sampai)) === null;
}

/* --------------------------------------------------------------- status */

export type StatusTp = "belum" | "masuk" | "panjang" | "telat" | "nilai" | "kosong";

/** Waiting for its Asisten: in, in on an extension, or late. */
export const TP_MENUNGGU: readonly StatusTp[] = ["masuk", "panjang", "telat"];

export function statusTp(a: {
  adaBerkas: boolean;
  tanda: "kosong" | null;
  telat: boolean;
  /** In after the window, within this Praktikan's own extension. */
  panjang?: boolean;
  lengkap: boolean;
}): StatusTp {
  if (a.tanda === "kosong") return "kosong";
  if (a.lengkap) return "nilai";
  if (!a.adaBerkas) return "belum";
  if (a.telat) return "telat";
  return a.panjang ? "panjang" : "masuk";
}

/** The LMS course a class name belongs to: "REG-04", "REG-01-INT", "ADD". */
export function labelKursus(nama: string): string {
  const m = nama.match(/REG-\d{2}(?:-INT)?/i);
  if (m) return m[0].toUpperCase();
  if (/\bADD\b/i.test(nama)) return "ADD";
  return nama.length > 18 ? `${nama.slice(0, 17)}…` : nama;
}

export function kelasKursus(nama: string): KelasTp {
  return /-INT\b|INTERNATIONAL/i.test(nama) ? "inter" : "reguler";
}

/** "TP Modul 3" (any case, any spacing): the module number, or null. */
export function modulTugas(nama: string): number | null {
  const m = nama.match(/^\s*TP\s*Modul\s*([1-4])\b/i);
  return m ? Number(m[1]) : null;
}

/* ------------------------------------------- the assignment in the LMS */

/** The name IRIS gives a module's assignment in every class course. */
export const namaTugasLms = (m: number) => `TP Modul ${m}`;

const HARI_TP = {
  id: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};
const BULAN_TP = {
  id: [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
};

/** "Sabtu, 17 Oktober 2026 pukul 18.00" / "Saturday, 17 October 2026 at 18:00", in WIB. */
export function waktuTugasLms(iso: string, b: "id" | "en"): string {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const tgl = `${HARI_TP[b][d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN_TP[b][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return b === "id" ? `${tgl} pukul ${hh}.${mm}` : `${tgl} at ${hh}:${mm}`;
}

/** The assignment's default description, plain text, in the class's language. */
export function teksTugasLms(m: number, tutup: string, b: "id" | "en"): string {
  return b === "id"
    ? `Tugas Pendahuluan Modul ${m}. Soal ada di IRIS (Modul ${m}, langkah Tugas Pendahuluan). Kerjakan di kertas, pindai menjadi satu PDF, lalu unggah di sini sebelum ${waktuTugasLms(tutup, "id")}.`
    : `Preliminary Task for Module ${m}. The questions are in IRIS (Module ${m}, the Preliminary Task step). Write your answers on paper, scan them into one PDF, and upload it here before ${waktuTugasLms(tutup, "en")}.`;
}

/** Plain text to the LMS's HTML: a paragraph per blank-line block, escaped. */
export function htmlTugasLms(teks: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return teks
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** An LMS assignment's dates are the window's, to the minute. */
export function tanggalSama(
  t: { buka: string | null; tutup: string | null; batas?: string | null },
  j: JendelaTp,
): boolean {
  const sama = (a: string | null | undefined, b: string) =>
    !!a && Math.abs(Date.parse(a) - Date.parse(b)) < 60_000;
  // The cut-off closes the LMS at the window's close too (2026-10-17).
  return sama(t.buka, j.buka) && sama(t.tutup, j.tutup) && sama(t.batas, j.tutup);
}

/* ------------------------------------------------------ answers in a PDF */

/**
 * Splits a typed PDF's text at the question numbers, for the grader's Per
 * Soal view. `halaman` is each page's text with line breaks. For each
 * number in `nomor` (in order) it looks for a line that starts with that
 * number ("3.", "3)", "No 3", "Soal 3", "Nomor 3") after the previous one,
 * and takes the text up to the next number found. A scan has no text and
 * finds nothing; the grader then offers the page jump alone.
 */
export function pisahJawaban(
  halaman: readonly string[],
  nomor: readonly number[],
): Record<number, { teks: string; halaman: number }> {
  const baris: { t: string; p: number }[] = [];
  halaman.forEach((tx, i) =>
    tx.split(/\r?\n/).forEach((t) => {
      const s = t.trim();
      if (s) baris.push({ t: s, p: i + 1 });
    }),
  );
  const pola = (no: number) =>
    new RegExp(`^(?:(?:no(?:mor)?|soal|question|number)\\s*\\.?\\s*)?${no}\\s*[.)]?(?:\\s|$)`, "i");
  const awal: { no: number; i: number }[] = [];
  let dari = 0;
  for (const no of nomor) {
    const re = pola(no);
    const i = baris.findIndex((b, k) => k >= dari && re.test(b.t));
    if (i < 0) continue;
    awal.push({ no, i });
    dari = i + 1;
  }
  const out: Record<number, { teks: string; halaman: number }> = {};
  awal.forEach((a, k) => {
    const akhir = k + 1 < awal.length ? awal[k + 1].i : baris.length;
    const isi = baris
      .slice(a.i, akhir)
      .map((b) => b.t)
      .join("\n")
      .replace(pola(a.no), "")
      .trim();
    out[a.no] = { teks: isi, halaman: baris[a.i].p };
  });
  return out;
}

/** How often IRIS reads the LMS while a TP window is open: 60 s after the
 *  last run, whatever the clock reads (user, 2026-10-17). An open page
 *  starts the due run itself; the relay's minute timer and the server's
 *  heartbeat keep it going when no page is open. */
export const JEDA_SINKRON_MS = 60_000;

/** Whole seconds until the next run, 0 once it is due. */
export function sisaSinkron(terakhir: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((terakhir + JEDA_SINKRON_MS - now) / 1000));
}
