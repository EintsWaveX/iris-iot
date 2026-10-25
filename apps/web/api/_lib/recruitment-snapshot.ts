/**
 * Reference snapshots, the server side (EXAM-ENGINE 8, prompt 09): fetch a
 * page under the guards of 8.1, sanitize it (src/lib/recruitment/
 * snapshot-sanitize.ts), inline its images the same guarded way, and hand
 * back one self contained document for R2.
 *
 * The network is a parameter (`Net`) so the rules are tested without one. The
 * real one looks the name up, refuses it if any answer is a blocked address,
 * and connects to the address it checked, so the name cannot be answered
 * differently the second time.
 */
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";
import { blockedAddress, checkUrl } from "../../src/lib/recruitment/snapshot-net.js";
import {
  MAX_IMAGE_BYTES,
  render,
  sanitize,
  svgFileToDataUri,
  verifySnapshot,
  type Sanitized,
} from "../../src/lib/recruitment/snapshot-sanitize.js";

export const SNAPSHOT_UA = "IRIS-Snapshot/1 (+https://irisiotlab.com)";
export const PAGE_MAX_BYTES = 3 * 1024 * 1024;
export const PAGE_TIMEOUT_MS = 10_000;
export const IMAGES_TIMEOUT_MS = 8_000;
export const DOC_MAX_BYTES = 6 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const IMAGE_PARALLEL = 5;

export interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface GetOptions {
  maxBytes: number;
  accept: string;
  signal: AbortSignal;
}

export interface Net {
  /** Every address the name answers with */
  resolve(host: string): Promise<string[]>;
  /** One GET to this address, with the name's Host and TLS name; the body stops at maxBytes (`terlalu_besar`) */
  get(url: URL, ip: string, o: GetOptions): Promise<RawResponse>;
}

export class SnapshotError extends Error {
  constructor(
    public kode: string,
    detail?: string,
  ) {
    super(detail ?? kode);
  }
}

/* ------------------------------------------------------------ the real net */

function decoder(enc: string | undefined) {
  switch ((enc ?? "").toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return createGunzip();
    case "deflate":
      return createInflate();
    case "br":
      return createBrotliDecompress();
    default:
      return null;
  }
}

export const netNyata: Net = {
  async resolve(host) {
    const r = await lookup(host, { all: true, verbatim: true });
    return r.map((a) => a.address);
  },
  get(url, ip, o) {
    return new Promise<RawResponse>((resolve, reject) => {
      const tls = url.protocol === "https:";
      const req = (tls ? https : http).request(
        {
          host: ip,
          port: url.port || (tls ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: "GET",
          servername: tls ? url.hostname : undefined,
          headers: {
            host: url.host,
            "user-agent": SNAPSHOT_UA,
            accept: o.accept,
            "accept-encoding": "gzip, deflate, br",
            "accept-language": "en,id;q=0.8",
          },
          signal: o.signal,
        },
        (res) => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers))
            if (typeof v === "string") headers[k] = v;
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            res.resume();
            return resolve({ status, headers, body: new Uint8Array(0) });
          }
          const dec = decoder(headers["content-encoding"]);
          const src: Readable = dec ? res.pipe(dec) : res;
          const chunks: Buffer[] = [];
          let n = 0;
          src.on("data", (c: Buffer) => {
            n += c.length;
            if (n > o.maxBytes) {
              res.destroy();
              reject(new SnapshotError("terlalu_besar"));
              return;
            }
            chunks.push(c);
          });
          src.on("end", () =>
            resolve({ status, headers, body: new Uint8Array(Buffer.concat(chunks)) }),
          );
          src.on("error", (e) => reject(e));
          res.on("error", (e) => reject(e));
        },
      );
      req.on("error", reject);
      req.end();
    });
  },
};

/* ---------------------------------------------------------------- guarded */

export interface Fetched {
  url: URL;
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

/**
 * One address under the rules of 8.1: the URL is checked, the name resolved
 * and every answer checked, then the first answer is connected to. Redirects
 * (at most 5) go through the same checks. A page that is not 200 is an error.
 */
export async function fetchGuarded(raw: string, net: Net, o: GetOptions): Promise<Fetched> {
  let cur = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (o.signal.aborted) throw new SnapshotError("waktu_habis");
    const c = checkUrl(cur);
    if (!c.ok) throw new SnapshotError(c.kode);
    const u = c.url;
    const host = u.hostname.replace(/^\[|\]$/g, "");
    let addrs: string[];
    try {
      addrs = /^[\d.]+$/.test(host) || host.includes(":") ? [host] : await net.resolve(host);
    } catch {
      throw new SnapshotError("tak_terjangkau", "dns");
    }
    if (addrs.length === 0) throw new SnapshotError("tak_terjangkau", "dns");
    if (addrs.some(blockedAddress)) throw new SnapshotError("alamat_terlarang");
    if (o.signal.aborted) throw new SnapshotError("waktu_habis");
    let r: RawResponse;
    try {
      r = await net.get(u, addrs[0], o);
    } catch (e) {
      if (e instanceof SnapshotError) throw e;
      if (o.signal.aborted) throw new SnapshotError("waktu_habis");
      throw new SnapshotError("tak_terjangkau", e instanceof Error ? e.message : String(e));
    }
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      try {
        cur = new URL(r.headers.location, u).href;
      } catch {
        throw new SnapshotError("url_salah");
      }
      continue;
    }
    if (r.status !== 200) throw new SnapshotError("status_salah", String(r.status));
    return { url: u, status: r.status, headers: r.headers, body: r.body };
  }
  throw new SnapshotError("terlalu_banyak_alihan");
}

