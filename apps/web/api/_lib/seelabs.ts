/**
 * SeeLabs export (Phase 9 Stage 3g, mockup c-seelabs), behind
 * /api/session/seelabs:
 *
 * GET  ?sesiId=      a session's groups as SeeLabs wants them: each group's
 *                    KLP numbers, scorer, the account it goes through, its
 *                    status and the rows in SeeLabs' field order; plus the
 *                    Asisten free to lend an account.
 * GET  ?titipan=1    groups whose scores go through MY account (I'm the
 *                    lender) and aren't saved in SeeLabs yet.
 * POST { aksi: "salin", sesiId, kelompok }        logs a copy
 * POST { aksi: "simpan" | "belum", sesiId, kelompok }
 *                    marks the group saved in SeeLabs, or takes that back
 * POST { aksi: "akun", sesiId, kelompok, akun }   picks (or clears, null)
 *                    the lender for an Asisten's second group, logged in
 *                    sesi_kejadian as "akun_seelabs"
 *
 * Nothing here talks to SeeLabs (it has no API): the Asisten copies, runs
 * the bookmarklet in their own tab, presses Simpan there, and marks it here.
 *
 * A group's KLP comes from its students: each NIM's weekly slot roster
 * (roster_slot) and that roster group's KLP (roster_kelompok), so a makeup
 * session mixing groups still lists every KLP its students sit in. The live
 * `kelompok.klp_seelabs` fills in when no roster knows them.
 */
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatOrang } from "./hak.js";
import { pemilikKelompok } from "./phase8.js";
import { getDb } from "../../src/lib/db.js";
import {
  anggota,
  asisten,
  kelompok,
  nilai,
  rosterKelompok,
  rosterSlot,
  seelabsEkspor,
  sesi,
  sesiAnggota,
  sesiKejadian,
} from "../../src/lib/schema.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { bolehPenuh } from "../../src/lib/hak.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import type { NilaiKomponen } from "../../src/lib/nilai-komponen.js";
import {
  akunKelompok,
  sidikPayload,
  statusSeelabs,
  type BarisSeelabs,
  type KelompokSeelabs,
  type SesiSeelabs,
} from "../../src/lib/seelabs.js";

type Db = ReturnType<typeof getDb>;

