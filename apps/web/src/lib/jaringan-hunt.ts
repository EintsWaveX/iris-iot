/**
 * The Module 4 network choice, the database side (2026-11-11): one row in
 * `pengaturan`, key `modul4_jaringan`, value { jaringan }. Read by the pages'
 * APIs and the PC heartbeat reply; written by the Server page, the Konsol's
 * start check and the Mulai Perburuan dialog (api/_lib/jaringan-api.ts).
 */
import { eq, sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { pengaturan } from "./schema.js";
import { bacaJaringan, type Jaringan } from "./jaringan.js";

export const KUNCI_JARINGAN = "modul4_jaringan";

export async function bacaJaringanHunt(): Promise<Jaringan> {
  const [row] = await getDb()
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_JARINGAN))
    .limit(1);
  return bacaJaringan(row?.nilai);
}

export async function tulisJaringanHunt(jaringan: Jaringan, nim: string): Promise<void> {
  await getDb()
    .insert(pengaturan)
    .values({
      kunci: KUNCI_JARINGAN,
      nilai: { jaringan },
      diubahOleh: nim,
      diubahPada: sql`now()`,
    })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai: { jaringan }, diubahOleh: nim, diubahPada: sql`now()` },
    });
}
