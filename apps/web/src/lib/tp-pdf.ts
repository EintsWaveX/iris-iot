/**
 * The formal TP PDF (Phase 13, Penilaian › Soal TP): the paper Asisten
 * upload to each class's TP assignment in the LMS, made in the browser with
 * pdf-lib like the other exports (src/lib/pdf.ts) and loaded only when one
 * is made.
 *
 * A4, a campus style head on every page (the IRIS mark, Laboratorium IRIS
 * and its unit, the module and semester, the four module colours as a band)
 * and a foot with the class, the language and "page n of m". Page one opens
 * with the title, the window and the instructions box; then the ten
 * questions, each with who answers it. The key version adds every answer
 * (code in a mono face, tables, diagrams) and is marked for Asisten only.
 * Mandarin is Beta: its head carries the mark and its foot says the
 * Indonesian or English paper is the one that counts.
 */
import type { Lang } from "./kelas";
import { MODUL_NAMA } from "./app";
import {
  TP_NOMOR,
  poinNomor,
  blokTeks,
  sasaranNomor,
  type JendelaTp,
  type KelasTp,
  type SoalTampil,
} from "./tp";

/** The paper's own words, in the paper's language. */
const KATA = {
  id: {
    lab: "LABORATORIUM IRIS",
    praktikum: "Praktikum Internet of Things",
    unit: "Divisi ASIC · S1 Teknik Elektro · Fakultas Teknik Elektro · Telkom University",
    kepala: "TUGAS PENDAHULUAN",
    kunciKepala: "KUNCI JAWABAN · RAHASIA",
    judul: (m: number) => `Tugas Pendahuluan Modul ${m}`,
    judulPendek: (m: number) => `TP Modul ${m}`,
    modulPendek: (m: number) => `Modul ${m}`,
    kunciH: "Kunci Jawaban",
    kelas: "Kelas",
    reguler: "Reguler",
    inter: "Internasional",
    bahasaNama: "Bahasa Indonesia",
    dibuka: "Dibuka",
    ditutup: "Batas Pengumpulan",
    jadwal: "Jadwal",
    jadwalLms: "Mengikuti tugas di LMS",
    pengumpulan: "Pengumpulan",
    pengumpulanIsi: (m: number) => `Satu file PDF di tugas "TP Modul ${m}" pada kelas LMS-mu`,
    bobot: "Penilaian",
    bobotIsi: "Nomor 1 dan 10 masing-masing 20 poin, nomor lainnya 15 poin, total 100",
    petunjuk: "Petunjuk Pengerjaan",
    soal: "Soal",
    soalKunci: "Soal dan Kunci Jawaban",
    sasaran: { semua: "Semua praktikan", genap: "NIM genap", ganjil: "NIM ganjil" },
    poin: (p: number) => `${p} poin`,
    kunciKosong: "Kunci belum ditulis.",
    gambarHilang: "Gambar tidak ditemukan.",
    halaman: (a: number, b: number) => `Halaman ${a} dari ${b}`,
    dibuat: (d: string) => `Dibuat dengan IRIS pada ${d}`,
    rahasia: "Rahasia. Hanya untuk Asisten; jangan dibagikan ke praktikan.",
    betaCatatan: "",
    semester: (s: string) => {
      const [y, k] = s.split("-");
      return `Semester ${k === "ganjil" ? "Ganjil" : "Genap"} ${y}/${Number(y) + 1}`;
    },
  },
  en: {
    lab: "IRIS LABORATORY",
    praktikum: "Internet of Things Practicum",
    unit: "ASIC Division · Electrical Engineering · School of Electrical Engineering · Telkom University",
    kepala: "PRELIMINARY ASSIGNMENT",
    kunciKepala: "ANSWER KEY · CONFIDENTIAL",
    judul: (m: number) => `Preliminary Assignment, Module ${m}`,
    judulPendek: (m: number) => `TP Module ${m}`,
    modulPendek: (m: number) => `Module ${m}`,
    kunciH: "Answer Key",
    kelas: "Class",
    reguler: "Regular",
    inter: "International",
    bahasaNama: "English",
    dibuka: "Opens",
    ditutup: "Deadline",
    jadwal: "Schedule",
    jadwalLms: "As set in the LMS assignment",
    pengumpulan: "Submission",
    pengumpulanIsi: (m: number) =>
      `One PDF file in the "TP Modul ${m}" assignment of your LMS class`,
    bobot: "Scoring",
    bobotIsi: "Numbers 1 and 10 are 20 points each, the others 15 points, 100 in all",
    petunjuk: "Instructions",
    soal: "Questions",
    soalKunci: "Questions and Answer Key",
    sasaran: { semua: "Everyone", genap: "Even NIM", ganjil: "Odd NIM" },
    poin: (p: number) => `${p} points`,
    kunciKosong: "No key written yet.",
    gambarHilang: "Diagram not found.",
    halaman: (a: number, b: number) => `Page ${a} of ${b}`,
    dibuat: (d: string) => `Made with IRIS on ${d}`,
    rahasia: "Confidential. For Asisten only; do not share with students.",
    betaCatatan: "",
    semester: (s: string) => {
      const [y, k] = s.split("-");
      return `${k === "ganjil" ? "Odd" : "Even"} Semester ${y}/${Number(y) + 1}`;
    },
  },
  zh: {
    lab: "IRIS 实验室",
    praktikum: "物联网实验课",
    unit: "Telkom University 电气工程学院 · 电气工程专业 · ASIC 部门",
    kepala: "预习作业",
    kunciKepala: "参考答案 · 机密",
    judul: (m: number) => `模块 ${m} 预习作业`,
    judulPendek: (m: number) => `模块 ${m} 预习作业`,
    modulPendek: (m: number) => `模块 ${m}`,
    kunciH: "参考答案",
    kelas: "班级",
    reguler: "普通班",
    inter: "国际班",
    bahasaNama: "中文（Beta）",
    dibuka: "开放时间",
    ditutup: "截止时间",
    jadwal: "时间",
    jadwalLms: "以 LMS 作业为准",
    pengumpulan: "提交方式",
    pengumpulanIsi: (m: number) => `在 LMS 班级的“TP Modul ${m}”作业中提交一个 PDF 文件`,
    bobot: "评分",
    bobotIsi: "第 1 题和第 10 题各 20 分，其余每题 15 分，共 100 分",
    petunjuk: "答题说明",
    soal: "题目",
    soalKunci: "题目与参考答案",
    sasaran: { semua: "所有学生", genap: "学号为偶数", ganjil: "学号为奇数" },
    poin: (p: number) => `${p} 分`,
    kunciKosong: "尚未填写参考答案。",
    gambarHilang: "找不到图片。",
    halaman: (a: number, b: number) => `第 ${a} 页，共 ${b} 页`,
    dibuat: (d: string) => `由 IRIS 生成于 ${d}`,
    rahasia: "机密：仅供助教使用，请勿发给学生。",
    betaCatatan: "中文版为测试版（Beta），以印尼语或英语版本为准。",
    semester: (s: string) => {
      const [y, k] = s.split("-");
      return `${y}/${Number(y) + 1} ${k === "ganjil" ? "第一" : "第二"}学期`;
    },
  },
} satisfies Record<Lang, unknown>;

