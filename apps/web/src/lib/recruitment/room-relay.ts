/**
 * The exam's relay room (EXAM-ENGINE 6): the rules shared by the API, the
 * relay (apps/relay, the Ujian room) and the pages. Pure and browser safe.
 *
 * One room per exam room, `rec-<id>`. A page enters with a ticket the API
 * signs for one room and one role: a `kursi` (a seat, whose id comes from the
 * database, never from the page) or `panitia`. The relay only fans out; the
 * API is the truth, so every message either carries its data or tells the
 * page to ask the API again.
 */
import type { PartKey, RoomState } from "./exam-types.js";
import { PART_KEYS } from "./exam-types.js";
import { normalize } from "./room.js";
import { bacaTanda, tandaiJson } from "../tanda.js";

// ---------- Tickets ----------

/** A room ticket lives this long; a reconnect asks for a new one */
export const UJIAN_TIKET_DETIK = 60;
export const UJIAN_RUANG_RE = /^rec-[1-9]\d{0,8}$/;

export type PeranUjian = "panitia" | "kursi";

export interface TiketUjian {
  v: 1;
  p: "ujian";
  /** The room: "rec-<roomId>" */
  r: string;
  peran: PeranUjian;
  /** The seat id: required for a kursi, null for the Panitia */
  s: number | null;
  /** The NIM */
  u: string;
  /** Ticket expiry, unix seconds */
  exp: number;
  /** Single use, at least 16 characters */
  n: string;
}

export const ruangUjian = (roomId: number): string => `rec-${roomId}`;

export function tandaTiketUjian(t: TiketUjian, secret: string): Promise<string> {
  return tandaiJson(t, secret);
}

export type CekTiketUjian =
  | { ok: true; tiket: TiketUjian }
  | { ok: false; kode: "format" | "tanda" | "kedaluwarsa" | "ruang" };

