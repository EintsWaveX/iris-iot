/**
 * Journal code managed in the app (ASO code editor, 2026-10-05). ASO and
 * Admins keep each module's COMPLETE files, id and en, and mark which spans
 * are blanks. One set of blanks serves both languages: a blank holds its
 * span in each file, and its answer is shared.
 *
 * The Praktikan file is generated from the complete file in the practicum's
 * blank format (iris-blank-format-underscores): the span becomes eight
 * underscores and the line's trailing comment becomes `// (n) hint`, so
 * blanks.ts's parseBlanks() keeps reading it unchanged. Each blank keeps its
 * own number, 1 to N: the journals do not always number in file order.
 *
 * Browser-safe: the editor runs this too. Only an Asisten with the `kode`
 * right is ever sent a KodeBerkas (it carries the answers); a Praktikan only
 * ever gets buatTemplat()'s output.
 */

export type BahasaKode = "id" | "en";
export const BAHASA_KODE: readonly BahasaKode[] = ["id", "en"];

/** Help text for a blank in the two code languages; Mandarin (the UI's
 *  third language) is optional and falls back to English. */
export type TeksKode = Record<BahasaKode, string> & { zh?: string };

/** Wrong tries a group needs on one blank before each hint opens
 *  (2026-10-18): a light clue after the first, the written hint after the
 *  second, a direct clue with the answer after the third. */
export const SALAH_UNTUK_BANTUAN1 = 1;
export const SALAH_UNTUK_BANTUAN = 2;
export const SALAH_UNTUK_JAWABAN = 3;

/** The hint tier a number of wrong tries opens: 0 (none) to 3. */
export function tingkatBantuan(salah: number): 0 | 1 | 2 | 3 {
  return salah >= SALAH_UNTUK_JAWABAN
    ? 3
    : salah >= SALAH_UNTUK_BANTUAN
      ? 2
      : salah >= SALAH_UNTUK_BANTUAN1
        ? 1
        : 0;
}

/** Character offsets into one language's complete file, [awal, akhir). */
export interface Rentang {
  awal: number;
  akhir: number;
}

export interface Celah {
  /** Stable within a version, for the editor (not the blank's number). */
  id: string;
  /** The `(n)` the Praktikan sees and soalKode() uses. */
  nomor: number;
  posisi: Record<BahasaKode, Rentang | null>;
  /** The as-authored answer: the marked text (group 1's value when the
   *  answer differs per group). */
  jawaban: string;
  /** Other spellings that compile the same. */
  juga: string[];
  /** Per-group answer with `{n}` for the group number ("/grup{n}"), or null. */
  perKelompok: string | null;
  petunjuk: Record<BahasaKode, string>;
  /** Shown once the blank is correct. en may be empty (id is used). */
  kenapa: TeksKode;
  /** Opens after SALAH_UNTUK_BANTUAN1 wrong try: a light clue. Missing on
   *  versions saved before it existed. */
  bantuan1?: TeksKode;
  /** Opens after SALAH_UNTUK_BANTUAN wrong tries: a nudge, never the
   *  answer. Missing on versions saved before it existed. */
  bantuan?: TeksKode;
  /** Opens after SALAH_UNTUK_JAWABAN wrong tries: a direct clue, shown
   *  with the group's answer. Missing on versions saved before it existed. */
  bantuan3?: TeksKode;
}

export interface KodeBerkas {
  slug: string;
  path: string;
  sumber: Record<BahasaKode, string>;
  celah: Celah[];
}

export const BLANK_TOKEN = "________";
export const MAKS_SUMBER = 60_000;
export const MAKS_JAWABAN = 200;

export function tandaKomentar(path: string): "//" | "#" {
  return path.endsWith(".py") ? "#" : "//";
}

/** Where a line's trailing comment starts (outside string literals), or -1. */
export function cariKomentar(line: string, tanda: "//" | "#"): number {
  let kutip: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (kutip) {
      if (c === "\\") i++;
      else if (c === kutip) kutip = null;
      continue;
    }
    if (c === '"' || c === "'") kutip = c;
    else if (tanda === "#" ? c === "#" : c === "/" && line[i + 1] === "/") return i;
  }
  return -1;
}

/** The bounds of the line holding `offset` (akhir excludes the newline). */
export function barisDi(src: string, offset: number): Rentang {
  const awal = src.lastIndexOf("\n", offset - 1) + 1;
  const n = src.indexOf("\n", offset);
  return { awal, akhir: n === -1 ? src.length : n };
}

