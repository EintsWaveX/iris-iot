/**
 * IRIS IoT practicum site — authentication.
 *
 * Two roles, two very different trust levels:
 *
 *   praktikan   a student. Types their NIM, plus the running session's
 *               four-digit code from the projector (kodeMasukSesi). The
 *               server resolves it
 *               against the currently running session and returns the
 *               group it found — the group is never something the client
 *               asserts, mirroring cari_nim() in apps/modul4/server.py.
 *
 *   asisten     a lab assistant. Types their NIM plus a password that is
 *               their own NIM with "1715" appended. This is NOT a secret:
 *               the 25 NIMs are printed in the handbook, so anyone holding
 *               one can compute anyone else's assistant password. That is
 *               the trade the user explicitly asked for, and it means the
 *               mitigations here are about ACCOUNTABILITY, not prevention
 *               — see writeAudit() and the rate limiter below, and the
 *               Phase 1 plan's section 6 for the full reasoning.
 *
 * Session state is a signed, httpOnly cookie — not localStorage. A static
 * site with serverless API routes has no server-side session store to key
 * a plain session ID against without adding one (Redis, another table);
 * a signed cookie carries its own claims and needs nothing else, at the
 * cost of not being revocable before it expires. TTL is kept short (3
 * hours) specifically because of that trade-off -- but never shorter than
 * one practicum session (SESI_CAP_MENIT, 150 minutes). It used to be 2
 * hours, which signed every student and assistant out 45 minutes before
 * their own session ended.
 */
import * as nodeCrypto from "node:crypto";
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from "node:crypto";
import { eq, and, gte, gt, count, desc, inArray, sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { asisten, percobaanMasuk, audit, sesiKejadian } from "./schema.js";
import { resolvePraktikan, resolvePraktikanTanpaSesi, currentSesi } from "./sesi.js";
import { totAktif } from "./mode-tot.js";
import { SESSION_TTL_SEC } from "./sesi-umur.js";
import { praktikanBolehMasuk } from "./tot.js";
import { sesiBerikutnya, type SesiBerikutnya } from "./sesi-gerbang.js";

export { SESSION_TTL_SEC };
const ASSISTANT_PASSWORD_SUFFIX = "1715";

// Rate limiting thresholds. Named after, and set to the same values as,
// the WebSocket-connection limits in apps/modul4/server.py — MAX_GAGAL_TOKEN (5)
// and MAX_GAGAL_MASUK (12) — so the two auth surfaces fail at the same
// point rather than one being quietly more permissive than the other.
const MAX_GAGAL_ASISTEN = 5;
const MAX_GAGAL_PRAKTIKAN = 12;
const LOCKOUT_WINDOW_MIN = 15;
// Per-IP ceilings sit well above the per-NIM ones: a whole lab signs in
// from one NAT address, so a handful of typos across the room must not
// lock every phone out. The per-NIM limit above still guards each account.
const MAX_GAGAL_IP_ASISTEN = 30;
const MAX_GAGAL_IP_PRAKTIKAN = 80;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is not set (or is shorter than 32 characters). " +
        "Generate one with `openssl rand -base64 32` and set it in the " +
        "Vercel project's environment variables.",
    );
  }
  return secret;
}

// Passwords are hashed, never encrypted: nothing, not even this site, can
// turn a stored value back into the password. 2026-10-13 (Phase 14, the user
// asked for the strongest method): new hashes are Argon2id (RFC 9106, OWASP's
// first choice) through node:crypto's own argon2 (Node 24.7+), 64 MiB, 3
// passes. A runtime without it gets scrypt at OWASP's cost (N=2^17). Both
// come from node:crypto, so no package and its advisories.
//
// Stored forms, all hex:
//   a2id$m$t$p$salt$hash    Argon2id, m KiB, t passes, p lanes
//   s2$N$salt$hash          scrypt N, r=8, p=1
//   salt:hash               the first scrypt (Node's default N=16384), until
//                           its owner next signs in and it is hashed again
const SCRYPT_KEYLEN = 64;
const ARGON2 = { memory: 65536, passes: 3, parallelism: 1, tagLength: 32 } as const;
const SCRYPT_N = 1 << 17;
export const MIN_PASSWORD_LEN = 8;

type Argon2Sync = (
  algorithm: "argon2id",
  params: {
    message: string;
    nonce: Buffer;
    memory: number;
    passes: number;
    parallelism: number;
    tagLength: number;
  },
) => Buffer;
const argon2Sync = (nodeCrypto as unknown as { argon2Sync?: Argon2Sync }).argon2Sync;

