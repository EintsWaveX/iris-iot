/**
 * POST /api/auth/asisten   { nim, password }
 *
 * password must equal nim + "1715". See src/lib/auth.ts's header comment
 * for why this is an accountability model, not a secrecy one, and why
 * that is an explicit, accepted trade-off rather than an oversight.
 *
 * Response shape is always { ok, ... } with a 200 status even on a
 * refused login — the HTTP status line carries transport-level meaning
 * only; the login outcome is in the body, matching the "tipe"/"ok"
 * envelope hunt/server.py's WebSocket replies already use, so the two
 * auth surfaces read the same way to a client.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http";
import { requireMethod, jsonBody, clientIp, noStore } from "../_lib/http";
import {
  verifyAsistenLogin,
  createSessionCookie,
  sessionCookieHeader,
  writeAudit,
} from "../../src/lib/auth";

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
      res.status(200).json({ ok: false, kode: result.kode });
      return;
    }

    const cookie = createSessionCookie({ role: "asisten", nim: result.nim, nama: result.nama });
    res.setHeader("Set-Cookie", sessionCookieHeader(cookie));
    await writeAudit(result.nim, "masuk_asisten");
    res.status(200).json({ ok: true, nim: result.nim, nama: result.nama });
  } catch (err) {
    console.error("[api/auth/asisten] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}
