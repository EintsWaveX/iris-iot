/**
 * Mode TOT, the database read (2026-10-05). One row in `pengaturan`, key
 * `tot`; see src/lib/tot.ts for its shape and the dummy accounts.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db.js";
import { pengaturan } from "./schema.js";
import { bacaNilaiTot, type ModeTot } from "./tot.js";

export const KUNCI_TOT = "tot";

export async function bacaModeTot(): Promise<ModeTot> {
  const [row] = await getDb()
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_TOT))
    .limit(1);
  return bacaNilaiTot(row?.nilai);
}

export async function totAktif(): Promise<boolean> {
  return (await bacaModeTot()).aktif;
}
