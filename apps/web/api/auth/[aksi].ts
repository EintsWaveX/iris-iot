/**
 * /api/auth/:aksi — merges four routes that used to be their own function
 * files (me, student, assistant, logout) behind one dynamic segment, the
 * same consolidation and for the same reason as api/session/[aksi].ts: the
 * Vercel Hobby plan's 12-function ceiling. No URL changes -- the existing
 * rewrites in vercel.json already map /api/auth/praktikan, /api/auth/asisten
 * and /api/auth/keluar onto these exact English paths.
 *
 * GET  /api/auth/me            — who is signed in, if anyone. P8: an assistant also gets `kode` and `perluAturSandi`.
 * POST /api/auth/student       { nim }              — no password.
 * POST /api/auth/assistant     { nim, password }
 * POST /api/auth/logout        (no body)
 * POST /api/auth/set-password  { password }         — assistant-only, first-login flow.
 * POST /api/auth/change-password { lama, baru }      — assistant-only, any time (P8 /account). Rate-limited like a login.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, clientIp, noStore } from "../_lib/http.js";
import { currentSession, requireRole } from "../_lib/session.js";
import {
  verifyPraktikanLogin,
  verifyAsistenLogin,
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

async function handleMe(req: ApiRequest, res: ApiResponse) {
  if (!requireMethod(req, res, "GET")) return;

  const session = currentSession(req);
  if (!session) {
    res.status(200).json({ ok: false });
    return;
  }

  // P8: the role badge shows an assistant's code, and the home page reminds
  // anyone still on the starting password. Best effort: /me must keep
  // answering even if this lookup fails.
  let kode: string | undefined;
  let perluAturSandi: boolean | undefined;
  let divisi: { id: string; en: string } | undefined;
  if (session.role === "asisten") {
    try {
      const [row] = await getDb()
        .select({
          kode: asisten.kode,
          hash: asisten.passwordHash,
          divisiId: asisten.divisiId,
          divisiEn: asisten.divisiEn,
        })
        .from(asisten)
        .where(eq(asisten.nim, session.nim))
        .limit(1);
      kode = row?.kode;
      perluAturSandi = row ? !row.hash : undefined;
      divisi = row ? { id: row.divisiId, en: row.divisiEn } : undefined;
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
    const result = await verifyPraktikanLogin(nim, clientIp(req));

    if (!result.ok) {
      // Asserted, not narrowed: see the old student.ts header comment --
      // vercel build's type-check fails to narrow this discriminated union
      // the way astro check's bundler resolution does.
      const gagal = result as Extract<PraktikanLoginResult, { ok: false }>;
      res.status(200).json({ ok: false, kode: gagal.kode });
      return;
    }

    const cookie = createSessionCookie({
      role: "praktikan",
      nim: result.nim,
      nama: result.nama,
      kelompokId: result.kelompokId,
      kelompokNomor: result.kelompokNomor,
      sesiId: result.sesiId,
    });
    res.setHeader("Set-Cookie", sessionCookieHeader(cookie));
    res.status(200).json({
      ok: true,
      nim: result.nim,
      nama: result.nama,
      kelompok: result.kelompokNomor,
      kelompokNama: result.kelompokNama,
    });
  } catch (err) {
    console.error("[api/auth/student] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

async function handleAssistant(req: ApiRequest, res: ApiResponse) {
  if (!requireMethod(req, res, "POST")) return;

  const body = jsonBody(req);
  const nim = typeof body.nim === "string" ? body.nim.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!nim || !password) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  try {
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);

  const aksi = req.query.aksi;

  if (aksi === "me") return handleMe(req, res);
  if (aksi === "student") return handleStudent(req, res);
  if (aksi === "assistant") return handleAssistant(req, res);
  if (aksi === "logout") return handleLogout(req, res);
  if (aksi === "set-password") return handleSetPassword(req, res);
  if (aksi === "change-password") return handleChangePassword(req, res);

  res.status(404).json({ ok: false, kode: "tidak_ditemukan" });
}
