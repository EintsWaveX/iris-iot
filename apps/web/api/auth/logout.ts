/**
 * POST /api/auth/logout — signs out by clearing the session cookie.
 * No body, no lookup: whoever is asking to sign out is signed out.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, noStore } from "../_lib/http.js";
import { clearSessionCookieHeader } from "../../src/lib/auth.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  res.setHeader("Set-Cookie", clearSessionCookieHeader());
  res.status(200).json({ ok: true });
}
