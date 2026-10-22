/**
 * Session streams (Phase 12): the rules shared by the API, the relay
 * (apps/relay, the Aliran room) and the pages. Pure and browser safe.
 *
 * A running session has one relay room, `sesi-<id>`, and the Server pages
 * share one more, `pi`. A page enters with a ticket the API signs for one
 * room, one role and, for a Praktikan, their own group. Inside, the room
 * passes each message only to those allowed to see it (`bolehTerima`):
 * - an Asisten sees everything;
 * - a Praktikan sees board telemetry of every group (the Live room's group
 *   picker allows it today), and serial lines, blank results and hints of
 *   their own group only;
 * - the `pi` room takes Asisten only.
 * A group's laptop sends its board lines and readings up its own socket
 * (`saringNaik` checks them, and the group comes from the ticket, never
 * from the page). The API sends the rest with a signed POST.
 */
import { bacaTanda, tandaiJson } from "./tanda.js";

// ---------- Tickets ----------
// ---------- Tickets ----------
// ---------- Tickets ----------

/** A room ticket lives this long; a reconnect asks for a new one */
export const ALIRAN_TIKET_DETIK = 60;
export const ALIRAN_RUANG_RE = /^(sesi-[1-9]\d{0,8}|pi)$/;

export type PeranAliran = "asisten" | "praktikan";

export interface TiketAliran {
  v: 1;
  p: "aliran";
  /** The room: "sesi-<id>" or "pi" */
  r: string;
  peran: PeranAliran;
  /** The group this socket belongs to and may send for (null: none) */
  g: number | null;
  /** The person */
  u: string;
  /** Ticket expiry, unix seconds */
  exp: number;
  /** Single use */
  n: string;
}

export function ruangSesi(sesiId: number): string {
  return `sesi-${sesiId}`;
}

export async function tandaTiketAliran(t: TiketAliran, secret: string): Promise<string> {
  return tandaiJson(t, secret);
}

export type CekTiketAliran =
  | { ok: true; tiket: TiketAliran }
  | { ok: false; kode: "format" | "tanda" | "kedaluwarsa" | "ruang" };

/** Signature, shape, room and expiry. Single use is the room's job. */
export async function cekTiketAliran(
  token: string,
  secret: string,
  ruang: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<CekTiketAliran> {
  const baca = await bacaTanda(token, secret);
  if (!baca.ok) return baca;
  const t = baca.isi as TiketAliran;
  if (
    t?.v !== 1 ||
    t.p !== "aliran" ||
    typeof t.r !== "string" ||
    !ALIRAN_RUANG_RE.test(t.r) ||
    (t.peran !== "asisten" && t.peran !== "praktikan") ||
    !(t.g === null || (Number.isInteger(t.g) && t.g >= 1 && t.g <= 99)) ||
    typeof t.u !== "string" ||
    typeof t.n !== "string" ||
    t.n.length < 16 ||
    typeof t.exp !== "number"
  )
    return { ok: false, kode: "format" };
  if (t.r !== ruang) return { ok: false, kode: "ruang" };
  // The Server pages' room is for Asisten only
  if (t.r === "pi" && t.peran !== "asisten") return { ok: false, kode: "ruang" };
  if (nowSec > t.exp) return { ok: false, kode: "kedaluwarsa" };
  return { ok: true, tiket: t };
}

// ---------- Messages ----------
// ---------- Messages ----------
// ---------- Messages ----------

/**
 * tel       board readings of a group (laptop for Module 1, the Pi for 2 to 4)
 * serial    a group laptop's raw board lines
 * jawaban   a blank was checked (the group's own answer, never the key)
 * petunjuk  a hint was asked for, cancelled or answered
 * denyut    a Pi heartbeat (the `pi` room)
 */
export const JENIS_ALIRAN = ["tel", "serial", "jawaban", "petunjuk", "denyut"] as const;
export type JenisAliran = (typeof JENIS_ALIRAN)[number];

export interface PesanAliran {
  j: JenisAliran;
  /** The group it is about, or null for the whole room */
  g: number | null;
  d: unknown;
}

/** Who may see a message, by the socket's ticket */
export function bolehTerima(
  att: { peran: PeranAliran; g: number | null },
  m: PesanAliran,
): boolean {
  if (att.peran === "asisten") return true;
  if (m.j === "denyut") return false;
  if (m.j === "tel") return true;
  return m.g !== null && m.g === att.g;
}

/** The largest message a page may send up, in characters */
export const NAIK_MAKS = 16_384;
const JAM_RE = /^\d{2}:\d{2}:\d{2}:\d{3}$/;
const SUMBER_RE = /^b\d$/;
const NILAI_KUNCI_RE = /^[a-z_]{1,16}$/;

function jamAtauNull(v: unknown): string | null {
  return typeof v === "string" && JAM_RE.test(v) ? v : null;
}

function nilaiAtauNull(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, number> = {};
  let n = 0;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!NILAI_KUNCI_RE.test(k) || typeof x !== "number" || !Number.isFinite(x)) continue;
    out[k] = x;
    if (++n >= 8) break;
  }
  return n ? out : null;
}

