/**
 * Oprec accounts (user, 2026-10-24): the would-be candidate's own sign-in on
 * /recruitment, NIM and a password they chose, apart from the practicum.
 * The practicum's iris_session never counts as a candidate, and this cookie
 * never counts anywhere else:
 *
 *   iris_oprec   a signed cookie like iris_session, but signed in its own
 *                HMAC domain ("oprec\n" + body), so neither can be passed off
 *                as the other. It carries the account's `versi`, read back on
 *                every request: Reset Akun bumps it and every device is out.
 *
 * sesiOprec() answers in the SessionPayload shape the candidate handlers
 * already read (role "praktikan", nim, nama), so they did not change.
 *
 * POST /api/recruitment/account-signup   { nim, nama, sandi, klaim? }  klaim after a reset;
 *                                        while the Google Form is the way in, only with klaim
 * POST /api/recruitment/account-signin   { nim, sandi }
 * POST /api/recruitment/account-signout
 * GET  /api/recruitment/account          { account: { nim, nama } | null }
 * POST /api/recruitment/account-reset    { nim }   Panitia with the approve right;
 *                                        answers the one-time claim code
 *
 * Self sign-up cannot prove who owns a NIM (accepted, user 2026-10-24); what
 * catches a squatter is Admin's Berkas review, which shows the account name
 * beside the practicum roster's name and the CV, and Reset Akun with its code.
 */
