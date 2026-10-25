/**
 * TP files on Cloudflare R2 (2026-10-21: TP lives only in IRIS now). The
 * relay Worker holds the bucket; the IRIS API signs a short ticket for each
 * thing it allows, and the relay checks it. Shared by the API (Node), the
 * relay (Worker) and the tests, so pure: WebCrypto only.
 *
 * - put: the Praktikan's browser PUTs one file straight to the relay, so
 *   it never squeezes through Vercel's 4.5 MB request body.
 * - baca: a 10-minute read link the API hands out after its own rights
 *   check (it redirects /api/tp/berkas there).
 * - srv: the API's own calls (head, get, put, delete a semester).
 *
 * Keys are content addressed, `tp/<semester>/<modul>/<nim>/<sha256>.<ext>`:
 * a retry of the same bytes lands on the same object, and a semester's
 * cleanup is one prefix.
 */
import { bacaTanda, tandaiJson } from "./tanda.js";

/** The largest file the relay takes. */
export const TP_BERKAS_MAKS = 16 * 1024 * 1024;

export const TP_PUT_DETIK = 15 * 60;
export const TP_BACA_DETIK = 10 * 60;
export const TP_SRV_DETIK = 60;

/** File types a TP file may have, by extension. */
export const TP_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
  // The exam's bank (2026-10-25): a SVG picture (a reference page is served by the API, which sets its own type).
  svg: "image/svg+xml",
  bin: "application/octet-stream",
};

export const TP_KUNCI_RE =
  /^tp\/\d{4}-(ganjil|genap)\/[1-9]\/[0-9A-Za-z]{4,20}\/[0-9a-f]{64}\.(pdf|jpg|png|webp|doc|docx|zip|bin)$/;
export const TP_AWALAN_RE = /^tp\/\d{4}-(ganjil|genap)\/$/;

/**
 * Open Recruitment documents (2026-10-23) share this bucket and these
 * tickets, under `recruitment/<edition>/<nim>/<kind>/<sha256>.pdf`: PDFs
 * only, and an edition's cleanup is one prefix.
 */
export const REK_KUNCI_RE =
  /^recruitment\/\d{1,6}\/[0-9A-Za-z]{4,20}\/(cv|letter|vision|biodata|other|ktm|khs|ksm|portofolio)\/[0-9a-f]{64}\.pdf$/;
export const REK_AWALAN_RE = /^recruitment\/\d{1,6}\/$/;

export function kunciRekrutmen(edisi: number, nim: string, jenis: string, sha256: string): string {
  const k = `recruitment/${edisi}/${nim}/${jenis}/${sha256}.pdf`;
  if (!REK_KUNCI_RE.test(k)) throw new Error("unsafe recruitment key");
  return k;
}

export const awalanRekrutmen = (edisi: number) => `recruitment/${edisi}/`;

/**
 * The question bank's two kinds of file (prompt 09, 2026-10-25): a sanitized
 * reference page the API writes (`ref/<sha256>.html`) and a picture of a bank
 * question a browser uploads (`bank/<sha256>.<ext>`). Both content addressed.
 */
export const REK_REF_RE = /^recruitment\/\d{1,6}\/ref\/[0-9a-f]{64}\.html$/;
export const BANK_GAMBAR = ["png", "jpg", "webp", "svg"] as const;
export const REK_BANK_RE = /^recruitment\/\d{1,6}\/bank\/[0-9a-f]{64}\.(png|jpg|webp|svg)$/;

export function kunciRef(edisi: number, sha256: string): string {
  const k = `recruitment/${edisi}/ref/${sha256}.html`;
  if (!REK_REF_RE.test(k)) throw new Error("unsafe reference key");
  return k;
}

export function kunciBank(edisi: number, sha256: string, ext: string): string {
  const k = `recruitment/${edisi}/bank/${sha256}.${ext}`;
  if (!REK_BANK_RE.test(k)) throw new Error("unsafe bank key");
  return k;
}

/**
 * Whether the first bytes of an upload are what its key says: the relay keeps
 * nothing that is not (a PDF starts `%PDF-`, a picture has its own header, an
 * SVG is text that opens a tag). The key's extension decides.
 */
