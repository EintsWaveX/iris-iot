/**
 * ETag and 304 for API JSON reads (15 Nov 2026). Every open page fetches again after a live-update topic, and
 * most of the time the answer is the same bytes as the page already has. The handler still runs (sign-in
 * checks and the database read are unchanged); what this saves is the body crossing the home uplink and
 * the compression.
 *
 * The tag is a hash of the answer itself, not a per-route version, so it is right for every route without
 * anyone declaring anything, and a 304 can only happen when the browser's stored copy is byte-for-byte what
 * this very request would receive now. That makes it safe for per-user answers too: another person signing
 * in on the same browser sends the tag of the previous person's copy, the handler builds that person's own
 * answer, the hashes differ, and a full 200 goes out.
 *
 * Left alone: anything that is not a plain 200 GET/HEAD, any answer that sets a cookie or carries its own
 * ETag, `Cache-Control: no-store`, and bodies too small to be worth a header.
 *
 * Strong tags (Cloudflare's edge drops weak ones, see static.ts): the tag names the content coding as well,
 * since Brotli and gzip bytes differ (`Vary: Accept-Encoding`).
 */
import { createHash } from "node:crypto";
import type http from "node:http";

/** Under this a 304 saves nothing over the body. */
export const ETAG_MIN_BYTE = 512;

/** The tag of `isi` as it would be sent with content coding `kode` ("" = none). */
export function buatEtag(isi: Buffer, kode: string): string {
  const h = createHash("sha1").update(isi).digest("base64url");
  return `"${h}${kode ? `-${kode}` : ""}"`;
}

/** True when an `If-None-Match` header lists `etag` (weak comparison) or says `*`. */
export function cocokEtag(header: string | string[] | undefined, etag: string): boolean {
  const mentah = Array.isArray(header) ? header.join(",") : (header ?? "");
  if (!mentah) return false;
  const sendiri = etag.replace(/^W\//, "");
  return mentah.split(",").some((t) => {
    const x = t.trim();
    return x === "*" || x.replace(/^W\//, "") === sendiri;
  });
}

/** Whether an answer qualifies for a tag at all. */
export function bolehDietag(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ukuran: number,
): boolean {
  return (
    (req.method === "GET" || req.method === "HEAD") &&
    res.statusCode === 200 &&
    ukuran >= ETAG_MIN_BYTE &&
    !res.getHeader("ETag") &&
    !res.getHeader("Set-Cookie") &&
    !/no-store/i.test(String(res.getHeader("Cache-Control") ?? ""))
  );
}

/**
 * Puts the tag on the answer and, when the browser already holds it, ends the answer as a 304 and returns
 * true. When the handler said nothing about caching the answer is marked `private, no-cache`: stored by the
 * browser, asked again every time (and never by a shared cache).
 */
export function terapkanEtag(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  etag: string,
): boolean {
  res.setHeader("ETag", etag);
  if (!res.getHeader("Cache-Control")) res.setHeader("Cache-Control", "private, no-cache");
  if (!cocokEtag(req.headers["if-none-match"], etag)) return false;
  res.removeHeader("Content-Type");
  res.removeHeader("Content-Length");
  res.removeHeader("Content-Encoding");
  res.statusCode = 304;
  res.end();
  return true;
}
