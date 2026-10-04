/**
 * Lihat Sebagai Praktikan (Phase 9, mockup c-run and p-module ap/av): an
 * Asisten opens the running module's page as one group. Reading is open to
 * every Asisten; writing (blank answers, board rows, captures, the laptop
 * mirror) only to the Asisten who holds that group this session. Writes
 * carry the Asisten's own NIM, so the group sees them as "diisi asisten".
 *
 * The payload returned looks like a Praktikan's resolved session for that
 * group (kelompokId, kelompokNomor, sesiId), with role and NIM still the
 * Asisten's, so the existing handlers can take it as `who` unchanged.
 */
import { and, eq } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { currentSession } from "./session.js";
import { pemilikKelompok } from "./phase8.js";
import { getDb } from "../../src/lib/db.js";
import { kelompok } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import type { SessionPayload } from "../../src/lib/auth.js";

/** The group number an Asisten request acts for, if it names one. */
export function nomorWakil(req: ApiRequest, body?: Record<string, unknown>): number | null {
  const s = currentSession(req);
  if (!s || s.role !== "asisten") return null;
  const raw = body?.kelompok ?? req.query.kelompok;
  const v = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(v) && v >= 1 && v <= 10 ? v : null;
}

export async function wakilKelompok(
  req: ApiRequest,
  res: ApiResponse,
  nomor: number,
  tulis: boolean,
): Promise<SessionPayload | null> {
  const session = currentSession(req);
  if (!session || session.role !== "asisten") {
    res.status(403).json({ ok: false, kode: "peran_salah" });
    return null;
  }
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: false, kode: "tidak_ada_sesi" });
    return null;
  }
  if (nomor > (running.jumlahKelompok ?? 10)) {
    res.status(200).json({ ok: false, kode: "kelompok_tidak_diketahui" });
    return null;
  }
  const db = getDb();
  const [g] = await db
    .select({ id: kelompok.id })
    .from(kelompok)
    .where(and(eq(kelompok.nomor, nomor), eq(kelompok.aktif, true)))
    .limit(1);
  if (!g) {
    res.status(200).json({ ok: false, kode: "kelompok_tidak_diketahui" });
    return null;
  }
  if (tulis) {
    const pemilik = await pemilikKelompok(db, running.id);
    if (pemilik.get(g.id) !== session.nim) {
      res.status(403).json({ ok: false, kode: "bukan_kelompokmu" });
      return null;
    }
  }
  return { ...session, kelompokId: g.id, kelompokNomor: nomor, sesiId: running.id };
}
