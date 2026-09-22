/**
 * GET /api/sesi/current — assistant-only. Which session is running (or
 * null), plus the MASTER roster (names AND NIMs -- this route is
 * assistant-only, unlike publicRoster()'s names-only projection).
 *
 * The roster is returned unconditionally, not just while a session is
 * running: the master roster is practicum-wide (Phase 3), so an assistant
 * edits it whether or not a session happens to be live right now. Each
 * group additionally carries `sesiAktif`, the CURRENT session's
 * sesi_kelompok override if one exists (e.g. Module 4's beacon exclusion)
 * -- true by default, since the table is sparse by design.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, noStore } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { kelompok, anggota, sesiKelompok } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { eq } from "drizzle-orm";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "GET")) return;
  if (!requireRole(req, res, "asisten")) return;

  const running = await currentSesi();

  const db = getDb();
  const groups = await db.select().from(kelompok);
  const members = await db
    .select({ kelompokId: anggota.kelompokId, nim: anggota.nim, nama: anggota.nama })
    .from(anggota);
  const overrides = running
    ? await db.select().from(sesiKelompok).where(eq(sesiKelompok.sesiId, running.id))
    : [];
  const overrideByKelompokId = new Map(overrides.map((o) => [o.kelompokId, o]));

  const roster = groups
    .sort((a, b) => a.nomor - b.nomor)
    .map((g) => ({
      id: g.id,
      nomor: g.nomor,
      nama: g.nama,
      aktif: g.aktif,
      sesiAktif: overrideByKelompokId.get(g.id)?.aktif ?? true,
      anggota: members
        .filter((m) => m.kelompokId === g.id)
        .map((m) => ({ nim: m.nim, nama: m.nama })),
    }));

  res.status(200).json({ ok: true, sesi: running, roster });
}
