/**
 * Konsol Pi (Phase 9 Stage 9): the rules and the ticket format, shared by
 * the API (Vercel, Node), the relay (Cloudflare Worker) and the tests. Pure
 * and browser safe: the HMAC uses WebCrypto, which all three have.
 *
 * - Who (2026-10-05): every active Asisten may ask, or ask to join an open
 *   console. The Pencipta, the Inti (Admin tier) and DEV open and join
 *   without an approver; the others of them are told and can ask or reject
 *   (reject cuts it off). Anyone else's request is answered by one of them,
 *   never the asker; a join, also by the console's owner. Inside the room
 *   one person controls at a time (the relay, apps/relay).
 * - Time: a request expires after 10 minutes unanswered; an open console
 *   closes after 10 minutes idle and 60 minutes at most.
 * - Tickets: `base64url(payload).base64url(hmac)`, HMAC-SHA256 over the
 *   first part with KONSOL_RELAY_SECRET. 60 seconds for the browser; the
 *   Pi's is longer because it rides the next heartbeat. Each carries a
 *   nonce the relay accepts once, the room (kanal), the server, the person
 *   and the hard end of the console.
 */

export const KONSOL_TARGET = ["terminal", ":0", ":1"] as const;
export type KonsolTarget = (typeof KONSOL_TARGET)[number];

export const KONSOL_STATUS = [
  "diminta",
  "disetujui",
  "ditolak",
  "aktif",
  "selesai",
  "kedaluwarsa",
  "diputus",
] as const;
export type KonsolStatus = (typeof KONSOL_STATUS)[number];

/** A request nobody answers runs out after this long. */
export const MINTA_MENIT = 10;
/** No input for this long closes the console (after a 60 s warning). */
export const DIAM_MENIT = 10;
/** The longest a console stays open; ask again after. */
export const BATAS_MENIT = 60;
/** The browser's ticket. */
export const TIKET_WEB_DETIK = 60;
/** The Pi's ticket: it waits for the agent's next heartbeat (60 s idle). */
export const TIKET_PI_DETIK = 180;
/** Terminal output kept for Audit. */
export const TRANSKRIP_MAKS = 256 * 1024;

export function targetValid(v: unknown): v is KonsolTarget {
  return typeof v === "string" && (KONSOL_TARGET as readonly string[]).includes(v);
}

/** Opens and joins without an approver, and answers others: the Pencipta,
 *  the Inti (Admin tier) and DEV. */
export function istimewaKonsol(o: { badges: readonly string[]; tier?: string | null }): boolean {
  return o.badges.includes("dev") || o.badges.includes("pencipta") || o.tier === "admin";
}

/** May ask for a console, or to join one: every active Asisten. */
export function bolehKonsol(o: { status?: string | null }): boolean {
  return (o.status ?? "aktif") === "aktif";
}

export function bolehSetujui(
  penyetuju: { nim: string; badges: readonly string[]; tier?: string | null },
  peminta: { nim: string },
): boolean {
  return istimewaKonsol(penyetuju) && penyetuju.nim !== peminta.nim;
}

export interface KonsolBaris {
  status: KonsolStatus;
  dimintaPada: Date | string;
  mulai?: Date | string | null;
  disetujuiPada?: Date | string | null;
}

const ms = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).getTime();

/** The status once time is counted: an unanswered request expires, an open
 *  console past its 60 minutes is over. Rows are updated lazily with this. */
export function statusEfektif(r: KonsolBaris, now = Date.now()): KonsolStatus {
  if (r.status === "diminta" && now - ms(r.dimintaPada) > MINTA_MENIT * 60_000)
    return "kedaluwarsa";
  const awal = r.mulai ?? r.disetujuiPada;
  if ((r.status === "disetujui" || r.status === "aktif") && awal) {
    if (now - ms(awal) > BATAS_MENIT * 60_000) return "selesai";
  }
  // Approved but never opened within the request window runs out too.
  if (r.status === "disetujui" && !r.mulai && r.disetujuiPada) {
    if (now - ms(r.disetujuiPada) > MINTA_MENIT * 60_000) return "kedaluwarsa";
  }
  return r.status;
}

/** Seconds left of an open console (null when it hasn't started). */
export function sisaDetikKonsol(r: KonsolBaris, now = Date.now()): number | null {
  const awal = r.mulai ?? r.disetujuiPada;
  if (!awal) return null;
  return Math.max(0, Math.round((ms(awal) + BATAS_MENIT * 60_000 - now) / 1000));
}

/* ----------------------------------------------------------- tickets */

export interface Tiket {
  v: 1;
  /** Which end: the browser or the Pi. */
  p: "web" | "pi";
  /** The relay room. */
  k: string;
  /** server.id */
  s: number;
  /** The person (web) or "" (pi). */
  u: string;
  /** Their name and code, for the others in the room (web). */
  nm?: string;
  /** The person who asked for the console (web): control comes back to
   *  them when the controller leaves. */
  pk?: boolean;
  t: KonsolTarget;
  /** Ticket expiry, unix seconds. */
  exp: number;
  /** The console's hard end, unix seconds. */
  end: number;
  /** Single use. */
  n: string;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(p);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function kunci(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function tandaTiket(t: Tiket, secret: string): Promise<string> {
  if (secret.length < 32) throw new Error("KONSOL_RELAY_SECRET too short");
  const body = b64url(enc.encode(JSON.stringify(t)));
  const sig = await crypto.subtle.sign("HMAC", await kunci(secret), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export type CekTiket =
  { ok: true; tiket: Tiket } | { ok: false; kode: "format" | "tanda" | "kedaluwarsa" | "peran" };

/** Checks the signature, the end it is for and the expiry. Single use is
 *  the relay's job (it keeps the nonces it has seen). */
export async function cekTiket(
  token: string,
  secret: string,
  peran: Tiket["p"],
  nowSec = Math.floor(Date.now() / 1000),
): Promise<CekTiket> {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || token.length > 2048)
    return { ok: false, kode: "format" };
  let good = false;
  try {
    good = await crypto.subtle.verify("HMAC", await kunci(secret), unb64url(sig), enc.encode(body));
  } catch {
    return { ok: false, kode: "format" };
  }
  if (!good) return { ok: false, kode: "tanda" };
  let t: Tiket;
  try {
    t = JSON.parse(new TextDecoder().decode(unb64url(body))) as Tiket;
  } catch {
    return { ok: false, kode: "format" };
  }
  if (
    t?.v !== 1 ||
    typeof t.k !== "string" ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(t.k) ||
    typeof t.n !== "string" ||
    t.n.length < 16 ||
    !targetValid(t.t) ||
    typeof t.exp !== "number" ||
    typeof t.end !== "number"
  )
    return { ok: false, kode: "format" };
  if (t.p !== peran) return { ok: false, kode: "peran" };
  if (nowSec > t.exp || nowSec > t.end) return { ok: false, kode: "kedaluwarsa" };
  return { ok: true, tiket: t };
}

/** A random id for a room or a nonce (base64url, 24 bytes). */
export function acakId(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return b64url(b);
}
