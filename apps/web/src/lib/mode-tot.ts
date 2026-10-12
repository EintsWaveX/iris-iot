/**
 * Mode TOT, the database read (2026-10-05). One row in `pengaturan`, key
 * `tot`; see src/lib/tot.ts for its shape and the dummy accounts.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db.js";
import { pengaturan } from "./schema.js";
import { bacaNilaiTot, dikeluarkanTot, praktikanBolehMasuk, type ModeTot } from "./tot.js";
import { SESSION_TTL_SEC } from "./sesi-umur.js";

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

/**
 * Why a Praktikan cookie can't be used now, or null when it can: the wrong
 * side of the switch ("mode_tot"), or a dummy signed out by hand on the TOT
 * page after the cookie was made ("dikeluarkan"; the cookie's age follows
 * from `exp` and its lifetime).
 */
export async function alasanTolakTot(
  nim: string,
  exp: number,
): Promise<"mode_tot" | "dikeluarkan" | null> {
  const mode = await bacaModeTot();
  if (!praktikanBolehMasuk(nim, mode.aktif)) return "mode_tot";
  return dikeluarkanTot(mode, nim, (exp - SESSION_TTL_SEC) * 1000) ? "dikeluarkan" : null;
}

/** May this Praktikan cookie be used now? */
export async function praktikanSahTot(nim: string, exp: number): Promise<boolean> {
  return (await alasanTolakTot(nim, exp)) === null;
}
