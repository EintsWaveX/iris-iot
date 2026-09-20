/**
 * POST /api/auth/praktikan   { nim }
 *
 * No password: the practitioner side of the Phase 1 plan's auth model
 * (section 6). Resolves the NIM against whichever session is currently
 * running and returns the group the server found — the group is never
 * something the client can assert, matching modul4/server.py's cari_nim().
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, clientIp, noStore } from "../_lib/http.js";
import {
  verifyPraktikanLogin,
  createSessionCookie,
  sessionCookieHeader,
  NIM_PATTERN,
} from "../../src/lib/auth.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
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
      res.status(200).json({ ok: false, kode: result.kode });
      return;
    }

    const cookie = createSessionCookie({
      role: "praktikan",
      nim: result.nim,
      nama: result.nama,
      reguId: result.reguId,
      reguNomor: result.reguNomor,
      sesiId: result.sesiId,
    });
    res.setHeader("Set-Cookie", sessionCookieHeader(cookie));
    res.status(200).json({
      ok: true,
      nim: result.nim,
      nama: result.nama,
      regu: result.reguNomor,
      reguNama: result.reguNama,
    });
  } catch (err) {
    console.error("[api/auth/praktikan] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}
