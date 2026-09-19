/**
 * Reads and (optionally) enforces the session cookie for a route. Every
 * assistant-only route in api/sesi/* calls requireRole(req, res, "asisten")
 * as its first line, so "who is allowed to call this" is answered the same
 * way everywhere rather than re-implemented per route.
 */
import type { ApiRequest, ApiResponse } from "./http.js";
import { parseCookies } from "./http.js";
import { readSessionCookie, type SessionPayload } from "../../src/lib/auth.js";

export function currentSession(req: ApiRequest): SessionPayload | null {
  const cookies = parseCookies(req);
  return readSessionCookie(cookies["iris_session"]);
}

/** Returns the session if it exists and matches `role`, otherwise writes
 *  a 401/403 response itself and returns null — callers just do
 *  `const session = requireRole(req, res, "asisten"); if (!session) return;` */
export function requireRole(
  req: ApiRequest,
  res: ApiResponse,
  role: "asisten" | "praktikan",
): SessionPayload | null {
  const session = currentSession(req);
  if (!session) {
    res.status(401).json({ ok: false, kode: "belum_masuk" });
    return null;
  }
  if (session.role !== role) {
    res.status(403).json({ ok: false, kode: "peran_salah" });
    return null;
  }
  return session;
}
