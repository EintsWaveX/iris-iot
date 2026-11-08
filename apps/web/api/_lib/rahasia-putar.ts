/**
 * Re-keys what `rahasia.ts` wrapped under the session secret (g1) to
 * DATA_KUNCI (g2), once, while the old session secret is still set.
 *
 * Why: every SeeLabs seal in `seelabs_akses` (one per connected Asisten) was
 * wrapped with a key derived from SESSION_SECRET. Moving the site to the PC
 * means a new session secret (Vercel's is write-only, so the old value cannot
 * be copied), and without this each Asisten would have to connect SeeLabs
 * again. Run on the old host with DATA_KUNCI newly set, it opens each seal
 * with the old key and writes it back under the new one; after that the new
 * host needs only DATA_KUNCI.
 *
 * Safe by construction: it does nothing without a valid DATA_KUNCI; it opens
 * the new wrap again and compares before writing; the write only lands if the
 * row still holds the very value it read; a seal it cannot open is counted
 * and left as it is. Running it twice finds nothing the second time.
 */
import { and, eq, like } from "drizzle-orm";
import type { getDb } from "../../src/lib/db.js";
import { seelabsAkses } from "../../src/lib/schema.js";
import { buka, bungkus, dataKunciSiap, masihLama } from "./rahasia.js";

type Db = ReturnType<typeof getDb>;

/** The label `seelabs-robot.ts` wraps the seal with. */
export const LABEL_SEGEL = "seelabs-segel";

/**
 * The g2 wrap of a g1 value, or null when it is not g1, cannot be opened (a
 * different secret, or altered), or the new wrap does not open back to the same text.
 */
export function putarSatu(segel: string, nim: string, label: string): string | null {
  if (!dataKunciSiap() || !masihLama(segel)) return null;
  const teks = buka(segel, nim, label);
  if (teks === null) return null;
  const baru = bungkus(teks, nim, label);
  return buka(baru, nim, label) === teks ? baru : null;
}

export interface HasilPutar {
  /** Seals now under DATA_KUNCI. */
  putar: number;
  /** Seals that could not be opened with the old key; left untouched. */
  gagal: number;
}

/** Re-keys every g1 seal in `seelabs_akses`. A no-op without DATA_KUNCI. */
export async function putarSegel(db: Db): Promise<HasilPutar> {
  const hasil: HasilPutar = { putar: 0, gagal: 0 };
  if (!dataKunciSiap()) return hasil;
  const rows = await db
    .select({ nim: seelabsAkses.nim, segel: seelabsAkses.segel })
    .from(seelabsAkses)
    .where(like(seelabsAkses.segel, "g1.%"));
  for (const r of rows) {
    const baru = putarSatu(r.segel, r.nim, LABEL_SEGEL);
    if (baru === null) {
      hasil.gagal++;
      continue;
    }
    // Only if the row still holds what was read: a seal replaced meanwhile wins.
    const ubah = await db
      .update(seelabsAkses)
      .set({ segel: baru })
      .where(and(eq(seelabsAkses.nim, r.nim), eq(seelabsAkses.segel, r.segel)))
      .returning({ nim: seelabsAkses.nim });
    if (ubah.length > 0) hasil.putar++;
  }
  return hasil;
}
