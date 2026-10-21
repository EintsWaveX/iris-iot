/**
 * A Praktikan's TP upload, in the browser (2026-10-21: TP is handed in only
 * in IRIS). The pages they picked (photos of the paper, or PDFs) become one
 * PDF, then go straight to the relay's R2 (api/_lib/tp-unggah.ts):
 *
 *   ticket (POST /api/tp/tiket) → PUT the bytes, with progress → confirm
 *   (POST /api/tp/unggah)
 *
 * Photos are decoded once into a bitmap no larger than the first round
 * needs, then re-encoded as JPEG, tighter each round until the PDF fits;
 * a PDF is copied in page by page as it is. The bytes are addressed by
 * their SHA-256, so a retry after a dropped connection is harmless.
 */
import { sha256Hex } from "./tp-r2";

/** What the site takes (api/_lib/tp-unggah.ts UNGGAH_MAKS). */
export const UNGGAH_MAKS = 15 * 1024 * 1024;

/** A photo-built PDF stops shrinking once it fits this: quick to open when grading. */
const SASARAN_FOTO = 6 * 1024 * 1024;

/** Pages a Praktikan may add at once. */
export const HALAMAN_MAKS = 30;

export const JENIS_UNGGAH = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/** Longest side (px) and JPEG quality, one round per try. */
const PUTARAN: [number, number][] = [
  [2000, 0.82],
  [1600, 0.74],
  [1280, 0.64],
  [1024, 0.55],
];

/** A4 width in points: every photo page is this wide. */
const LEBAR_A4 = 595.28;

export type Sudut = 0 | 90 | 180 | 270;

export interface Halaman {
  id: string;
  berkas: File;
  putar: Sudut;
}

export class GagalUnggah extends Error {
  constructor(public kode: "terlalu_besar" | "rusak" | "kosong") {
    super(kode);
  }
}

let urut = 0;
export const halamanBaru = (f: File): Halaman => ({ id: `h${++urut}`, berkas: f, putar: 0 });

/** Decoded photos, kept while the page is picked (one decode per photo). */
const bitmap = new WeakMap<File, Promise<ImageBitmap | null>>();

function decode(f: File): Promise<ImageBitmap | null> {
  let p = bitmap.get(f);
  if (!p) {
    p = createImageBitmap(f, { imageOrientation: "from-image" })
      .then(async (b) => {
        // Only as large as the first round draws it.
        const skala = Math.min(1, PUTARAN[0][0] / Math.max(b.width, b.height));
        if (skala >= 1) return b;
        const kecil = await createImageBitmap(b, {
          resizeWidth: Math.round(b.width * skala),
          resizeHeight: Math.round(b.height * skala),
          resizeQuality: "high",
        });
        b.close();
        return kecil;
      })
      .catch(() => null);
    bitmap.set(f, p);
  }
  return p;
}

/** Forgets a removed photo's bitmap. */
export function lupakan(f: File) {
  void bitmap.get(f)?.then((b) => b?.close());
  bitmap.delete(f);
}

async function jpeg(
  h: Halaman,
  sisi: number,
  mutu: number,
): Promise<{ isi: Uint8Array; w: number; h: number }> {
  const bmp = await decode(h.berkas);
  if (!bmp) throw new GagalUnggah("rusak");
  const skala = Math.min(1, sisi / Math.max(bmp.width, bmp.height));
  const bw = Math.max(1, Math.round(bmp.width * skala));
  const bh = Math.max(1, Math.round(bmp.height * skala));
  const tegak = h.putar === 90 || h.putar === 270;
  const c = document.createElement("canvas");
  c.width = tegak ? bh : bw;
  c.height = tegak ? bw : bh;
  const g = c.getContext("2d");
  if (!g) throw new GagalUnggah("rusak");
  // White under a transparent PNG, as on paper.
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2);
  g.rotate((h.putar * Math.PI) / 180);
  g.drawImage(bmp, -bw / 2, -bh / 2, bw, bh);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", mutu));
  if (!blob) throw new GagalUnggah("rusak");
  return { isi: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height };
}

const pdfDibaca = new WeakMap<File, Promise<ArrayBuffer>>();
const bacaPdf = (f: File) => {
  let p = pdfDibaca.get(f);
  if (!p) pdfDibaca.set(f, (p = f.arrayBuffer()));
  return p;
};

