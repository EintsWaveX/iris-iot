/**
 * Session and roster queries — "which session is running right now" and
 * "which group does this NIM belong to in it". Kept separate from auth.ts
 * because these are read models other things will also need (a dashboard
 * showing the live session, the eventual layer X-ray) whereas auth.ts is
 * specifically about verifying a login attempt.
 *
 * Phase 1 has no scheduler yet (that is modul4/server.py's job for Module 4A
 * today, and becomes this site's job for all four modules only once
 * Phase 3/4 are planned). "Currently running" for now just means the most
 * recent session marked status = 'berjalan' — an assistant sets that
 * status explicitly. This is intentionally the simplest thing that lets
 * the Phase 1 verification checklist ("paste a roster, log in by NIM,
 * land in the right group") pass truthfully, without inventing scheduling
 * logic that the next phase would then have to un-invent.
 */
import { eq, and, desc, count } from "drizzle-orm";
import { getDb } from "./db.js";
import { sesi, regu, praktikan, anggota, kelompok, sesiKelompok } from "./schema.js";

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
 * True once `scripts/backfill-roster.ts --apply` has actually run. Checked
 * on every call rather than cached, so the fallback below self-heals the
 * moment the backfill completes without needing a redeploy — an env-var
 * gate would need exactly that redeploy, which is the extra step a forgotten
 * backfill would silently be missing.
 */
async function masterRosterIsPopulated(): Promise<boolean> {
  const db = getDb();
  const [row] = await db.select({ n: count() }).from(anggota);
  return (row?.n ?? 0) > 0;
}

/**
 * Resolve a NIM against whichever session is currently running. Returns
 * null for: no session running, NIM not in any group, or the NIM's group
 * has been deactivated -- either at the roster level (`kelompok.aktif`) or
 * just for this session (`sesi_kelompok.aktif`, e.g. Module 4's beacon
 * exclusion). All refusal cases are deliberately indistinguishable from the
 * return value alone -- the caller decides what to tell the student.
 *
 * Reads the master roster (`anggota` -> `kelompok`, LEFT JOIN
 * `sesi_kelompok` for the per-session override) rather than Phase 1's
 * per-session `praktikan`/`regu`, dropping `sesiId` from the lookup itself
 * -- which is what makes a roster pasted once visible to every module's
 * session, not just the one it was entered under.
 *
 * Falls back to the Phase 1 join whenever `anggota` is empty, i.e. migration
 * 0002 has landed but `scripts/backfill-roster.ts --apply` has not run yet.
 * A row-count check rather than an env var: a forgotten backfill then
 * degrades to the old behaviour instead of locking every student out.
 */
export async function resolvePraktikan(nim: string): Promise<ResolvedPraktikan | null> {
  const running = await currentSesi();
  if (!running) return null;

  const db = getDb();

  if (!(await masterRosterIsPopulated())) {
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

  const [row] = await db
    .select({
      nim: anggota.nim,
      nama: anggota.nama,
      reguId: kelompok.id,
      reguNomor: kelompok.nomor,
      reguNama: kelompok.nama,
      kelompokAktif: kelompok.aktif,
      sesiAktif: sesiKelompok.aktif,
    })
    .from(anggota)
    .innerJoin(kelompok, eq(anggota.kelompokId, kelompok.id))
    .leftJoin(
      sesiKelompok,
      and(eq(sesiKelompok.kelompokId, kelompok.id), eq(sesiKelompok.sesiId, running.id)),
    )
    .where(eq(anggota.nim, nim))
    .limit(1);

  if (!row) return null;

  const aktif = row.kelompokAktif && (row.sesiAktif ?? true);
  if (!aktif) return null;

  return {
    nim: row.nim,
    nama: row.nama,
    sesiId: running.id,
    reguId: row.reguId,
    reguNomor: row.reguNomor,
    reguNama: row.reguNama,
  };
}

/** Names only — never NIMs. This is the projection rule from
 *  jadwal_publik() in modul4/server.py:1023, carried forward: a route a
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
