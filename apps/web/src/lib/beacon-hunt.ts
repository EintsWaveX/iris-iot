/**
 * The Module 4 board layout, the database side (2026-11-13): one row in `pengaturan`, key
 * `modul4_beacon`, value { jumlah, pola } (src/lib/beacon-bersama.ts). Read by the build and the
 * download of a Beacon's file; written by the Server page and the Mulai Perburuan dialog
 * (api/_lib/beacon-api.ts).
 */
import { eq, sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { pengaturan } from "./schema.js";
import { bacaBeacon, type PengaturanBeacon } from "./beacon-bersama.js";

export const KUNCI_BEACON = "modul4_beacon";

export async function bacaBeaconHunt(): Promise<PengaturanBeacon> {
  const [row] = await getDb()
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_BEACON))
    .limit(1);
  return bacaBeacon(row?.nilai);
}

export async function tulisBeaconHunt(nilai: PengaturanBeacon, nim: string): Promise<void> {
  await getDb()
    .insert(pengaturan)
    .values({ kunci: KUNCI_BEACON, nilai, diubahOleh: nim, diubahPada: sql`now()` })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai, diubahOleh: nim, diubahPada: sql`now()` },
    });
}
