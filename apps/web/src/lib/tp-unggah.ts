/**
 * A Praktikan's TP upload in IRIS (2026-10-14), in the browser: the pages
 * they picked (photos of the paper, or PDFs) become one PDF under the
 * 3 MB the site takes, then go to POST /api/tp/unggah.
 *
 * Photos are scaled down and re-encoded as JPEG, tighter each round until
 * the whole PDF fits; a PDF is copied in page by page as it is (it can't be
 * shrunk here, so a PDF alone over the limit is refused).
 */

/** What the site takes (api/_lib/tp-unggah.ts UNGGAH_MAKS). */
export const UNGGAH_MAKS = 3 * 1024 * 1024;

/** Pages a Praktikan may add at once. */
export const HALAMAN_MAKS = 20;

export const JENIS_UNGGAH = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/** Longest side (px) and JPEG quality, one round per try. */
const PUTARAN: [number, number][] = [
  [2000, 0.82],
  [1600, 0.72],
  [1280, 0.62],
  [1024, 0.55],
];

/** A4 width in points: every photo page is this wide. */
const LEBAR_A4 = 595.28;

export class GagalUnggah extends Error {
  constructor(public kode: "terlalu_besar" | "rusak" | "kosong") {
    super(kode);
  }
}

async function jpeg(
  f: File,
  sisi: number,
  mutu: number,
): Promise<{ isi: Uint8Array; w: number; h: number }> {
  const bmp = await createImageBitmap(f, { imageOrientation: "from-image" }).catch(() => null);
  if (!bmp) throw new GagalUnggah("rusak");
  const skala = Math.min(1, sisi / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * skala));
  const h = Math.max(1, Math.round(bmp.height * skala));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new GagalUnggah("rusak");
  // White under a transparent PNG, as on paper.
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", mutu));
  if (!blob) throw new GagalUnggah("rusak");
  return { isi: new Uint8Array(await blob.arrayBuffer()), w, h };
}

async function satuPutaran(files: File[], sisi: number, mutu: number): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (const f of files) {
    if (f.type === "application/pdf") {
      const sumber = await PDFDocument.load(await f.arrayBuffer(), {
        ignoreEncryption: true,
      }).catch(() => null);
      if (!sumber) throw new GagalUnggah("rusak");
      for (const p of await doc.copyPages(sumber, sumber.getPageIndices())) doc.addPage(p);
    } else {
      const j = await jpeg(f, sisi, mutu);
      const gambar = await doc.embedJpg(j.isi);
      const tinggi = (LEBAR_A4 * j.h) / j.w;
      doc.addPage([LEBAR_A4, tinggi]).drawImage(gambar, {
        x: 0,
        y: 0,
        width: LEBAR_A4,
        height: tinggi,
      });
    }
  }
  if (!doc.getPageCount()) throw new GagalUnggah("kosong");
  return doc.save();
}

/** The picked pages as one PDF under the limit. A single PDF that already
 *  fits goes as it is. */
export async function susunPdf(files: File[]): Promise<Uint8Array> {
  if (!files.length) throw new GagalUnggah("kosong");
  if (files.length === 1 && files[0].type === "application/pdf") {
    if (files[0].size > UNGGAH_MAKS) throw new GagalUnggah("terlalu_besar");
    const isi = new Uint8Array(await files[0].arrayBuffer());
    if (new TextDecoder().decode(isi.subarray(0, 5)) !== "%PDF-") throw new GagalUnggah("rusak");
    return isi;
  }
  const adaFoto = files.some((f) => f.type !== "application/pdf");
  for (const [sisi, mutu] of PUTARAN) {
    const pdf = await satuPutaran(files, sisi, mutu);
    if (pdf.length <= UNGGAH_MAKS) return pdf;
    // Only photos shrink; PDFs alone come out the same every round.
    if (!adaFoto) break;
  }
  throw new GagalUnggah("terlalu_besar");
}

function base64(isi: Uint8Array): string {
  let s = "";
  for (let i = 0; i < isi.length; i += 0x8000)
    s += String.fromCharCode(...isi.subarray(i, i + 0x8000));
  return btoa(s);
}

export interface JawabUnggah {
  ok: boolean;
  kode?: string;
  sama?: boolean;
}

/** Sends the PDF; a slow phone link gets two minutes. */
export async function kirimUnggah(modul: number, pdf: Uint8Array): Promise<JawabUnggah> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 120_000);
  try {
    const r = await fetch("/api/tp/unggah", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modul, isi: base64(pdf) }),
      signal: ctl.signal,
    });
    if (r.status === 413) return { ok: false, kode: "terlalu_besar" };
    if (!r.ok) return { ok: false, kode: `http_${r.status}` };
    return (await r.json()) as JawabUnggah;
  } catch {
    return { ok: false, kode: "jaringan" };
  } finally {
    clearTimeout(timer);
  }
}
