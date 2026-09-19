/**
 * GET /api/sesi/current — assistant-only. The session the dashboard's
 * roster editor is currently pointed at. Also returns the roster already
 * saved for it (names AND NIMs — this route is assistant-only, unlike
 * publicRoster()'s names-only projection, which is reserved for anything
 * a practitioner's browser might reach).
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, noStore } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { regu, praktikan } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { eq } from "drizzle-orm";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "GET")) return;
  if (!requireRole(req, res, "asisten")) return;

  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: true, sesi: null });
    return;
  }

  const db = getDb();
  const groups = await db.select().from(regu).where(eq(regu.sesiId, running.id));
  const members = await db
    .select({ reguId: praktikan.reguId, nim: praktikan.nim, nama: praktikan.nama })
    .from(praktikan)
    .where(eq(praktikan.sesiId, running.id));

  const roster = groups
    .sort((a, b) => a.nomor - b.nomor)
    .map((g) => ({
      nomor: g.nomor,
      nama: g.nama,
      anggota: members.filter((m) => m.reguId === g.id).map((m) => ({ nim: m.nim, nama: m.nama })),
    }));

  res.status(200).json({ ok: true, sesi: running, roster });
}
