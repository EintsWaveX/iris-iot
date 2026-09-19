/**
 * GET /api/auth/me — the only way a static page finds out who is signed
 * in. With output: 'static' (see the Phase 1 plan's stack decision),
 * .astro pages have no server-side request context to read a cookie from
 * at all; every page that needs to know "am I signed in, and as what"
 * asks this endpoint on mount, the same way hunt/'s identity.js confirms
 * its stored NIM with the server on every reconnect rather than trusting
 * what it remembers locally.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, noStore } from "../_lib/http.js";
import { currentSession } from "../_lib/session.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "GET")) return;

  const session = currentSession(req);
  if (!session) {
    res.status(200).json({ ok: false });
    return;
  }

  res.status(200).json({
    ok: true,
    role: session.role,
    nim: session.nim,
    nama: session.nama,
    regu: session.reguNomor,
  });
}