function scryptKuat(password: string, salt: string, n: number): string {
  return scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: n,
    r: 8,
    p: 1,
    maxmem: 256 * n * 8,
  }).toString("hex");
}

/** A new hash: Argon2id where the runtime has it, scrypt N=2^17 otherwise. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  if (argon2Sync) {
    const { memory, passes, parallelism, tagLength } = ARGON2;
    const hash = argon2Sync("argon2id", {
      message: password,
      nonce: salt,
      memory,
      passes,
      parallelism,
      tagLength,
    });
    return `a2id$${memory}$${passes}$${parallelism}$${salt.toString("hex")}$${hash.toString("hex")}`;
  }
  return `s2$${SCRYPT_N}$${salt.toString("hex")}$${scryptKuat(password, salt.toString("hex"), SCRYPT_N)}`;
}

/** True when a stored hash is weaker than what hashPassword makes now. */
export function perluHashUlang(stored: string): boolean {
  if (stored.startsWith("a2id$")) return false;
  return !!argon2Sync || !stored.startsWith(`s2$${SCRYPT_N}$`);
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  if (stored.startsWith("a2id$")) {
    const [, m, t, p, salt, hash] = stored.split("$");
    if (!argon2Sync || !salt || !hash) return false;
    const candidate = argon2Sync("argon2id", {
      message: password,
      nonce: Buffer.from(salt, "hex"),
      memory: Number(m),
      passes: Number(t),
      parallelism: Number(p),
      tagLength: hash.length / 2,
    }).toString("hex");
    return safeEqual(candidate, hash);
  }
  if (stored.startsWith("s2$")) {
    const [, n, salt, hash] = stored.split("$");
    if (!salt || !hash) return false;
    return safeEqual(scryptKuat(password, salt, Number(n)), hash);
  }
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return safeEqual(candidate, hash);
}

/** Timing-safe string comparison. Both inputs are padded to equal length
 *  first so the comparison itself never leaks length via early return —
 *  timingSafeEqual throws on mismatched buffer lengths rather than
 *  returning false, which would otherwise become a length oracle. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still do a comparison of equal-length dummy buffers so a mismatched
    // length takes the same code path length-wise as a real compare.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export interface SessionPayload {
  role: "asisten" | "praktikan";
  nim: string;
  nama: string;
  /** Only set for a praktikan; the group the server resolved them into. */
  kelompokId?: number;
  kelompokNomor?: number;
  /** Only set for a praktikan; which session this resolution belongs to,
   *  so a rollover can invalidate a stale cookie the same way apps/modul4/'s
   *  identity.js compares its stored `sesi` against the live frame. */
  sesiId?: number;
  /** Only set for a praktikan who signed in to look around while a session
   *  ran (2026-10-07, user): no code, no attendance, and no nudges to join. */
  lihat?: true;
  exp: number; // unix seconds
}

