/**
 * The columns of a `perintah` list as the Server view needs them. `keluaran`
 * is the command's diagnostic log and can be large; whoever does not have the
 * full Server view never sees it (saringKeluaran blanks it), so the database
 * should not send it either. Same keys as `select()`, so the answer's shape
 * does not change: for them `keluaran` is null, except on the commands whose
 * output everyone reads (AKSI_KELUARAN_UMUM).
 */
import { getTableColumns, sql, type SQL } from "drizzle-orm";
import { perintah } from "../../src/lib/schema.js";
import { AKSI_KELUARAN_UMUM } from "../../src/lib/server-shared.js";

export function kolomPerintah(full: boolean) {
  const kolom = getTableColumns(perintah);
  if (full) return kolom;
  const umum = sql.join(
    AKSI_KELUARAN_UMUM.map((a) => sql`${a}`),
    sql`, `,
  );
  const keluaran: SQL<string | null> =
    sql`case when ${perintah.aksi} in (${umum}) then ${perintah.keluaran} else null end`;
  return { ...kolom, keluaran };
}
