/**
 * PDF downloads (Phase 9 Stage 6b: Reports' "PDF" export, a written
 * report's "Export PDF"), written in the browser with pdf-lib, loaded only
 * when someone exports. Indonesian and English draw with Helvetica (no
 * download); Mandarin draws with a Noto Sans SC subset made by
 * scripts/subset_pdf_cjk.py. A character the font lacks prints as "?".
 *
 * The document is a list of parts (title, meta line, heading, paragraph,
 * key-value rows, table) laid out top to bottom on A4 pages, with tables
 * repeating their header after a page break.
 */
import type { Lang } from "./kelas";

export type BagianPdf =
  | { k: "judul"; teks: string }
  | { k: "meta"; teks: string }
  | { k: "sub"; teks: string }
  | { k: "p"; teks: string; abu?: boolean }
  | { k: "kv"; baris: [string, string][] }
  | { k: "tabel"; kepala: string[]; baris: (string | number | null)[][] }
  | { k: "garis" };

const A4: [number, number] = [595.28, 841.89];
const TEPI = 48;
const WARNA = { teks: [0.1, 0.11, 0.16], abu: [0.42, 0.45, 0.52], garis: [0.84, 0.86, 0.9] };

/** Characters the CJK subset covers, beyond Latin. */
let sc: Promise<{ bytes: ArrayBuffer; chars: Set<string> }> | null = null;
function fontSc() {
  sc ??= Promise.all([
    fetch("/fonts/pdf-sc.ttf").then((r) => r.arrayBuffer()),
    fetch("/fonts/pdf-sc.chars.txt").then((r) => r.text()),
  ]).then(([bytes, chars]) => ({ bytes, chars: new Set([...chars]) }));
  return sc;
}

/** Helvetica's WinAnsi set, near enough: ASCII, Latin-1 and the usual
 *  punctuation. Anything else becomes "?". */
function winAnsi(s: string): string {
  return s.replace(/[^\x20-\x7e\xa0-\xff–—‘’“”•…€]/g, (c) =>
    c === "\n" || c === "\t" ? " " : "?",
  );
}

