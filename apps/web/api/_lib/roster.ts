/**
 * Copying a roster into a starting session (Phase 9 Stage 3).
 *
 * Rosters belong to the weekly schedule slot (roster_slot, with each
 * group's running flag and SeeLabs KLP in roster_kelompok) and are reused
 * every week; a Praktikum Susulan has its own one-off roster on its draft
 * session (roster_susulan). Sign-in and scoring still read the practicum's
 * one live roster, `kelompok` and `anggota`, so starting a session rewrites
 * those from the slot's roster and snapshots the result into sesi_anggota,
 * which keeps every past session's groups as they were.
 *
 * `kelompok` rows are only ever updated, never deleted: sesi_kelompok,
 * sesi_asisten and jawaban cascade from them, so deleting one would erase
 * past sessions. Groups past the count are switched off instead.
 *
 * A source roster with nobody in it changes nothing: the live roster stays
 * as it was (the way sessions started before Phase 9), and is snapshotted.
 */
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { getDb } from "../../src/lib/db.js";
import {
  anggota,
  kelompok,
  praktikan,
  rosterKelompok,
  rosterSlot,
  rosterSusulan,
  sesiAnggota,
} from "../../src/lib/schema.js";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type SumberRoster =
  | { jenis: "slot"; semester: string; hari: number; slot: number }
  | { jenis: "susulan"; sesiId: number };

interface Anggota {
  nomor: number;
  nim: string;
  nama: string;
}

async function bacaSumber(tx: Tx, sumber: SumberRoster) {
  if (sumber.jenis === "slot") {
    const where = and(
      eq(rosterSlot.semester, sumber.semester),
      eq(rosterSlot.hari, sumber.hari),
      eq(rosterSlot.slot, sumber.slot),
    );
    const orang: Anggota[] = await tx
      .select({ nomor: rosterSlot.kelompokNomor, nim: rosterSlot.nim, nama: praktikan.nama })
      .from(rosterSlot)
      .innerJoin(praktikan, eq(praktikan.nim, rosterSlot.nim))
      .where(where)
      .orderBy(asc(rosterSlot.kelompokNomor), asc(rosterSlot.urutan));
    const grup = await tx
      .select({
        nomor: rosterKelompok.nomor,
        aktif: rosterKelompok.aktif,
        klp: rosterKelompok.klpSeelabs,
      })
      .from(rosterKelompok)
      .where(
        and(
          eq(rosterKelompok.semester, sumber.semester),
          eq(rosterKelompok.hari, sumber.hari),
          eq(rosterKelompok.slot, sumber.slot),
        ),
      );
    return { orang, grup };
  }
  const orang: Anggota[] = await tx
    .select({
      nomor: rosterSusulan.kelompokNomor,
      nim: rosterSusulan.nim,
      nama: rosterSusulan.nama,
    })
    .from(rosterSusulan)
    .where(eq(rosterSusulan.sesiId, sumber.sesiId))
    .orderBy(asc(rosterSusulan.kelompokNomor), asc(rosterSusulan.urutan));
  return { orang, grup: [] as { nomor: number; aktif: boolean; klp: string | null }[] };
}

/**
 * Inside the session-start transaction: make `kelompok`/`anggota` the
 * source roster with `jumlah` groups, then snapshot them for `sesiId`.
 * Returns how many people were copied (0 when the source was empty and
 * the live roster was kept).
 */
export async function salinRosterKeSesi(
  tx: Tx,
  sesiId: number,
  sumber: SumberRoster,
  jumlah: number,
): Promise<{ disalin: number }> {
  const { orang, grup } = await bacaSumber(tx, sumber);
  const dipakai = orang.filter((o) => o.nomor >= 1 && o.nomor <= jumlah);

  if (dipakai.length > 0) {
    const info = new Map(grup.map((g) => [g.nomor, g]));
    for (let n = 1; n <= jumlah; n++) {
      const g = info.get(n);
      await tx
        .insert(kelompok)
        .values({
          nomor: n,
          nama: `Kelompok ${n}`,
          aktif: g?.aktif ?? true,
          klpSeelabs: g?.klp ?? null,
        })
        .onConflictDoUpdate({
          target: kelompok.nomor,
          set: { nama: `Kelompok ${n}`, aktif: g?.aktif ?? true, klpSeelabs: g?.klp ?? null },
        });
    }
    await tx.update(kelompok).set({ aktif: false }).where(gt(kelompok.nomor, jumlah));
    await tx.delete(anggota);
    const ids = new Map(
      (await tx.select({ id: kelompok.id, nomor: kelompok.nomor }).from(kelompok)).map((k) => [
        k.nomor,
        k.id,
      ]),
    );
    await tx
      .insert(anggota)
      .values(dipakai.map((o) => ({ kelompokId: ids.get(o.nomor)!, nim: o.nim, nama: o.nama })));
  }

  // The snapshot: everyone in a running group, as the session starts.
  await tx.execute(sql`
    INSERT INTO ${sesiAnggota} (sesi_id, kelompok_nomor, nim, nama)
    SELECT ${sesiId}, k.nomor, a.nim, a.nama
    FROM ${anggota} a JOIN ${kelompok} k ON k.id = a.kelompok_id
    WHERE k.aktif
    ON CONFLICT (sesi_id, nim) DO NOTHING
  `);
  return { disalin: dipakai.length };
}
