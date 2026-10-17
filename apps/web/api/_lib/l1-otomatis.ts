/**
 * L1 (Jurnal Praktikum) from the system (rubric, user ruling 2026-10-17):
 * the group's correct blanks over all the module's blanks times 90. One
 * source for every reader of a session's scores: the score table, Kirim
 * Nilai (which stores it) and the SeeLabs export.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { jawaban, kelompok } from "../../src/lib/schema.js";
import { l1Otomatis } from "../../src/lib/nilai-rubrik.js";
import { jumlahCelahModul, kodeModul } from "./kode-aktif.js";

type Db = ReturnType<typeof getDb>;

/** The automatic L1 of every group of a session, by group number. A group
 *  with no right blank is missing from the map; read it as 0. */
export async function l1PerKelompok(
  db: Db,
  sesiId: number,
  modul: number,
): Promise<Map<number, number>> {
  const total = jumlahCelahModul(await kodeModul(modul));
  const rows = await db
    .select({
      nomor: kelompok.nomor,
      benar: sql<number>`count(*) filter (where ${jawaban.benar})::int`,
    })
    .from(jawaban)
    .innerJoin(kelompok, eq(kelompok.id, jawaban.kelompokId))
    .where(and(eq(jawaban.sesiId, sesiId), ne(jawaban.isi, "")))
    .groupBy(kelompok.nomor);
  return new Map(rows.map((r) => [r.nomor, l1Otomatis(r.benar, total)]));
}