/* ------------------------------------------------------------------ text */

/** The page's text: the header's charset, else a meta tag in the first 2 KB, else UTF-8. */
export function decodeHtml(body: Uint8Array, contentType: string): string {
  let cs = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (!cs) {
    const head = new TextDecoder("latin1").decode(body.subarray(0, 2048));
    cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(cs ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---------------------------------------------------------------- images */

function sniff(b: Uint8Array): "png" | "jpeg" | "gif" | "webp" | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return "gif";
  if (
    b.length > 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "webp";
  return null;
}

/** One image as a data: URI, or null when it cannot be had under the rules. */
export async function fetchImage(
  raw: string,
  net: Net,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    const r = await fetchGuarded(raw, net, {
      maxBytes: MAX_IMAGE_BYTES,
      accept: "image/*",
      signal,
    });
    const type = sniff(r.body);
    if (type) return `data:image/${type};base64,${Buffer.from(r.body).toString("base64")}`;
    const ct = (r.headers["content-type"] ?? "").toLowerCase();
    if (ct.includes("svg") || new URL(raw).pathname.toLowerCase().endsWith(".svg"))
      return svgFileToDataUri(new TextDecoder().decode(r.body));
    return null;
  } catch {
    return null;
  }
}

/** Fills in every image job; the ones that fail stay out and print as skipped. */
export async function inlineImages(s: Sanitized, net: Net): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const todo: Sanitized["jobs"] = [];
  for (const j of s.jobs) {
    if (j.data) out.set(j.id, j.data);
    else if (j.srcs.length) todo.push(j);
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), IMAGES_TIMEOUT_MS);
  let next = 0;
  const worker = async () => {
    while (next < todo.length && !ctl.signal.aborted) {
      const j = todo[next++];
      for (const src of j.srcs) {
        const d = await fetchImage(src, net, ctl.signal);
        if (d) {
          out.set(j.id, d);
          break;
        }
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(IMAGE_PARALLEL, todo.length) }, worker));
  } finally {
    clearTimeout(timer);
  }
  return out;
}

/* -------------------------------------------------------------- snapshot */

export interface Snapshot {
  html: string;
  bytes: Uint8Array;
  sha256: string;
  title: string;
  /** Where the page ended up after redirects */
  finalUrl: string;
  /** The content root that was used */
  selector: string;
  /** Images that could not be had */
  skipped: number;
}

function pack(s: Sanitized, images: Map<number, string>, now: Date): Snapshot {
  const html = render(s, { images, fetchedAt: now });
  const bad = verifySnapshot(html);
  if (bad.length) throw new SnapshotError("tidak_aman", bad.slice(0, 5).join(", "));
  const bytes = new TextEncoder().encode(html);
  if (bytes.length > DOC_MAX_BYTES) throw new SnapshotError("terlalu_besar");
  const wanted = s.jobs.filter((j) => j.data || j.srcs.length).length;
  return {
    html,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    title: s.title,
    finalUrl: s.url,
    selector: s.rootSelector,
    skipped: wanted - images.size + s.jobs.filter((j) => !j.data && !j.srcs.length).length,
  };
}

/** A page by address (reference-add, reference-refetch). */
export async function snapshotUrl(
  url: string,
  o: { selector?: string; net?: Net; now?: Date } = {},
): Promise<Snapshot> {
  const net = o.net ?? netNyata;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PAGE_TIMEOUT_MS);
  let page: Fetched;
  try {
    page = await fetchGuarded(url, net, {
      maxBytes: PAGE_MAX_BYTES,
      accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const ct = (page.headers["content-type"] ?? "").toLowerCase();
  let html: string;
  if (ct.startsWith("text/html") || ct.startsWith("application/xhtml+xml"))
    html = decodeHtml(page.body, ct);
  else if (ct.startsWith("text/plain")) html = `<pre>${escText(decodeHtml(page.body, ct))}</pre>`;
  else throw new SnapshotError("jenis_salah", ct || "?");
  const s = sanitize(html, { url: page.url.href, selector: o.selector });
  const images = await inlineImages(s, net);
  return pack(s, images, o.now ?? new Date());
}

/** An uploaded .html file (the fallback for pages that only render with JavaScript): no image is fetched. */
export function snapshotUpload(
  html: string,
  o: { url?: string; selector?: string; title?: string; now?: Date } = {},
): Snapshot {
  if (html.length > PAGE_MAX_BYTES) throw new SnapshotError("terlalu_besar");
  const base = o.url && checkUrl(o.url).ok ? o.url : "https://unggahan.iris.invalid/";
  const s = sanitize(html, { url: base, selector: o.selector });
  if (o.title?.trim()) s.title = o.title.trim();
  return pack(
    s,
    new Map(s.jobs.filter((j) => j.data).map((j) => [j.id, j.data!])),
    o.now ?? new Date(),
  );
}

/** Where a snapshot is kept in R2 (8.1 step 8). */
export const kunciRef = (edition: number, sha256: string) =>
  `recruitment/${edition}/ref/${sha256}.html`;
