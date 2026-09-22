/**
 * POST /api/sesi   { tanggal, mulai, modul }   — assistant-only.
 *
 * Creates a session and marks it the running one. Phase 1 has no
 * scheduler (see src/lib/sesi.ts's header comment) — an assistant starts
 * a session explicitly, the same "manual override" affordance
 * modul4/server.py always kept alongside its own automatic scheduler for
 * when a practicum slips off the clock.
 *
 * Starting a new session demotes whichever one was previously "berjalan"
 * to "selesai" — the invariant is "at most one running session", enforced
 * here rather than left to the caller to remember to end the old one
 * first. That demotion now also stamps real selesaiPada/durasiDetik
 * (matching api/sesi/akhiri.ts's explicit end-session path), so a session
 * that ends by a new one starting has the same lifecycle data as one an
 * assistant explicitly ended.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore, pgErrorCode } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { sesi } from "../../src/lib/schema.js";
import { eq, sql } from "drizzle-orm";
import { writeAudit } from "../../src/lib/auth.js";

const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;
const JAM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const body = jsonBody(req);
  const tanggal = typeof body.tanggal === "string" ? body.tanggal : "";
  const mulai = typeof body.mulai === "string" ? body.mulai : "";
  const modul = Number(body.modul);

  if (!TANGGAL_RE.test(tanggal) || !JAM_RE.test(mulai) || ![1, 2, 3, 4].includes(modul)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  try {
    const db = getDb();

    const created = await db.transaction(async (tx) => {
      await tx
        .update(sesi)
        .set({
          status: "selesai",
          selesaiPada: sql`now()`,
          durasiDetik: sql`extract(epoch from now() - coalesce(${sesi.mulaiPada}, ${sesi.dibuatPada}))::int`,
        })
        .where(eq(sesi.status, "berjalan"));
      const [row] = await tx
        .insert(sesi)
        .values({ tanggal, mulai, modul, status: "berjalan", mulaiPada: new Date() })
        .returning();
      return row;
    });

    await writeAudit(session.nim, "sesi_mulai", { tanggal, mulai, modul });
    res.status(200).json({ ok: true, sesi: created });
  } catch (err) {
    // Postgres unique_violation on (tanggal, modul, mulai) -- the same
    // slot was already scheduled today.
    if (pgErrorCode(err) === "23505") {
      res.status(200).json({ ok: false, kode: "sudah_ada" });
      return;
    }
    console.error("[api/sesi] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}