/** A trailing comment's text without a leading `(n)` label. */
export function teksPetunjuk(komentar: string, tanda: "//" | "#"): string {
  return komentar
    .slice(tanda.length)
    .trim()
    .replace(/^\(\d+\)\s*/, "")
    .trim();
}

/** The hint the editor suggests for a new blank: the line's own comment. */
export function petunjukBaris(src: string, r: Rentang, path: string): string {
  const tanda = tandaKomentar(path);
  const b = barisDi(src, r.awal);
  const line = src.slice(b.awal, b.akhir);
  const k = cariKomentar(line, tanda);
  return k === -1 || k < r.akhir - b.awal ? "" : teksPetunjuk(line.slice(k), tanda);
}

/** Blanks in number order. */
export function urutkanCelah(celah: readonly Celah[]): Celah[] {
  return [...celah].sort((a, b) => a.nomor - b.nomor);
}

/** Blanks in the order they sit in the id file (en when id has none). */
export function urutPosisi(celah: readonly Celah[]): Celah[] {
  const pos = (c: Celah) => c.posisi.id?.awal ?? c.posisi.en?.awal ?? Infinity;
  return [...celah].sort((a, b) => pos(a) - pos(b));
}

/** Numbers 1 to N again, keeping their order (after a delete). */
export function rapikanNomor(celah: readonly Celah[]): Celah[] {
  const urut = urutkanCelah(celah);
  return celah.map((c) => ({ ...c, nomor: urut.indexOf(c) + 1 }));
}

/** The Praktikan file for one language. Blanks with no span in this
 *  language are skipped (periksaBerkas() blocks publishing those). */
export function buatTemplat(berkas: KodeBerkas, bahasa: BahasaKode): string {
  const src = berkas.sumber[bahasa];
  const tanda = tandaKomentar(berkas.path);
  const items = berkas.celah
    .map((c) => ({ c, nomor: c.nomor, r: c.posisi[bahasa] }))
    .filter((x): x is { c: Celah; nomor: number; r: Rentang } => !!x.r)
    .sort((a, b) => b.r.awal - a.r.awal);
  let out = src;
  for (const { c, nomor, r } of items) {
    const b = barisDi(out, r.awal);
    const line = out.slice(b.awal, b.akhir);
    const lokal = r.awal - b.awal;
    let kode = line.slice(0, lokal) + BLANK_TOKEN + line.slice(r.akhir - b.awal);
    const k = cariKomentar(kode, tanda);
    const petunjuk = (c.petunjuk[bahasa] || c.petunjuk.id || c.petunjuk.en).trim();
    const label = `${tanda} (${nomor})${petunjuk ? ` ${petunjuk}` : ""}`;
    if (k !== -1 && k > lokal) kode = kode.slice(0, k) + label;
    else kode = `${kode.trimEnd()}  ${label}`;
    out = out.slice(0, b.awal) + kode + out.slice(b.akhir);
  }
  return out;
}

/** A line's code without its trailing comment, trimmed: how a line is
 *  recognised across languages (only comments are translated) and across
 *  a replaced file. */
function kodeBaris(line: string, tanda: "//" | "#"): string {
  const k = cariKomentar(line, tanda);
  return (k === -1 ? line : line.slice(0, k)).trim();
}

function kodeAkhir(line: string, tanda: "//" | "#"): number {
  const k = cariKomentar(line, tanda);
  return k === -1 ? line.length : k;
}

function semuaIndeks(teks: string, cari: string): number[] {
  const out: number[] = [];
  if (!cari) return out;
  for (let i = teks.indexOf(cari); i !== -1; i = teks.indexOf(cari, i + 1)) out.push(i);
  return out;
}

/** The same span in another text: the line whose code matches (the same
 *  one among equal lines), then the same occurrence of the text inside it.
 *  Null when that line is gone or changed. */
