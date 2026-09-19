/**
 * Session and roster queries — "which session is running right now" and
 * "which group does this NIM belong to in it". Kept separate from auth.ts
 * because these are read models other things will also need (a dashboard
 * showing the live session, the eventual layer X-ray) whereas auth.ts is
 * specifically about verifying a login attempt.
 *
 * Phase 1 has no scheduler yet (that is hunt/server.py's job for Module 4A
 * today, and becomes this site's job for all four modules only once
 * Phase 3/4 are planned). "Currently running" for now just means the most
 * recent session marked status = 'berjalan' — an assistant sets that
 * status explicitly. This is intentionally the simplest thing that lets
 * the Phase 1 verification checklist ("paste a roster, log in by NIM,
 * land in the right group") pass truthfully, without inventing scheduling
 * logic that the next phase would then have to un-invent.
 */
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import { sesi, regu, praktikan } from "./schema";

export interface ResolvedPraktikan {
  nim: string;
  nama: string;
  sesiId: number;
  reguId: number;
  reguNomor: number;
  reguNama: string;
}

export async function currentSesi() {
  const db = getDb();
  const [row] = await db
    .select()
    .from(sesi)
    .where(eq(sesi.status, "berjalan"))
    .orderBy(desc(sesi.dibuatPada))
    .limit(1);
  return row ?? null;
}

/**
 * Resolve a NIM against whichever session is currently running. Returns
 * null for: no session running, NIM not in any group of that session, or
 * the NIM's group has been marked inactive (the "this board is the beacon,
 * not a hunter" case carried over from hunt/'s regu.aktif flag). All three
 * cases are deliberately indistinguishable from the return value alone —
 * the caller decides what to tell the student, and the login route is the
 * only caller that needs to.
 */
export async function resolvePraktikan(nim: string): Promise<ResolvedPraktikan | null> {
  const running = await currentSesi();
  if (!running) return null;

  const db = getDb();
  const [row] = await db
    .select({
      nim: praktikan.nim,
      nama: praktikan.nama,
      sesiId: praktikan.sesiId,
      reguId: regu.id,
      reguNomor: regu.nomor,
      reguNama: regu.nama,
      reguAktif: regu.aktif,
    })
    .from(praktikan)
    .innerJoin(regu, eq(praktikan.reguId, regu.id))
    .where(and(eq(praktikan.sesiId, running.id), eq(praktikan.nim, nim)))
    .limit(1);

  if (!row || !row.reguAktif) return null;

  const { reguAktif: _reguAktif, ...rest } = row;
  return rest;
}

/** Names only — never NIMs. This is the projection rule from
 *  jadwal_publik() in hunt/server.py:1023, carried forward: a route a
 *  student's browser can reach must never be able to return another
 *  student's NIM, even as a side effect of showing group membership. */
export async function publicRoster(sesiId: number) {
  const db = getDb();
  const groups = await db.select().from(regu).where(eq(regu.sesiId, sesiId));

  const members = await db
    .select({ reguId: praktikan.reguId, nama: praktikan.nama })
    .from(praktikan)
    .where(eq(praktikan.sesiId, sesiId));

  return groups.map((g) => ({
    nomor: g.nomor,
    nama: g.nama,
    aktif: g.aktif,
    anggota: members.filter((m) => m.reguId === g.id).map((m) => m.nama),
  }));
}
