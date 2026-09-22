/**
 * POST /api/auth/assistant   { nim, password }
 *
 * password must equal nim + "1715". See src/lib/auth.ts's header comment
 * for why this is an accountability model, not a secrecy one, and why
 * that is an explicit, accepted trade-off rather than an oversight.
 *
 * Response shape is always { ok, ... } with a 200 status even on a
 * refused login — the HTTP status line carries transport-level meaning
 * only; the login outcome is in the body, matching the "tipe"/"ok"
 * envelope modul4/server.py's WebSocket replies already use, so the two
 * auth surfaces read the same way to a client.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, clientIp, noStore } from "../_lib/http.js";
import {
  verifyAsistenLogin,
  createSessionCookie,
  sessionCookieHeader,
  writeAudit,
  type AsistenLoginResult,
} from "../../src/lib/auth.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
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
      // Asserted, not narrowed: `!result.ok` already proves this at runtime,
      // but `vercel build`'s own type-check -- unlike `astro check`'s more
      // lenient bundler resolution -- fails to narrow this discriminated
      // union here, the same class of gap `tindakan.ts`'s `jenis` field hit.
      // Confirmed by a real `vercel build` failure, not by reasoning about it.
      const gagal = result as Extract<AsistenLoginResult, { ok: false }>;
      res.status(200).json({ ok: false, kode: gagal.kode });
      return;
    }

    const cookie = createSessionCookie({ role: "asisten", nim: result.nim, nama: result.nama });
    res.setHeader("Set-Cookie", sessionCookieHeader(cookie));
    await writeAudit(result.nim, "masuk_asisten");
    res.status(200).json({ ok: true, nim: result.nim, nama: result.nama });
  } catch (err) {
    console.error("[api/auth/assistant] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}