export function cariPadanan(dari: string, r: Rentang, ke: string, path: string): Rentang | null {
  const tanda = tandaKomentar(path);
  const teks = dari.slice(r.awal, r.akhir);
  const b = barisDi(dari, r.awal);
  const line = dari.slice(b.awal, b.akhir);
  const kode = kodeBaris(line, tanda);
  if (!kode || !teks) return null;
  const sama = (ls: string[]) =>
    ls.map((l, i) => (kodeBaris(l, tanda) === kode ? i : -1)).filter((i) => i !== -1);
  const asal = sama(dari.split("\n"));
  const linesKe = ke.split("\n");
  const tujuan = sama(linesKe);
  // Among equal lines, the same one by order; a lone match is taken as is.
  const iKe =
    tujuan.length === asal.length
      ? tujuan[asal.indexOf(dari.slice(0, b.awal).split("\n").length - 1)]
      : tujuan.length === 1
        ? tujuan[0]
        : undefined;
  if (iKe === undefined) return null;
  const urutan = semuaIndeks(line.slice(0, kodeAkhir(line, tanda)), teks).indexOf(r.awal - b.awal);
  const lineKe = linesKe[iKe];
  const di = semuaIndeks(lineKe.slice(0, kodeAkhir(lineKe, tanda)), teks)[urutan];
  if (urutan === -1 || di === undefined) return null;
  const awalBaris = linesKe.slice(0, iKe).reduce((a, l) => a + l.length + 1, 0);
  return { awal: awalBaris + di, akhir: awalBaris + di + teks.length };
}

/** After a file is replaced: each blank's span in the new text, found by its
 *  line. Returns the blanks with moved spans and the ids that were lost. */
export function pindahkanCelah(
  berkas: KodeBerkas,
  bahasa: BahasaKode,
  baru: string,
): { celah: Celah[]; hilang: string[] } {
  const hilang: string[] = [];
  const celah = berkas.celah.map((c) => {
    const r = c.posisi[bahasa];
    if (!r) return c;
    const p = cariPadanan(berkas.sumber[bahasa], r, baru, berkas.path);
    if (!p) hilang.push(c.id);
    return { ...c, posisi: { ...c.posisi, [bahasa]: p } };
  });
  return { celah, hilang };
}

export type KodeMasalah =
  | "belum_ditandai"
  | "teks_beda"
  | "satu_baris"
  | "tumpang"
  | "dalam_komentar"
  | "lintas_baris"
  | "urutan_beda"
  | "jawaban_kosong"
  | "jawaban_panjang"
  | "kelompok_tanpa_n"
  | "nomor_salah"
  | "petunjuk_kosong"
  | "bantuan1_kosong"
  | "bantuan_kosong"
  | "bantuan3_kosong"
  | "sumber_kosong"
  | "sumber_panjang"
  | "identitas";

export interface Masalah {
  kode: KodeMasalah;
  /** Errors block publishing; warnings only show. */
  berat: boolean;
  celah?: string;
  bahasa?: BahasaKode;
}

const RINGAN: ReadonlySet<KodeMasalah> = new Set([
  "petunjuk_kosong",
  "bantuan1_kosong",
  "bantuan_kosong",
  "bantuan3_kosong",
]);

/** Everything wrong with one file, before it may be published. The group
 *  identity check (personalize) is the caller's: it needs group-identity.ts. */
