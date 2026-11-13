/**
 * Which saved answers count as a group's right now, shared by the code API
 * (the download's gate) and Live Upload (api/_lib/live-build.ts), so both
 * ask the same question the same way. Moved out of api/modul/[aksi].ts
 * (2026-11-13) without a change to what it does.
 */
import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { jawaban, kelompok, percobaanMasuk, sesiAnggota } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { soalKodePrefix } from "../../src/lib/blanks.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { jumlahCelah, kanonik, type KodeAktif } from "./kode-aktif.js";

/** Which jawaban rows count as "this group's answers" right now. The
 *  same (group, blank) has one row per session, so an unscoped read used to
 *  mix them: the editor showed whichever row Postgres happened to return
 *  last, and the download could pass on a blank the running session's own
 *  report still counted wrong. In the running session of this module (its
 *  own sign-in, or an Asisten viewing as a group) only its rows count,
 *  matching handleLaporan's scope exactly.
 *
 *  History (2026-10-07): group ids are shared by every slot's Group N, so
 *  the group alone also mixed in other slots' answers. Now it is the
 *  sessions this NIM signed in to, each with the group the session's own
 *  roster snapshot had them in (handleResults does the same). Mode TOT
 *  needs no rule of its own: a dummy only ever signs in to TOT sessions,
 *  and a real Praktikan never does. Callers order by diubahPada, so the
 *  newest row per blank wins. */
export async function jawabanScope(
  sesiIni: { id: number } | null,
  kelompokId: number,
  prefix: string,
  nim: string,
) {
  const base = like(jawaban.soalKode, `${prefix}%`);
  if (sesiIni) return and(base, eq(jawaban.kelompokId, kelompokId), eq(jawaban.sesiId, sesiIni.id));
  const ikut = await getDb()
    .selectDistinct({ sesiId: sesiAnggota.sesiId, kelompokId: kelompok.id })
    .from(percobaanMasuk)
    .innerJoin(
      sesiAnggota,
      and(eq(sesiAnggota.sesiId, percobaanMasuk.sesiId), eq(sesiAnggota.nim, percobaanMasuk.nim)),
    )
    .innerJoin(kelompok, eq(kelompok.nomor, sesiAnggota.kelompokNomor))
    .where(
      and(
        eq(percobaanMasuk.nim, nim),
        eq(percobaanMasuk.jenis, "praktikan"),
        eq(percobaanMasuk.berhasil, true),
      ),
    );
  if (ikut.length === 0) return sql`false`;
  return and(
    base,
    or(...ikut.map((x) => and(eq(jawaban.sesiId, x.sesiId), eq(jawaban.kelompokId, x.kelompokId)))),
  );
}

/** The running session of this module, when this reader is in it: its own
 *  sign-in, or an Asisten viewing as a group. Anyone else reads history. */
export async function sesiBaca(session: SessionPayload, modul: number, wakil: boolean) {
  const running = await currentSesi();
  if (!running || running.modul !== modul) return null;
  return wakil || session.sesiId === running.id ? running : null;
}

/** How many of a file's blanks this person's group has right, out of how many. The same count the
 *  download's gate makes: the newest row per blank wins, and a blank the editor marks wrong never
 *  counts. null when the sign-in carries no group. */
export async function jawabanBenar(
  session: SessionPayload,
  kode: KodeAktif,
  modul: number,
  slug: string,
  wakil = false,
): Promise<{ benar: number; total: number } | null> {
  const kelompokId = session.kelompokId;
  const nomorKelompok = session.kelompokNomor;
  if (!kelompokId || !nomorKelompok) return null;
  const prefix = soalKodePrefix(modul, slug);
  const sesiIni = await sesiBaca(session, modul, wakil);
  const rows = await getDb()
    .select({ soalKode: jawaban.soalKode, benar: jawaban.benar })
    .from(jawaban)
    .where(await jawabanScope(sesiIni, kelompokId, prefix, session.nim))
    .orderBy(asc(jawaban.diubahPada));
  const sah = new Set<number>();
  for (const row of rows) {
    const nomor = Number(row.soalKode.slice(prefix.length));
    if (!row.benar) {
      sah.delete(nomor);
      continue;
    }
    if (kanonik(kode, slug, nomor, nomorKelompok) === undefined) continue;
    sah.add(nomor);
  }
  return { benar: sah.size, total: jumlahCelah(kode, slug) };
}