export async function unduhPdf(nama: string, bagian: BagianPdf[], lang: Lang): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  let font;
  let tebal;
  let bersih: (s: string) => string;
  if (lang === "zh") {
    const [{ default: fontkit }, f] = await Promise.all([import("@pdf-lib/fontkit"), fontSc()]);
    doc.registerFontkit(fontkit);
    font = await doc.embedFont(f.bytes, { subset: true });
    tebal = font;
    const latin = (c: string) => {
      const n = c.codePointAt(0)!;
      return (n >= 0x20 && n < 0x7f) || (n >= 0xa0 && n < 0x180) || (n >= 0x2010 && n < 0x2070);
    };
    bersih = (s) =>
      [...s.replace(/[\n\t]/g, " ")].map((c) => (latin(c) || f.chars.has(c) ? c : "?")).join("");
  } else {
    font = await doc.embedFont(StandardFonts.Helvetica);
    tebal = await doc.embedFont(StandardFonts.HelveticaBold);
    bersih = winAnsi;
  }
  const warna = (w: number[]) => rgb(w[0], w[1], w[2]);
  const lebar = A4[0] - TEPI * 2;
  let page = doc.addPage(A4);
  let y = A4[1] - TEPI;

  const baru = () => {
    page = doc.addPage(A4);
    y = A4[1] - TEPI;
  };
  const butuh = (h: number) => {
    if (y - h < TEPI) baru();
  };
  /** Word wrap; CJK text may break between any two characters. */
  const bungkus = (teks: string, f: typeof font, size: number, max: number): string[] => {
    const out: string[] = [];
    for (const para of teks.split("\n")) {
      if (!para.trim()) {
        out.push("");
        continue;
      }
      const token = bersih(para).match(/[　-鿿＀-￯]|[^\s　-鿿＀-￯]+|\s+/g) ?? [];
      let line = "";
      for (const t of token) {
        const coba = line + t;
        if (f.widthOfTextAtSize(coba, size) <= max || !line.trim()) {
          line = coba;
          // a single token wider than the line is cut by characters
          while (f.widthOfTextAtSize(line, size) > max && line.length > 1) {
            let i = line.length - 1;
            while (i > 1 && f.widthOfTextAtSize(line.slice(0, i), size) > max) i--;
            out.push(line.slice(0, i));
            line = line.slice(i);
          }
        } else {
          out.push(line.trimEnd());
          line = t.trimStart();
        }
      }
      if (line.trim()) out.push(line.trimEnd());
    }
    return out.length ? out : [""];
  };
  const tulis = (
    teks: string,
    f: typeof font,
    size: number,
    w: number[],
    x = TEPI,
    max = lebar,
  ) => {
    for (const l of bungkus(teks, f, size, max)) {
      butuh(size * 1.45);
      page.drawText(l, { x, y: y - size, size, font: f, color: warna(w) });
      y -= size * 1.45;
    }
  };

  for (const b of bagian) {
    if (b.k === "judul") {
      tulis(b.teks, tebal, 18, WARNA.teks);
      y -= 4;
    } else if (b.k === "meta") {
      tulis(b.teks, font, 9.5, WARNA.abu);
      y -= 8;
    } else if (b.k === "sub") {
      y -= 8;
      butuh(30);
      tulis(b.teks, tebal, 12.5, WARNA.teks);
      y -= 2;
    } else if (b.k === "p") {
      tulis(b.teks, font, 10.5, b.abu ? WARNA.abu : WARNA.teks);
      y -= 4;
    } else if (b.k === "garis") {
      butuh(12);
      page.drawLine({
        start: { x: TEPI, y: y - 4 },
        end: { x: A4[0] - TEPI, y: y - 4 },
        thickness: 0.6,
        color: warna(WARNA.garis),
      });
      y -= 12;
    } else if (b.k === "kv") {
      const kunciW = Math.min(
        170,
        Math.max(...b.baris.map(([k]) => tebal.widthOfTextAtSize(bersih(k), 10))) + 12,
      );
      for (const [k, v] of b.baris) {
        const awal = y;
        tulis(k, tebal, 10, WARNA.abu, TEPI, kunciW - 8);
        const habis = y;
        y = awal;
        tulis(v, font, 10, WARNA.teks, TEPI + kunciW, lebar - kunciW);
        y = Math.min(y, habis) - 2;
      }
      y -= 4;
    } else if (b.k === "tabel") {
      const size = 9;
      const cols = b.kepala.length;
      // Width per column from its longest cell, capped, then scaled to fit.
      const ukur = b.kepala.map((h, i) =>
        Math.min(
          200,
          Math.max(
            tebal.widthOfTextAtSize(bersih(h), size),
            ...b.baris.map((r) => font.widthOfTextAtSize(bersih(String(r[i] ?? "")), size)),
          ) + 10,
        ),
      );
      const total = ukur.reduce((a, x) => a + x, 0);
      const w = ukur.map((x) => (x / total) * lebar);
      const xs = w.map((_, i) => TEPI + w.slice(0, i).reduce((a, x) => a + x, 0));
      const barisTinggi = (r: string[], f: typeof font) =>
        Math.max(...r.map((c, i) => bungkus(c, f, size, w[i] - 8).length)) * size * 1.35 + 6;
      const gambar = (r: string[], f: typeof font, warnaT: number[]) => {
        const h = barisTinggi(r, f);
        r.forEach((c, i) => {
          bungkus(c, f, size, w[i] - 8).forEach((l, j) =>
            page.drawText(l, {
              x: xs[i] + 4,
              y: y - 4 - size - j * size * 1.35,
              size,
              font: f,
              color: warna(warnaT),
            }),
          );
        });
        y -= h;
        page.drawLine({
          start: { x: TEPI, y },
          end: { x: A4[0] - TEPI, y },
          thickness: 0.4,
          color: warna(WARNA.garis),
        });
      };
      const kepala = b.kepala.map(String);
      butuh(barisTinggi(kepala, tebal) * 2);
      gambar(kepala, tebal, WARNA.abu);
      for (const r of b.baris) {
        const sel = Array.from({ length: cols }, (_, i) => (r[i] == null ? "" : String(r[i])));
        if (y - barisTinggi(sel, font) < TEPI) {
          baru();
          gambar(kepala, tebal, WARNA.abu);
        }
        gambar(sel, font, WARNA.teks);
      }
      y -= 10;
    }
  }

  const bytes = await doc.save();
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nama.endsWith(".pdf") ? nama : `${nama}.pdf`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
