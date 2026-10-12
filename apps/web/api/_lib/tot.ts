/**
 * Mode TOT, the switch (2026-10-05) and its page (2026-10-12).
 * GET/POST /api/session/tot; GET ?detail=1 adds the dummies' sign-ins, the
 * running TOT session and the finished ones for the /tot page.
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
 *
 * The page also sets who takes part (divisions and dummies per group,
 * rebuilt at once while TOT is on and nothing runs), signs a dummy out,
 * clears one group's answers and captures in the running TOT session, and
 * deletes one finished TOT session or all of them.
 */
import { and, asc, eq, gt, inArray, ne, notInArray, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { writeAudit } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import {
  anggota,
  asisten,
  jawaban,
  jurnalTangkapan,
  kelompok,
  pengaturan,
  percobaanMasuk,
  petunjukMinta,
  serialCermin,
  sesi,
  sesiKelompok,
} from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { KUNCI_TOT, bacaModeTot } from "../../src/lib/mode-tot.js";
import {
  MODE_TOT_MATI,
  PRAKTIKAN_TOT,
  bacaAturTot,
  bacaNilaiTot,
  isNimTot,
  pesertaTot,
  rosterTot,
  type AturTot,
  type ModeTot,
} from "../../src/lib/tot.js";
import { SESSION_TTL_SEC } from "../../src/lib/sesi-umur.js";

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
      { ...mode, aktif: true, sejak: new Date().toISOString(), oleh: nim, cadangan, keluar: {} },
      nim,
    );

    await pasangRosterTot(tx, mode.atur);
    return { ok: true as const };
  });
}

/** Puts the dummies the setting names on the live roster */
async function pasangRosterTot(tx: Tx, atur: AturTot) {
  const ada = await tx.select({ nomor: kelompok.nomor }).from(kelompok);
  const tot = rosterTot(ada, atur);
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
    await tulisDalam(tx, { ...MODE_TOT_MATI, atur: mode.atur }, nim);
    return { ok: true as const };
  });
}

/** GET /api/session/tot: the switch's state for the banner and the card;
 *  `?detail=1` adds everything the /tot page shows. */
export async function handleTotGet(req: ApiRequest, res: ApiResponse) {
  const mode = await bacaModeTot();
  const db = getDb();
  let olehKode: string | null = null;
  if (mode.oleh) {
    const [a] = await db
      .select({ kode: asisten.kode })
      .from(asisten)
      .where(eq(asisten.nim, mode.oleh))
      .limit(1);
    olehKode = a?.kode ?? null;
  }
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sesi)
    .where(and(eq(sesi.jenis, "tot"), ne(sesi.status, "berjalan")));
  const dasar = {
    ok: true,
    aktif: mode.aktif,
    sejak: mode.sejak,
    oleh: mode.oleh,
    olehKode,
    jumlah: pesertaTot(mode.atur).length,
    riwayat: r?.n ?? 0,
    atur: mode.atur,
  };
  if (String(req.query?.detail ?? "") !== "1") {
    res.status(200).json(dasar);
    return;
  }
  res.status(200).json({ ...dasar, ...(await detailTot(mode)) });
}

/** The /tot page's live parts: each dummy's last sign-in, the running TOT
 *  session with each group's progress, and the finished TOT sessions. */
