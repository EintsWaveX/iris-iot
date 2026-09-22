/**
 * POST /api/sesi/akhiri   (no body)   — assistant-only.
 *
 * Explicitly ends whichever session is "berjalan": sets selesaiPada and
 * durasiDetik and moves status to "selesai". Previously a session only
 * ever left "berjalan" as a side effect of starting the NEXT one
 * (api/sesi/index.ts) -- this is the real end-session path, callable the
 * moment a practicum session actually wraps up rather than only once
 * someone starts the next slot.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, noStore } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { sesi } from "../../src/lib/schema.js";
import { eq, sql } from "drizzle-orm";
import { currentSesi } from "../../src/lib/sesi.js";
import { writeAudit } from "../../src/lib/auth.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }

  const db = getDb();
  const [updated] = await db
    .update(sesi)
    .set({
      status: "selesai",
      selesaiPada: sql`now()`,
      durasiDetik: sql`extract(epoch from now() - coalesce(${sesi.mulaiPada}, ${sesi.dibuatPada}))::int`,
    })
    .where(eq(sesi.id, running.id))
    .returning();

  await writeAudit(session.nim, "sesi_akhiri", { sesiId: running.id });
  res.status(200).json({ ok: true, sesi: updated });
}
