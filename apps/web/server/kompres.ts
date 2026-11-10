/**
 * Compression for what this process sends (10 Nov 2026). The site's only way
 * out is the home uplink, through cloudflared. Cloudflare compresses at ITS
 * edge, i.e. after the bytes have already crossed that uplink, and it does not
 * cache HTML or JSON, so every page and API answer would cross it at full
 * size. Sending them compressed here is what cuts the uplink.
 *
 * Text types only (HTML, JS, CSS, JSON, SVG, XML, plain text); images, fonts
 * and PDFs are already compressed. Brotli when the browser says it takes it,
 * else gzip. Built-in node:zlib, no packages.
 */
import { promisify } from "node:util";
import zlib from "node:zlib";
import type http from "node:http";

export type Kode = "br" | "gzip";

/** Under this a body is not worth the header and the CPU. */
export const MIN_BYTE = 1024;
/** An API answer up to this is compressed in line (a few ms); bigger goes out as is. */
export const BATAS_API_BYTE = 2 * 1024 * 1024;
/** A file up to this is compressed once and kept; bigger streams as is. */
export const BATAS_BERKAS_BYTE = 8 * 1024 * 1024;

const brAsinkron = promisify(zlib.brotliCompress);
const gzipAsinkron = promisify(zlib.gzip);

/** Which encoding to answer with, by the browser's `Accept-Encoding` (q=0 means no). */
export function pilihKode(header: string | string[] | undefined): Kode | null {
  const mentah = Array.isArray(header) ? header.join(",") : (header ?? "");
  let br = false;
  let gzip = false;
  for (const bagian of mentah.split(",")) {
    const [nama = "", ...param] = bagian.trim().toLowerCase().split(";");
    const q = param.map((p) => /^\s*q\s*=\s*([\d.]+)\s*$/.exec(p)).find(Boolean);
    if (q && !(Number(q[1]) > 0)) continue;
    const n = nama.trim();
    if (n === "br") br = true;
    else if (n === "gzip" || n === "x-gzip" || n === "*") gzip = true;
  }
  return br ? "br" : gzip ? "gzip" : null;
}

/** True for the text types that shrink well. */
export function bisaDikompres(jenis: string): boolean {
  const t = jenis.split(";")[0]!.trim().toLowerCase();
  return (
    t.startsWith("text/") ||
    t === "application/json" ||
    t === "application/javascript" ||
    t === "application/xml" ||
    t === "application/manifest+json" ||
    t.endsWith("+json") ||
    t.endsWith("+xml")
  );
}

/** Adds `Accept-Encoding` to Vary without dropping what is already there. */
export function tambahVary(res: http.ServerResponse): void {
  const ada = String(res.getHeader("Vary") ?? "");
  if (/(^|,)\s*(accept-encoding|\*)\s*(,|$)/i.test(ada)) return;
  res.setHeader("Vary", ada ? `${ada}, Accept-Encoding` : "Accept-Encoding");
}

/** In line, for an API answer: quick settings, because the event loop waits for it. */
export function kompresSinkron(isi: Buffer, kode: Kode): Buffer {
  return kode === "br"
    ? zlib.brotliCompressSync(isi, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: isi.length,
        },
      })
    : zlib.gzipSync(isi, { level: 5 });
}

/** Off the event loop, for a file that is then kept: the strongest settings, paid once. */
export function kompresKuat(isi: Buffer, kode: Kode): Promise<Buffer> {
  return kode === "br"
    ? brAsinkron(isi, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: isi.length,
        },
      })
    : gzipAsinkron(isi, { level: 9 });
}

/**
 * Ends an API answer, compressed when the browser takes it and the body is
 * worth it. Same bytes either way once decoded.
 */
export function akhiriJson(req: http.IncomingMessage, res: http.ServerResponse, teks: string) {
  const isi = Buffer.from(teks, "utf8");
  const jenis = String(res.getHeader("Content-Type") ?? "");
  const layak =
    isi.length >= MIN_BYTE &&
    isi.length <= BATAS_API_BYTE &&
    bisaDikompres(jenis) &&
    !res.getHeader("Content-Encoding") &&
    res.statusCode !== 204 &&
    res.statusCode !== 304 &&
    !/no-transform/i.test(String(res.getHeader("Cache-Control") ?? ""));
  if (!layak) {
    res.end(isi);
    return;
  }
  tambahVary(res);
  const kode = pilihKode(req.headers["accept-encoding"]);
  if (!kode) {
    res.end(isi);
    return;
  }
  const kecil = kompresSinkron(isi, kode);
  if (kecil.length >= isi.length) {
    res.end(isi);
    return;
  }
  res.setHeader("Content-Encoding", kode);
  res.setHeader("Content-Length", String(kecil.length));
  res.end(kecil);
}

/** Compressed copies of files, kept so a file is compressed once, not per visit. */
export class SimpanKompres {
  private isi = new Map<string, Buffer>();
  private jalan = new Map<string, Promise<Buffer>>();
  private jumlah = 0;
  constructor(private readonly maks = 64 * 1024 * 1024) {}

  /** The compressed bytes, or null when compressing does not make the file smaller. */
  async ambil(kunci: string, kode: Kode, baca: () => Promise<Buffer>): Promise<Buffer | null> {
    const k = `${kode}|${kunci}`;
    let h = this.isi.get(k);
    if (!h) {
      let p = this.jalan.get(k);
      if (!p) {
        p = (async () => {
          const asli = await baca();
          const kecil = await kompresKuat(asli, kode);
          // A copy that is not smaller is kept as an empty marker so it is not tried again.
          const simpan = kecil.length < asli.length ? kecil : Buffer.alloc(0);
          this.taruh(k, simpan);
          return simpan;
        })().finally(() => this.jalan.delete(k));
        this.jalan.set(k, p);
      }
      h = await p;
    }
    return h.length ? h : null;
  }

  private taruh(k: string, b: Buffer) {
    this.isi.set(k, b);
    this.jumlah += b.length;
    for (const [lama, v] of this.isi) {
      if (this.jumlah <= this.maks || lama === k) break;
      this.isi.delete(lama);
      this.jumlah -= v.length;
    }
  }
}
