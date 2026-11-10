/**
 * The built site (`dist/`), served as Vercel serves a static Astro build.
 *
 * `/en/modules/3` finds `en/modules/3.html` or `en/modules/3/index.html`, a
 * trailing slash finds the folder's index, and an unknown path answers
 * `404.html` with a 404. Files carry an ETag so a revisit costs a 304.
 * `/_astro/*` is content-hashed, so it is cached for a year; everything else
 * revalidates. Text files (HTML, JS, CSS, JSON, SVG) go out brotli or gzip
 * compressed when the browser takes it (server/kompres.ts): Cloudflare would
 * compress at its edge, but only after the bytes crossed the home uplink.
 */
import { createReadStream, statSync, type Stats } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  BATAS_BERKAS_BYTE,
  MIN_BYTE,
  SimpanKompres,
  bisaDikompres,
  pilihKode,
  tambahVary,
} from "./kompres.js";

const simpan = new SimpanKompres();

const JENIS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/vnd.microsoft.icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
};

export interface BerkasStatis {
  berkas: string;
  stat: Stats;
}

/** The file for a request path under `akar`, or null (never outside `akar`). */
export function cariBerkas(akar: string, path: string): BerkasStatis | null {
  let p: string;
  try {
    p = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (p.includes("\0") || p.includes("\\")) return null;
  const dasar = resolve(akar);
  const calon = p.endsWith("/") ? [join(p, "index.html")] : [p, `${p}.html`, join(p, "index.html")];
  for (const c of calon) {
    const penuh = resolve(dasar, `.${c.startsWith("/") ? c : `/${c}`}`);
    if (penuh !== dasar && !penuh.startsWith(dasar + sep)) continue;
    try {
      const stat = statSync(penuh);
      if (stat.isFile()) return { berkas: penuh, stat };
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

/** Sends the file; `status` is 200, or 404 for the not-found page. */
export async function sajikan(
  req: IncomingMessage,
  res: ServerResponse,
  f: BerkasStatis,
  path: string,
  status = 200,
): Promise<void> {
  const jenis = JENIS[extname(f.berkas).toLowerCase()] ?? "application/octet-stream";
  res.statusCode = status;
  res.setHeader("Content-Type", jenis);
  // A rule in vercel.json (the handbook's) may already have set this.
  if (!res.getHeader("Cache-Control")) {
    res.setHeader(
      "Cache-Control",
      status !== 200
        ? "public, max-age=0, must-revalidate"
        : path.startsWith("/_astro/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=0, must-revalidate",
    );
  }
  if (status === 200) {
    const etag = `W/"${f.stat.size.toString(16)}-${Math.floor(f.stat.mtimeMs).toString(16)}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", f.stat.mtime.toUTCString());
    // Behind Cloudflare the browser never sees our ETag (the edge drops weak ones), only
    // Last-Modified, so a revisit asks with If-Modified-Since. If-None-Match wins when sent.
    const cocok = req.headers["if-none-match"];
    const sejak = req.headers["if-modified-since"];
    const belumBerubah =
      typeof cocok === "string"
        ? cocok.split(",").some((t) => t.trim() === etag)
        : typeof sejak === "string" &&
          Math.floor(f.stat.mtimeMs / 1000) <= Math.floor(Date.parse(sejak) / 1000);
    if (belumBerubah) {
      res.statusCode = 304;
      res.end();
      return;
    }
  }
  const layak = bisaDikompres(jenis) && f.stat.size >= MIN_BYTE && f.stat.size <= BATAS_BERKAS_BYTE;
  if (layak) tambahVary(res);
  if (req.method === "HEAD") {
    res.setHeader("Content-Length", String(f.stat.size));
    res.end();
    return;
  }
  const kode = layak ? pilihKode(req.headers["accept-encoding"]) : null;
  if (kode) {
    try {
      const kecil = await simpan.ambil(
        `${f.berkas}|${f.stat.size}|${Math.floor(f.stat.mtimeMs)}`,
        kode,
        () => readFile(f.berkas),
      );
      if (kecil) {
        res.setHeader("Content-Encoding", kode);
        res.setHeader("Content-Length", String(kecil.length));
        res.end(kecil);
        return;
      }
    } catch {
      /* unreadable, or the client left: fall through to the plain stream */
    }
  }
  res.setHeader("Content-Length", String(f.stat.size));
  const aliran = createReadStream(f.berkas);
  aliran.on("error", () => res.destroy());
  aliran.pipe(res);
}