/** Signature, shape, room and expiry. Single use is the room's job. */
export async function cekTiketUjian(
  token: string,
  secret: string,
  ruang: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<CekTiketUjian> {
  const baca = await bacaTanda(token, secret);
  if (!baca.ok) return baca;
  const t = baca.isi as TiketUjian;
  const kursi = t?.peran === "kursi";
  if (
    t?.v !== 1 ||
    t.p !== "ujian" ||
    typeof t.r !== "string" ||
    !UJIAN_RUANG_RE.test(t.r) ||
    (t.peran !== "panitia" && !kursi) ||
    (kursi ? !(Number.isInteger(t.s) && (t.s as number) >= 1) : t.s !== null) ||
    typeof t.u !== "string" ||
    !t.u ||
    typeof t.n !== "string" ||
    t.n.length < 16 ||
    typeof t.exp !== "number"
  )
    return { ok: false, kode: "format" };
  if (t.r !== ruang) return { ok: false, kode: "ruang" };
  if (nowSec > t.exp) return { ok: false, kode: "kedaluwarsa" };
  return { ok: true, tiket: t };
}

// ---------- Messages ----------

/**
 * Down, from the API to the room (EXAM-ENGINE 6.3):
 * ruang        everyone     RoomPublic, on every accepted room action
 * kursi        that seat    { seq, extraMs, done, moved?, reroll? }
 * pelanggaran  panitia      a kejadian opened or closed
 * catatan      panitia      a note changed, refetch
 * master       panitia      { master, ask }
 * kompilasi    that seat    a compile job changed (12)
 * antrean      everyone     the compile queue, seat ids only (12)
 * hadir        panitia      who is connected, from the relay itself
 * Up: kemajuan, from a seat.
 */
export const JENIS_UJIAN_BAWAH = [
  "ruang",
  "kursi",
  "pelanggaran",
  "catatan",
  "master",
  "kompilasi",
  "antrean",
  "hadir",
] as const;
export type JenisUjianBawah = (typeof JENIS_UJIAN_BAWAH)[number];
export type JenisUjian = JenisUjianBawah | "kemajuan";

export interface PesanUjian {
  j: JenisUjian;
  /** The seat it is about; absent for the whole room */
  s?: number | null;
  d: unknown;
}

/** What the seat's own socket hears: the room, the queue, and what is its own */
const UNTUK_SEMUA = new Set<JenisUjian>(["ruang", "antrean"]);
const UNTUK_KURSI_SENDIRI = new Set<JenisUjian>(["kursi", "kompilasi"]);

/** Who may see a message, by the socket's ticket */
export function bolehTerimaUjian(
  att: { peran: PeranUjian; s: number | null },
  m: PesanUjian,
): boolean {
  if (att.peran === "panitia") return true;
  if (UNTUK_SEMUA.has(m.j)) return true;
  return UNTUK_KURSI_SENDIRI.has(m.j) && typeof m.s === "number" && m.s === att.s;
}

/** The largest frame a seat may send up, in characters */
export const UJIAN_NAIK_MAKS = 1024;
const MAKS_SOAL = 200;

/**
 * A frame a page sent up its socket, checked and stamped with the seat from
 * its ticket; null when it may not send it or it isn't well formed. Only a
 * seat sends, and only its progress (display only; the console's real counts
 * come from the API).
 */
export function saringNaikUjian(
  raw: string,
  att: { peran: PeranUjian; s: number | null },
): PesanUjian | null {
  if (att.peran !== "kursi" || att.s === null || raw.length > UJIAN_NAIK_MAKS) return null;
  let m: { j?: unknown; d?: unknown };
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (m?.j !== "kemajuan") return null;
  const d = m.d as { part?: unknown; answered?: unknown; total?: unknown } | null;
  if (
    !d ||
    typeof d.part !== "string" ||
    !(PART_KEYS as readonly string[]).includes(d.part) ||
    !Number.isInteger(d.answered) ||
    !Number.isInteger(d.total) ||
    (d.answered as number) < 0 ||
    (d.total as number) < 0 ||
    (d.total as number) > MAKS_SOAL ||
    (d.answered as number) > (d.total as number)
  )
    return null;
  return {
    j: "kemajuan",
    s: att.s,
    d: { part: d.part as PartKey, answered: d.answered, total: d.total },
  };
}

/** The API's batch for a room: well formed messages only, else null */
export function saringKirimanUjian(raw: unknown): PesanUjian[] | null {
  const m = (raw as { m?: unknown })?.m;
  if (!Array.isArray(m) || !m.length || m.length > 100) return null;
  const out: PesanUjian[] = [];
  for (const x of m as Record<string, unknown>[]) {
    if (!(JENIS_UJIAN_BAWAH as readonly string[]).includes(String(x?.j))) return null;
    const s = x.s ?? null;
    if (!(s === null || (Number.isInteger(s) && (s as number) >= 1))) return null;
    out.push({ j: x.j as JenisUjianBawah, s: s as number | null, d: x.d ?? null });
  }
  return out;
}

// ---------- The seats' copy of the room ----------

export interface RunPublic {
  durMs: number;
  usedMs: number;
  mark: number | null;
  state: "running" | "paused" | "ended";
  pausedAt: number | null;
  /** The longest extra any seat has; the per seat times stay with the console */
  maxExtraMs: number;
  startedAt: number;
  endedAt: number | null;
  endedBy: "time" | "skip" | null;
}

/** The room as every seat may know it: no Master, no ask, no seat's extra */
export interface RoomPublic {
  seq: number;
  stage: RoomState["stage"];
  cur: PartKey | null;
  runs: Partial<Record<PartKey, RunPublic>>;
  startedAt: number | null;
  finishedAt: number | null;
  /** The server's clock when this was made */
  now: number;
}

export function roomPublic(state: RoomState, now: number): RoomPublic {
  const s = normalize(state, now);
  const runs: RoomPublic["runs"] = {};
  for (const key of PART_KEYS) {
    const r = s.runs[key];
    if (!r) continue;
    runs[key] = {
      durMs: r.durMs,
      usedMs: r.usedMs,
      mark: r.mark,
      state: r.state,
      pausedAt: r.pausedAt,
      maxExtraMs: Math.max(0, ...Object.values(r.extra)),
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      endedBy: r.endedBy,
    };
  }
  return {
    seq: s.seq,
    stage: s.stage,
    cur: s.cur,
    runs,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    now,
  };
}
