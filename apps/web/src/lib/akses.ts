/**
 * Module access (P6.5): which of the four modules students can currently
 * open. One row in `pengaturan` (migration 0006), keyed `modul_terbuka`,
 * holding a sorted JSON array of module numbers -- kept here rather than
 * a dedicated table because nothing else about it needs its own schema.
 *
 * Phase 9: only an Asisten opens or closes modules (Preparation, Module
 * Access, through `setModulTerbuka`); starting a session no longer opens
 * its module, and a closed module can't be started.
 */
import { getDb } from "./db.js";
import { pengaturan, percobaanMasuk, sesi } from "./schema.js";
import { and, eq, inArray, sql } from "drizzle-orm";
import { isNimTot } from "./tot.js";

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

/* ------------------------------------------------ the journal (Phase 8) */

/** Modules a student has done a practicum of: any running or finished
 *  session of that module they signed in to. The successful sign-in row
 *  (with its sesi_id, see percobaanMasuk) is the attendance record. */
export async function modulDiikuti(nim: string): Promise<number[]> {
  const rows = await getDb()
    .selectDistinct({ modul: sesi.modul })
    .from(percobaanMasuk)
    .innerJoin(sesi, eq(sesi.id, percobaanMasuk.sesiId))
    .where(
      and(
        eq(percobaanMasuk.nim, nim),
        eq(percobaanMasuk.jenis, "praktikan"),
        eq(percobaanMasuk.berhasil, true),
        inArray(sesi.status, ["berjalan", "selesai"]),
      ),
    );
  return rows.map((r) => r.modul).sort((a, b) => a - b);
}

/** Which modules' full journal (setup, code, live) this person may open.
 *  Assistants: all four. A student: a module that is open AND whose
 *  practicum they have done; being open alone is not enough. Everyone
 *  else reads only the public handbook. */
export async function jurnalBolehDibuka(who: {
  role: "asisten" | "praktikan";
  nim: string;
}): Promise<number[]> {
  if (who.role === "asisten") return [1, 2, 3, 4];
  // Mode TOT: a dummy's journals are the TOT sessions they did, open or not.
  if (isNimTot(who.nim)) return modulDiikuti(who.nim);
  const [terbuka, diikuti] = await Promise.all([getModulTerbuka(), modulDiikuti(who.nim)]);
  return terbuka.filter((m) => diikuti.includes(m));
}