import { createHmac, randomBytes } from "node:crypto";
import { and, count, eq, gte, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { clientIp, jsonBody, parseCookies, pgErrorCode } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import {
  hashPassword,
  perluHashUlang,
  safeEqual,
  verifyPasswordHash,
  writeAudit,
  type SessionPayload,
} from "../../src/lib/auth.js";
import { asisten, percobaanMasuk, praktikan, recAccount } from "../../src/lib/schema.js";
import { cekAkunBaru, cekMasukOprec, cekNimOprec } from "../../src/lib/recruitment/akun.js";
import { FORMULIR } from "../../src/lib/recruitment/formulir.js";
import { tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { muatPelaku, wajibHak } from "./recruitment-rights.js";

export const OPREC_COOKIE = "iris_oprec";
/** A week: candidates come back over days, and Reset Akun can still end it. */
export const OPREC_TTL_SEC = 7 * 24 * 3600;

const JENDELA_MENIT = 15;
const MAX_GAGAL_NIM = 5;
// A campus NAT puts a whole crowd behind one address in the registration week.
const MAX_GAGAL_IP = 80;
const MAX_NIM_IP = 100;

/**
 * A candidate's name: their oprec account's, else the practicum roster's (a
 * candidate who applied before accounts existed). The query joins both:
 * `.leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))` and the same
 * for `praktikan`.
 */
export const namaKandidat = sql<string | null>`coalesce(${recAccount.nama}, ${praktikan.nama})`;

interface TokenOprec {
  nim: string;
  nama: string;
  v: number;
  exp: number;
}

function rahasia(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set");
  return s;
}

const tanda = (body: string) =>
  createHmac("sha256", rahasia()).update(`oprec\n${body}`).digest("base64url");

export function buatTokenOprec(p: Omit<TokenOprec, "exp">, ttl = OPREC_TTL_SEC): string {
  const full: TokenOprec = { ...p, exp: Math.floor(Date.now() / 1000) + ttl };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${tanda(body)}`;
}

/** The token's claims if it is ours, intact and not expired; null otherwise. Never throws. */
export function bacaTokenOprec(value: string | undefined | null): TokenOprec | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig || !safeEqual(tanda(body), sig)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenOprec;
    if (typeof p.exp !== "number" || p.exp < Date.now() / 1000) return null;
    if (typeof p.nim !== "string" || typeof p.v !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

function cookieOprec(value: string, maxAge = OPREC_TTL_SEC): string {
  return `${OPREC_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
const HAPUS_COOKIE = `${OPREC_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/**
 * The candidate behind this request, from iris_oprec only, checked against
 * rec_account (still there, password set, same versi). Shaped like a
 * Praktikan session so the candidate handlers read s.nim as before.
 */
export async function sesiOprec(req: ApiRequest, db: Db = getDb()): Promise<SessionPayload | null> {
  const t = bacaTokenOprec(parseCookies(req)[OPREC_COOKIE]);
  if (!t) return null;
  const [a] = await db
    .select({ nama: recAccount.nama, versi: recAccount.versi, ada: recAccount.passHash })
    .from(recAccount)
    .where(eq(recAccount.nim, t.nim))
    .limit(1);
  if (!a || !a.ada || a.versi !== t.v) return null;
  return { role: "praktikan", nim: t.nim, nama: a.nama, exp: t.exp };
}

/** sesiOprec, or a 401 `belum_masuk_oprec` written here. */
export async function wajibOprec(
  req: ApiRequest,
  res: ApiResponse,
): Promise<SessionPayload | null> {
  const s = await sesiOprec(req);
  if (!s) tolak(res, "belum_masuk_oprec", 401);
  return s;
}

async function terkunci(db: Db, nim: string, ip: string): Promise<boolean> {
  const sejak = new Date(Date.now() - JENDELA_MENIT * 60_000);
  const gagal = and(
    eq(percobaanMasuk.jenis, "oprec"),
    eq(percobaanMasuk.berhasil, false),
    gte(percobaanMasuk.pada, sejak),
  );
  const [n] = await db
    .select({ n: count() })
    .from(percobaanMasuk)
    .where(and(gagal, eq(percobaanMasuk.nim, nim)));
  if ((n?.n ?? 0) >= MAX_GAGAL_NIM) return true;
  const [i] = await db
    .select({ n: count() })
    .from(percobaanMasuk)
    .where(and(gagal, eq(percobaanMasuk.ip, ip)));
  if ((i?.n ?? 0) >= MAX_GAGAL_IP) return true;
  // One address walking through many NIMs is collecting accounts, not a crowd.
  const [d] = await db
    .select({ n: sql<number>`count(distinct ${percobaanMasuk.nim})::int` })
    .from(percobaanMasuk)
    .where(
      and(
        eq(percobaanMasuk.jenis, "oprec"),
        eq(percobaanMasuk.ip, ip),
        gte(percobaanMasuk.pada, sejak),
      ),
    );
  return (d?.n ?? 0) >= MAX_NIM_IP;
}

const catat = (db: Db, nim: string, ip: string, berhasil: boolean) =>
  db.insert(percobaanMasuk).values({ nim, ip, jenis: "oprec", berhasil });

function masukkan(res: ApiResponse, nim: string, nama: string, v: number) {
  res.setHeader("Set-Cookie", cookieOprec(buatTokenOprec({ nim, nama, v })));
  res.status(200).json({ ok: true, account: { nim, nama } });
}

// An unknown NIM costs the same hash as a known one, so timing tells nothing.
let hashPalsu: string | null = null;

export async function handleAkun(req: ApiRequest, res: ApiResponse) {
  const s = await sesiOprec(req);
  res.status(200).json({ ok: true, account: s ? { nim: s.nim, nama: s.nama } : null });
}

export async function handleBuatAkun(req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const b = cekAkunBaru(jsonBody(req));
  if (!b.ok) return tolak(res, "data_salah", 400, { field: b.field });
  const ip = clientIp(req);
  if (await terkunci(db, b.nim, ip)) return tolak(res, "terlalu_sering", 429);
  // Asisten are never candidates; their NIMs are in the handbook anyway.
  const [a] = await db
    .select({ nim: asisten.nim })
    .from(asisten)
    .where(eq(asisten.nim, b.nim))
    .limit(1);
  if (a) return tolak(res, "nim_asisten", 409);

  const [lama] = await db.select().from(recAccount).where(eq(recAccount.nim, b.nim)).limit(1);
  // While the Google Form is the way in, the Panitia make every account
  // (2026-10-25); only a reset account is made again here, with its claim code.
  if (FORMULIR && !lama) return tolak(res, "daftar_lewat_formulir", 409, { url: FORMULIR.url });
  let versi = 1;
  if (lama?.passHash) {
    await catat(db, b.nim, ip, false);
    return tolak(res, "akun_ada", 409);
  }
  // After Reset Akun only the one holding Admin's claim code may make it again,
  // so a reset never opens the NIM to whoever is fastest.
  if (lama) {
    const klaim = jsonBody(req).klaim;
    const cocok =
      !!lama.klaimHash &&
      typeof klaim === "string" &&
      verifyPasswordHash(klaim.trim().toUpperCase(), lama.klaimHash);
    if (!cocok) {
      await catat(db, b.nim, ip, false);
      return tolak(res, typeof klaim === "string" && klaim ? "klaim_salah" : "perlu_klaim", 409);
    }
  }
  const hash = hashPassword(b.sandi);
  try {
    if (lama) {
      versi = lama.versi + 1;
      const [u] = await db
        .update(recAccount)
        .set({ nama: b.nama, passHash: hash, klaimHash: null, versi, lastSigninAt: new Date() })
        .where(and(eq(recAccount.nim, b.nim), sql`${recAccount.passHash} is null`))
        .returning({ nim: recAccount.nim });
      if (!u) return tolak(res, "akun_ada", 409);
    } else {
      await db
        .insert(recAccount)
        .values({ nim: b.nim, nama: b.nama, passHash: hash, lastSigninAt: new Date() });
    }
  } catch (e) {
    if (pgErrorCode(e) === "23505") return tolak(res, "akun_ada", 409);
    throw e;
  }
  await catat(db, b.nim, ip, true);
  await writeAudit(b.nim, "rec_akun_buat", { ulang: !!lama });
  masukkan(res, b.nim, b.nama, versi);
}

export async function handleMasukAkun(req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const b = cekMasukOprec(jsonBody(req));
  if (!b.ok) return tolak(res, "data_salah", 400, { field: b.field });
  const ip = clientIp(req);
  if (await terkunci(db, b.nim, ip)) return tolak(res, "terlalu_sering", 429);
  const [a] = await db.select().from(recAccount).where(eq(recAccount.nim, b.nim)).limit(1);
  const simpan = a?.passHash ?? (hashPalsu ??= hashPassword("bukan-sandi-siapa-pun"));
  const cocok = verifyPasswordHash(b.sandi, simpan) && !!a?.passHash;
  await catat(db, b.nim, ip, cocok);
  if (!a || !cocok) return tolak(res, "salah", 401);
  await db
    .update(recAccount)
    .set({
      lastSigninAt: new Date(),
      ...(perluHashUlang(a.passHash!) ? { passHash: hashPassword(b.sandi) } : {}),
    })
    .where(eq(recAccount.nim, a.nim));
  masukkan(res, a.nim, a.nama, a.versi);
}

export function handleKeluarAkun(_req: ApiRequest, res: ApiResponse) {
  res.setHeader("Set-Cookie", HAPUS_COOKIE);
  res.status(200).json({ ok: true });
}

/** No 0/O or 1/I/L: the code is read aloud or typed from a LINE chat. */
const HURUF_KLAIM = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function buatKodeKlaim(): string {
  const b = randomBytes(8);
  return Array.from(b, (x) => HURUF_KLAIM[x % HURUF_KLAIM.length]).join("");
}

/**
 * Admin or the Ketua: forget the password (a forgotten one, or a NIM someone
 * else took) and sign every device out. The answer carries a one-time claim
 * code, shown once to the Admin, who gives it to the NIM's owner after
 * checking who they are; making the account again needs it.
 */
export async function handleResetAkun(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "approve")) return;
  const nim = jsonBody(req).nim;
  if (!cekNimOprec(nim)) return tolak(res, "data_salah", 400, { field: "nim" });
  const kode = buatKodeKlaim();
  const [u] = await db
    .update(recAccount)
    .set({ passHash: null, klaimHash: hashPassword(kode), versi: sql`${recAccount.versi} + 1` })
    .where(eq(recAccount.nim, nim))
    .returning({ nim: recAccount.nim });
  if (!u) return tolak(res, "tidak_ditemukan", 404);
  await writeAudit(s.nim, "rec_akun_reset", { nim });
  res.status(200).json({ ok: true, klaim: kode });
}
