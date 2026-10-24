/**
 * Sembunyikan Oprec (user, 2026-10-24): one switch that takes recruitment off
 * the web for everyone but the Asisten, whatever the calendar says. While it
 * is on, a visitor, a Praktikan and a candidate get exactly what they get when
 * no edition runs (no banner, no calendar, no applying), even after the daftar
 * gate opens; the Panitia keep the panel to prepare. The Ketua and the full
 * rights flip it from Ringkasan. Kept in `pengaturan` (no migration); no row
 * means shown.
 *
 * GET  /api/recruitment/edition       carries `hidden` for an Asisten
 * POST /api/recruitment/visibility    { hidden: boolean }   Ketua or hakPenuh
 */
import { eq, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import type { getDb } from "../../src/lib/db.js";
import { pengaturan } from "../../src/lib/schema.js";
import { muatPelaku } from "./recruitment-rights.js";

type Db = ReturnType<typeof getDb>;
export const KUNCI_SEMBUNYI = "rec_sembunyi";

const tolak = (res: ApiResponse, kode: string, status: number, extra = {}) =>
  void res.status(status).json({ ok: false, kode, ...extra });

export async function oprecTersembunyi(db: Db): Promise<boolean> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_SEMBUNYI))
    .limit(1);
  return r?.nilai === true;
}

/** What anyone but an Asisten is told while it is hidden: the same as with no edition. */
export function jawabTersembunyi(aksi: unknown, res: ApiResponse) {
  const now = new Date().toISOString();
  if (aksi === "banner")
    return void res.status(200).json({ ok: true, kind: "none", segera: false });
  if (aksi === "edition")
    return void res
      .status(200)
      .json({ ok: true, edition: null, viewer: "visitor", rights: null, seat: null });
  if (aksi === "me")
    return void res.status(200).json({
      ok: true,
      edition: null,
      candidate: null,
      documents: [],
      envelopes: [],
      pending: [],
      daftarOpen: false,
      now,
    });
  if (aksi === "account") return void res.status(200).json({ ok: true, account: null });
  tolak(res, "tidak_ada_edisi", 404);
}

export const bolehSembunyikan = (
  p: { penuh: boolean; kursi: { division: string } | null } | null,
) => !!p && (p.penuh || p.kursi?.division === "ketua");

export async function handleTampil(
  req: ApiRequest,
  res: ApiResponse,
  s: SessionPayload,
  db: Db,
  edisiId: number,
) {
  const p = await muatPelaku(db, edisiId, s.nim);
  if (!bolehSembunyikan(p)) return tolak(res, "tanpa_hak", 403, { hak: "visibility" });
  const hidden = jsonBody(req).hidden;
  if (typeof hidden !== "boolean") return tolak(res, "data_salah", 400, { field: "hidden" });
  await db
    .insert(pengaturan)
    .values({ kunci: KUNCI_SEMBUNYI, nilai: hidden, diubahOleh: s.nim, diubahPada: sql`now()` })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai: hidden, diubahOleh: s.nim, diubahPada: sql`now()` },
    });
  await writeAudit(s.nim, "rec_tampil", { hidden });
  res.status(200).json({ ok: true, hidden });
}