export interface BarisTel {
  seq: number;
  tx: string | null;
  rx: string | null;
  delayMs: number | null;
  nilai: Record<string, number> | null;
}

export interface BarisSerial {
  sumber: string;
  teks: string;
  t: number;
}

/**
 * A message a page sent up its socket, checked and stamped with the group
 * from its ticket; null when it may not send it or it isn't well formed.
 * `{j:"lihat"}` is handled by the room itself, not here.
 */
export function saringNaik(
  raw: string,
  att: { peran: PeranAliran; g: number | null },
): PesanAliran | null {
  if (raw.length > NAIK_MAKS || att.g === null) return null;
  let m: { j?: unknown; d?: unknown };
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(m?.d) || !m.d.length) return null;
  if (m.j === "tel") {
    const d: BarisTel[] = [];
    for (const r of m.d.slice(0, 50) as Record<string, unknown>[]) {
      const tx = jamAtauNull(r?.tx);
      const rx = jamAtauNull(r?.rx);
      if (!tx && !rx) continue;
      const delay = r?.delayMs;
      d.push({
        seq: Number.isInteger(r?.seq) ? (r.seq as number) : 0,
        tx,
        rx,
        delayMs:
          rx && Number.isInteger(delay) && (delay as number) >= 0 && (delay as number) <= 600_000
            ? (delay as number)
            : null,
        nilai: nilaiAtauNull(r?.nilai),
      });
    }
    return d.length ? { j: "tel", g: att.g, d } : null;
  }
  if (m.j === "serial") {
    const d: BarisSerial[] = [];
    for (const r of m.d.slice(0, 60) as Record<string, unknown>[]) {
      const t = Number(r?.t);
      if (typeof r?.sumber !== "string" || !SUMBER_RE.test(r.sumber)) continue;
      if (typeof r?.teks !== "string" || !r.teks.trim()) continue;
      if (!Number.isInteger(t) || t < 0 || t >= 86_400_000) continue;
      d.push({ sumber: r.sumber, teks: r.teks.slice(0, 300), t });
    }
    return d.length ? { j: "serial", g: att.g, d } : null;
  }
  return null;
}

/** The API's batch for a room: well formed messages only, else null */
export function saringKiriman(raw: unknown): PesanAliran[] | null {
  const m = (raw as { m?: unknown })?.m;
  if (!Array.isArray(m) || !m.length || m.length > 100) return null;
  const out: PesanAliran[] = [];
  for (const x of m as Record<string, unknown>[]) {
    if (!(JENIS_ALIRAN as readonly string[]).includes(String(x?.j))) return null;
    const g = x.g ?? null;
    if (!(g === null || (Number.isInteger(g) && (g as number) >= 1 && (g as number) <= 99)))
      return null;
    out.push({ j: x.j as JenisAliran, g: g as number | null, d: x.d ?? null });
  }
  return out;
}
