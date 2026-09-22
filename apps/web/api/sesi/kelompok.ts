/**
 * POST /api/sesi/kelompok   { sesiId, kelompokId, aktif }   — assistant-only.
 *
 * Sets one group's per-session exclusion (sesi_kelompok.aktif) -- e.g.
 * Module 4's beacon group, which must be excluded from hunter login for
 * that session without touching its master-roster membership at all (see
 * schema.ts's comment on sesiKelompok: sparse by design, so most groups
 * never get a row here). Upserts on (sesiId, kelompokId).
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { sesiKelompok } from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const body = jsonBody(req);
  const sesiId = Number(body.sesiId);
  const kelompokId = Number(body.kelompokId);
  const aktif = Boolean(body.aktif);

  if (
    !Number.isInteger(sesiId) ||
    sesiId <= 0 ||
    !Number.isInteger(kelompokId) ||
    kelompokId <= 0
  ) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  try {
    const db = getDb();
    await db
      .insert(sesiKelompok)
      .values({ sesiId, kelompokId, aktif })
      .onConflictDoUpdate({
        target: [sesiKelompok.sesiId, sesiKelompok.kelompokId],
        set: { aktif },
      });

    await writeAudit(session.nim, "sesi_kelompok_set", { sesiId, kelompokId, aktif });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[api/sesi/kelompok] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}
