/**
 * The quiz room's database side: which session is running, who a cookie is,
 * and the room's snapshot. The snapshot is one row per session in
 * `pengaturan` (key `kuis_<sesiId>`), so the game needs no migration.
 */
import { eq } from "drizzle-orm";
import { readSessionCookie } from "../src/lib/auth.js";
import { getDb } from "../src/lib/db.js";
import type { Simpanan } from "../src/lib/kuis/engine.js";
import { pengaturan } from "../src/lib/schema.js";
import { currentSesi } from "../src/lib/sesi.js";
import type { KonteksKuis } from "./kuis.js";

export function kunciKuis(sesiId: number): string {
  return `kuis_${sesiId}`;
}

export function konteksKuisDb(): KonteksKuis {
  return {
    async sesiAktif() {
      const s = await currentSesi();
      return s ? { id: s.id, modul: s.modul, kelas: s.kelas } : null;
    },
    bacaCookie: (nilai) => readSessionCookie(nilai),
    async muat(sesiId) {
      const [r] = await getDb()
        .select({ nilai: pengaturan.nilai })
        .from(pengaturan)
        .where(eq(pengaturan.kunci, kunciKuis(sesiId)))
        .limit(1);
      return (r?.nilai as Simpanan | undefined) ?? null;
    },
    async simpan(sesiId, nilai) {
      await getDb()
        .insert(pengaturan)
        .values({ kunci: kunciKuis(sesiId), nilai })
        .onConflictDoUpdate({
          target: pengaturan.kunci,
          set: { nilai, diubahPada: new Date() },
        });
    },
  };
}