export function awalOk(kunci: string, b: Uint8Array): boolean {
  const ext = kunci.slice(kunci.lastIndexOf(".") + 1);
  const at = (...xs: number[]) => xs.every((x, i) => b[i] === x);
  switch (ext) {
    case "pdf":
      return at(0x25, 0x50, 0x44, 0x46, 0x2d);
    case "png":
      return at(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "jpg":
      return at(0xff, 0xd8, 0xff);
    case "webp":
      return (
        at(0x52, 0x49, 0x46, 0x46) &&
        b[8] === 0x57 &&
        b[9] === 0x45 &&
        b[10] === 0x42 &&
        b[11] === 0x50
      );
    case "svg": {
      const head = new TextDecoder().decode(b.subarray(0, 512)).replace(/^﻿/, "").trimStart();
      return head.startsWith("<svg") || /^<\?xml[^>]*\?>\s*(<!--[\s\S]*?-->\s*)*<svg/.test(head);
    }
    default:
      return false;
  }
}

/**
 * Live Coding's objects (2026-10-25, EXAM-ENGINE 9.4 and 9.7) share the
 * bucket too: a compiled image per job and a traffic log per seat, under
 * `recruitment/<edition>/lc/<seat>/`. See recruitment/lc-r2.ts.
 */
export const LC_KUNCI_RE =
  /^recruitment\/\d{1,6}\/lc\/(?:\d{1,9}\/(?:\d{1,9}\.bin|traffic\.jsonl)|warm\/\d{1,9}\.bin)$/;

const kunciBerkas = (k: string) =>
  TP_KUNCI_RE.test(k) ||
  REK_KUNCI_RE.test(k) ||
  LC_KUNCI_RE.test(k) ||
  REK_REF_RE.test(k) ||
  REK_BANK_RE.test(k);

/** The extension a mime type is kept under. */
export function extTp(mime: string): string {
  const m = mime.toLowerCase().split(";")[0].trim();
  return Object.entries(TP_MIME).find(([, v]) => v === m)?.[0] ?? "bin";
}

export function kunciTp(
  semester: string,
  modul: number,
  nim: string,
  sha256: string,
  mime = "application/pdf",
): string {
  return `tp/${semester}/${modul}/${nim}/${sha256}.${extTp(mime)}`;
}

export const awalanSemester = (semester: string) => `tp/${semester}/`;

export interface TiketPut {
  j: "tp-put";
  k: string;
  /** Size in bytes, SHA-256 hex, page count */
  n: number;
  s: string;
  h: number;
  /** Expiry, unix seconds */
  e: number;
}

export interface TiketBaca {
  j: "tp-baca";
  k: string;
  e: number;
  /** i: inline, u: download */
  d: "i" | "u";
  nm: string;
  m: string;
}

export type OpSrv = "head" | "get" | "put" | "hapus-awalan";

export interface TiketSrv {
  j: "tp-srv";
  op: OpSrv;
  k: string;
  /** SHA-256 of a put's body, else "" */
  s: string;
  e: number;
}

export type TiketTp = TiketPut | TiketBaca | TiketSrv;

export const sekarangDetik = () => Math.floor(Date.now() / 1000);

export function tandaiTp(t: TiketTp, secret: string): Promise<string> {
  return tandaiJson(t, secret);
}

/** A ticket of the given kind, signed and not expired, or null. */
export async function bacaTiketTp<J extends TiketTp["j"]>(
  token: string,
  secret: string,
  jenis: J,
  kini = sekarangDetik(),
): Promise<Extract<TiketTp, { j: J }> | null> {
  const r = await bacaTanda(token, secret);
  if (!r.ok || !r.isi || typeof r.isi !== "object") return null;
  const t = r.isi as Record<string, unknown>;
  if (t.j !== jenis || typeof t.e !== "number" || t.e < kini || typeof t.k !== "string")
    return null;
  if (jenis === "tp-srv") {
    if (
      t.op === "hapus-awalan"
        ? !(TP_AWALAN_RE.test(t.k) || REK_AWALAN_RE.test(t.k))
        : !kunciBerkas(t.k)
    )
      return null;
  } else if (!kunciBerkas(t.k)) return null;
  return t as unknown as Extract<TiketTp, { j: J }>;
}

/** SHA-256 of bytes as hex. */
export async function sha256Hex(isi: Uint8Array | ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", isi as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The relay's https base from KONSOL_RELAY_URL (wss://host → https://host). */
export function relayHttps(relay: string): string {
  return relay.replace(/^ws(s?):\/\//, "http$1://").replace(/\/+$/, "");
}
