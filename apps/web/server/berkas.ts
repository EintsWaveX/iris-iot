/**
 * GET /f/<id>/<name>: an uploaded file out of the database (api/_lib/berkas.ts).
 * The id is random and never reused, so the address is the capability and the
 * answer can be cached; the name after the id is only for the browser's
 * "save as". The stored type was checked on upload (PNG, JPEG, WebP or PDF,
 * first bytes included) and `nosniff` is on every answer.
 */
import type http from "node:http";

export type InfoBerkas = { nama: string; tipe: string; ukuran: number };
export type BacaBerkas = (id: string) => Promise<(InfoBerkas & { isi: Buffer }) | null>;
/** The same without the bytes: one small row, so a 304 or a HEAD never reads the blob. */
export type CekBerkas = (id: string) => Promise<InfoBerkas | null>;

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
  cek?: CekBerkas,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return teks(res, 405, "Method not allowed");
  }
  const id = path.slice("/f/".length).split("/", 1)[0] ?? "";
  const etag = `"${id}"`;
  const cocok = String(req.headers["if-none-match"] ?? "")
    .split(/\s*,\s*/)
    .includes(etag);
  const tanpaIsi = cocok || req.method === "HEAD";
  let info: InfoBerkas | null = null;
  let isi: Buffer | undefined;
  try {
    if (tanpaIsi && cek) {
      info = await cek(id);
    } else if (baca) {
      const f = await baca(id);
      info = f;
      isi = f?.isi;
    }
  } catch (err) {
    console.error("[server] /f/ read failed:", err);
    return teks(res, 503, "Try again");
  }
  if (!info) return teks(res, 404, "Not found");

  res.setHeader("ETag", etag);
  // The id is random and a row is never rewritten, so a given address always
  // gives the same bytes: the browser may keep it for good.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  if (cocok) {
    res.statusCode = 304;
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", info.tipe);
  res.setHeader("Content-Length", String(isi ? isi.length : info.ukuran));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${namaHeader(info.nama)}`);
  res.end(req.method === "HEAD" ? undefined : isi);
}
