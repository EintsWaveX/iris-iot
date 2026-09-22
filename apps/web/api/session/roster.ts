/**
 * POST /api/session/roster   { paste }   — assistant-only.
 *
 * Edits the MASTER roster (kelompok/anggota) directly. Phase 3's whole
 * point is that this paste is no longer scoped to a session -- see
 * scripts/backfill-roster.ts and src/lib/sesi.ts's resolvePraktikan(),
 * which already reads from these two tables globally.
 *
 * Members fully replace: a NIM missing from the new paste is removed from
 * the roster, matching Phase 1's "re-paste deletes anyone missing" rule.
 * This is safe because nothing else references anggota.id directly.
 *
 * Groups never auto-delete. kelompok.id is referenced by sesi_kelompok
 * (per-session exclusions) and jawaban (answers) across every module's
 * session, not just today's, so a group number disappearing from one
 * paste must not cascade-delete that history. A group present in the
 * paste is upserted (created, renamed, or reactivated); a group absent
 * from the paste is left exactly as it is. Deleting a group for good is a
 * separate, deliberate action, never a side effect of fixing a typo.
 *
 * Save is refused while the paste has any parse errors, matching Phase 1's
 * "Simpan tidak bekerja selama masih ada galat" rule.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { kelompok, anggota } from "../../src/lib/schema.js";
import { parseRosterPaste } from "../../src/lib/roster-parser.js";
import { writeAudit } from "../../src/lib/auth.js";
import { notInArray } from "drizzle-orm";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const body = jsonBody(req);
  const paste = typeof body.paste === "string" ? body.paste : "";

  const parsed = parseRosterPaste(paste);
  if (parsed.errors.length > 0) {
    res.status(200).json({
      ok: false,
      kode: "galat_tempel",
      errors: parsed.errors,
      groups: parsed.groups.length,
      total: parsed.total,
    });
    return;
  }

  try {
    const db = getDb();

    await db.transaction(async (tx) => {
      const keepNims = parsed.groups.flatMap((g) => g.anggota.map((m) => m.nim));

      for (const g of parsed.groups) {
        const nama = g.nama || `Kelompok ${g.nomor}`;
        const [row] = await tx
          .insert(kelompok)
          .values({ nomor: g.nomor, nama, aktif: true })
          .onConflictDoUpdate({ target: kelompok.nomor, set: { nama, aktif: true } })
          .returning({ id: kelompok.id });

        for (const m of g.anggota) {
          await tx
            .insert(anggota)
            .values({ kelompokId: row.id, nim: m.nim, nama: m.nama })
            .onConflictDoUpdate({
              target: anggota.nim,
              set: { kelompokId: row.id, nama: m.nama },
            });
        }
      }

      // Full replace on members only -- see header comment for why groups
      // don't get the same treatment.
      if (keepNims.length > 0) {
        await tx.delete(anggota).where(notInArray(anggota.nim, keepNims));
      } else {
        await tx.delete(anggota);
      }
    });

    await writeAudit(session.nim, "roster_set", {
      kelompok: parsed.groups.length,
      anggota: parsed.total,
    });

    res.status(200).json({ ok: true, groups: parsed.groups.length, total: parsed.total });
  } catch (err) {
    console.error("[api/session/roster] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}
