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
import { eq, and, ne, desc } from "drizzle-orm";
import { getDb } from "./db.js";
import {
  sesi,
  anggota,
  kelompok,
  sesiKelompok,
  praktikan,
  rosterSlot,
  rosterKelompok,
} from "./schema.js";
import { durasiSesi, hariIniWib, idHuntSusulan, slotToMulai } from "./jadwal.js";
import { semesterDariTanggal } from "./jadwal-parser.js";
import { namaKelompok } from "./kelompok-nama.js";

export interface ResolvedPraktikan {
  nim: string;
  nama: string;
  sesiId: number;
  kelompokId: number;
  kelompokNomor: number;
  kelompokNama: string;
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
  // Phase 9: the session's own length, not one fixed cap.
  const batasDetik = durasiSesi(row) * 60;
  if (elapsedSec < batasDetik) return row;

  // Past the cap: the session's canonical end is the cap itself, not
  // whenever this lazy check happened to run, so selesaiPada/durasiDetik
  // record that rather than "now".
  await db
    .update(sesi)
    .set({
      status: "selesai",
      selesaiPada: new Date(startedAt.getTime() + batasDetik * 1000),
      durasiDetik: batasDetik,
    })
    .where(eq(sesi.id, row.id));

  return null;
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
 * `sesi_kelompok` for the per-session override), dropping `sesiId` from the
 * lookup itself -- which is what makes a roster pasted once visible to
 * every module's session, not just the one it was entered under.
 *
 * Stage 21 removed the fallback this used to have onto Phase 1's per-session
 * `praktikan`/`regu` (retired as `arsipPraktikan`/`arsipRegu`): that path
 * only ever mattered before migration 0002's roster landed, and both tables
 * were confirmed empty in production before that migration (MIGRATIONS.md,
 * 2026-09-22) with nothing having written to either since.
 */