async function detailTot(mode: ModeTot) {
  const db = getDb();
  const nims = PRAKTIKAN_TOT.map((p) => p.nim);
  const masuk = await db
    .select({
      nim: percobaanMasuk.nim,
      pada: sql<string>`max(${percobaanMasuk.pada})`,
    })
    .from(percobaanMasuk)
    .where(
      and(
        inArray(percobaanMasuk.nim, nims),
        eq(percobaanMasuk.jenis, "praktikan"),
        eq(percobaanMasuk.berhasil, true),
      ),
    )
    .groupBy(percobaanMasuk.nim);
  const terakhir = new Map(masuk.map((m) => [m.nim, new Date(m.pada).toISOString()]));
  const batas = Date.now() - SESSION_TTL_SEC * 1000;
  const sejakMs = mode.sejak ? Date.parse(mode.sejak) : 0;
  // A dummy counts as signed in while its last sign-in is fresher than the
  // cookie's life, came after TOT was switched on, and after any sign-out.
  const peserta = new Set(pesertaTot(mode.atur).map((p) => p.nim));
  const akun = PRAKTIKAN_TOT.map((p) => {
    const t = terakhir.get(p.nim) ?? null;
    const ms = t ? Date.parse(t) : 0;
    const keluar = mode.keluar[p.nim] ? Date.parse(mode.keluar[p.nim]) : 0;
    return {
      nim: p.nim,
      nama: p.nama,
      divisi: p.divisi,
      urut: p.urut,
      ikut: peserta.has(p.nim),
      masukPada: t,
      masuk: mode.aktif && !!t && ms > batas && ms >= sejakMs && ms > keluar,
    };
  });

  const [jalan] = await db
    .select()
    .from(sesi)
    .where(and(eq(sesi.jenis, "tot"), eq(sesi.status, "berjalan")))
    .limit(1);
  let berjalan = null;
  if (jalan) {
    const kel = await db
      .select({
        id: kelompok.id,
        nomor: kelompok.nomor,
        benar: sql<number>`(select count(*)::int from ${jawaban} j where j.sesi_id = ${jalan.id} and j.kelompok_id = ${kelompok.id} and j.benar)`,
        tangkap: sql<number>`(select count(*)::int from ${jurnalTangkapan} t where t.sesi_id = ${jalan.id} and t.kelompok_id = ${kelompok.id})`,
      })
      .from(sesiKelompok)
      .innerJoin(kelompok, eq(kelompok.id, sesiKelompok.kelompokId))
      .where(eq(sesiKelompok.sesiId, jalan.id))
      .orderBy(asc(kelompok.nomor));
    berjalan = {
      id: jalan.id,
      modul: jalan.modul,
      mulaiPada: (jalan.mulaiPada ?? jalan.dibuatPada).toISOString(),
      durasiMenit: jalan.durasiMenit,
      kelompok: kel,
    };
  }

  const lalu = await db
    .select({
      id: sesi.id,
      modul: sesi.modul,
      tanggal: sesi.tanggal,
      mulai: sesi.mulai,
      status: sesi.status,
      mulaiPada: sesi.mulaiPada,
      selesaiPada: sesi.selesaiPada,
      jumlahKelompok: sesi.jumlahKelompok,
      benar: sql<number>`(select count(*)::int from ${jawaban} j where j.sesi_id = ${sesi.id} and j.benar)`,
      tangkap: sql<number>`(select count(*)::int from ${jurnalTangkapan} t where t.sesi_id = ${sesi.id})`,
      hadir: sql<number>`(select count(distinct p.nim)::int from ${percobaanMasuk} p where p.sesi_id = ${sesi.id} and p.jenis = 'praktikan' and p.berhasil)`,
    })
    .from(sesi)
    .where(and(eq(sesi.jenis, "tot"), ne(sesi.status, "berjalan")))
    .orderBy(sql`${sesi.id} desc`)
    .limit(60);
  return {
    akun,
    berjalan,
    lalu: lalu.map((x) => ({
      ...x,
      mulaiPada: x.mulaiPada?.toISOString() ?? null,
      selesaiPada: x.selesaiPada?.toISOString() ?? null,
    })),
  };
}

/**
 * Clears finished TOT sessions (2026-10-05): the practice runs' scores,
 * answers, sign-ins and events go with them (every table cascades from
 * `sesi`). A TOT session still running is kept. The dummies' sign-in
 * attempts are removed first, since that table only unlinks. `id` clears
 * just that one (2026-10-12).
 */
async function hapusRiwayatTot(id?: number): Promise<number> {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .select({ id: sesi.id })
      .from(sesi)
      .where(
        and(
          eq(sesi.jenis, "tot"),
          ne(sesi.status, "berjalan"),
          id === undefined ? undefined : eq(sesi.id, id),
        ),
      );
    const ids = rows.map((r) => r.id);
    if (!ids.length) return 0;
    await tx.delete(percobaanMasuk).where(inArray(percobaanMasuk.sesiId, ids));
    await tx.delete(sesi).where(inArray(sesi.id, ids));
    return ids.length;
  });
}

/** Who takes part, saved; while TOT is on and nothing runs, the roster
 *  follows at once. */
async function aturTot(atur: AturTot, nim: string) {
  await currentSesi();
  return getDb().transaction(async (tx) => {
    const mode = await bacaDalam(tx);
    if (mode.aktif && (await adaSesiBerjalan(tx)))
      return { ok: false as const, kode: "sesi_berjalan" };
    await tulisDalam(tx, { ...mode, atur }, nim);
    if (mode.aktif) await pasangRosterTot(tx, atur);
    return { ok: true as const };
  });
}

