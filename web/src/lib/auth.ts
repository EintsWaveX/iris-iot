/**
 * IRIS IoT practicum site — authentication.
 *
 * Two roles, two very different trust levels:
 *
 *   praktikan   a student. Types their NIM alone. The server resolves it
 *               against the currently running session and returns the
 *               group it found — the group is never something the client
 *               asserts, mirroring cari_nim() in hunt/server.py.
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
 * cost of not being revocable before it expires. TTL is kept short (2
 * hours) specifically because of that trade-off.
 */
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { eq, and, gte, count } from "drizzle-orm";
import { getDb } from "./db";
import { asisten, percobaanMasuk, audit } from "./schema";
import { resolvePraktikan, currentSesi } from "./sesi";

const SESSION_TTL_SEC = 2 * 60 * 60; // 2 hours
const ASSISTANT_PASSWORD_SUFFIX = "1715";

// Rate limiting thresholds. Named after, and set to the same values as,
// the WebSocket-connection limits in hunt/server.py — MAX_GAGAL_TOKEN (5)
// and MAX_GAGAL_MASUK (12) — so the two auth surfaces fail at the same
// point rather than one being quietly more permissive than the other.
const MAX_GAGAL_ASISTEN = 5;
const MAX_GAGAL_PRAKTIKAN = 12;
const LOCKOUT_WINDOW_MIN = 15;

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

/** Timing-safe string comparison. Both inputs are padded to equal length
 *  first so the comparison itself never leaks length via early return —
 *  timingSafeEqual throws on mismatched buffer lengths rather than
 *  returning false, which would otherwise become a length oracle. */
function safeEqual(a: string, b: string): boolean {
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
  reguId?: number;
  reguNomor?: number;
  /** Only set for a praktikan; which session this resolution belongs to,
   *  so a rollover can invalidate a stale cookie the same way hunt/'s
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
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
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
 * in hunt/server.py rather than continuing to answer a client that has
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
  return (byIp?.n ?? 0) >= limit;
}

async function recordAttempt(
  nim: string,
  ip: string,
  jenis: "asisten" | "praktikan",
  berhasil: boolean,
): Promise<void> {
  const db = getDb();
  await db.insert(percobaanMasuk).values({ nim, ip, jenis, berhasil });
}

// Same shape hunt/server.py's NIM_RE uses: alphanumeric, 4-20 characters.
// Kept as one constant so the login route's format check and any future
// roster-paste validator agree on exactly what counts as a NIM.
export const NIM_PATTERN = /^[A-Za-z0-9]{4,20}$/;

export type PraktikanLoginResult =
  | {
      ok: true;
      nim: string;
      nama: string;
      sesiId: number;
      reguId: number;
      reguNomor: number;
      reguNama: string;
    }
  | { ok: false; kode: "terkunci" | "tidak_ada_sesi" | "tidak_terdaftar" };

/**
 * Resolve a student's NIM against the running session. Trimmed and
 * upper-cased first, matching hunt/'s cleanNim() — a NIM copy-pasted from
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

  // Checked separately from resolvePraktikan() so the two refusal reasons
  // hunt/SETUP.md already distinguishes for students -- "belum ada sesi
  // yang berjalan" versus "NIM ini tidak terdaftar" -- stay distinguishable
  // here too, rather than collapsing back into one generic failure.
  const running = await currentSesi();
  if (!running) {
    await recordAttempt(nim, ip, "praktikan", false);
    return { ok: false, kode: "tidak_ada_sesi" };
  }

  const resolved = await resolvePraktikan(nim);
  await recordAttempt(nim, ip, "praktikan", resolved !== null);

  if (!resolved) {
    return { ok: false, kode: "tidak_terdaftar" };
  }

  return { ok: true, ...resolved };
}

export type AsistenLoginResult =
  { ok: true; nim: string; nama: string } | { ok: false; kode: "terkunci" | "tidak_cocok" };

/**
 * Verify an assistant's NIM + password. Unknown NIM and wrong password
 * return the SAME kode and take the same code path length, so a caller
 * cannot use response timing or content to enumerate which NIMs exist in
 * `asisten` — the table is not secret (it is printed in the handbook) but
 * there is no reason to make probing it any easier than it already is.
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
  const matched = row !== undefined && safeEqual(password, expected);

  await recordAttempt(nim, ip, "asisten", matched);

  if (!matched) return { ok: false, kode: "tidak_cocok" };
  return { ok: true, nim: row!.nim, nama: row!.nama };
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
