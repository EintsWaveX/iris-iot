/**
 * POST /api/session   { tanggal, modul, slot? , mulai?, butuhAp? }   — assistant-only.
 *
 * Creates a session and marks it the running one. Phase 1 has no
 * scheduler (see src/lib/sesi.ts's header comment) — an assistant starts
 * a session explicitly, the same "manual override" affordance
 * modul4/server.py always kept alongside its own automatic scheduler for
 * when a practicum slips off the clock.
 *
 * `slot` (1-4) is the Stage 5 path: the client sends one of the
 * practicum's four fixed daily slots and the server looks up its clock
 * time from jadwal.ts's SLOT_MULAI, so the two can never disagree about
 * what "slot 2" means. `mulai` (free-text "HH:MM") still works standalone
 * for a session outside the fixed schedule; `slot` wins if both are sent.
 * `butuhAp` marks a session that needs the Orange Pi as its own access
 * point rather than a campus client (Module 4 Part A only, see the Track B
 * provisioning notes) — refused for any other module, since nothing else
 * in the practicum ever needs AP mode.
 *
 * Starting a new session demotes whichever one was previously "berjalan"
 * to "selesai" — the invariant is "at most one running session", enforced
 * here rather than left to the caller to remember to end the old one
 * first. That demotion now also stamps real selesaiPada/durasiDetik
 * (matching api/session/[aksi].ts's explicit end-session action), so a
 * session that ends by a new one starting has the same lifecycle data as
 * one an assistant explicitly ended.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore, pgErrorCode } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { sesi } from "../../src/lib/schema.js";
import { slotToMulai } from "../../src/lib/jadwal.js";
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
  const modul = Number(body.modul);
  const slot = body.slot === undefined || body.slot === null ? null : Number(body.slot);
  const butuhAp = Boolean(body.butuhAp);
  const mulai =
    slot !== null ? (slotToMulai(slot) ?? "") : typeof body.mulai === "string" ? body.mulai : "";

  if (
    !TANGGAL_RE.test(tanggal) ||
    !JAM_RE.test(mulai) ||
    ![1, 2, 3, 4].includes(modul) ||
    (slot !== null && ![1, 2, 3, 4].includes(slot)) ||
    (butuhAp && modul !== 4)
  ) {
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
        .values({ tanggal, mulai, modul, slot, butuhAp, status: "berjalan", mulaiPada: new Date() })
        .returning();
      return row;
    });

    await writeAudit(session.nim, "sesi_mulai", { tanggal, mulai, modul, slot, butuhAp });
    res.status(200).json({ ok: true, sesi: created });
  } catch (err) {
    // Postgres unique_violation on (tanggal, modul, mulai) -- the same
    // slot was already scheduled today.
    if (pgErrorCode(err) === "23505") {
      res.status(200).json({ ok: false, kode: "sudah_ada" });
      return;
    }
    console.error("[api/session] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}
