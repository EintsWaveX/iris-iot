/**
 * Module access (P6.5): which of the four modules students can currently
 * open. One row in `pengaturan` (migration 0006), keyed `modul_terbuka`,
 * holding a sorted JSON array of module numbers -- kept here rather than
 * a dedicated table because nothing else about it needs its own schema.
 *
 * Cumulative by design: opening module N is meant to also open every
 * module below it (a practicum in week 3 should never re-lock weeks 1-2
 * for a student catching up), so `bukaHingga` unions rather than
 * replaces. An assistant closing a module by hand through
 * `setModulTerbuka` is a direct overwrite instead, since that is a
 * deliberate correction, not a forward step.
 */
import { getDb } from "./db.js";
import { pengaturan } from "./schema.js";
import { eq, sql } from "drizzle-orm";

const KUNCI = "modul_terbuka";
const DEFAULT_TERBUKA: number[] = [1];

function normalize(list: unknown): number[] {
  if (!Array.isArray(list)) return DEFAULT_TERBUKA;
  const nums = list.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 4);
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

export async function getModulTerbuka(): Promise<number[]> {
  const db = getDb();
  const [row] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI))
    .limit(1);
  if (!row) return DEFAULT_TERBUKA;
  return normalize(row.nilai);
}

/** Same as getModulTerbuka(), plus who last changed it and when -- for
 *  P6.6's Modul tab, which shows that alongside the four toggles. Kept
 *  separate from getModulTerbuka() itself: every other caller (the public
 *  akses endpoint, the lock-screen checks) only ever needed the array, and
 *  diubahOleh/diubahPada are assistant-only detail with no reason to ride
 *  along on the cacheable public response. There is only ever one row for
 *  this key, so this is "when was the array as a whole last changed", not
 *  a per-module timestamp -- the schema has nowhere to hang the latter. */
export async function getModulTerbukaMeta(): Promise<{
  terbuka: number[];
  diubahOleh: string | null;
  diubahPada: Date | null;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      nilai: pengaturan.nilai,
      diubahOleh: pengaturan.diubahOleh,
      diubahPada: pengaturan.diubahPada,
    })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI))
    .limit(1);
  if (!row) return { terbuka: DEFAULT_TERBUKA, diubahOleh: null, diubahPada: null };
  return { terbuka: normalize(row.nilai), diubahOleh: row.diubahOleh, diubahPada: row.diubahPada };
}

async function writeModulTerbuka(list: number[], aktorNim: string | null): Promise<number[]> {
  const nilai = normalize(list);
  const db = getDb();
  await db
    .insert(pengaturan)
    .values({ kunci: KUNCI, nilai, diubahOleh: aktorNim, diubahPada: sql`now()` })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai, diubahOleh: aktorNim, diubahPada: sql`now()` },
    });
  return nilai;
}

/** An assistant's explicit choice from the (future) settings UI -- a direct
 *  overwrite, so closing a module the cumulative auto-open opened earlier
 *  is possible. */
export async function setModulTerbuka(list: number[], aktorNim: string): Promise<number[]> {
  return writeModulTerbuka(list, aktorNim);
}

/** Starting a session for `modul` opens it and everything below it, without
 *  ever closing a module that was already open (a union, not a replace).
 *  `aktorNim` is null here on purpose: this is an automatic side effect of
 *  starting a session, not itself an assistant decision worth naming in
 *  the settings' own "changed by" column -- the session-start audit entry
 *  already records who started it. */
export async function bukaHingga(modul: number): Promise<void> {
  const current = await getModulTerbuka();
  const target = new Set(current);
  for (let m = 1; m <= modul; m++) target.add(m);
  const next = Array.from(target).sort((a, b) => a - b);
  if (next.length === current.length && next.every((v, i) => v === current[i])) return;
  await writeModulTerbuka(next, null);
}
