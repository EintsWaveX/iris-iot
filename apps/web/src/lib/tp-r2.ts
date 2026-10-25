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

const kunciBerkas = (k: string) => TP_KUNCI_RE.test(k) || REK_KUNCI_RE.test(k);

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