export interface TpPdfIsi {
  modul: number;
  /** The paper's language. */
  bahasa: Lang;
  /** The class the paper is for; null (Mandarin) names both. */
  kelas: KelasTp | null;
  semester: string;
  jendela: JendelaTp | null;
  petunjuk: string;
  soal: SoalTampil[];
  /** The key version: each question's key and its diagrams. */
  kunci?: { teks: string; gambar?: string[] }[];
}

const A4: [number, number] = [595.28, 841.89];
const TEPI = 54;
const ATAS = A4[1] - TEPI - 62; // content starts under the head
const BAWAH = TEPI + 34; // and stops over the foot
const LEBAR = A4[0] - TEPI * 2;

const MODUL_WARNA: Record<number, [number, number, number]> = {
  1: [0.059, 0.435, 0.702],
  2: [0.357, 0.31, 0.82],
  3: [0.031, 0.502, 0.353],
  4: [0.698, 0.353, 0.078],
};
const TINTA: [number, number, number] = [0.1, 0.11, 0.16];
const ABU: [number, number, number] = [0.42, 0.45, 0.52];
const GARIS: [number, number, number] = [0.84, 0.86, 0.9];
const LATAR: [number, number, number] = [0.955, 0.962, 0.975];
const MERAH: [number, number, number] = [0.72, 0.13, 0.16];