const posInt = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Everything SeeLabs needs about one session, or null when it is unknown. */
export async function muatSeelabs(db: Db, sesiId: number): Promise<SesiSeelabs | null> {
  const [s] = await db.select().from(sesi).where(eq(sesi.id, sesiId)).limit(1);
  if (!s) return null;

  // The groups as they were when the session started; older sessions have
  // no snapshot and use the live roster.
  let orang = await db
    .select({ nomor: sesiAnggota.kelompokNomor, nim: sesiAnggota.nim, nama: sesiAnggota.nama })
    .from(sesiAnggota)
    .where(eq(sesiAnggota.sesiId, sesiId))
    .orderBy(asc(sesiAnggota.kelompokNomor), asc(sesiAnggota.id));
  if (orang.length === 0) {
    orang = await db
      .select({ nomor: kelompok.nomor, nim: anggota.nim, nama: anggota.nama })
      .from(anggota)
      .innerJoin(kelompok, eq(kelompok.id, anggota.kelompokId))
      .where(eq(kelompok.aktif, true))
      .orderBy(asc(kelompok.nomor), asc(anggota.id));
  }

  const grup = await db
    .select({ id: kelompok.id, nomor: kelompok.nomor, klp: kelompok.klpSeelabs })
    .from(kelompok);
  const idKeNomor = new Map(grup.map((g) => [g.id, g.nomor]));
  const pemilik = await pemilikKelompok(db, sesiId);
  const nomorDipakai = [...new Set(orang.map((o) => o.nomor))].sort((a, b) => a - b);
  const pasangan = new Map<number, string | null>(nomorDipakai.map((n) => [n, null]));
  for (const [kid, nim] of pemilik) {
    const n = idKeNomor.get(kid);
    if (n !== undefined && pasangan.has(n)) pasangan.set(n, nim);
  }

  const skor = new Map<string, Partial<Record<NilaiKomponen, number>>>();
  for (const r of await db.select().from(nilai).where(eq(nilai.sesiId, sesiId))) {
    const e = skor.get(r.nim) ?? {};
    e[r.komponen] = r.skor;
    skor.set(r.nim, e);
  }

  // KLP per NIM, through the student's weekly slot roster.
  const semester = semesterDariTanggal(s.tanggal);
  const nims = orang.map((o) => o.nim);
  const klpNim = new Map<string, string>();
  if (nims.length) {
    const tempat = await db
      .select({
        nim: rosterSlot.nim,
        klp: rosterKelompok.klpSeelabs,
      })
      .from(rosterSlot)
      .innerJoin(
        rosterKelompok,
        and(
          eq(rosterKelompok.semester, rosterSlot.semester),
          eq(rosterKelompok.hari, rosterSlot.hari),
          eq(rosterKelompok.slot, rosterSlot.slot),
          eq(rosterKelompok.nomor, rosterSlot.kelompokNomor),
        ),
      )
      .where(and(eq(rosterSlot.semester, semester), inArray(rosterSlot.nim, nims)));
    for (const t of tempat) if (t.klp) klpNim.set(t.nim, t.klp);
  }
  const klpLive = new Map(grup.map((g) => [g.nomor, g.klp]));

  // The lender picked for each group: the latest akun_seelabs event wins.
  const pinjam = new Map<number, string>();
  const kejadian = await db
    .select({ detail: sesiKejadian.detail })
    .from(sesiKejadian)
    .where(and(eq(sesiKejadian.sesiId, sesiId), eq(sesiKejadian.jenis, "akun_seelabs")))
    .orderBy(asc(sesiKejadian.pada), asc(sesiKejadian.id));
  for (const k of kejadian) {
    const d = k.detail as { nomor?: number; akun?: string | null };
    if (typeof d.nomor !== "number") continue;
    if (d.akun) pinjam.set(d.nomor, d.akun);
    else pinjam.delete(d.nomor);
  }
  const akun = akunKelompok(pasangan, pinjam);

  // The latest copy of each group, and whether it was marked saved.
  const ekspor = new Map<number, typeof seelabsEkspor.$inferSelect>();
  for (const e of await db
    .select()
    .from(seelabsEkspor)
    .where(eq(seelabsEkspor.sesiId, sesiId))
    .orderBy(asc(seelabsEkspor.id)))
    ekspor.set(e.kelompokNomor, e);

  const kelompokSeelabs: KelompokSeelabs[] = nomorDipakai.map((nomor) => {
    const anggotaGrup = orang.filter((o) => o.nomor === nomor);
    const baris: BarisSeelabs[] = anggotaGrup.map((o) => ({
      nim: o.nim,
      nama: o.nama,
      skor: skor.get(o.nim) ?? {},
    }));
    const klp = [
      ...new Set(anggotaGrup.map((o) => klpNim.get(o.nim) ?? null).filter((x): x is string => !!x)),
    ];
    if (klp.length === 0 && klpLive.get(nomor)) klp.push(klpLive.get(nomor)!);
    const sidik = sidikPayload(baris, s.modul);
    const e = ekspor.get(nomor);
    const a = akun.get(nomor) ?? null;
    const penilai = pasangan.get(nomor) ?? null;
    return {
      nomor,
      klp: klp.sort((x, y) => Number(x) - Number(y)),
      penilai,
      akun: a,
      pinjam: !!a && a !== penilai,
      status: statusSeelabs({
        akun: a,
        adaNilai: baris.some((b) => Object.keys(b.skor).length > 0),
        sidikSekarang: sidik,
        disimpan: e?.disimpanPada ? { sidik: e.payloadHash } : null,
      }),
      disalinPada: e?.disalinPada.toISOString() ?? null,
      disimpanPada: e?.disimpanPada?.toISOString() ?? null,
      baris,
    };
  });

  const terlibat = [
    ...new Set(kelompokSeelabs.flatMap((g) => [g.penilai, g.akun]).filter((x): x is string => !!x)),
  ];
  const namaAkun: Record<string, string | null> = {};
  if (terlibat.length) {
    for (const r of await db
      .select({ nim: asisten.nim, akun: asisten.seelabsAkun })
      .from(asisten)
      .where(inArray(asisten.nim, terlibat)))
      namaAkun[r.nim] = r.akun;
  }

  return {
    sesi: {
      id: s.id,
      tanggal: s.tanggal,
      mulai: s.mulai,
      slot: s.slot,
      modul: s.modul,
      kelas: s.kelas,
      jenis: s.jenis,
      status: s.status,
    },
    kelompok: kelompokSeelabs,
    namaAkun,
  };
}

/** Active Asisten who hold no group in this session: who can lend. */
async function pemberiPinjam(db: Db, data: SesiSeelabs): Promise<string[]> {
  const pegang = new Set(data.kelompok.map((g) => g.penilai).filter(Boolean));
  const rows = await db
    .select({ nim: asisten.nim })
    .from(asisten)
    .where(eq(asisten.status, "aktif"))
    .orderBy(asc(asisten.kode));
  return rows.map((r) => r.nim).filter((n) => !pegang.has(n));
}

export async function handleSeelabsGet(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const db = getDb();
  if (req.query.titipan) {
    // Sessions from the last 60 days where someone picked MY account.
    const batas = new Date(Date.now() - 60 * 86_400_000);
    const rows = await db
      .selectDistinct({ sesiId: sesiKejadian.sesiId })
      .from(sesiKejadian)
      .where(
        and(
          eq(sesiKejadian.jenis, "akun_seelabs"),
          sql`${sesiKejadian.detail}->>'akun' = ${session.nim}`,
          gte(sesiKejadian.pada, batas),
        ),
      )
      .orderBy(desc(sesiKejadian.sesiId));
    const titipan: (SesiSeelabs["sesi"] & { kelompok: KelompokSeelabs })[] = [];
    let namaAkun: Record<string, string | null> = {};
    for (const r of rows) {
      const data = await muatSeelabs(db, r.sesiId);
      if (!data) continue;
      namaAkun = { ...namaAkun, ...data.namaAkun };
      for (const g of data.kelompok)
        if (g.akun === session.nim && g.pinjam && g.status !== "terkirim")
          titipan.push({ ...data.sesi, kelompok: g });
    }
    res.status(200).json({ ok: true, titipan, namaAkun });
    return;
  }

  const sesiId = posInt(req.query.sesiId);
  if (!sesiId) {
    res.status(400).json({ ok: false, kode: "format_salah" });
    return;
  }
  const data = await muatSeelabs(db, sesiId);
  if (!data) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  res.status(200).json({ ok: true, ...data, pemberi: await pemberiPinjam(db, data) });
}

