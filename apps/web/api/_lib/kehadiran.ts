/**
 * Stamps an Asisten as active (lib/kehadiran.ts): one conditional UPDATE,
 * so at most one write every 45 s per person however often they poll. When
 * they were offline before, every open Team page hears it ("online").
 */
import { sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { ONLINE_MS } from "../../src/lib/kehadiran.js";
import { siarkan } from "./siaran.js";

export async function tandaiAktif(nim: string): Promise<void> {
  try {
    const hasil = await getDb().execute(sql`
      UPDATE asisten a SET terakhir_aktif = now()
      FROM (SELECT terakhir_aktif AS lama FROM asisten WHERE nim = ${nim}) s
      WHERE a.nim = ${nim}
        AND (a.terakhir_aktif IS NULL OR a.terakhir_aktif < now() - interval '45 seconds')
      RETURNING s.lama
    `);
    const list = hasil.rows as { lama: string | Date | null }[];
    if (!list.length) return;
    const lama = list[0].lama ? new Date(list[0].lama).getTime() : 0;
    if (Date.now() - lama >= ONLINE_MS) await siarkan(["online"]);
  } catch {
    /* presence is best effort; the poll itself must not fail over it */
  }
}

/** Whether any Asisten is online now (the PC's night beat stays at a
 *  minute for them, so Konsol and the Server tab still answer). */
export async function adaAsistenOnline(): Promise<boolean> {
  try {
    const hasil = await getDb().execute(sql`
      SELECT 1 FROM asisten
      WHERE terakhir_aktif > now() - make_interval(secs => ${ONLINE_MS / 1000})
      LIMIT 1
    `);
    return hasil.rows.length > 0;
  } catch {
    return true;
  }
}