let sc: Promise<{ bytes: ArrayBuffer; chars: Set<string> }> | null = null;
function fontSc() {
  sc ??= Promise.all([
    fetch("/fonts/pdf-sc.ttf").then((r) => r.arrayBuffer()),
    fetch("/fonts/pdf-sc.chars.txt").then((r) => r.text()),
  ]).then(([bytes, chars]) => ({ bytes, chars: new Set([...chars]) }));
  return sc;
}

function winAnsi(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e\xa0-\xff•…€]/g, (c) => (c === "\t" ? "  " : "?"));
}

function bytesDari(dataUrl: string): { bytes: Uint8Array; png: boolean } | null {
  const m = dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (!m) return null;
  const bin = atob(m[2]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return { bytes: out, png: m[1] === "png" };
}

/** "Rabu, 14 Oktober 2026 · 18:00 WIB" */
function waktu(iso: string, lang: Lang): string {
  const loc = lang === "en" ? "en-GB" : lang === "zh" ? "zh-CN" : "id-ID";
  const d = new Date(iso);
  const tgl = d.toLocaleDateString(loc, {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const jam = d.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${tgl} · ${jam} WIB`;
}

export function namaBerkasTp(i: Pick<TpPdfIsi, "modul" | "bahasa" | "kelas" | "kunci">): string {
  const kelas = i.bahasa === "zh" ? "ZH-Beta" : i.kelas === "inter" ? "Internasional" : "Reguler";
  return `${i.kunci ? "Kunci_" : ""}TP_Modul-${i.modul}_${kelas}.pdf`;
}

/** Builds the paper; the bytes, so a caller can save or preview them. */
export async function buatPdfTp(isi: TpPdfIsi): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const p = KATA[isi.bahasa];
  const doc = await PDFDocument.create();
  doc.setTitle(`${p.judul(isi.modul)}${isi.kunci ? ` · ${p.kunciH}` : ""}`);
  doc.setAuthor("Laboratorium IRIS");
  doc.setCreator("IRIS");
  doc.setSubject(MODUL_NAMA[isi.modul] ?? "");

  let font;
  let tebal;
  let bersih: (s: string) => string;
  const zh = isi.bahasa === "zh";
  if (zh) {
    const [{ default: fontkit }, f] = await Promise.all([import("@pdf-lib/fontkit"), fontSc()]);
    doc.registerFontkit(fontkit);
    // Whole, not subset: pdf-lib's subsetting drops glyphs of this font
    // (blank characters; seen 2026-10-12), so every Mandarin PDF carries
    // the ~1 MB subset font as it is.
    font = await doc.embedFont(f.bytes, { subset: false });
    tebal = font;
    const latin = (c: string) => {
      const n = c.codePointAt(0)!;
      return (n >= 0x20 && n < 0x7f) || (n >= 0xa0 && n < 0x180) || (n >= 0x2010 && n < 0x2070);
    };
    bersih = (s) =>
      [...s.replace(/\t/g, "  ")].map((c) => (latin(c) || f.chars.has(c) ? c : "?")).join("");
  } else {
    font = await doc.embedFont(StandardFonts.Helvetica);
    tebal = await doc.embedFont(StandardFonts.HelveticaBold);
    bersih = winAnsi;
  }
  const mono = await doc.embedFont(StandardFonts.Courier);
  type F = typeof font;
  const warna = (w: number[]) => rgb(w[0], w[1], w[2]);
  const mw = MODUL_WARNA[isi.modul] ?? MODUL_WARNA[1];
  const tint = mw.map((c) => 1 - (1 - c) * 0.1) as [number, number, number];

  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  try {
    const b = await fetch("/brand/iris-logo-mark.png").then((r) => r.arrayBuffer());
    logo = await doc.embedPng(b);
  } catch {
    logo = null;
  }

  let page = doc.addPage(A4);
  let y = ATAS;
  const baru = () => {
    page = doc.addPage(A4);
    y = ATAS;
  };
  const butuh = (h: number) => {
    if (y - h < BAWAH) baru();
  };
  /** Draws a word, bold by a faint double strike where the face has no bold. */
  const tulisKata = (s: string, x: number, yy: number, size: number, f: F, w: number[]) => {
    page.drawText(s, { x, y: yy, size, font: f, color: warna(w) });
    if (zh && f === tebal && f !== mono)
      page.drawText(s, { x: x + 0.3, y: yy, size, font: f, color: warna(w) });
  };
  const bungkus = (teks: string, f: F, size: number, max: number): string[] => {
    const out: string[] = [];
    for (const para of teks.split("\n")) {
      if (!para.trim()) {
        out.push("");
        continue;
      }
      const token = bersih(para).match(/[　-鿿＀-￯]|[^\s　-鿿＀-￯]+|\s+/g) ?? [];
      let line = "";
      for (const tk of token) {
        const coba = line + tk;
        // closing CJK punctuation stays with the line it ends
        const tutup = /^[。，、；：！？）」』】》]$/.test(tk);
        if (f.widthOfTextAtSize(coba, size) <= max || !line.trim() || tutup) {
          line = coba;
          while (f.widthOfTextAtSize(line, size) > max && line.length > 1) {
            let i = line.length - 1;
            while (i > 1 && f.widthOfTextAtSize(line.slice(0, i), size) > max) i--;
            out.push(line.slice(0, i));
            line = line.slice(i);
          }
        } else {
          out.push(line.trimEnd());
          line = tk.trimStart();
        }
      }
      if (line.trim()) out.push(line.trimEnd());
    }
    return out.length ? out : [""];
  };
  /** A wrapped paragraph from the cursor; `bar` draws the key's left rule. */
  const paragraf = (
    teks: string,
    o: {
      f?: F;
      size?: number;
      w?: number[];
      x?: number;
      max?: number;
      jarak?: number;
      bar?: boolean;
    } = {},
  ) => {
    const f = o.f ?? font;
    const size = o.size ?? 10.5;
    const x = o.x ?? TEPI;
    const max = o.max ?? LEBAR - (x - TEPI);
    const lh = size * (zh ? 1.6 : 1.45);
    for (const l of bungkus(teks, f, size, max)) {
      butuh(lh);
      if (o.bar)
        page.drawRectangle({ x: TEPI + 30, y: y - lh, width: 2, height: lh, color: warna(mw) });
      tulisKata(l, x, y - size, size, f, o.w ?? TINTA);
      y -= lh;
    }
    y -= o.jarak ?? 0;
  };
  /** A label beside its text (a part's letter, a bullet, an info row's
   *  name): room for the first line comes first, so a page break never
   *  parts them. */
  const pasang = (
    label: string,
    lo: Parameters<typeof paragraf>[1],
    teks: string,
    to: Parameters<typeof paragraf>[1],
  ) => {
    butuh((to?.size ?? 10.5) * (zh ? 1.6 : 1.45));
    const awal = y;
    const pg = page;
    paragraf(label, lo);
    const habis = y;
    y = awal;
    paragraf(teks, to);
    if (page === pg) y = Math.min(y, habis);
  };

  /* ------------------------------------------------------ title block */
  paragraf(isi.kunci ? `${p.judul(isi.modul)} · ${p.kunciH}` : p.judul(isi.modul), {
    f: tebal,
    size: 19,
    jarak: 2,
  });
  paragraf(MODUL_NAMA[isi.modul] ?? "", { size: 12, w: mw, jarak: 10 });

  const kelasNama =
    isi.kelas === "inter"
      ? p.inter
      : isi.kelas === "reguler"
        ? p.reguler
        : `${p.reguler} / ${p.inter}`;
  const info: [string, string][] = [
    [p.kelas, `${kelasNama} · ${p.bahasaNama}`],
    ...(isi.jendela
      ? ([
          [p.dibuka, waktu(isi.jendela.buka, isi.bahasa)],
          [p.ditutup, waktu(isi.jendela.tutup, isi.bahasa)],
        ] as [string, string][])
      : ([[p.jadwal, p.jadwalLms]] as [string, string][])),
    [p.pengumpulan, p.pengumpulanIsi(isi.modul)],
    [p.bobot, p.bobotIsi],
  ];
  const kunciW = Math.max(...info.map(([k]) => tebal.widthOfTextAtSize(bersih(k), 9.5))) + 18;
  for (const [k, v] of info)
    pasang(k, { f: tebal, size: 9.5, w: ABU, max: kunciW - 8 }, v, {
      size: 9.5,
      x: TEPI + kunciW,
    });
  y -= 12;

  // The instructions box: measured, then drawn behind its lines.
  const baris = isi.petunjuk
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const pad = 12;
  const ukur = baris.reduce(
    (a, l) => a + bungkus(l, font, 9.5, LEBAR - pad * 2 - 12).length * 9.5 * (zh ? 1.6 : 1.45),
    0,
  );
  const tinggi = ukur + pad * 2 + 18;
  butuh(tinggi);
  page.drawRectangle({
    x: TEPI,
    y: y - tinggi,
    width: LEBAR,
    height: tinggi,
    color: warna(tint),
    borderColor: warna(mw),
    borderWidth: 0.8,
  });
  page.drawRectangle({ x: TEPI, y: y - tinggi, width: 3, height: tinggi, color: warna(mw) });
  y -= pad;
  paragraf(p.petunjuk, { f: tebal, size: 10, x: TEPI + pad, w: mw, jarak: 3 });
  for (const l of baris)
    pasang("•", { size: 9.5, x: TEPI + pad }, l, {
      size: 9.5,
      x: TEPI + pad + 12,
      max: LEBAR - pad * 2 - 12,
    });
  y -= pad + 14;

  /* ---------------------------------------------------------- questions */
  paragraf(isi.kunci ? p.soalKunci : p.soal, { f: tebal, size: 13, jarak: 8 });
  const gambarCache = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();

  for (let i = 0; i < TP_NOMOR; i++) {
    const q = isi.soal[i];
    if (!q) continue;
    const no = i + 1;
    const ukuran = 10.5;
    const lh = ukuran * (zh ? 1.6 : 1.45);
    // keep the number with its first two lines
    butuh(lh * 3 + 14);
    const s = sasaranNomor(no);
    page.drawRectangle({ x: TEPI, y: y - 20, width: 22, height: 20, color: warna(mw) });
    const nos = String(no);
    page.drawText(nos, {
      x: TEPI + 11 - tebal.widthOfTextAtSize(nos, 10.5) / 2,
      y: y - 14.5,
      size: 10.5,
      font: tebal,
      color: rgb(1, 1, 1),
    });
    const tag = `${p.sasaran[s]} · ${p.poin(poinNomor(no))}`;
    paragraf(tag, { size: 8, x: TEPI + 32, w: s === "semua" ? mw : ABU, jarak: 1 });
    paragraf(q.teks, { x: TEPI + 32, jarak: 2 });
    for (const [j, b] of (q.bagian ?? []).entries())
      pasang(`${"abcdefgh"[j]}.`, { x: TEPI + 40, f: tebal }, b, { x: TEPI + 54, jarak: 1 });
    y -= 6;

    const k = isi.kunci?.[i];
    if (isi.kunci) {
      butuh(lh * 2);
      paragraf(p.kunciH, { f: tebal, size: 8.5, x: TEPI + 38, w: mw, bar: true });
      if (!k?.teks.trim()) paragraf(p.kunciKosong, { size: 9.5, x: TEPI + 38, w: ABU, bar: true });
      for (const b of blokTeks(k?.teks ?? "")) {
        const x0 = TEPI + 38;
        const max = LEBAR - 38;
        if (b.k === "p") paragraf(b.teks, { size: 9.5, x: x0, max, bar: true, jarak: 1 });
        else if (b.k === "bagian")
          pasang(`${b.huruf}.`, { size: 9.5, x: x0, f: tebal, bar: true }, b.teks, {
            size: 9.5,
            x: x0 + 14,
            max: max - 14,
            jarak: 1,
            bar: true,
          });
        else if (b.k === "butir")
          for (const x of b.teks)
            pasang("•", { size: 9.5, x: x0 + 2, bar: true }, x, {
              size: 9.5,
              x: x0 + 12,
              max: max - 12,
              bar: true,
            });
        else if (b.k === "kode") {
          y -= 2;
          const ls = b.teks.split("\n");
          const lhk = 8.5 * 1.35;
          for (const l of ls) {
            // a long line wraps by characters in the mono face
            const potong: string[] = [];
            let sisa = winAnsi(l);
            const muat = Math.floor((max - 12) / mono.widthOfTextAtSize("M", 8.5));
            while (sisa.length > muat) {
              potong.push(sisa.slice(0, muat));
              sisa = "  " + sisa.slice(muat);
            }
            potong.push(sisa);
            for (const c of potong) {
              butuh(lhk);
              page.drawRectangle({
                x: x0,
                y: y - lhk,
                width: max,
                height: lhk,
                color: warna(LATAR),
              });
              page.drawRectangle({
                x: TEPI + 30,
                y: y - lhk,
                width: 2,
                height: lhk,
                color: warna(mw),
              });
              page.drawText(c, {
                x: x0 + 6,
                y: y - 8.5,
                size: 8.5,
                font: mono,
                color: warna(TINTA),
              });
              y -= lhk;
            }
          }
          y -= 4;
        } else if (b.k === "tabel") {
          const size = 8.5;
          const cols = Math.max(...b.baris.map((r) => r.length));
          const lebarK = b.baris[0].map((_, c) =>
            Math.min(
              170,
              Math.max(...b.baris.map((r) => tebal.widthOfTextAtSize(bersih(r[c] ?? ""), size))) +
                10,
            ),
          );
          const tot = lebarK.reduce((a, x) => a + x, 0);
          const w = lebarK.map((x) => (x / tot) * max);
          const xs = w.map((_, c) => x0 + w.slice(0, c).reduce((a, x) => a + x, 0));
          const rowH = (r: string[], f: F) =>
            Math.max(...r.map((c, j) => bungkus(c, f, size, w[j] - 8).length)) * size * 1.35 + 6;
          b.baris.forEach((r0, ri) => {
            const r = Array.from({ length: cols }, (_, c) => r0[c] ?? "");
            const f = ri === 0 ? tebal : font;
            const h = rowH(r, f);
            butuh(h);
            if (ri === 0)
              page.drawRectangle({ x: x0, y: y - h, width: max, height: h, color: warna(tint) });
            page.drawRectangle({ x: TEPI + 30, y: y - h, width: 2, height: h, color: warna(mw) });
            r.forEach((c, j) =>
              bungkus(c, f, size, w[j] - 8).forEach((l, n) =>
                tulisKata(l, xs[j] + 4, y - 4 - size - n * size * 1.35, size, f, TINTA),
              ),
            );
            y -= h;
            page.drawLine({
              start: { x: x0, y },
              end: { x: x0 + max, y },
              thickness: 0.4,
              color: warna(GARIS),
            });
          });
          y -= 6;
        } else if (b.k === "gambar") {
          const url = k?.gambar?.[b.i];
          const raw = url ? bytesDari(url) : null;
          if (!raw) {
            paragraf(p.gambarHilang, { size: 9, x: x0, w: ABU, bar: true });
            continue;
          }
          let img = gambarCache.get(url!);
          if (!img) {
            img = raw.png ? await doc.embedPng(raw.bytes) : await doc.embedJpg(raw.bytes);
            gambarCache.set(url!, img);
          }
          const sk = Math.min(1, (max - 8) / img.width, 240 / img.height);
          const h = img.height * sk;
          butuh(h + 8);
          page.drawRectangle({
            x: TEPI + 30,
            y: y - h - 8,
            width: 2,
            height: h + 8,
            color: warna(mw),
          });
          page.drawImage(img, { x: x0 + 4, y: y - h - 4, width: img.width * sk, height: h });
          y -= h + 8;
        }
      }
      y -= 10;
    }
    y -= 4;
  }

  /* ------------------------------------------- the head and foot, all pages */
  const pages = doc.getPages();
  const dibuat = new Date().toISOString();
  pages.forEach((pg, n) => {
    const top = A4[1] - TEPI;
    if (logo) {
      const s = 26 / logo.height;
      pg.drawImage(logo, { x: TEPI, y: top - 28, width: logo.width * s, height: 26 });
    }
    const xT = TEPI + (logo ? (logo.width * 26) / logo.height + 10 : 0);
    const kata = (s: string, x: number, yy: number, size: number, f: F, w: number[]) => {
      pg.drawText(bersih(s), { x, y: yy, size, font: f, color: warna(w) });
      if (zh && f === tebal)
        pg.drawText(bersih(s), { x: x + 0.3, y: yy, size, font: f, color: warna(w) });
    };
    const kanan = (s: string, yy: number, size: number, f: F, w: number[]) =>
      kata(s, A4[0] - TEPI - f.widthOfTextAtSize(bersih(s), size), yy, size, f, w);
    kata(p.lab, xT, top - 9, 10.5, tebal, TINTA);
    kata(p.praktikum, xT, top - 20, 8.5, font, TINTA);
    kata(p.unit, xT, top - 30, 7, font, ABU);
    kanan(isi.kunci ? p.kunciKepala : p.kepala, top - 9, 8.5, tebal, isi.kunci ? MERAH : mw);
    kanan(
      `${p.modulPendek(isi.modul)} · ${MODUL_NAMA[isi.modul] ?? ""}`,
      top - 20,
      8.5,
      font,
      TINTA,
    );
    kanan(p.semester(isi.semester), top - 30, 7, font, ABU);
    if (zh) {
      const bw = tebal.widthOfTextAtSize("BETA", 7) + 10;
      const bx = A4[0] - TEPI - bw;
      pg.drawRectangle({
        x: bx,
        y: top - 46,
        width: bw,
        height: 11,
        color: warna(tint),
        borderColor: warna(mw),
        borderWidth: 0.6,
      });
      pg.drawText("BETA", { x: bx + 5, y: top - 43.5, size: 7, font: tebal, color: warna(mw) });
    }
    // the band: the four module colours, then this module's rule
    const yb = top - 40;
    [1, 2, 3, 4].forEach((m, j) =>
      pg.drawRectangle({
        x: TEPI + j * 14,
        y: yb,
        width: 14,
        height: 3,
        color: warna(MODUL_WARNA[m]),
      }),
    );
    pg.drawRectangle({
      x: TEPI + 60,
      y: yb + 1,
      width: LEBAR - 60 - (zh ? 46 : 0),
      height: 1,
      color: warna(mw),
    });

    // the foot
    const yf = TEPI + 14;
    pg.drawLine({
      start: { x: TEPI, y: yf + 12 },
      end: { x: A4[0] - TEPI, y: yf + 12 },
      thickness: 0.5,
      color: warna(GARIS),
    });
    kata(
      `IRIS · ${p.judulPendek(isi.modul)} · ${kelasNama} · ${p.bahasaNama}`,
      TEPI,
      yf,
      7.5,
      font,
      ABU,
    );
    kanan(p.halaman(n + 1, pages.length), yf, 7.5, font, ABU);
    const bawah = isi.kunci ? p.rahasia : zh ? p.betaCatatan : p.dibuat(waktu(dibuat, isi.bahasa));
    kata(bawah, TEPI, yf - 10, 6.5, font, isi.kunci ? MERAH : ABU);
  });

  return doc.save();
}

/** Builds the paper and hands it to the browser as a download. */
export async function unduhPdfTp(isi: TpPdfIsi): Promise<string> {
  const bytes = await buatPdfTp(isi);
  const nama = namaBerkasTp(isi);
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return nama;
}
