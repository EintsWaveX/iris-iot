/**
 * GET /f/<id>/<name>: an uploaded file out of the database (api/_lib/berkas.ts).
 * The id is random and never reused, so the address is the capability and the
 * answer can be cached; the name after the id is only for the browser's
 * "save as". The stored type was checked on upload (PNG, JPEG, WebP or PDF,
 * first bytes included) and `nosniff` is on every answer.
 */
import type http from "node:http";

export type BacaBerkas = (
  id: string,
) => Promise<{ nama: string; tipe: string; ukuran: number; isi: Buffer } | null>;

const teks = (res: http.ServerResponse, kode: number, isi: string) => {
  res.statusCode = kode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(isi);
};

/** A file name as an RFC 5987 header value. */
function namaHeader(nama: string): string {
  return encodeURIComponent(nama).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
}

export async function sajikanBerkas(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  path: string,
  baca: BacaBerkas | undefined,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return teks(res, 405, "Method not allowed");
  }
  const id = path.slice("/f/".length).split("/", 1)[0] ?? "";
  let f: Awaited<ReturnType<BacaBerkas>> = null;
  try {
    f = baca ? await baca(id) : null;
  } catch (err) {
    console.error("[server] /f/ read failed:", err);
    return teks(res, 503, "Try again");
  }
  if (!f) return teks(res, 404, "Not found");

  const etag = `"${id}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "public, max-age=86400");
  if (
    String(req.headers["if-none-match"] ?? "")
      .split(/\s*,\s*/)
      .includes(etag)
  ) {
    res.statusCode = 304;
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", f.tipe);
  res.setHeader("Content-Length", String(f.isi.length));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${namaHeader(f.nama)}`);
  res.end(req.method === "HEAD" ? undefined : f.isi);
}