/** Signs dummies out: their cookies made before now stop working. */
async function keluarkanTot(siapa: string[], nim: string) {
  return getDb().transaction(async (tx) => {
    const mode = await bacaDalam(tx);
    const pada = new Date().toISOString();
    const keluar = { ...mode.keluar };
    for (const n of siapa) keluar[n] = pada;
    await tulisDalam(tx, { ...mode, keluar }, nim);
  });
}

/** Clears one group's answers, hints, captures and serial mirror in the
 *  running TOT session, so the group can practise the module again. */
async function resetKelompokTot(nomor: number) {
  const running = await currentSesi();
  if (!running || running.jenis !== "tot") return { ok: false as const, kode: "bukan_sesi_tot" };
  const db = getDb();
  const [k] = await db
    .select({ id: kelompok.id })
    .from(kelompok)
    .where(eq(kelompok.nomor, nomor))
    .limit(1);
  if (!k) return { ok: false as const, kode: "format_salah" };
  await db.transaction(async (tx) => {
    await tx
      .delete(jawaban)
      .where(and(eq(jawaban.sesiId, running.id), eq(jawaban.kelompokId, k.id)));
    await tx
      .delete(petunjukMinta)
      .where(and(eq(petunjukMinta.sesiId, running.id), eq(petunjukMinta.kelompokId, k.id)));
    await tx
      .delete(jurnalTangkapan)
      .where(and(eq(jurnalTangkapan.sesiId, running.id), eq(jurnalTangkapan.kelompokId, k.id)));
    await tx
      .delete(serialCermin)
      .where(and(eq(serialCermin.sesiId, running.id), eq(serialCermin.kelompokNomor, nomor)));
  });
  return { ok: true as const, sesiId: running.id };
}

/** POST /api/session/tot (right `jadwal`, checked by the dispatcher):
 *  { aktif } | { hapusRiwayat: true } | { hapusSesi: id } | { atur } |
 *  { keluarkan: nim | "semua" } | { resetKelompok: nomor } */
export async function handleTotPost(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  if (body.hapusRiwayat === true || body.hapusSesi !== undefined) {
    const satu = body.hapusSesi === undefined ? undefined : Number(body.hapusSesi);
    if (satu !== undefined && !Number.isInteger(satu)) return tolak(res, "format_salah");
    const n = await hapusRiwayatTot(satu);
    if (satu !== undefined && !n) return tolak(res, "tidak_ada");
    await writeAudit(session.nim, "tot_hapus_riwayat", { sesi: n, sesiId: satu });
    res.status(200).json({ ok: true, dihapus: n });
    return;
  }
  if (body.atur !== undefined) {
    const atur = bacaAturTot(body.atur);
    if (!atur) return tolak(res, "format_salah");
    const hasil = await aturTot(atur, session.nim);
    if (!hasil.ok) return tolak(res, hasil.kode);
    await writeAudit(session.nim, "tot_atur", { ...atur });
    res.status(200).json({ ok: true, atur });
    return;
  }
  if (body.keluarkan !== undefined) {
    const siapa =
      body.keluarkan === "semua"
        ? PRAKTIKAN_TOT.map((p) => p.nim)
        : typeof body.keluarkan === "string" && isNimTot(body.keluarkan)
          ? [body.keluarkan]
          : null;
    if (!siapa) return tolak(res, "format_salah");
    await keluarkanTot(siapa, session.nim);
    await writeAudit(session.nim, "tot_keluarkan", { nim: body.keluarkan });
    res.status(200).json({ ok: true });
    return;
  }
  if (body.resetKelompok !== undefined) {
    const nomor = Number(body.resetKelompok);
    if (!Number.isInteger(nomor) || nomor < 1) return tolak(res, "format_salah");
    const hasil = await resetKelompokTot(nomor);
    if (!hasil.ok) return tolak(res, hasil.kode);
    await writeAudit(session.nim, "tot_reset_kelompok", { sesiId: hasil.sesiId, kelompok: nomor });
    res.status(200).json({ ok: true });
    return;
  }
  if (typeof body.aktif !== "boolean") return tolak(res, "format_salah");
  const hasil = body.aktif ? await nyalakanTot(session.nim) : await matikanTot(session.nim);
  if (!hasil.ok) return tolak(res, hasil.kode);
  await writeAudit(session.nim, body.aktif ? "tot_nyala" : "tot_mati", {
    praktikan: body.aktif ? PRAKTIKAN_TOT.length : undefined,
  });
  res.status(200).json({ ok: true, aktif: body.aktif });
}
