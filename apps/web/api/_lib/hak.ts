/**
 * Server-side rights checks (Phase 9 Stage 2). The session cookie says only
 * "asisten"; the person's tier, badges and overrides live in `asisten`, so a
 * guarded action loads them once and asks src/lib/hak.ts.
 *
 * Usage, after requireRole(req, res, "asisten"):
 *   const orang = await cekHak(res, session.nim, "jadwal");
 *   if (!orang) return;   // 403 already sent
 */
import { eq } from "drizzle-orm";
import type { ApiResponse } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { asisten } from "../../src/lib/schema.js";
import { boleh, type HakKey, type Orang } from "../../src/lib/hak.js";

export { petaHak } from "../../src/lib/hak.js";

export interface OrangHak extends Orang {
  nim: string;
  kode: string;
  nama: string;
  status: string;
}

export async function muatOrang(nim: string): Promise<OrangHak | null> {
  const [row] = await getDb()
    .select({
      nim: asisten.nim,
      kode: asisten.kode,
      nama: asisten.nama,
      tier: asisten.tier,
      divisi: asisten.divisi,
      badges: asisten.badges,
      hakOverride: asisten.hakOverride,
      status: asisten.status,
    })
    .from(asisten)
    .where(eq(asisten.nim, nim))
    .limit(1);
  return row ?? null;
}

/** Loads the person and checks one right. Sends 403 and returns null when
 *  they don't have it. "own" counts as having it; callers that need the
 *  full right check `hakDari(orang, key) === true` themselves. */
export async function cekHak(res: ApiResponse, nim: string, key: HakKey): Promise<OrangHak | null> {
  const orang = await muatOrang(nim);
  if (!orang || !boleh(orang, key)) {
    res.status(403).json({ ok: false, kode: "tanpa_hak", hak: key });
    return null;
  }
  return orang;
}
