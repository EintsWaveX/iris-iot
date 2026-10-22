/**
 * SeeLabs export (Phase 9 Stage 3g, mockup c-seelabs), behind
 * /api/session/seelabs:
 *
 * GET  ?sesiId=      a session's groups as SeeLabs wants them: each group's
 *                    KLP numbers, scorer, the account it goes through, its
 *                    status and the rows in SeeLabs' field order; plus the
 *                    Asisten free to lend an account.
 * POST { aksi: "akun", sesiId, kelompok, akun }   picks (or clears, null)
 *                    the lender for an Asisten's second group (or any group
 *                    at the two-sessions-a-day cap), logged in
 *                    sesi_kejadian as "akun_seelabs"
 *
 * Nothing here talks to SeeLabs (it has no API): the robot saves the scores
 * (api/_lib/seelabs-robot.ts) and reads them back (seelabs-baca.ts).
 *
 * A group's KLP comes from its students: each NIM's weekly slot roster
 * (roster_slot) and that roster group's KLP (roster_kelompok), so a makeup
 * session mixing groups still lists every KLP its students sit in. The live
 * `kelompok.klp_seelabs` fills in when no roster knows them.
 */
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatOrang } from "./hak.js";
import { siarkan } from "./siaran.js";
import { jadwalUntuk, pemilikKelompok } from "./phase8.js";
import { muatTanggal } from "./penugasan-api.js";
import { l1PerKelompok } from "./l1-otomatis.js";
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
  sesiAsisten,
  sesiKejadian,
} from "../../src/lib/schema.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { bolehPenuh } from "../../src/lib/hak.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import type { NilaiKomponen } from "../../src/lib/nilai-komponen.js";
import {
  AKUN_MAKS_SESI_HARI,
  akunKelompok,
  bacaKejadianAkun,
  pilahPemberi,
  saranPinjam,
  sidikPayload,
  statusSeelabs,
  type BarisSeelabs,
  type KelompokSeelabs,
  type PemberiTolak,
  type SesiSeelabs,
} from "../../src/lib/seelabs.js";

type Db = ReturnType<typeof getDb>;

const posInt = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Mode TOT: a TOT session's dummy scores never go to SeeLabs or pay. */
export async function sesiTot(db: Db, sesiId: number): Promise<boolean> {
  const [s] = await db.select({ jenis: sesi.jenis }).from(sesi).where(eq(sesi.id, sesiId)).limit(1);
  return s?.jenis === "tot";
}

/**
 * Whose SeeLabs account the other sessions of a date went through (TOT and
 * cancelled ones left out; `kecuali` is the session being looked at): each
 * holder's own lowest numbered group, and the latest lender picked for each
 * group. One entry per account per session, in `mulai` then id order.
 */