async function satuPutaran(
  pages: Halaman[],
  sisi: number,
  mutu: number,
  kemajuan?: (i: number, n: number) => void,
): Promise<{ pdf: Uint8Array; halaman: number }> {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (const [i, h] of pages.entries()) {
    kemajuan?.(i + 1, pages.length);
    if (h.berkas.type === "application/pdf") {
      const sumber = await PDFDocument.load(await bacaPdf(h.berkas), {
        ignoreEncryption: true,
      }).catch(() => null);
      if (!sumber) throw new GagalUnggah("rusak");
      for (const p of await doc.copyPages(sumber, sumber.getPageIndices())) {
        if (h.putar) p.setRotation(degrees((p.getRotation().angle + h.putar) % 360));
        doc.addPage(p);
      }
    } else {
      const j = await jpeg(h, sisi, mutu);
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
  return { pdf: await doc.save(), halaman: doc.getPageCount() };
}

/** The picked pages as one PDF under the limit. A single unrotated PDF
 *  that already fits goes as it is. */
export async function susunPdf(
  pages: Halaman[],
  kemajuan?: (i: number, n: number) => void,
): Promise<{ pdf: Uint8Array; halaman: number }> {
  if (!pages.length) throw new GagalUnggah("kosong");
  const [satu] = pages;
  if (pages.length === 1 && satu.berkas.type === "application/pdf" && !satu.putar) {
    if (satu.berkas.size > UNGGAH_MAKS) throw new GagalUnggah("terlalu_besar");
    const isi = new Uint8Array(await bacaPdf(satu.berkas));
    if (new TextDecoder().decode(isi.subarray(0, 5)) !== "%PDF-") throw new GagalUnggah("rusak");
    const { PDFDocument } = await import("pdf-lib");
    const d = await PDFDocument.load(isi, { ignoreEncryption: true }).catch(() => null);
    if (!d) throw new GagalUnggah("rusak");
    return { pdf: isi, halaman: d.getPageCount() };
  }
  const adaFoto = pages.some((h) => h.berkas.type !== "application/pdf");
  let akhir: { pdf: Uint8Array; halaman: number } | null = null;
  for (const [sisi, mutu] of PUTARAN) {
    akhir = await satuPutaran(pages, sisi, mutu, kemajuan);
    if (akhir.pdf.length <= (adaFoto ? SASARAN_FOTO : UNGGAH_MAKS)) return akhir;
    // Only photos shrink; PDFs alone come out the same every round.
    if (!adaFoto) break;
  }
  // Past the photo target but still within what the site takes: fine.
  if (akhir && akhir.pdf.length <= UNGGAH_MAKS) return akhir;
  throw new GagalUnggah("terlalu_besar");
}

/* ============================================================ sending */

export type Tahap =
  { t: "tiket" } | { t: "kirim"; persen: number; coba: number } | { t: "pastikan" };

export interface HasilKirim {
  ok: boolean;
  kode?: string;
  sama?: boolean;
  dikirimPada?: string;
  halaman?: number;
  ukuran?: number;
  /** The receipt code: the file's SHA-256, first 8, upper case */
  kodeTerima?: string;
}

const tunggu = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok, gagal) => {
    const t = setTimeout(ok, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      gagal(new DOMException("aborted", "AbortError"));
    });
  });

async function postJson(url: string, isi: unknown, signal?: AbortSignal) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(isi),
    signal,
  });
  if (!r.ok) return { ok: false, kode: `http_${r.status}` } as Record<string, unknown>;
  return (await r.json()) as Record<string, unknown>;
}

/** One PUT with byte progress. Resolves the HTTP status (0: no answer). */
function put(url: string, pdf: Uint8Array, onPersen: (p: number) => void, signal?: AbortSignal) {
  return new Promise<number>((ok, gagal) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", "application/pdf");
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onPersen(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    x.onload = () => ok(x.status);
    x.onerror = () => ok(0);
    x.ontimeout = () => ok(0);
    x.timeout = 5 * 60_000;
    signal?.addEventListener("abort", () => {
      x.abort();
      gagal(new DOMException("aborted", "AbortError"));
    });
    x.send(new Blob([pdf as BlobPart], { type: "application/pdf" }));
  });
}

/**
 * Sends one built PDF. A dropped connection is tried again (3 times, a
 * little longer apart each time); the server's own refusals are not.
 */
export async function kirimTp(
  modul: number,
  pdf: Uint8Array,
  halaman: number,
  onTahap: (t: Tahap) => void,
  signal?: AbortSignal,
): Promise<HasilKirim> {
  try {
    const sha256 = await sha256Hex(pdf);
    const kodeTerima = sha256.slice(0, 8).toUpperCase();
    onTahap({ t: "tiket" });
    const tk = await postJson(
      "/api/tp/tiket",
      { modul, ukuran: pdf.length, sha256, halaman },
      signal,
    );
    if (!tk.ok) return { ok: false, kode: String(tk.kode ?? "lain") };
    if (tk.sama) return { ok: true, sama: true, kodeTerima };

    let status = 0;
    for (let coba = 0; coba < 4; coba++) {
      if (coba) await tunggu(1000 * 2 ** coba, signal);
      onTahap({ t: "kirim", persen: 0, coba });
      status = await put(
        String(tk.url),
        pdf,
        (persen) => onTahap({ t: "kirim", persen, coba }),
        signal,
      );
      if (status >= 200 && status < 300) break;
      // A refusal (bad ticket, wrong bytes, too large) won't change on a retry.
      if (status >= 400 && status < 500) break;
    }
    if (status === 413) return { ok: false, kode: "terlalu_besar" };
    if (status === 403) return { ok: false, kode: "tiket_salah" };
    if (status === 0) return { ok: false, kode: "jaringan" };
    if (status < 200 || status >= 300) return { ok: false, kode: "penyimpanan_mati" };

    onTahap({ t: "pastikan" });
    let r: Record<string, unknown> = { ok: false, kode: "jaringan" };
    for (let coba = 0; coba < 3; coba++) {
      if (coba) await tunggu(1500 * coba, signal);
      try {
        r = await postJson("/api/tp/unggah", { modul, tiket: tk.tiket }, signal);
        break;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
      }
    }
    if (!r.ok) return { ok: false, kode: String(r.kode ?? "lain") };
    return {
      ok: true,
      sama: !!r.sama,
      dikirimPada: r.dikirimPada as string,
      halaman: r.halaman as number,
      ukuran: r.ukuran as number,
      kodeTerima,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, kode: "batal" };
    return { ok: false, kode: "jaringan" };
  }
}