export function periksaBerkas(berkas: KodeBerkas): Masalah[] {
  const out: Masalah[] = [];
  const add = (kode: KodeMasalah, x: Partial<Masalah> = {}) =>
    out.push({ kode, berat: !RINGAN.has(kode), ...x });
  const tanda = tandaKomentar(berkas.path);
  for (const b of BAHASA_KODE) {
    if (!berkas.sumber[b].trim()) add("sumber_kosong", { bahasa: b });
    if (berkas.sumber[b].length > MAKS_SUMBER) add("sumber_panjang", { bahasa: b });
  }
  const urut = urutkanCelah(berkas.celah);
  if (urut.some((c, i) => c.nomor !== i + 1)) add("nomor_salah");
  for (const c of urut) {
    if (!c.jawaban.trim()) add("jawaban_kosong", { celah: c.id });
    if (c.jawaban.length > MAKS_JAWABAN) add("jawaban_panjang", { celah: c.id });
    if (c.perKelompok !== null && !c.perKelompok.includes("{n}"))
      add("kelompok_tanpa_n", { celah: c.id });
    if (!teksUntuk(c.bantuan1, "id")) add("bantuan1_kosong", { celah: c.id });
    if (!teksUntuk(c.bantuan, "id")) add("bantuan_kosong", { celah: c.id });
    if (!teksUntuk(c.bantuan3, "id")) add("bantuan3_kosong", { celah: c.id });
    for (const b of BAHASA_KODE) {
      const r = c.posisi[b];
      if (!r) {
        add("belum_ditandai", { celah: c.id, bahasa: b });
        continue;
      }
      const src = berkas.sumber[b];
      const teks = src.slice(r.awal, r.akhir);
      if (r.akhir <= r.awal || r.akhir > src.length || teks !== c.jawaban)
        add("teks_beda", { celah: c.id, bahasa: b });
      if (teks.includes("\n")) add("lintas_baris", { celah: c.id, bahasa: b });
      const baris = barisDi(src, r.awal);
      const k = cariKomentar(src.slice(baris.awal, baris.akhir), tanda);
      if (k !== -1 && baris.awal + k < r.akhir) add("dalam_komentar", { celah: c.id, bahasa: b });
      if (!(c.petunjuk[b] || c.petunjuk.id).trim())
        add("petunjuk_kosong", { celah: c.id, bahasa: b });
    }
  }
  for (const b of BAHASA_KODE) {
    const ada = urut.filter((c) => c.posisi[b]);
    const pos = [...ada].sort((x, y) => x.posisi[b]!.awal - y.posisi[b]!.awal);
    for (let i = 1; i < pos.length; i++) {
      const a = pos[i - 1].posisi[b]!;
      const c = pos[i].posisi[b]!;
      if (c.awal < a.akhir) add("tumpang", { celah: pos[i].id, bahasa: b });
      else if (barisDi(berkas.sumber[b], a.awal).awal === barisDi(berkas.sumber[b], c.awal).awal)
        add("satu_baris", { celah: pos[i].id, bahasa: b });
    }
  }
  // Both files hold the same code, so their blanks sit in the same order.
  const kedua = urut.filter((c) => c.posisi.id && c.posisi.en);
  const enUrut = [...kedua].sort((x, y) => x.posisi.en!.awal - y.posisi.en!.awal);
  if (urutPosisi(kedua).some((c, i) => c !== enUrut[i])) add("urutan_beda", { bahasa: "en" });
  return out;
}

/** One help text in a UI language: zh falls back to en, and en and id to
 *  each other. */
export function teksUntuk(t: TeksKode | undefined, lang: "id" | "en" | "zh"): string {
  if (!t) return "";
  const v = lang === "zh" ? t.zh || t.en || t.id : lang === "en" ? t.en || t.id : t.id || t.en;
  return (v ?? "").trim();
}

/** Trim, case-fold and drop whitespace: how a Praktikan's answer is compared. */
export function normalJawaban(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, "");
}

/** The as-authored answer for one group. */
export function kanonikCelah(c: Celah, nomorKelompok: number): string {
  return c.perKelompok ? c.perKelompok.replaceAll("{n}", String(nomorKelompok)) : c.jawaban;
}

export function cocokCelah(c: Celah, jawaban: string, nomorKelompok: number): boolean {
  const n = String(nomorKelompok);
  const sah = [kanonikCelah(c, nomorKelompok), ...c.juga.map((j) => j.replaceAll("{n}", n))];
  return sah.map(normalJawaban).includes(normalJawaban(jawaban));
}

/** A fresh blank on a marked span, its hint taken from the line's comment. */
export function celahBaru(berkas: KodeBerkas, bahasa: BahasaKode, r: Rentang): Celah {
  const lain: BahasaKode = bahasa === "id" ? "en" : "id";
  const padan = cariPadanan(berkas.sumber[bahasa], r, berkas.sumber[lain], berkas.path);
  const teks = berkas.sumber[bahasa].slice(r.awal, r.akhir);
  const angka = /\d+$/.exec(teks);
  return {
    id: Math.random().toString(36).slice(2, 10),
    nomor: berkas.celah.length + 1,
    posisi: { [bahasa]: r, [lain]: padan } as Record<BahasaKode, Rentang | null>,
    jawaban: teks,
    juga: [],
    perKelompok: null,
    petunjuk: {
      [bahasa]: petunjukBaris(berkas.sumber[bahasa], r, berkas.path),
      [lain]: padan ? petunjukBaris(berkas.sumber[lain], padan, berkas.path) : "",
    } as Record<BahasaKode, string>,
    kenapa: { id: "", en: "" },
    bantuan1: { id: "", en: "" },
    bantuan: { id: "", en: "" },
    bantuan3: { id: "", en: "" },
    ...(angka && /grup|group|kelompok/i.test(teks)
      ? { perKelompok: teks.slice(0, angka.index) + "{n}" }
      : {}),
  };
}