export async function pemakaianAkunHari(
  db: Db,
  tanggal: string,
  kecuali: number,
): Promise<Map<string, { sesiId: number; mulai: string }[]>> {
  const hasil = new Map<string, { sesiId: number; mulai: string }[]>();
  const lain = (
    await db
      .select({ id: sesi.id, mulai: sesi.mulai })
      .from(sesi)
      .where(
        and(
          eq(sesi.tanggal, tanggal),
          ne(sesi.id, kecuali),
          ne(sesi.status, "batal"),
          ne(sesi.jenis, "tot"),
        ),
      )
  ).sort((a, b) => a.mulai.localeCompare(b.mulai) || a.id - b.id);
  if (lain.length === 0) return hasil;
  const ids = lain.map((x) => x.id);

  const idKeNomor = new Map(
    (await db.select({ id: kelompok.id, nomor: kelompok.nomor }).from(kelompok)).map((g) => [
      g.id,
      g.nomor,
    ]),
  );
  const pegang = await db
    .select({
      sesiId: sesiAsisten.sesiId,
      kelompokId: sesiAsisten.kelompokId,
      nim: sesiAsisten.asistenNim,
    })
    .from(sesiAsisten)
    .where(inArray(sesiAsisten.sesiId, ids));
  const kejadian = await db
    .select({ sesiId: sesiKejadian.sesiId, detail: sesiKejadian.detail })
    .from(sesiKejadian)
    .where(and(inArray(sesiKejadian.sesiId, ids), eq(sesiKejadian.jenis, "akun_seelabs")))
    .orderBy(asc(sesiKejadian.pada), asc(sesiKejadian.id));

  for (const x of lain) {
    const dipakai = new Set<string>();
    // Each holder's lowest numbered group is on their own account.
    const terendah = new Map<string, number>();
    for (const r of pegang.filter((p) => p.sesiId === x.id)) {
      const n = idKeNomor.get(r.kelompokId);
      if (n !== undefined && n < (terendah.get(r.nim) ?? Infinity)) terendah.set(r.nim, n);
    }
    for (const nim of terendah.keys()) dipakai.add(nim);
    // The latest lender per group wins; a cleared pick (null) removes it.
    const { pinjam } = bacaKejadianAkun(kejadian.filter((e) => e.sesiId === x.id));
    for (const nim of pinjam.values()) dipakai.add(nim);
    for (const nim of dipakai) {
      const daftar = hasil.get(nim) ?? [];
      daftar.push({ sesiId: x.id, mulai: x.mulai });
      hasil.set(nim, daftar);
    }
  }
  return hasil;
}

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
  // L1 nobody typed is the system's, so the export agrees with the table.
  const l1Auto = await l1PerKelompok(db, sesiId, s.modul);
  for (const o of orang) {
    const e = skor.get(o.nim) ?? {};
    if (e.L1 == null) skor.set(o.nim, { ...e, L1: l1Auto.get(o.nomor) ?? 0 });
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
  // The same events carry the groups marked as input by hand in SeeLabs.
  const kejadian = await db
    .select({ detail: sesiKejadian.detail, pada: sesiKejadian.pada })
    .from(sesiKejadian)
    .where(and(eq(sesiKejadian.sesiId, sesiId), eq(sesiKejadian.jenis, "akun_seelabs")))
    .orderBy(asc(sesiKejadian.pada), asc(sesiKejadian.id));
  const { pinjam, manual } = bacaKejadianAkun(kejadian);
  // A holder whose account already carries two earlier sessions today needs
  // a lender for every group of this one.
  const pakaiHari = await pemakaianAkunHari(db, s.tanggal, s.id);
  const penuh = new Set<string>();
  for (const nim of new Set(pasangan.values())) {
    if (!nim) continue;
    const lebihAwal = (pakaiHari.get(nim) ?? []).filter(
      (u) => u.mulai < s.mulai || (u.mulai === s.mulai && u.sesiId < s.id),
    );
    if (lebihAwal.length >= AKUN_MAKS_SESI_HARI) penuh.add(nim);
  }
  const akun = akunKelompok(pasangan, pinjam, penuh);

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
      klp: klpNim.get(o.nim) ?? klpLive.get(nomor) ?? null,
    }));
    const klp = [
      ...new Set(anggotaGrup.map((o) => klpNim.get(o.nim) ?? null).filter((x): x is string => !!x)),
    ];
    if (klp.length === 0 && klpLive.get(nomor)) klp.push(klpLive.get(nomor)!);
    const sidik = sidikPayload(baris, s.modul);
    const e = ekspor.get(nomor);
    const a = akun.get(nomor) ?? null;
    const penilai = pasangan.get(nomor) ?? null;
    // A mark stands only until SeeLabs is seen holding the group (a robot
    // save or a read-back), which then speaks for itself.
    const tanda = !e?.disimpanPada ? (manual.get(nomor) ?? null) : null;
    return {
      nomor,
      klp: klp.sort((x, y) => Number(x) - Number(y)),
      penilai,
      akun: a,
      pinjam: !!a && a !== penilai,
      manual: tanda ? { pada: tanda.pada?.toISOString() ?? null, akun: tanda.akun } : null,
      status: statusSeelabs({
        akun: a,
        adaNilai: baris.some((b) => Object.keys(b.skor).length > 0),
        sidikSekarang: sidik,
        disimpan: e?.disimpanPada
          ? { sidik: e.payloadHash }
          : tanda
            ? { sidik } // entered by hand: what IRIS holds is not what SeeLabs has
            : null,
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
    penuh: [...penuh],
  };
}

/**
 * Active Asisten who can lend an account to this session: they hold no group
 * in it, their account carries fewer than two other sessions that day, and
 * it isn't already lent to another group here (`untukNomor` is the group
 * being picked for, whose own lender doesn't count against it).
 */
async function pemberiPinjam(
  db: Db,
  data: SesiSeelabs,
  untukNomor?: number,
): Promise<{ pemberi: string[]; tolak: PemberiTolak[] }> {
  const rows = await db
    .select({ nim: asisten.nim })
    .from(asisten)
    .where(eq(asisten.status, "aktif"))
    .orderBy(asc(asisten.kode));
  const pakai = await pemakaianAkunHari(db, data.sesi.tanggal, data.sesi.id);
  const dipinjam = new Map<string, number>();
  for (const g of data.kelompok)
    if (g.pinjam && g.akun && g.nomor !== untukNomor) dipinjam.set(g.akun, g.nomor);
  return pilahPemberi({
    aktif: rows.map((r) => r.nim),
    pegang: new Set(data.kelompok.map((g) => g.penilai).filter((n): n is string => !!n)),
    sesiLain: new Map([...pakai].map(([nim, daftar]) => [nim, daftar.length])),
    dipinjam,
  });
}

/**
 * The lender to suggest first for each group of the session: when its holder
 * covers someone's seat, that someone (user, 2026-10-22), as long as they
 * can lend. Group number to NIM.
 */
async function saranPemberi(
  db: Db,
  data: SesiSeelabs,
  pemberi: readonly string[],
): Promise<Record<number, string>> {
  const j = await jadwalUntuk(db, data.sesi.tanggal, data.sesi.slot);
  if (!j) return {};
  const m = (await muatTanggal(db, [j], new Map([[j.id, data.sesi.tanggal]]))).get(j.id);
  if (!m) return {};
  const orang = await db.select({ nim: asisten.nim, kode: asisten.kode }).from(asisten);
  const saran = saranPinjam(m.kursi, new Map(orang.map((o) => [o.kode.toUpperCase(), o.nim])));
  return Object.fromEntries([...saran].filter(([, nim]) => pemberi.includes(nim)));
}

export async function handleSeelabsGet(req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const sesiId = posInt(req.query.sesiId);
  if (!sesiId) {
    res.status(400).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (await sesiTot(db, sesiId)) {
    res.status(200).json({ ok: false, kode: "sesi_tot" });
    return;
  }
  const data = await muatSeelabs(db, sesiId);
  if (!data) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  const { pemberi, tolak } = await pemberiPinjam(db, data);
  res.status(200).json({
    ok: true,
    ...data,
    pemberi,
    pemberiTolak: tolak,
    saran: await saranPemberi(db, data, pemberi),
  });
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
  if (!sesiId || !nomor || (aksi !== "akun" && aksi !== "manual")) {
    res.status(400).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  if (await sesiTot(db, sesiId)) {
    res.status(200).json({ ok: false, kode: "sesi_tot" });
    return;
  }
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

  // The scorer picks the lender; the full `pair` right covers an Asisten
  // who is away.
  const orang = await muatOrang(session.nim);
  const penuh = !!orang && bolehPenuh(orang, "pair");
  const penilai = g.penilai === session.nim || (!g.penilai && !!orang);
  if (!(penilai || penuh)) {
    res.status(403).json({ ok: false, kode: "bukan_penilai" });
    return;
  }

  const akun = typeof body.akun === "string" && body.akun ? body.akun : null;
  // A lender is only for a group that doesn't ride its scorer's own
  // account: a later group, or any group of a scorer at the daily cap.
  const pasangan = new Map(data.kelompok.map((x) => [x.nomor, x.penilai]));
  const butuh = akunKelompok(pasangan, new Map(), new Set(data.penuh)).get(g.nomor) === null;

  if (aksi === "manual") {
    // "Sudah Kuinput Sendiri": the scorer typed the group into SeeLabs
    // themselves, so IRIS has nothing to send. The account it went through
    // is recorded the same way a lender pick is (Bayar's transfers and the
    // two-sessions count follow it); until a read-back sees the group in
    // SeeLabs, the mark shows as unverified.
    const tandai = body.manual === true;
    if (tandai && g.disimpanPada) {
      res.status(200).json({ ok: false, kode: "sudah_tersimpan" });
      return;
    }
    // Marking needs the lender chosen first when the group rides one; taking
    // the mark back leaves the lender as it was.
    const dipakai = tandai ? (butuh ? akun : null) : g.pinjam ? g.akun : null;
    if (tandai && butuh && !dipakai) {
      res.status(200).json({ ok: false, kode: "butuh_pemberi" });
      return;
    }
    if (
      tandai &&
      dipakai &&
      dipakai !== (g.pinjam ? g.akun : null) &&
      !(await pemberiPinjam(db, data, nomor)).pemberi.includes(dipakai)
    ) {
      res.status(200).json({ ok: false, kode: "pemberi_salah" });
      return;
    }
    await db.insert(sesiKejadian).values({
      sesiId,
      jenis: "akun_seelabs",
      detail: { nomor, akun: dipakai, penilai: g.penilai, manual: tandai },
      aktorNim: session.nim,
    });
    await writeAudit(session.nim, "seelabs_manual", {
      sesiId,
      nomor,
      akun: dipakai,
      manual: tandai,
    });
    res.status(200).json({ ok: true });
    await siarkan(["sesi", "bayar", "nilai", "hadir"]);
    return;
  }

  if (!g.penilai || !butuh) {
    res.status(200).json({ ok: false, kode: "tidak_perlu_pinjam" });
    return;
  }
  // A group marked as input by hand keeps its lender: that is who the
  // Treasurer's transfer goes through.
  if (!akun && g.manual) {
    res.status(200).json({ ok: false, kode: "tanda_manual_aktif" });
    return;
  }
  if (akun && !(await pemberiPinjam(db, data, nomor)).pemberi.includes(akun)) {
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
}
