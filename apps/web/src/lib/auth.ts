/**
 * IRIS IoT practicum site — authentication.
 *
 * Two roles, two very different trust levels:
 *
 *   praktikan   a student. Types their NIM alone. The server resolves it
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
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from "node:crypto";
import { eq, and, gte, count } from "drizzle-orm";
import { getDb } from "./db.js";
import { asisten, percobaanMasuk, audit } from "./schema.js";
import { resolvePraktikan, resolvePraktikanTanpaSesi, currentSesi } from "./sesi.js";
import { totAktif } from "./mode-tot.js";
import { praktikanBolehMasuk } from "./tot.js";

const SESSION_TTL_SEC = 3 * 60 * 60; // 3 hours, > SESI_CAP_MENIT (150 min)
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

// scrypt's own key-derivation cost is the actual defence here (a plain
// salted hash with a fast digest would make offline guessing cheap); the
// built-in node:crypto implementation is used rather than a dependency
// like bcrypt for the same reason http.ts avoids @vercel/node -- one
// primitive doesn't justify a package and its own advisories.
const SCRYPT_KEYLEN = 64;
export const MIN_PASSWORD_LEN = 8;

/** Salted scrypt hash, stored as `salt:hash` (both hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPasswordHash(password: string, stored: string): boolean {
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
        eq(percobaanMasuk.jenis, jenis),
        eq(percobaanMasuk.berhasil, false),
        gte(percobaanMasuk.pada, since),
      ),
    );
  return (byIp?.n ?? 0) >= (jenis === "asisten" ? MAX_GAGAL_IP_ASISTEN : MAX_GAGAL_IP_PRAKTIKAN);
}

async function recordAttempt(
  nim: string,
  ip: string,
  jenis: "asisten" | "praktikan",
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
    }
  | { ok: false; kode: "terkunci" | "tidak_ada_sesi" | "tidak_terdaftar" | "mode_tot" };

/**
 * Resolve a student's NIM against the running session. Trimmed and
 * upper-cased first, matching apps/modul4/'s cleanNim() — a NIM copy-pasted from
 * a spreadsheet cell routinely carries stray whitespace or inconsistent
 * case, and rejecting it on that basis would be a self-inflicted support
 * ticket, not a security measure.
 */
export async function verifyPraktikanLogin(
  rawNim: string,
  ip: string,
): Promise<PraktikanLoginResult> {
  const nim = rawNim.trim().toUpperCase();

  if (await isLockedOut(nim, ip, "praktikan")) {
    return { ok: false, kode: "terkunci" };
  }

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
  if (!running) {
    // Phase 8: with no session running a rostered student may still sign
    // in, to see results, give feedback and reopen journals they have
    // done. The attempt row has no sesi_id, so it never counts as having
    // attended anything.
    const luar = await resolvePraktikanTanpaSesi(nim);
    await recordAttempt(nim, ip, "praktikan", luar !== null);
    if (!luar) return { ok: false, kode: "tidak_terdaftar" };
    return { ok: true, ...luar, sesiId: null };
  }

  const resolved = await resolvePraktikan(nim);
  // P6.2/B9: the running session's id, not resolved.sesiId -- both are the
  // same value on a real login (resolvePraktikan() only ever resolves
  // against the currently running session), but recording it here, from
  // `running` directly, keeps this attempt row correct even for a FAILED
  // resolution (resolved === null), which has no resolved.sesiId to read.
  await recordAttempt(nim, ip, "praktikan", resolved !== null, running.id);

  if (!resolved) {
    return { ok: false, kode: "tidak_terdaftar" };
  }

  return { ok: true, ...resolved };
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
  return { ok: true, nim: row!.nim, nama: row!.nama, perluAturSandi: !row!.passwordHash };
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
