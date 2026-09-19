/**
 * POST /api/sesi/roster   { sesiId, paste }   — assistant-only.
 *
 * Parses the pasted text with the exact grammar hunt/'s assistant console
 * already uses (src/lib/roster-parser.ts), then REPLACES that session's
 * groups and members wholesale inside one transaction — the same
 * "re-pasting deletes anyone missing from the new text" contract
 * hunt/src/ui-assistant.js documents, so an assistant fixing one typo by
 * re-pasting the whole box behaves exactly as they'd expect.
 *
 * Save is refused while the paste has any parse errors, matching hunt/'s
 * "Simpan tidak bekerja selama masih ada galat" rule -- a partially valid
 * roster is not saved partially, it is not saved at all.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore, pgErrorCode } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { sesi, regu, praktikan } from "../../src/lib/schema.js";
import { parseRosterPaste } from "../../src/lib/roster-parser.js";
import { writeAudit } from "../../src/lib/auth.js";
import { eq } from "drizzle-orm";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const body = jsonBody(req);
  const sesiId = Number(body.sesiId);
  const paste = typeof body.paste === "string" ? body.paste : "";

  if (!Number.isInteger(sesiId) || sesiId <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

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

    const [target] = await db.select().from(sesi).where(eq(sesi.id, sesiId)).limit(1);
    if (!target) {
      res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
      return;
    }

    await db.transaction(async (tx) => {
      // Cascading foreign keys on regu -> praktikan mean deleting the
      // groups also deletes their members; see schema.ts.
      await tx.delete(regu).where(eq(regu.sesiId, sesiId));

      for (const g of parsed.groups) {
        const [row] = await tx
          .insert(regu)
          .values({ sesiId, nomor: g.nomor, nama: g.nama || `Kelompok ${g.nomor}` })
          .returning();

        if (g.anggota.length > 0) {
          await tx.insert(praktikan).values(
            g.anggota.map((m) => ({
              sesiId,
              reguId: row.id,
              tanggal: target.tanggal,
              nim: m.nim,
              nama: m.nama,
            })),
          );
        }
      }
    });

    await writeAudit(session.nim, "jadwal_set", {
      sesiId,
      kelompok: parsed.groups.length,
      anggota: parsed.total,
    });

    res.status(200).json({ ok: true, groups: parsed.groups.length, total: parsed.total });
  } catch (err) {
    // Postgres unique_violation on (tanggal, nim): this NIM is already
    // registered in a DIFFERENT session today. The paste's own in-block
    // duplicate check (roster-parser.ts) cannot catch this -- it only
    // sees the text in front of it -- so this is the backstop the schema
    // comment on `praktikan` promises.
    if (pgErrorCode(err) === "23505") {
      res.status(200).json({ ok: false, kode: "nim_dipakai_sesi_lain" });
      return;
    }
    console.error("[api/sesi/roster] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}
