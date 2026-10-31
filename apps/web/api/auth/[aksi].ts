/**
 * /api/auth/:aksi — merges four routes that used to be their own function
 * files (me, student, assistant, logout) behind one dynamic segment, the
 * same consolidation and for the same reason as api/session/[aksi].ts: the
 * Vercel Hobby plan's 12-function ceiling. No URL changes -- the existing
 * rewrites in vercel.json already map /api/auth/praktikan, /api/auth/asisten
 * and /api/auth/keluar onto these exact English paths.
 *
 * GET  /api/auth/me            — who is signed in, if anyone. P8: an assistant also gets `kode` and `perluAturSandi`.
 * POST /api/auth/student       { nim, tujuan?, kodeSesi? } — no password; while a session runs, why
 *                              ("praktikum" | "lihat"), and to join it, its 4-digit code.
 * POST /api/auth/assistant     { kode, password } — the three-letter Asisten code (2026-10-09); { nim, password } still works.
 * POST /api/auth/logout        (no body)
 * POST /api/auth/set-password  { password }         — assistant-only, first-login flow.
 * POST /api/auth/change-password { lama, baru }      — assistant-only, any time (P8 /account). Rate-limited like a login.
 * POST /api/auth/galat         { pesan, sumber?, baris?, halaman? } — anyone: the browser reporting its
 *                              own uncaught error (2026-10-05, _lib/galat.ts). Capped per IP.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { petaHak } from "../_lib/hak.js";
import { requireMethod, jsonBody, clientIp, noStore } from "../_lib/http.js";
import { currentSession, requireRole } from "../_lib/session.js";
import {
  verifyPraktikanLogin,
  verifyAsistenLogin,
  nimForKode,
  createSessionCookie,
  sessionCookieHeader,
  clearSessionCookieHeader,
  writeAudit,
  setAsistenPassword,
  NIM_PATTERN,
  MIN_PASSWORD_LEN,
  type PraktikanLoginResult,
  type AsistenLoginResult,
} from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import { asisten } from "../../src/lib/schema.js";
import { eq } from "drizzle-orm";
import { denganSiaran } from "../_lib/siaran.js";
import { catatGalat } from "../_lib/galat.js";
import { alasanTolakTot } from "../../src/lib/mode-tot.js";
import { jalankanOtomatis } from "../_lib/retensi.js";

async function handleMe(req: ApiRequest, res: ApiResponse) {
  if (!requireMethod(req, res, "GET")) return;
  // Every page asks this first, so a new semester's deletion of the last
  // one happens on its first visit (once; cheap afterwards).
  await jalankanOtomatis();

  const session = currentSession(req);
  if (!session) {
    res.status(200).json({ ok: false });
    return;
  }
  // Mode TOT: a Praktikan on the wrong side of the switch is signed out
  // here, and the page's identity check says why (IdentityWatch).
  const tolakTot =
    session.role === "praktikan"
      ? await alasanTolakTot(session.nim, session.exp, session.sesiId)
      : null;
  if (tolakTot) {
    res.setHeader("Set-Cookie", clearSessionCookieHeader());
    res.status(200).json({ ok: false, kode: tolakTot });
    return;
  }

  // P8: the role badge shows an assistant's code, and the home page reminds
  // anyone still on the starting password. Best effort: /me must keep
  // answering even if this lookup fails.
  let kode: string | undefined;
  let perluAturSandi: boolean | undefined;
  let divisi: { id: string; en: string } | undefined;
  let peran:
    | { tier: string; badges: string[]; kodeDivisi: string | null; hak: Record<string, unknown> }
    | undefined;
  if (session.role === "asisten") {
    try {
      const [row] = await getDb()
        .select({
          kode: asisten.kode,
          hash: asisten.passwordHash,
          divisiId: asisten.divisiId,
          divisiEn: asisten.divisiEn,
          tier: asisten.tier,
          divisi: asisten.divisi,
          badges: asisten.badges,
          hakOverride: asisten.hakOverride,
        })
        .from(asisten)
        .where(eq(asisten.nim, session.nim))
        .limit(1);
      kode = row?.kode;
      perluAturSandi = row ? !row.hash : undefined;
      divisi = row ? { id: row.divisiId, en: row.divisiEn } : undefined;
      // Phase 9: the tier, badges and every right, so the interface can
      // hide what the API would refuse anyway.
      // The division's code too, for Akun's Hak Saya (where a right comes from).
      peran = row
        ? { tier: row.tier, badges: row.badges, kodeDivisi: row.divisi, hak: petaHak(row) }
        : undefined;
    } catch (err) {
      console.error("[api/auth/me] asisten lookup failed:", err);
    }
  }

  res.status(200).json({
    ok: true,
    role: session.role,
    nim: session.nim,
    nama: session.nama,
    kelompok: session.kelompokNomor,
    kode,
    perluAturSandi,
    divisi,
    ...peran,
  });
}

async function handleStudent(req: ApiRequest, res: ApiResponse) {
  if (!requireMethod(req, res, "POST")) return;

  const body = jsonBody(req);
  const rawNim = typeof body.nim === "string" ? body.nim : "";
  const nim = rawNim.trim().toUpperCase();

  if (!NIM_PATTERN.test(nim)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  try {
    const kodeSesi = typeof body.kodeSesi === "string" ? body.kodeSesi.slice(0, 8) : "";
    const tujuan = body.tujuan === "praktikum" || body.tujuan === "lihat" ? body.tujuan : undefined;
    const result = await verifyPraktikanLogin(nim, clientIp(req), kodeSesi, tujuan);

    if (!result.ok) {
      // Asserted, not narrowed: see the old student.ts header comment --
      // vercel build's type-check fails to narrow this discriminated union
      // the way astro check's bundler resolution does.
      const gagal = result as Extract<PraktikanLoginResult, { ok: false }>;
      res.status(200).json({
        ok: false,
        kode: gagal.kode,
        ...(gagal.sisaPercobaan !== undefined ? { sisaPercobaan: gagal.sisaPercobaan } : {}),
        ...(gagal.sisaDetik !== undefined ? { sisaDetik: gagal.sisaDetik } : {}),
        ...(gagal.sesiBerikutnya ? { sesiBerikutnya: gagal.sesiBerikutnya } : {}),
      });
      return;
    }

    const cookie = createSessionCookie({
      role: "praktikan",
      nim: result.nim,
      nama: result.nama,
      kelompokId: result.kelompokId,
      kelompokNomor: result.kelompokNomor,
      sesiId: result.sesiId ?? undefined,
      ...(result.lihat ? { lihat: true as const } : {}),
    });
    res.setHeader("Set-Cookie", sessionCookieHeader(cookie));
    res.status(200).json({
      ok: true,
      nim: result.nim,
      nama: result.nama,
      kelompok: result.kelompokNomor,
      kelompokNama: result.kelompokNama,
      ...(result.lihat ? { lihat: true } : {}),
    });
  } catch (err) {
    console.error("[api/auth/student] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

async function handleAssistant(req: ApiRequest, res: ApiResponse) {
  if (!requireMethod(req, res, "POST")) return;

  const body = jsonBody(req);
  const kode = typeof body.kode === "string" ? body.kode.trim().toUpperCase() : "";
  const nimRaw = typeof body.nim === "string" ? body.nim.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if ((kode ? !/^[A-Z]{3}$/.test(kode) : !nimRaw) || !password) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  try {
    // An unknown code still goes through the check (and its lockout) under
    // a placeholder that matches no row.
    const nim = kode ? ((await nimForKode(kode)) ?? `kode:${kode}`) : nimRaw;
    const result = await verifyAsistenLogin(nim, password, clientIp(req));

    if (!result.ok) {
      const gagal = result as Extract<AsistenLoginResult, { ok: false }>;
      res.status(200).json({ ok: false, kode: gagal.kode });
      return;
    }

    const cookie = createSessionCookie({ role: "asisten", nim: result.nim, nama: result.nama });
    res.setHeader("Set-Cookie", sessionCookieHeader(cookie));
    await writeAudit(result.nim, "masuk_asisten");
    res.status(200).json({
      ok: true,
      nim: result.nim,
      nama: result.nama,
      perluAturSandi: result.perluAturSandi,
    });
  } catch (err) {
    console.error("[api/auth/assistant] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

async function handleLogout(req: ApiRequest, res: ApiResponse) {
  if (!requireMethod(req, res, "POST")) return;

  res.setHeader("Set-Cookie", clearSessionCookieHeader());
  res.status(200).json({ ok: true });
}

async function handleSetPassword(req: ApiRequest, res: ApiResponse) {
  if (!requireMethod(req, res, "POST")) return;

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const body = jsonBody(req);
  const password = typeof body.password === "string" ? body.password : "";

  if (password.length < MIN_PASSWORD_LEN) {
    res.status(200).json({ ok: false, kode: "terlalu_pendek" });
    return;
  }

  try {
    await setAsistenPassword(session.nim, password);
    await writeAudit(session.nim, "sandi_diatur");
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[api/auth/set-password] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

/** POST /api/auth/change-password { lama, baru } (Phase 8) -- the /account
 *  page's password change. Unlike set-password (the first-login stage, where
 *  the assistant has just typed the starting password), this re-checks the
 *  current one through verifyAsistenLogin, so it shares login's lockout. */
