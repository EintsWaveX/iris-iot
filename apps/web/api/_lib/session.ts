/**
 * Reads and (optionally) enforces the session cookie for a route. Every
 * assistant-only route in api/session/* calls requireRole(req, res, "asisten")
 * as its first line, so "who is allowed to call this" is answered the same
 * way everywhere rather than re-implemented per route.
 */
import type { ApiRequest, ApiResponse } from "./http.js";
import { parseCookies } from "./http.js";
import { readSessionCookie, type SessionPayload } from "../../src/lib/auth.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { getDb } from "../../src/lib/db.js";
import { anggota } from "../../src/lib/schema.js";
import { eq } from "drizzle-orm";
import { totAktif } from "../../src/lib/mode-tot.js";
import { praktikanBolehMasuk } from "../../src/lib/tot.js";

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

/**
 * requireRole(req, res, "praktikan"), plus one more check (P6.2/B9): when a
 * session IS currently running and this cookie was issued for a DIFFERENT
 * one, the cookie is stale -- carried over (its 3-hour TTL outlives a
 * single 150-minute practicum slot) from a session that has since ended,
 * without a fresh login for the new one. Refuses with `sesi_berganti`
 * rather than silently letting the action through: a stale cookie's
 * attendance record still points at the OLD session (see
 * verifyPraktikanLogin's own recordAttempt call), so a student who never
 * re-logs in would show as absent from the new session's report despite
 * actively working in it. Scoped to api/modul's three actions only --
 * NOT api/session/now or /telemetry, which are read-only, carry no
 * per-student data, and are exactly the poll a client uses to notice a
 * new session started in the first place; gating those the same way would
 * make the rollover undetectable instead of just prompting a re-login.
 */
export async function requireCurrentPraktikanSesi(
  req: ApiRequest,
  res: ApiResponse,
): Promise<SessionPayload | null> {
  const session = requireRole(req, res, "praktikan");
  if (!session) return null;

  const running = await currentSesi();
  if (running && session.sesiId !== running.id) {
    res.status(401).json({ ok: false, kode: "sesi_berganti" });
    return null;
  }
  // Phase 9: an Asisten moved this student to another group during the
  // session (api/_lib/sesi-hadir.ts). The cookie still names the old one,
  // so they sign in again and land in the new group.
  if (running && session.kelompokId) {
    const [r] = await getDb()
      .select({ kelompokId: anggota.kelompokId })
      .from(anggota)
      .where(eq(anggota.nim, session.nim))
      .limit(1);
    if (r && r.kelompokId !== session.kelompokId) {
      res.status(401).json({ ok: false, kode: "sesi_berganti" });
      return null;
    }
  }
  return session;
}

/**
 * Mode TOT (2026-10-05): while it is on only the dummy Praktikan may use the
 * site, and while it is off only real ones may. A Praktikan cookie on the
 * wrong side gets 401 `sesi_berganti` (the client already signs out and asks
 * for a new sign-in on it, which then says why). Returns true when it
 * answered. Asisten and visitors pass through untouched.
 */
export async function tolakPraktikanTot(req: ApiRequest, res: ApiResponse): Promise<boolean> {
  const session = currentSession(req);
  if (!session || session.role !== "praktikan") return false;
  if (praktikanBolehMasuk(session.nim, await totAktif())) return false;
  res.status(401).json({ ok: false, kode: "sesi_berganti", alasan: "mode_tot" });
  return true;
}

/** Same contract as requireRole, but accepts any role in the given list --
 *  for routes both asisten and praktikan can call (e.g. the narrow session
 *  banner endpoint), where requireRole's exact match would wrongly reject
 *  one of the two legitimate callers. */
export function requireAnyRole(
  req: ApiRequest,
  res: ApiResponse,
  roles: ReadonlyArray<"asisten" | "praktikan">,
): SessionPayload | null {
  const session = currentSession(req);
  if (!session) {
    res.status(401).json({ ok: false, kode: "belum_masuk" });
    return null;
  }
  if (!roles.includes(session.role)) {
    res.status(403).json({ ok: false, kode: "peran_salah" });
    return null;
  }
  return session;
}