export async function resolvePraktikan(nim: string): Promise<ResolvedPraktikan | null> {
  const running = await currentSesi();
  if (!running) return null;

  const db = getDb();

  const [row] = await db
    .select({
      nim: anggota.nim,
      nama: anggota.nama,
      kelompokId: kelompok.id,
      kelompokNomor: kelompok.nomor,
      kelompokNama: kelompok.nama,
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
    kelompokId: row.kelompokId,
    kelompokNomor: row.kelompokNomor,
    kelompokNama: row.kelompokNama,
  };
}

/** The roster lookup without a session (Phase 8's off-session sign-in):
 *  the student's own group, if that group is active on the roster.
 *
 *  The live roster only holds the slot that started last (salinRosterKeSesi
 *  swaps it in), so everyone else is found on this semester's slot roster
 *  (2026-10-07: until then only that one slot could sign in between
 *  sessions, or look around while another slot's session ran). */
export async function resolvePraktikanTanpaSesi(
  nim: string,
): Promise<Omit<ResolvedPraktikan, "sesiId"> | null> {
  return (await dariRosterHidup(nim)) ?? (await dariRosterSlot(nim));
}

async function dariRosterSlot(nim: string): Promise<Omit<ResolvedPraktikan, "sesiId"> | null> {
  const db = getDb();
  const semester = semesterDariTanggal(hariIniWib());
  const [r] = await db
    .select({
      nama: praktikan.nama,
      nomor: rosterSlot.kelompokNomor,
      aktif: rosterKelompok.aktif,
    })
    .from(rosterSlot)
    .innerJoin(praktikan, eq(praktikan.nim, rosterSlot.nim))
    .leftJoin(
      rosterKelompok,
      and(
        eq(rosterKelompok.semester, rosterSlot.semester),
        eq(rosterKelompok.hari, rosterSlot.hari),
        eq(rosterKelompok.slot, rosterSlot.slot),
        eq(rosterKelompok.nomor, rosterSlot.kelompokNomor),
      ),
    )
    .where(and(eq(rosterSlot.semester, semester), eq(rosterSlot.nim, nim)))
    .limit(1);
  if (!r || r.aktif === false) return null;
  // Group ids are shared by every slot's Group N. One that no session has
  // made yet has no journals either, so 0 simply finds none.
  const [k] = await db
    .select({ id: kelompok.id, nama: kelompok.nama })
    .from(kelompok)
    .where(eq(kelompok.nomor, r.nomor))
    .limit(1);
  return {
    nim,
    nama: r.nama,
    kelompokId: k?.id ?? 0,
    kelompokNomor: r.nomor,
    kelompokNama: k?.nama ?? `Kelompok ${r.nomor}`,
  };
}

async function dariRosterHidup(nim: string): Promise<Omit<ResolvedPraktikan, "sesiId"> | null> {
  const [row] = await getDb()
    .select({
      nim: anggota.nim,
      nama: anggota.nama,
      kelompokId: kelompok.id,
      kelompokNomor: kelompok.nomor,
      kelompokNama: kelompok.nama,
      aktif: kelompok.aktif,
    })
    .from(anggota)
    .innerJoin(kelompok, eq(anggota.kelompokId, kelompok.id))
    .where(eq(anggota.nim, nim))
    .limit(1);
  if (!row || !row.aktif) return null;
  return {
    nim: row.nim,
    nama: row.nama,
    kelompokId: row.kelompokId,
    kelompokNomor: row.kelompokNomor,
    kelompokNama: row.kelompokNama,
  };
}

/** Names only — never NIMs. This is the projection rule from
 *  jadwal_publik() in apps/modul4/server.py:1023, carried forward: a route a
 *  student's browser can reach must never be able to return another
 *  student's NIM, even as a side effect of showing group membership.
 *
 *  Reads the master roster, same as resolvePraktikan() above -- Stage 21
 *  dropped this function's own fallback onto the retired
 *  `arsipPraktikan`/`arsipRegu` pair for the same reason resolvePraktikan()
 *  dropped its own. */
export async function publicRoster(sesiId: number) {
  const db = getDb();

  const [groups, members, overrides] = await Promise.all([
    db.select().from(kelompok),
    db.select({ kelompokId: anggota.kelompokId, nama: anggota.nama }).from(anggota),
    db.select().from(sesiKelompok).where(eq(sesiKelompok.sesiId, sesiId)),
  ]);
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
  // Phase 9: a Module 4 Praktikum Susulan has no slot, so it borrows the
  // nearest free one (idHuntSusulan) and keeps its own start time; before,
  // it never reached the Pi and its Praktikan couldn't join the hunt.
  const dipakai = new Set(withSlot.map((s) => s.slot));
  const susulan = slots
    .filter((s) => s.slot === null)
    .sort((a, b) => a.mulai.localeCompare(b.mulai));
  const semua: { id: number; slot: number; mulai: string; susulan: boolean }[] = withSlot.map(
    (s) => ({ ...s, susulan: false }),
  );
  for (const s of susulan) {
    const id = idHuntSusulan(s.mulai, dipakai);
    if (id === null) continue;
    dipakai.add(id);
    semua.push({ id: s.id, slot: id, mulai: s.mulai, susulan: true });
  }
  if (semua.length === 0) return null;

  const sesiOut: JadwalModul4["sesi"] = [];
  for (const s of semua) {
    // Stage 21 removed this loop's own fallback onto the retired
    // `arsipRegu`/`arsipPraktikan` pair, for the same reason resolvePraktikan()
    // dropped its own -- see that function's docblock. The `regu` KEY on the
    // object below is deliberately left alone even so: it is apps/modul4/'s
    // own wire format (jadwal_set()/jadwal_muat()), not a database name, and
    // renaming it would break the Pi-side import this function feeds.
    const kelompokSesi: JadwalModul4["sesi"][number]["regu"] = {};

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
          // The star name when the roster left "Kelompok N" (the hunt's
          // reveal and headings show it, like the web does).
          nama: namaKelompok(row.nomor, row.nama),
          aktif: row.kelompokAktif && (row.sesiAktif ?? true),
          anggota: [],
        };
      }
      if (row.nim) kelompokSesi[key].anggota.push({ nim: row.nim, nama: row.anggotaNama ?? "" });
    }

    sesiOut.push({
      id: s.slot,
      mulai: s.susulan ? s.mulai : (slotToMulai(s.slot) ?? s.mulai),
      regu: kelompokSesi,
    });
  }

  sesiOut.sort((a, b) => a.id - b.id);
  return { hari: tanggal, sesi: sesiOut };
}
