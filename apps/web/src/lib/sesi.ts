/**
 * Session and roster queries — "which session is running right now" and
 * "which group does this NIM belong to in it". Kept separate from auth.ts
 * because these are read models other things will also need (a dashboard
 * showing the live session, the eventual layer X-ray) whereas auth.ts is
 * specifically about verifying a login attempt.
 *
 * Phase 1 has no scheduler yet (that is apps/modul4/server.py's job for Module 4A
 * today, and becomes this site's job for all four modules only once
 * Phase 3/4 are planned). "Currently running" for now just means the most
 * recent session marked status = 'berjalan' — an assistant sets that
 * status explicitly. This is intentionally the simplest thing that lets
 * the Phase 1 verification checklist ("paste a roster, log in by NIM,
 * land in the right group") pass truthfully, without inventing scheduling
 * logic that the next phase would then have to un-invent.
 */
import { eq, and, ne, desc, count } from "drizzle-orm";
import { getDb } from "./db.js";
import { sesi, regu, praktikan, anggota, kelompok, sesiKelompok } from "./schema.js";
import { SESI_CAP_DETIK, slotToMulai } from "./jadwal.js";

export interface ResolvedPraktikan {
  nim: string;
  nama: string;
  sesiId: number;
  reguId: number;
  reguNomor: number;
  reguNama: string;
}

/**
 * Whichever session is marked "berjalan", auto-ending it first if it has
 * already run past the practicum's fixed cap. This is the ONLY place that
 * check happens: there is no cron in this stack (Vercel Hobby's own cron
 * limits would not fit a "check every session's clock" job anyway), so a
 * session that has run past its cap is corrected lazily, on whatever call
 * happens to ask "what's running right now" next — the banner poll, a
 * login attempt, an assistant's console. That costs nothing extra: one of
 * those is already querying this every time it matters, so there is no
 * idle-wakeup cost the way a standalone poller would add.
 */
