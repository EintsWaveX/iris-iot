/**
 * Mode TOT, the switch (2026-10-05). GET/POST /api/session/tot.
 *
 * Switching on saves the live roster (`kelompok` + `anggota`) exactly as it
 * is into `pengaturan.tot`, then puts the 60 dummy Praktikan in its place:
 * one group per division, groups past 6 switched off. Switching off puts
 * the saved rows back with their own ids and values and clears the backup.
 * Nothing else is written: `praktikan`, the slot rosters, susulan drafts,
 * past snapshots, answers and scores stay as they are. Both directions are
 * refused while a session is running.
 *
 * `kelompok` rows are only ever updated, never deleted (sessions cascade
 * from them, see api/_lib/roster.ts). A group TOT had to create stays,
 * switched off.
 */
import { asc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { writeAudit } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import { anggota, asisten, kelompok, pengaturan, sesi } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { KUNCI_TOT, bacaModeTot } from "../../src/lib/mode-tot.js";
import {
  MODE_TOT_MATI,
  PRAKTIKAN_TOT,
  bacaNilaiTot,
  rosterTot,
  type ModeTot,
} from "../../src/lib/tot.js";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function tolak(res: ApiResponse, kode: string) {
  res.status(200).json({ ok: false, kode });
}

async function bacaDalam(tx: Tx): Promise<ModeTot> {
  const rows = await tx.execute(
    sql`select nilai from ${pengaturan} where kunci = ${KUNCI_TOT} for update`,
  );
  return bacaNilaiTot((rows.rows[0] as { nilai?: unknown } | undefined)?.nilai);
}

async function tulisDalam(tx: Tx, nilai: ModeTot, nim: string) {
  await tx
    .insert(pengaturan)
    .values({ kunci: KUNCI_TOT, nilai, diubahOleh: nim, diubahPada: sql`now()` })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai, diubahOleh: nim, diubahPada: sql`now()` },
    });
}

async function adaSesiBerjalan(tx: Tx): Promise<boolean> {
  const [r] = await tx
    .select({ id: sesi.id })
    .from(sesi)
    .where(eq(sesi.status, "berjalan"))
    .limit(1);
  return !!r;
}

export async function nyalakanTot(
  nim: string,
): Promise<{ ok: true } | { ok: false; kode: string }> {
  await currentSesi(); // closes a session already past its length
  return getDb().transaction(async (tx) => {
    const mode = await bacaDalam(tx);
    if (mode.aktif) return { ok: false as const, kode: "sudah_aktif" };
    if (await adaSesiBerjalan(tx)) return { ok: false as const, kode: "sesi_berjalan" };

    const simpanKelompok = await tx.select().from(kelompok).orderBy(asc(kelompok.id));
    const simpanAnggota = await tx.select().from(anggota).orderBy(asc(anggota.id));
    const cadangan = {
      kelompok: simpanKelompok.map((k) => ({
        id: k.id,
        nomor: k.nomor,
        nama: k.nama,
        aktif: k.aktif,
        klpSeelabs: k.klpSeelabs,
      })),
      anggota: simpanAnggota.map((a) => ({
        id: a.id,
        kelompokId: a.kelompokId,
        nim: a.nim,
        nama: a.nama,
      })),
    };
    // The backup is written first, so nothing below runs without it.
    await tulisDalam(
      tx,
      { aktif: true, sejak: new Date().toISOString(), oleh: nim, cadangan },
      nim,
    );

    const tot = rosterTot(simpanKelompok);
    for (const k of tot.kelompok) {
      await tx
        .insert(kelompok)
        .values(k)
        .onConflictDoUpdate({
          target: kelompok.nomor,
          set: { nama: k.nama, aktif: k.aktif, klpSeelabs: k.klpSeelabs },
        });
    }
    if (tot.matikan.length) {
      await tx.update(kelompok).set({ aktif: false }).where(inArray(kelompok.nomor, tot.matikan));
    }
    await tx.delete(anggota);
    const ids = new Map(
      (await tx.select({ id: kelompok.id, nomor: kelompok.nomor }).from(kelompok)).map((k) => [
        k.nomor,
        k.id,
      ]),
    );
    await tx.insert(anggota).values(
      tot.anggota.map((a) => ({
        kelompokId: ids.get(a.kelompokNomor)!,
        nim: a.nim,
        nama: a.nama,
      })),
    );
    return { ok: true as const };
  });
}

export async function matikanTot(nim: string): Promise<{ ok: true } | { ok: false; kode: string }> {
  await currentSesi();
  return getDb().transaction(async (tx) => {
    const mode = await bacaDalam(tx);
    if (!mode.aktif) return { ok: false as const, kode: "sudah_mati" };
    if (await adaSesiBerjalan(tx)) return { ok: false as const, kode: "sesi_berjalan" };
    if (!mode.cadangan) return { ok: false as const, kode: "cadangan_hilang" };

    const { kelompok: kSimpan, anggota: aSimpan } = mode.cadangan;
    await tx.delete(anggota);
    for (const k of kSimpan) {
      await tx
        .update(kelompok)
        .set({ nomor: k.nomor, nama: k.nama, aktif: k.aktif, klpSeelabs: k.klpSeelabs })
        .where(eq(kelompok.id, k.id));
    }
    // A group TOT created (the live roster had fewer than six) stays, off.
    const idSimpan = kSimpan.map((k) => k.id);
    await tx
      .update(kelompok)
      .set({ aktif: false })
      .where(idSimpan.length ? notInArray(kelompok.id, idSimpan) : gt(kelompok.id, 0));
    if (aSimpan.length) await tx.insert(anggota).values(aSimpan);
    await tulisDalam(tx, MODE_TOT_MATI, nim);
    return { ok: true as const };
  });
}

/** GET /api/session/tot: the switch's state for the banner and the card. */
export async function handleTotGet(_req: ApiRequest, res: ApiResponse) {
  const mode = await bacaModeTot();
  let olehKode: string | null = null;
  if (mode.oleh) {
    const [a] = await getDb()
      .select({ kode: asisten.kode })
      .from(asisten)
      .where(eq(asisten.nim, mode.oleh))
      .limit(1);
    olehKode = a?.kode ?? null;
  }
  res.status(200).json({
    ok: true,
    aktif: mode.aktif,
    sejak: mode.sejak,
    oleh: mode.oleh,
    olehKode,
    jumlah: PRAKTIKAN_TOT.length,
  });
}

/** POST /api/session/tot { aktif: boolean } (right `jadwal`, checked by the
 *  dispatcher). */
export async function handleTotPost(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  if (typeof body.aktif !== "boolean") return tolak(res, "format_salah");
  const hasil = body.aktif ? await nyalakanTot(session.nim) : await matikanTot(session.nim);
  if (!hasil.ok) return tolak(res, hasil.kode);
  await writeAudit(session.nim, body.aktif ? "tot_nyala" : "tot_mati", {
    praktikan: body.aktif ? PRAKTIKAN_TOT.length : undefined,
  });
  res.status(200).json({ ok: true, aktif: body.aktif });
}