export async function handleSeelabsPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const aksi = typeof body.aksi === "string" ? body.aksi : "";
  const sesiId = posInt(body.sesiId);
  const nomor = posInt(body.kelompok);
  if (!sesiId || !nomor || !["salin", "simpan", "belum", "akun"].includes(aksi)) {
    res.status(400).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const data = await muatSeelabs(db, sesiId);
  if (!data) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  const g = data.kelompok.find((x) => x.nomor === nomor);
  if (!g) {
    res.status(200).json({ ok: false, kode: "kelompok_tidak_ada" });
    return;
  }

  // The scorer may do everything; the lender may copy and mark saved; the
  // full `pair` right covers an Asisten who is away.
  const orang = await muatOrang(session.nim);
  const penuh = !!orang && bolehPenuh(orang, "pair");
  const penilai = g.penilai === session.nim || (!g.penilai && !!orang);
  const pemberi = g.akun === session.nim;
  const boleh = aksi === "akun" ? penilai || penuh : penilai || pemberi || penuh;
  if (!boleh) {
    res.status(403).json({ ok: false, kode: "bukan_penilai" });
    return;
  }

  if (aksi === "akun") {
    const akun = typeof body.akun === "string" && body.akun ? body.akun : null;
    // Only a scorer's second (or later) group goes through a lender; their
    // lowest numbered group always uses their own account.
    const pertama = Math.min(
      ...data.kelompok.filter((x) => x.penilai === g.penilai).map((x) => x.nomor),
    );
    if (!g.penilai || g.nomor === pertama) {
      res.status(200).json({ ok: false, kode: "tidak_perlu_pinjam" });
      return;
    }
    if (akun && !(await pemberiPinjam(db, data)).includes(akun)) {
      res.status(200).json({ ok: false, kode: "pemberi_salah" });
      return;
    }
    await db.insert(sesiKejadian).values({
      sesiId,
      jenis: "akun_seelabs",
      detail: { nomor, akun, penilai: g.penilai },
      aktorNim: session.nim,
    });
    await writeAudit(session.nim, "seelabs_akun", { sesiId, nomor, akun });
    res.status(200).json({ ok: true });
    return;
  }

  if (!g.akun) {
    res.status(200).json({ ok: false, kode: "butuh_akun" });
    return;
  }
  const sidik = sidikPayload(g.baris, data.sesi.modul);
  if (aksi === "salin") {
    // A fresh row only when the scores changed since the last copy, so the
    // saved mark of an unchanged copy stays.
    const [akhir] = await db
      .select()
      .from(seelabsEkspor)
      .where(and(eq(seelabsEkspor.sesiId, sesiId), eq(seelabsEkspor.kelompokNomor, nomor)))
      .orderBy(desc(seelabsEkspor.id))
      .limit(1);
    if (akhir && akhir.payloadHash === sidik && akhir.akunNim === g.akun) {
      await db
        .update(seelabsEkspor)
        .set({ disalinPada: new Date() })
        .where(eq(seelabsEkspor.id, akhir.id));
    } else {
      await db.insert(seelabsEkspor).values({
        sesiId,
        kelompokNomor: nomor,
        klp: g.klp.join(",") || null,
        modul: data.sesi.modul,
        akunNim: g.akun,
        payloadHash: sidik,
      });
    }
    res.status(200).json({ ok: true });
    return;
  }

  // simpan / belum: on the latest copy, made now if there was none.
  let [akhir] = await db
    .select()
    .from(seelabsEkspor)
    .where(and(eq(seelabsEkspor.sesiId, sesiId), eq(seelabsEkspor.kelompokNomor, nomor)))
    .orderBy(desc(seelabsEkspor.id))
    .limit(1);
  if (!akhir) {
    [akhir] = await db
      .insert(seelabsEkspor)
      .values({
        sesiId,
        kelompokNomor: nomor,
        klp: g.klp.join(",") || null,
        modul: data.sesi.modul,
        akunNim: g.akun,
        payloadHash: sidik,
      })
      .returning();
  }
  await db
    .update(seelabsEkspor)
    .set(
      aksi === "simpan"
        ? { disimpanPada: new Date(), payloadHash: sidik, akunNim: g.akun }
        : { disimpanPada: null },
    )
    .where(eq(seelabsEkspor.id, akhir.id));
  await writeAudit(session.nim, aksi === "simpan" ? "seelabs_simpan" : "seelabs_belum", {
    sesiId,
    nomor,
    akun: g.akun,
  });
  res.status(200).json({ ok: true });
}
