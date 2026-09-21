/**
 * One-time backfill from Phase 1's per-session roster (`regu`/`praktikan`)
 * into Phase 3's master roster (`kelompok`/`anggota`). Migration 0002 must
 * already be applied — this script only inserts, it does not migrate schema.
 *
 * Source of truth: the newest session that actually has a roster (highest
 * `tanggal`/`mulai`, `sesi.id` breaking ties), because that is the most
 * up-to-date grouping anyone has entered. `kelompok` rows come from that
 * session's `regu` (nomor, nama); `anggota` rows come from that session's
 * `praktikan` (nim, nama), attached to the group its `regu.nomor` names.
 *
 * Before writing anything, every session's `praktikan` is scanned for a NIM
 * that was recorded under two different group numbers on two different
 * days. `unique(anggota.nim)` means the new schema can only hold one answer
 * to "what group is this NIM in" — if the historical data disagrees with
 * itself, this script cannot guess which occurrence is right, so it prints
 * every conflicting NIM with both (date, group) pairs and exits non-zero
 * without writing a single row. Resolve those by hand (typically a typo'd
 * group number on one of the two days) and re-run.
 *
 * Dry-run by default: prints exactly what it would insert and exits 0
 * without touching the database. Pass --apply to actually write.
 *
 *   npx tsx scripts/backfill-roster.ts            # dry run
 *   npx tsx scripts/backfill-roster.ts --apply     # writes kelompok/anggota
 */
import { getDb } from "../src/lib/db";
import { sesi, regu, praktikan, kelompok, anggota } from "../src/lib/schema";
import { asc, eq } from "drizzle-orm";

interface RosterRow {
  nim: string;
  nama: string;
  tanggal: string;
  reguNomor: number;
  sesiTanggal: string;
  sesiMulai: string;
  sesiId: number;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  // Every session's roster, oldest first, so the conflict scan below can
  // report the two dates in the order they actually happened.
  const rows: RosterRow[] = await db
    .select({
      nim: praktikan.nim,
      nama: praktikan.nama,
      tanggal: praktikan.tanggal,
      reguNomor: regu.nomor,
      sesiTanggal: sesi.tanggal,
      sesiMulai: sesi.mulai,
      sesiId: sesi.id,
    })
    .from(praktikan)
    .innerJoin(regu, eq(regu.id, praktikan.reguId))
    .innerJoin(sesi, eq(sesi.id, praktikan.sesiId))
    .orderBy(asc(sesi.tanggal), asc(sesi.mulai), asc(sesi.id));

  if (rows.length === 0) {
    console.log("No praktikan rows found — nothing to backfill.");
    process.exit(0);
  }

  // nim -> Map(reguNomor -> first tanggal seen with that number)
  const seenByNim = new Map<string, Map<number, string>>();
  const conflicts: { nim: string; a: [string, number]; b: [string, number] }[] = [];

  for (const row of rows) {
    let seen = seenByNim.get(row.nim);
    if (!seen) {
      seen = new Map();
      seenByNim.set(row.nim, seen);
    }
    if (!seen.has(row.reguNomor)) {
      seen.set(row.reguNomor, row.tanggal);
    }
    if (seen.size > 1) {
      const entries = [...seen.entries()];
      const [firstNomor, firstTanggal] = entries[0];
      const [, lastTanggal] = entries[entries.length - 1];
      // Only report once per nim, the first time it disagrees with itself.
      if (!conflicts.some((c) => c.nim === row.nim)) {
        conflicts.push({
          nim: row.nim,
          a: [firstTanggal, firstNomor],
          b: [lastTanggal, row.reguNomor],
        });
      }
    }
  }

  if (conflicts.length > 0) {
    console.error(
      `${conflicts.length} NIM(s) appear under different group numbers on different days:\n`,
    );
    for (const c of conflicts) {
      console.error(`  ${c.nim}: grup ${c.a[1]} on ${c.a[0]}, grup ${c.b[1]} on ${c.b[0]}`);
    }
    console.error("\nRefusing to backfill — resolve these by hand, then re-run.");
    process.exit(1);
  }

  // Newest session that has at least one roster row is the source of truth.
  const newest = rows[rows.length - 1];
  const newestRows = rows.filter(
    (r) => r.sesiTanggal === newest.sesiTanggal && r.sesiMulai === newest.sesiMulai,
  );

  const groupsBySesi = await db
    .select({ nomor: regu.nomor, nama: regu.nama })
    .from(regu)
    .where(eq(regu.sesiId, newest.sesiId));

  console.log(
    `Source session: ${newest.sesiTanggal} ${newest.sesiMulai} ` +
      `(${groupsBySesi.length} groups, ${newestRows.length} students)`,
  );

  if (!apply) {
    console.log("\n-- dry run, pass --apply to write --\n");
    for (const g of groupsBySesi.sort((a, b) => a.nomor - b.nomor)) {
      const members = newestRows.filter((r) => r.reguNomor === g.nomor);
      console.log(`kelompok ${g.nomor} (${g.nama}): ${members.length} anggota`);
      for (const m of members) {
        console.log(`  ${m.nim}  ${m.nama}`);
      }
    }
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    const kelompokIdByNomor = new Map<number, number>();

    for (const g of groupsBySesi) {
      const [inserted] = await tx
        .insert(kelompok)
        .values({ nomor: g.nomor, nama: g.nama })
        .onConflictDoUpdate({ target: kelompok.nomor, set: { nama: g.nama } })
        .returning({ id: kelompok.id, nomor: kelompok.nomor });
      kelompokIdByNomor.set(inserted.nomor, inserted.id);
    }

    for (const r of newestRows) {
      const kelompokId = kelompokIdByNomor.get(r.reguNomor);
      if (kelompokId === undefined) {
        throw new Error(`No kelompok row for nomor ${r.reguNomor} (nim ${r.nim})`);
      }
      await tx
        .insert(anggota)
        .values({ kelompokId, nim: r.nim, nama: r.nama })
        .onConflictDoUpdate({ target: anggota.nim, set: { kelompokId, nama: r.nama } });
    }
  });

  console.log(`\nBackfilled ${groupsBySesi.length} groups and ${newestRows.length} students.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