function sign(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function createSessionCookie(payload: Omit<SessionPayload, "exp">): string {
  const full: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = sign(body);
  return `${body}.${sig}`;
}

/** Returns the payload if the cookie is well-formed, correctly signed, and
 *  not expired — null otherwise. Never throws; a bad cookie is simply not
 *  a session, the same way an unknown NIM is simply not a match. */
export function readSessionCookie(value: string | undefined | null): SessionPayload | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sign(body), sig)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload & {
      reguId?: number;
      reguNomor?: number;
    };
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    // Stage 21 compat: a cookie already issued when this deployed still
    // carries the pre-rename key names in its signed JSON body -- renaming
    // the TS field does nothing to bytes signed before the rename. Safe to
    // delete once SESSION_TTL_SEC (3h) has passed since that deploy, since
    // every cookie still valid by then was issued after it.
    if (payload.kelompokId === undefined && payload.reguId !== undefined) {
      payload.kelompokId = payload.reguId;
    }
    if (payload.kelompokNomor === undefined && payload.reguNomor !== undefined) {
      payload.kelompokNomor = payload.reguNomor;
    }
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieHeader(value: string, maxAgeSec = SESSION_TTL_SEC): string {
  const parts = [
    `iris_session=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  return parts.join("; ");
}

export function clearSessionCookieHeader(): string {
  return "iris_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

/**
 * Has this NIM or this IP failed too many times recently? Checked BEFORE
 * the password comparison runs, so a locked-out caller never even reaches
 * the timing-safe compare — matching the "close the connection" behaviour
 * in apps/modul4/server.py rather than continuing to answer a client that has
 * already used up its attempts.
 */
async function isLockedOut(
  nim: string,
  ip: string,
  jenis: "asisten" | "praktikan",
): Promise<boolean> {
  const db = getDb();
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000);
  const limit = jenis === "asisten" ? MAX_GAGAL_ASISTEN : MAX_GAGAL_PRAKTIKAN;

  const [byNim] = await db
    .select({ n: count() })
    .from(percobaanMasuk)
    .where(
      and(
        eq(percobaanMasuk.nim, nim),
        eq(percobaanMasuk.jenis, jenis),
        eq(percobaanMasuk.berhasil, false),
        gte(percobaanMasuk.pada, since),
      ),
    );
  if ((byNim?.n ?? 0) >= limit) return true;

  const [byIp] = await db
    .select({ n: count() })
    .from(percobaanMasuk)
    .where(
      and(
        eq(percobaanMasuk.ip, ip),
        // Wrong session codes count here too, so guessing can't hop NIMs.
        jenis === "praktikan"
          ? inArray(percobaanMasuk.jenis, ["praktikan", "kode"])
          : eq(percobaanMasuk.jenis, jenis),
        eq(percobaanMasuk.berhasil, false),
        gte(percobaanMasuk.pada, since),
      ),
    );
  return (byIp?.n ?? 0) >= (jenis === "asisten" ? MAX_GAGAL_IP_ASISTEN : MAX_GAGAL_IP_PRAKTIKAN);
}

/** Distinct NIMs one address may sign in as per window. A NIM alone opens a
 *  Praktikan's results, so one address walking through many of them is
 *  collecting names, not a lab sharing a NAT (a class is a few dozen). */
const MAX_NIM_PER_IP = 200;

async function terlaluBanyakNim(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000);
  const [r] = await getDb()
    .select({ n: sql<number>`count(distinct ${percobaanMasuk.nim})::int` })
    .from(percobaanMasuk)
    .where(
      and(
        eq(percobaanMasuk.ip, ip),
        eq(percobaanMasuk.jenis, "praktikan"),
        gte(percobaanMasuk.pada, since),
      ),
    );
  return (r?.n ?? 0) >= MAX_NIM_PER_IP;
}

async function recordAttempt(
  nim: string,
  ip: string,
  jenis: "asisten" | "praktikan" | "kode",
  berhasil: boolean,
  sesiId: number | null = null,
): Promise<void> {
  const db = getDb();
  await db.insert(percobaanMasuk).values({ nim, ip, jenis, berhasil, sesiId });
}

// Same shape apps/modul4/server.py's NIM_RE uses: alphanumeric, 4-20 characters.
// Kept as one constant so the login route's format check and any future
// roster-paste validator agree on exactly what counts as a NIM.
export const NIM_PATTERN = /^[A-Za-z0-9]{4,20}$/;

/**
 * The session's sign-in code (2026-10-05): four digits on the projector and
 * the Asisten's screen, typed with the NIM while a session runs, so knowing
 * a classmate's NIM is no longer enough to sign them in from elsewhere.
 * Derived from the session's id and start time with the cookie secret, so
 * it needs no column, changes every session, and only the server knows it.
 */
export function kodeMasukSesi(s: { id: number; mulaiPada: Date | null; dibuatPada: Date }): string {
  const mulai = (s.mulaiPada ?? s.dibuatPada).toISOString();
  const mac = createHmac("sha256", getSessionSecret())
    .update(`kode-masuk|${s.id}|${mulai}`)
    .digest();
  return String(mac.readUInt32BE(0) % 10_000).padStart(4, "0");
}

export const KODE_MASUK_RE = /^\d{4}$/;

export type PraktikanLoginResult =
  | {
      ok: true;
      nim: string;
      nama: string;
      /** null: signed in while no session runs (Phase 8), for results,
       *  feedback and journals already done. Not attendance. */
      sesiId: number | null;
      kelompokId: number;
      kelompokNomor: number;
      kelompokNama: string;
      /** Signed in to look around while a session runs (tujuan "lihat"). */
      lihat?: true;
    }
  | {
      ok: false;
      kode:
        | "terkunci"
        | "tidak_ada_sesi"
        | "tidak_terdaftar"
        | "mode_tot"
        | "perlu_tujuan"
        | "perlu_kode"
        | "kode_salah"
        | "kode_terkunci"
        | "bukan_sesimu";
      /** bukan_sesimu: when this Praktikan's own session opens. */
      sesiBerikutnya?: SesiBerikutnya;
      /** The code's own lock (2026-10-07): tries left in this round, or
       *  seconds until the next round may start. */
      sisaPercobaan?: number;
      sisaDetik?: number;
    };

/** Two tries per round; a failed round locks 30 s, doubling each time. */
export const KODE_PERCOBAAN = 2;
export const KODE_KUNCI_AWAL_DETIK = 30;
const KODE_KUNCI_MAKS_DETIK = 30 * 60;

/**
 * Where a NIM stands with this session's code: wrong codes since its last
 * sign-in to the session, two to a round. After a full round of wrong ones
 * it waits 30 s, then 60, 120... (capped at 30 min). A new session, a
 * successful sign-in or an Asisten's Buka Kunci starts over.
 */
export async function statusKode(
  nim: string,
  sesiId: number,
): Promise<{ sisaPercobaan: number; sisaDetik: number }> {
  const db = getDb();
  const [masuk] = await db
    .select({ pada: percobaanMasuk.pada })
    .from(percobaanMasuk)
    .where(
      and(
        eq(percobaanMasuk.nim, nim),
        inArray(percobaanMasuk.jenis, ["praktikan", "buka"]),
        eq(percobaanMasuk.berhasil, true),
        eq(percobaanMasuk.sesiId, sesiId),
      ),
    )
    .orderBy(desc(percobaanMasuk.pada))
    .limit(1);
  const salah = await db
    .select({ pada: percobaanMasuk.pada })
    .from(percobaanMasuk)
    .where(
      and(
        eq(percobaanMasuk.nim, nim),
        eq(percobaanMasuk.jenis, "kode"),
        eq(percobaanMasuk.sesiId, sesiId),
        ...(masuk ? [gt(percobaanMasuk.pada, masuk.pada)] : []),
      ),
    )
    .orderBy(desc(percobaanMasuk.pada))
    .limit(200);
  const n = salah.length;
  if (n === 0) return { sisaPercobaan: KODE_PERCOBAAN, sisaDetik: 0 };
  if (n % KODE_PERCOBAAN !== 0)
    return { sisaPercobaan: KODE_PERCOBAAN - (n % KODE_PERCOBAAN), sisaDetik: 0 };
  const ronde = n / KODE_PERCOBAAN;
  const kunci = Math.min(KODE_KUNCI_AWAL_DETIK * 2 ** (ronde - 1), KODE_KUNCI_MAKS_DETIK);
  const sampai = salah[0].pada.getTime() + kunci * 1000;
  const sisaDetik = Math.max(0, Math.ceil((sampai - Date.now()) / 1000));
  return { sisaPercobaan: sisaDetik > 0 ? 0 : KODE_PERCOBAAN, sisaDetik };
}

/**
 * Resolve a student's NIM against the running session. Trimmed and
 * upper-cased first, matching apps/modul4/'s cleanNim() — a NIM copy-pasted from
 * a spreadsheet cell routinely carries stray whitespace or inconsistent
 * case, and rejecting it on that basis would be a self-inflicted support
 * ticket, not a security measure.
 */
/** Why a Praktikan signs in while a session runs (2026-10-07, user): to
 *  join it, or only to look around (the next module's Ringkasan, journal
 *  history, results). Only joining asks for the code and meets the gate. */
export type TujuanMasuk = "praktikum" | "lihat";

export async function verifyPraktikanLogin(
  rawNim: string,
  ip: string,
  kodeMasuk = "",
  tujuan?: TujuanMasuk,
): Promise<PraktikanLoginResult> {
  const nim = rawNim.trim().toUpperCase();

  if (await isLockedOut(nim, ip, "praktikan")) {
    return { ok: false, kode: "terkunci" };
  }
  if (await terlaluBanyakNim(ip)) return { ok: false, kode: "terkunci" };

  // Mode TOT (2026-10-05): only the dummy accounts while it is on, only
  // real Praktikan while it is off. Not a failed attempt: it says nothing
  // about whether the NIM is real, so it never counts toward a lockout.
  if (!praktikanBolehMasuk(nim, await totAktif())) {
    return { ok: false, kode: "mode_tot" };
  }

  // Checked separately from resolvePraktikan() so the two refusal reasons
  // apps/modul4/SETUP.md already distinguishes for students -- "belum ada sesi
  // yang berjalan" versus "NIM ini tidak terdaftar" -- stay distinguishable
  // here too, rather than collapsing back into one generic failure.
  const running = await currentSesi();
  if (!running || tujuan === "lihat") {
    // Phase 8: with no session running a rostered student may still sign
    // in, to see results, give feedback and reopen journals they have
    // done. The attempt row has no sesi_id, so it never counts as having
    // attended anything. Looking around while one runs is the same sign-in.
    const luar = await resolvePraktikanTanpaSesi(nim);
    await recordAttempt(nim, ip, "praktikan", luar !== null);
    if (!luar) return { ok: false, kode: "tidak_terdaftar" };
    return { ok: true, ...luar, sesiId: null, ...(running ? { lihat: true as const } : {}) };
  }
  // Asked before the code or the gate, and for any NIM alike, so it says
  // nothing about the roster. A code sent without a purpose is an older
  // page joining.
  if (!tujuan && !kodeMasuk.trim()) return { ok: false, kode: "perlu_tujuan" };

  // The session's code comes first, so a wrong one says nothing about
  // whether the NIM is on the roster. Asking for it is not a failure; a
  // wrong one counts toward the lockout like a wrong NIM.
  // Someone else's session (2026-10-07, user): right code or wrong, the
  // answer is when their own opens, and the gate lifts then by itself. If
  // their own slot is open right now they are only missing from this
  // roster, which the Asisten fixes with Tambah Praktikan: fall through.
  // A right code from someone outside this session is flagged for the
  // Asisten (2026-10-18, user); the answer they get stays the same.
  const kode = kodeMasuk.trim();
  const kodeBenar = KODE_MASUK_RE.test(kode) && safeEqual(kode, kodeMasukSesi(running));
  let nanti: SesiBerikutnya | null = null;
  if (!(await resolvePraktikan(nim))) {
    nanti = await sesiBerikutnya(nim);
    if (nanti && new Date(nanti.bukaPada).getTime() > Date.now()) {
      if (kodeBenar) await tandaiKodeSesiLain(nim, running.id, nanti);
      return { ok: false, kode: "bukan_sesimu", sesiBerikutnya: nanti };
    }
  }

  const st = await statusKode(nim, running.id);
  if (st.sisaDetik > 0) return { ok: false, kode: "kode_terkunci", ...st };
  if (!kode) return { ok: false, kode: "perlu_kode", ...st };
  if (!kodeBenar) {
    await recordAttempt(nim, ip, "kode", false, running.id);
    const lalu = await statusKode(nim, running.id);
    return lalu.sisaDetik > 0
      ? { ok: false, kode: "kode_terkunci", ...lalu }
      : { ok: false, kode: "kode_salah", ...lalu };
  }

  const resolved = await resolvePraktikan(nim);
  // P6.2/B9: the running session's id, not resolved.sesiId -- both are the
  // same value on a real login (resolvePraktikan() only ever resolves
  // against the currently running session), but recording it here, from
  // `running` directly, keeps this attempt row correct even for a FAILED
  // resolution (resolved === null), which has no resolved.sesiId to read.
  await recordAttempt(nim, ip, "praktikan", resolved !== null, running.id);

  if (!resolved) {
    // Not on this roster and their own slot isn't the one open now.
    if (!nanti) await tandaiKodeSesiLain(nim, running.id, null);
    return { ok: false, kode: "tidak_terdaftar" };
  }

  return { ok: true, ...resolved };
}

/**
 * A Praktikan outside the running session typed its right code: one line in
 * the session's Kejadian and one in the Audit, for the Asisten only, once per
 * person per session. Only a known Praktikan counts; a stray NIM is not one.
 * Best effort: it never changes the sign-in's answer.
 */
export async function tandaiKodeSesiLain(
  nim: string,
  sesiId: number,
  nanti: SesiBerikutnya | null,
): Promise<void> {
  try {
    const p = await resolvePraktikanTanpaSesi(nim);
    if (!p) return;
    const db = getDb();
    const [ada] = await db
      .select({ id: sesiKejadian.id })
      .from(sesiKejadian)
      .where(
        and(
          eq(sesiKejadian.sesiId, sesiId),
          eq(sesiKejadian.jenis, "kode_sesi_lain"),
          sql`${sesiKejadian.detail} ->> 'nim' = ${nim}`,
        ),
      )
      .limit(1);
    if (ada) return;
    const detail = {
      nim,
      nama: p.nama,
      kelompok: p.kelompokNomor,
      ...(nanti ? { tanggal: nanti.tanggal, slot: nanti.slot } : {}),
    };
    await db
      .insert(sesiKejadian)
      .values({ sesiId, jenis: "kode_sesi_lain", detail, aktorNim: nim });
    await writeAudit(nim, "kode_sesi_lain", { sesiId, ...detail });
  } catch (err) {
    console.error("[auth] kode_sesi_lain flag failed:", err);
  }
}

export type AsistenLoginResult =
  | { ok: true; nim: string; nama: string; perluAturSandi: boolean }
  | { ok: false; kode: "terkunci" | "tidak_cocok" };

/**
 * Verify an assistant's NIM + password. Unknown NIM and wrong password
 * return the SAME kode and take the same code path length, so a caller
 * cannot use response timing or content to enumerate which NIMs exist in
 * `asisten` — the table is not secret (it is printed in the handbook) but
 * there is no reason to make probing it any easier than it already is.
 *
 * Once an assistant has a `passwordHash` set (see setAsistenPassword()),
 * that hash is the ONLY thing checked for them — the derived nim+"1715"
 * scheme stops working entirely, which is the point of moving off it. An
 * unknown NIM or an assistant who hasn't set one yet still compares against
 * the derived scheme, exactly as before Stage 4, and the timing-safe
 * compare against it always runs regardless of which row (if any) exists.
 */
export async function verifyAsistenLogin(
  nim: string,
  password: string,
  ip: string,
): Promise<AsistenLoginResult> {
  if (await isLockedOut(nim, ip, "asisten")) {
    return { ok: false, kode: "terkunci" };
  }

  const db = getDb();
  const [row] = await db.select().from(asisten).where(eq(asisten.nim, nim)).limit(1);

  // Always compare against SOMETHING, even for an unknown NIM, so the
  // absence of a row doesn't shortcut the function before the timing-safe
  // compare would otherwise have run.
  const expected = (row?.nim ?? nim) + ASSISTANT_PASSWORD_SUFFIX;
  const derivedMatch = safeEqual(password, expected);
  const hashMatch = row?.passwordHash ? verifyPasswordHash(password, row.passwordHash) : false;

  const matched = row !== undefined && (row.passwordHash ? hashMatch : derivedMatch);

  await recordAttempt(nim, ip, "asisten", matched);

  if (!matched) return { ok: false, kode: "tidak_cocok" };
  // A hash from before Argon2id is made again now, while the password is at hand.
  if (row!.passwordHash && perluHashUlang(row!.passwordHash))
    await db
      .update(asisten)
      .set({ passwordHash: hashPassword(password) })
      .where(eq(asisten.nim, row!.nim));
  return { ok: true, nim: row!.nim, nama: row!.nama, perluAturSandi: !row!.passwordHash };
}

/** The NIM behind a three-letter Asisten code, which is what the sign-in
 *  form asks for (2026-10-09). Null for an unknown or ambiguous code; the
 *  caller still runs verifyAsistenLogin on a placeholder so the attempt is
 *  counted and timed like any other miss. */
export async function nimForKode(kode: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ nim: asisten.nim })
    .from(asisten)
    .where(sql`upper(${asisten.kode}) = ${kode.toUpperCase()}`)
    .limit(2);
  return rows.length === 1 ? rows[0].nim : null;
}

/** Sets (or replaces) an assistant's real password, ending their eligibility
 *  for the derived nim+"1715" scheme from this call onward. Caller is
 *  responsible for having already authenticated the assistant (this is the
 *  first-login flow's next step, not a login itself) and for length-checking
 *  against MIN_PASSWORD_LEN. */
export async function setAsistenPassword(nim: string, password: string): Promise<void> {
  const db = getDb();
  await db
    .update(asisten)
    .set({ passwordHash: hashPassword(password), passwordDiaturPada: new Date() })
    .where(eq(asisten.nim, nim));
}

export async function writeAudit(aktorNim: string, aksi: string, detail?: unknown): Promise<void> {
  const db = getDb();
  await db.insert(audit).values({
    aktorNim,
    aksi,
    detail: detail === undefined ? null : JSON.stringify(detail),
  });
}

export { isLockedOut as isLoginLockedOut, recordAttempt as recordLoginAttempt };

/** A short, printable identifier for a request when nothing better is
 *  available — used only as a fallback IP key in local dev, where
 *  Vercel's forwarded-for headers are absent. */
export function fallbackClientKey(): string {
  return "local-" + randomBytes(4).toString("hex");
}