async function handleChangePassword(req: ApiRequest, res: ApiResponse) {
  if (!requireMethod(req, res, "POST")) return;
  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const body = jsonBody(req);
  const lama = typeof body.lama === "string" ? body.lama : "";
  const baru = typeof body.baru === "string" ? body.baru : "";
  if (!lama || baru.length < MIN_PASSWORD_LEN) {
    res.status(200).json({
      ok: false,
      kode: baru.length < MIN_PASSWORD_LEN ? "terlalu_pendek" : "format_salah",
    });
    return;
  }
  try {
    const check = await verifyAsistenLogin(session.nim, lama, clientIp(req));
    if (!check.ok) {
      res
        .status(200)
        .json({ ok: false, kode: (check as Extract<AsistenLoginResult, { ok: false }>).kode });
      return;
    }
    await setAsistenPassword(session.nim, baru);
    await writeAudit(session.nim, "sandi_diganti");
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[api/auth/change-password] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

/** Per IP, per function instance: enough for a real crash loop to show,
 *  too few to fill the audit log. */
const galatPerIp = new Map<string, { n: number; sejak: number }>();
const GALAT_IP_MAKS = 10;

async function handleGalat(req: ApiRequest, res: ApiResponse) {
  if (!requireMethod(req, res, "POST")) return;
  const body = jsonBody(req);
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  const pesan = s(body.pesan, 400);
  if (!pesan) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const ip = clientIp(req);
  const kini = Date.now();
  const r = galatPerIp.get(ip);
  const baris = r && kini - r.sejak < 10 * 60_000 ? r : { n: 0, sejak: kini };
  baris.n += 1;
  galatPerIp.set(ip, baris);
  if (galatPerIp.size > 500) galatPerIp.clear();
  if (baris.n <= GALAT_IP_MAKS) {
    const who = currentSession(req);
    catatGalat("galat_klien", {
      pesan,
      sumber: s(body.sumber, 200),
      baris: typeof body.baris === "number" ? body.baris : undefined,
      halaman: s(body.halaman, 200),
      peran: who?.role ?? "tamu",
      nim: who?.role === "asisten" ? who.nim : undefined,
    });
  }
  res.status(200).json({ ok: true });
}

async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);

  const aksi = req.query.aksi;

  if (aksi === "me") return handleMe(req, res);
  if (aksi === "student") return handleStudent(req, res);
  if (aksi === "assistant") return handleAssistant(req, res);
  if (aksi === "logout") return handleLogout(req, res);
  if (aksi === "set-password") return handleSetPassword(req, res);
  if (aksi === "change-password") return handleChangePassword(req, res);
  if (aksi === "galat") return handleGalat(req, res);

  res.status(404).json({ ok: false, kode: "tidak_ditemukan" });
}

// A successful write tells every open page what changed (_lib/siaran.ts).
export default denganSiaran("auth", handler);