export async function currentSesi() {
  const db = getDb();
  const [row] = await db
    .select()
    .from(sesi)
    .where(eq(sesi.status, "berjalan"))
    .orderBy(desc(sesi.dibuatPada))
    .limit(1);
  if (!row) return null;

  const startedAt = row.mulaiPada ?? row.dibuatPada;
  const elapsedSec = (Date.now() - startedAt.getTime()) / 1000;
  if (elapsedSec < SESI_CAP_DETIK) return row;

  // Past the cap: the session's canonical end is the cap itself, not
  // whenever this lazy check happened to run, so selesaiPada/durasiDetik
  // record that rather than "now".
  await db
    .update(sesi)
    .set({
      status: "selesai",
      selesaiPada: new Date(startedAt.getTime() + SESI_CAP_DETIK * 1000),
      durasiDetik: SESI_CAP_DETIK,
    })
    .where(eq(sesi.id, row.id));

  return null;
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
 *  jadwal_publik() in apps/modul4/server.py:1023, carried forward: a route a
 *  student's browser can reach must never be able to return another
 *  student's NIM, even as a side effect of showing group membership.
 *
 *  Reads the master roster first, same as resolvePraktikan() above, and for
 *  the same reason: `regu`/`praktikan` are the retired Phase 1 tables, and
 *  after the roster migration this function returned nothing for anyone
 *  because it never followed resolvePraktikan() onto `kelompok`/`anggota`.
 *  Falls back to the Phase 1 join under the same row-count check so a
 *  not-yet-backfilled environment still gets a real answer instead of an
 *  empty roster. */
export async function publicRoster(sesiId: number) {
  const db = getDb();

  if (!(await masterRosterIsPopulated())) {
    const groups = await db.select().from(regu).where(eq(regu.sesiId, sesiId));
    const members = await db
      .select({ reguId: praktikan.reguId, nama: praktikan.nama })
      .from(praktikan)
      .where(eq(praktikan.sesiId, sesiId));

    return groups
      .sort((a, b) => a.nomor - b.nomor)
      .map((g) => ({
        nomor: g.nomor,
        nama: g.nama,
        aktif: g.aktif,
        anggota: members.filter((m) => m.reguId === g.id).map((m) => m.nama),
      }));
  }

  const groups = await db.select().from(kelompok);
  const members = await db
    .select({ kelompokId: anggota.kelompokId, nama: anggota.nama })
    .from(anggota);
  const overrides = await db.select().from(sesiKelompok).where(eq(sesiKelompok.sesiId, sesiId));
  const overrideByKelompokId = new Map(overrides.map((o) => [o.kelompokId, o]));

  return groups
    .sort((a, b) => a.nomor - b.nomor)
    .map((g) => ({
      nomor: g.nomor,
      nama: g.nama,
      aktif: g.aktif && (overrideByKelompokId.get(g.id)?.aktif ?? true),
      anggota: members.filter((m) => m.kelompokId === g.id).map((m) => m.nama),
    }));
}

export interface JadwalModul4 {
  hari: string;
  sesi: Array<{
    id: number;
    mulai: string;
    regu: Record<
      string,
      { nama: string; aktif: boolean; anggota: Array<{ nim: string; nama: string }> }
    >;
  }>;
}

/**
 * Today's Module 4 slots, in the exact shape apps/modul4/server.py's own
 * jadwal_set()/jadwal_muat() already expect (`{hari, sesi: [{id, mulai,
 * regu}]}`) -- so the Pi-side import (Stage 18) can hand each slot straight
 * to that same validated write path rather than re-deriving it. Includes
 * NIMs: unlike publicRoster() this never reaches a student's browser, only
 * an authenticated agent's heartbeat response, and the Pi's own scoreboard
 * already carries NIMs for its assistant-only "papan lengkap" view.
 *
 * Returns null when today has no Module 4 session at all, so the heartbeat
 * handler can skip the field entirely rather than send an empty schedule
 * every single cycle for every server, all day, every day a session isn't
 * even running.
 */
export async function jadwalModul4Hari(tanggal: string): Promise<JadwalModul4 | null> {
  const db = getDb();

  const slots = await db
    .select({ id: sesi.id, slot: sesi.slot, mulai: sesi.mulai })
    .from(sesi)
    .where(and(eq(sesi.tanggal, tanggal), eq(sesi.modul, 4), ne(sesi.status, "batal")));

  const withSlot = slots.filter(
    (s): s is { id: number; slot: number; mulai: string } => s.slot !== null,
  );
  if (withSlot.length === 0) return null;

  const master = await masterRosterIsPopulated();

  const sesiOut: JadwalModul4["sesi"] = [];
  for (const s of withSlot) {
    const kelompokSesi: JadwalModul4["sesi"][number]["regu"] = {};

    if (master) {
      const rows = await db
        .select({
          nomor: kelompok.nomor,
          nama: kelompok.nama,
          kelompokAktif: kelompok.aktif,
          sesiAktif: sesiKelompok.aktif,
          nim: anggota.nim,
          anggotaNama: anggota.nama,
        })
        .from(kelompok)
        .leftJoin(anggota, eq(anggota.kelompokId, kelompok.id))
        .leftJoin(
          sesiKelompok,
          and(eq(sesiKelompok.kelompokId, kelompok.id), eq(sesiKelompok.sesiId, s.id)),
        );

      for (const row of rows) {
        const key = String(row.nomor);
        if (!kelompokSesi[key]) {
          kelompokSesi[key] = {
            nama: row.nama,
            aktif: row.kelompokAktif && (row.sesiAktif ?? true),
            anggota: [],
          };
        }
        if (row.nim) kelompokSesi[key].anggota.push({ nim: row.nim, nama: row.anggotaNama ?? "" });
      }
    } else {
      const rows = await db
        .select({
          nomor: regu.nomor,
          nama: regu.nama,
          aktif: regu.aktif,
          nim: praktikan.nim,
          praktikanNama: praktikan.nama,
        })
        .from(regu)
        .leftJoin(praktikan, and(eq(praktikan.reguId, regu.id), eq(praktikan.sesiId, s.id)))
        .where(eq(regu.sesiId, s.id));

      for (const row of rows) {
        const key = String(row.nomor);
        if (!kelompokSesi[key]) {
          kelompokSesi[key] = { nama: row.nama, aktif: row.aktif, anggota: [] };
        }
        if (row.nim)
          kelompokSesi[key].anggota.push({ nim: row.nim, nama: row.praktikanNama ?? "" });
      }
    }

    sesiOut.push({ id: s.slot, mulai: slotToMulai(s.slot) ?? s.mulai, regu: kelompokSesi });
  }

  sesiOut.sort((a, b) => a.id - b.id);
  return { hari: tanggal, sesi: sesiOut };
}
