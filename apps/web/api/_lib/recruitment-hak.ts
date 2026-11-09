/**
 * Hak Akses (user, 2026-11-09): who holds which recruitment right is no
 * longer fixed. The Ketua and the Pencipta, and nobody else, can switch every
 * right on for every active Asisten, or set for each right which roles hold
 * it (the seven committee divisions, and an Asisten with no seat). The
 * default is the PRD table (src/lib/recruitment/rights.ts). Kept in
 * `pengaturan` under `rec_hak` (no migration); no row means the default.
 * Practice never changes it, because it is one value for the live site.
 *
 * GET  /api/recruitment/rights-config        any Panitia: the config and whether they may change it
 * POST /api/recruitment/rights-save          { semua, peran }  Ketua or Pencipta
 * POST /api/recruitment/rights-reset         back to the default  Ketua or Pencipta
 */
import { eq, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import type { getDb } from "../../src/lib/db.js";
import {
  bolehAturHak,
  cekHakConfig,
  HAK_BAWAAN,
  type HakConfig,
} from "../../src/lib/recruitment/rights.js";
import { pengaturan } from "../../src/lib/schema.js";
import { KUNCI_HAK, anggotaPanitia, muatPelaku, type PelakuServer } from "./recruitment-rights.js";

type Db = ReturnType<typeof getDb>;

const tolak = (res: ApiResponse, kode: string, status: number, extra = {}) =>
  void res.status(status).json({ ok: false, kode, ...extra });

export const bolehAtur = (p: PelakuServer | null) => !!p && bolehAturHak(p.orang, p.kursi);

export async function handleHakBaca(
  _req: ApiRequest,
  res: ApiResponse,
  s: SessionPayload,
  db: Db,
  edisiId: number,
) {
  const p = await muatPelaku(db, edisiId, s.nim);
  if (!anggotaPanitia(p)) return tolak(res, "tanpa_hak", 403);
  const [r] = await db
    .select({ nilai: pengaturan.nilai, oleh: pengaturan.diubahOleh, pada: pengaturan.diubahPada })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_HAK))
    .limit(1);
  // The saved row only counts when it reads as a config; the pages show what the server really applies.
  const custom = !!r && !!r.nilai && typeof r.nilai === "object";
  res.status(200).json({
    ok: true,
    config: p!.config,
    defaults: HAK_BAWAAN,
    custom,
    by: custom ? (r!.oleh ?? null) : null,
    at: custom && r!.pada ? new Date(r!.pada).toISOString() : null,
    canManage: bolehAtur(p),
  });
}

export async function handleHakSimpan(
  req: ApiRequest,
  res: ApiResponse,
  s: SessionPayload,
  db: Db,
  edisiId: number,
  reset: boolean,
) {
  const p = await muatPelaku(db, edisiId, s.nim);
  if (!bolehAtur(p)) return tolak(res, "tanpa_hak", 403, { hak: "rights_config" });
  const before: HakConfig = p!.config;
  if (reset) {
    await db.delete(pengaturan).where(eq(pengaturan.kunci, KUNCI_HAK));
    await writeAudit(s.nim, "rec_hak", { reset: true, before });
    return void res.status(200).json({ ok: true, config: HAK_BAWAAN, custom: false });
  }
  const b = jsonBody(req);
  const config = cekHakConfig({ semua: b.semua, peran: b.peran });
  if (!config) return tolak(res, "data_salah", 400, { field: "peran" });
  await db
    .insert(pengaturan)
    .values({ kunci: KUNCI_HAK, nilai: config, diubahOleh: s.nim, diubahPada: sql`now()` })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai: config, diubahOleh: s.nim, diubahPada: sql`now()` },
    });
  await writeAudit(s.nim, "rec_hak", { before, after: config });
  res.status(200).json({ ok: true, config, custom: true });
}
