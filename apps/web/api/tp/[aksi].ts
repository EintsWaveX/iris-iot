/**
 * /api/tp/:aksi — Tugas Pendahuluan (Phase 13), handed in and kept only in
 * IRIS since 2026-10-21 (files on R2, _lib/tp-unggah.ts). The group data
 * lives in api/_lib/tp.ts.
 *
 * Praktikan:
 * GET  /api/tp/saya[?modul=]        my TP per module: window, my file and its
 *      receipt, and my scores once my group's scores were sent (Kirim Nilai).
 *      With ?modul= also the final set's questions in my class's language
 *      (and Mandarin) and the PDF's instructions.
 * GET  /api/tp/berkas?id=&i=[&unduh=1]       my own file (a redirect to R2).
 * GET  /api/tp/kalender              the TP calendar: windows, practicum weeks,
 *      postponed weeks; a Praktikan's own close and practicum day (both roles)
 * POST /api/tp/tiket { modul, ukuran, sha256, halaman }   where to PUT my PDF
 * POST /api/tp/unggah { modul, tiket }       the PDF I put becomes my TP
 * Relay (no session; signed `detak|ts` with KONSOL_RELAY_SECRET):
 * POST /api/tp/detak   the minute timer: the lab clock's automatic starts
 *      (_lib/jam-lab.ts); answers how long the timer may sleep.
 *
 * Asisten:
 * GET  /api/tp/modul?modul=          the module's TP tab: window, counts per
 *      class and the server PC's copy.
 * GET  /api/tp/kelompok?modul=       Penilaian › TP: every slot's groups that
 *      module's week, each member's status and total.
 * GET  /api/tp/praktikan?modul=&nim= the grader: one Praktikan's files,
 *      scores, notes and extension, and whether I may score them.
 * GET  /api/tp/paket?modul=          the module's question bank with its keys
 *      (never to a Praktikan), the final set's pick and who may edit it.
 * GET  /api/tp/praktikum             Penilaian › Praktikum: every session this
 *      semester where I hold a group, with each group's score state.
 * GET  /api/tp/hitung                the navbar badge: my groups' files to grade.
 * GET  /api/tp/kumpul?modul=         who handed in, by class (IRIS's roster)
 * GET  /api/tp/jejak?modul=[&nim=][&n=]   every change to the module's files
 * GET  /api/tp/kabar                    the TP notices and the automatic ones
 * POST /api/tp/kabar { modul|null, jenis, sasaran, judul, isi, mulai?, sampai|null }
 *      or { modul, sasaran: "satu", nim, isi, sampai } a message to one
 *      Praktikan (also for whoever grades their TP)
 * POST /api/tp/kabar-hapus { id }  POST /api/tp/kabar-oto { buka, mepet }
 * GET  /api/tp/pengaturan            Penilaian › Pengaturan TP: Peserta TP,
 *      the default window, the IRIS and SeeLabs cross-check
 * GET  /api/tp/berkas?id=&i=         any Praktikan's file.
 * POST /api/tp/nilai  { modul, nim, nomor, skor|null, catatan? }
 * POST /api/tp/tanda  { modul, nim, kosong }      Tidak Mengumpulkan (all 0)
 * POST /api/tp/telat  { modul, nim, terima }      a late file: accept, or 0
 * POST /api/tp/perpanjang { modul, nim, sampai|null, alasan? }  one
 *      Praktikan's own extension
 * POST /api/tp/jendela { modul, buka, tutup } | { modul, hapus } | { pola }
 *      (the jadwal right)
 * POST /api/tp/paket { modul, versi, varian, pilih, petunjuk }  save the bank
 * POST /api/tp/pilih { modul, versi, pilih }      a new draw or a hand pick
 * POST /api/tp/bawaan { modul }                   back to the default bank
 *      (the three: the jadwal or kode right; versi is the one loaded, and a
 *      newer save refuses it with the latest)
 * POST /api/tp/kecuali { nim, alasan } | { nim, hapus }   leave a registered
 *      Praktikan out of TP, or take them back (the tp right)
 *
 * Only the group's Per Modul seat scores its TP, the same rule as the
 * session's score table. Every write is audited; a complete TP's total
 * goes into the session's TP component.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonBody, noStore, requireMethod } from "../_lib/http.js";
import { currentSession, requireRole } from "../_lib/session.js";
import { muatOrang } from "../_lib/hak.js";
import { denganSiaran } from "../_lib/siaran.js";
import { getDb } from "../../src/lib/db.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import { boleh, hakPenuh, type Orang } from "../../src/lib/hak.js";
import { KUNCI_ROBOT } from "../../src/lib/seelabs-robot.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import {
  asisten,
  nilai,
  nilaiAbsen,
  nilaiKirim,
  pengaturan,
  praktikan,
  sesi,
  sesiAnggota,
  sesiAsisten,
  kelompok,
  jadwal,
  rosterSlot,
  tpJejak,
  tpKabar,
  tpKiriman,
  tpNilai,
  tpPerpanjang,
  tpUnggah,
} from "../../src/lib/schema.js";
import { NILAI_KOMPONEN } from "../../src/lib/nilai-komponen.js";
import {
  ISI_MAKS,
  JENIS_KABAR,
  JUDUL_MAKS,
  judulPesan,
  kabarUntuk,
  type JenisKabar,
  type KabarSimpan,
  type OtoKabar,
} from "../../src/lib/tp-kabar.js";
import {
  JAM_RE,
  POLA_BAWAAN,
  TP_MENUNGGU,
  TANGGAL_RE,
  poinNomor,
  bahasaKelas,
  isoWib,
  jendelaPribadi,
  masukPerpanjangan,
  keadaanJendela,
  kelasTp,
  nomorBeda,
  nomorUntuk,
  statusTp,
  tanpaAsisten,
  telatMenit,
  totalTp,
  tpLengkap,
  type PolaJendela,
} from "../../src/lib/tp.js";
import {
  KUNCI_TP,
  bacaSet,
  hapusPaket,
  jendelaUntuk,
  kelompokTp,
  perpanjangTp,
  muatPaket,
  nimKecuali,
  pemegangTp,
  periksaPetunjuk,
  periksaPilih,
  periksaVarian,
  nimAsistenTim,
  simpanPaket,
  skorModul,
  soalPaket,
  tulisSet,
  tulisTotal,
  type KecualiSet,
  type SetTp,
} from "../_lib/tp.js";
import { ambilIsiTp, bacaR2, mintaTiket, terimaUnggah } from "../_lib/tp-unggah.js";
import { bacaTunda } from "../_lib/modul-tunda.js";
import { acaraKalender } from "../../src/lib/tp-kalender.js";
import { SLOT_MULAI, hariIniWib } from "../../src/lib/jadwal.js";
import { daftarLibur } from "../../src/lib/penugasan-minggu.js";
import { bacaStatusCermin } from "../_lib/tp-cermin.js";
import { batasTidurJamLab, jamLabBilaPerlu } from "../_lib/jam-lab.js";

type Db = ReturnType<typeof getDb>;

const tolak = (res: ApiResponse, kode: string, status = 200) =>
  res.status(status).json({ ok: false, kode });

const modulDari = (v: unknown) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
};

function ringkasJendela(set: SetTp, m: number) {
  const j = jendelaUntuk(set, m);
  return { jendela: j, keadaan: keadaanJendela(j) };
}

/** Registered Praktikan this semester, without the excluded: every TP count's whole. */
async function pesertaTerdaftar(db: Db, set: SetTp): Promise<number> {
  const rows = await db
    .select({ nim: praktikan.nim })
    .from(praktikan)
    .where(eq(praktikan.semester, set.semester));
  const kec = nimKecuali(set);
  return rows.filter((r) => !kec.has(r.nim)).length;
}

/* ============================================================= Praktikan */

async function handleSaya(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const set = await bacaSet(db);
  const satu = modulDari(req.query.modul);
  const modul = satu ? [satu] : [1, 2, 3, 4];
  const [p] = await db
    .select({ kelas: praktikan.kelas })
    .from(praktikan)
    .where(and(eq(praktikan.nim, s.nim), eq(praktikan.semester, set.semester)))
    .limit(1);
  const kiriman = await db
    .select()
    .from(tpKiriman)
    .where(
      and(
        eq(tpKiriman.semester, set.semester),
        eq(tpKiriman.nim, s.nim),
        inArray(tpKiriman.modul, modul),
      ),
    );
  // Sent: the group's scores of that module's session went out (Kirim Nilai).
  const kirim = await db
    .select({ modul: sesi.modul, pada: nilaiKirim.dikirimPada })
    .from(sesiAnggota)
    .innerJoin(sesi, eq(sesi.id, sesiAnggota.sesiId))
    .innerJoin(
      nilaiKirim,
      and(
        eq(nilaiKirim.sesiId, sesiAnggota.sesiId),
        eq(nilaiKirim.kelompokNomor, sesiAnggota.kelompokNomor),
      ),
    )
    .where(and(eq(sesiAnggota.nim, s.nim), ne(sesi.jenis, "tot")));
  const terkirim = new Set(kirim.map((k) => k.modul));
  const unggahan = await db
    .select({
      id: tpUnggah.id,
      modul: tpUnggah.modul,
      sha256: tpUnggah.sha256,
      halaman: tpUnggah.halaman,
      asal: tpUnggah.asal,
    })
    .from(tpUnggah)
    .where(
      and(
        eq(tpUnggah.semester, set.semester),
        eq(tpUnggah.nim, s.nim),
        inArray(tpUnggah.modul, modul),
      ),
    )
    .orderBy(desc(tpUnggah.id));
  const skorRows = await db
    .select()
    .from(tpNilai)
    .where(
      and(
        eq(tpNilai.semester, set.semester),
        eq(tpNilai.nim, s.nim),
        inArray(tpNilai.modul, modul),
      ),
    );
  const kodeRows = await db.select({ nim: asisten.nim, kode: asisten.kode }).from(asisten);
  const kodeOf = new Map(kodeRows.map((a) => [a.nim, a.kode.toUpperCase()]));
  const nomor = nomorUntuk(s.nim);
  const kelas = kelasTp(p?.kelas);
  const perpanjang = await perpanjangTp(db, set);
  const out = modul.map((m) => {
    const umum = ringkasJendela(set, m);
    // Their own extension moves their own close (2026-10-17).
    const sampai = perpanjang.get(m)?.get(s.nim) ?? null;
    const jendela = umum.jendela && jendelaPribadi(umum.jendela, sampai);
    const keadaan = jendela && jendela !== umum.jendela ? keadaanJendela(jendela) : umum.keadaan;
    const k = kiriman.find((x) => x.modul === m);
    const sk = skorRows.filter((r) => r.modul === m);
    const per = Object.fromEntries(sk.map((r) => [r.nomor, r.skor]));
    const lengkap = tpLengkap(per, nomor);
    const telat = telatMenit(k?.dikirimPada?.toISOString() ?? null, jendela);
    const panjang = masukPerpanjangan(k?.dikirimPada?.toISOString() ?? null, umum.jendela, sampai);
    const kirimDone = terkirim.has(m);
    const u = k?.unggahId ? unggahan.find((x) => x.id === k.unggahId) : undefined;
    const oleh = sk.sort((a, b) => b.diubahPada.getTime() - a.diubahPada.getTime())[0]?.diubahOleh;
    return {
      modul: m,
      jendela,
      keadaan,
      status: statusTp({
        adaBerkas: !!k?.berkas.length,
        tanda: k?.tanda ?? null,
        telat: telat !== null,
        panjang,
        lengkap: lengkap && kirimDone,
      }),
      perpanjangan: jendela && jendela !== umum.jendela ? sampai : null,
      berkas: k?.berkas.map((b, i) => ({ i, nama: b.nama, ukuran: b.ukuran, mime: b.mime })) ?? [],
      kirimanId: k?.id ?? null,
      dikirimPada: k?.dikirimPada?.toISOString() ?? null,
      diambilPada: k?.diambilPada?.toISOString() ?? null,
      telatMenit: telat,
      terkirim: kirimDone,
      // Scores only after the group's Kirim Nilai (2026-10-09 rule).
      skor: kirimDone
        ? Object.fromEntries(sk.map((r) => [r.nomor, { skor: r.skor, catatan: r.catatan }]))
        : null,
      total: kirimDone && lengkap ? totalTp(per, nomor) : null,
      dinilaiOleh: kirimDone && oleh ? (kodeOf.get(oleh) ?? null) : null,
      // The receipt: pages and the code (the file's SHA-256, first 8).
      tandaTerima:
        u && k?.berkas.length
          ? { kode: u.sha256.slice(0, 8).toUpperCase(), halaman: u.halaman }
          : null,
      // Registered and the window is open: the upload card takes a file.
      bolehUnggah: !!p && keadaan === "buka",
    };
  });
  // The notices they see now (2026-10-21), in their class's language; their
  // own extension (when it was given) and their score (when it went out).
  const pj = await db
    .select({ modul: tpPerpanjang.modul, sampai: tpPerpanjang.sampai, pada: tpPerpanjang.pada })
    .from(tpPerpanjang)
    .where(and(eq(tpPerpanjang.semester, set.semester), eq(tpPerpanjang.nim, s.nim)));
  const kirimPada = (m: number) =>
    kirim
      .filter((k) => k.modul === m)
      .map((k) => k.pada.toISOString())
      .sort()
      .at(-1);
  const kabar = kabarUntuk({
    simpan: await kabarSemester(db, set.semester, s.nim),
    nim: s.nim,
    oto: await bacaOto(db),
    jendela: new Map(out.map((x) => [x.modul, x.jendela ?? null])),
    belum: new Set(out.filter((x) => x.berkas.length === 0).map((x) => x.modul)),
    kelas,
    now: Date.now(),
    modul: satu ?? undefined,
    pribadi: {
      panjang: new Map(
        pj.map((x) => [x.modul, { sampai: x.sampai.toISOString(), pada: x.pada.toISOString() }]),
      ),
      nilai: new Map(
        out.flatMap((x) => {
          const pada = kirimPada(x.modul);
          return x.total !== null && pada ? [[x.modul, { total: x.total, pada }] as const] : [];
        }),
      ),
    },
  });
  // One module: their own submission history, newest first (2026-10-21).
  const riwayat = satu
    ? (
        await db
          .select()
          .from(tpJejak)
          .where(
            and(
              eq(tpJejak.semester, set.semester),
              eq(tpJejak.modul, satu),
              eq(tpJejak.nim, s.nim),
            ),
          )
          .orderBy(desc(tpJejak.dicatatPada), desc(tpJejak.id))
          .limit(20)
      ).map((r) => ({
        id: r.id,
        jenis: r.jenis,
        berkas: r.berkas.map((b) => b.nama),
        pada: r.dicatatPada.toISOString(),
      }))
    : undefined;
  // One module: its final set, only once its window has opened (open or
  // closed); a module whose window is still ahead or not set yet shows none.
  const kSatu = satu ? keadaanJendela(jendelaUntuk(set, satu)) : null;
  const paket = satu && (kSatu === "buka" || kSatu === "tutup") ? await muatPaket(db, satu) : null;
  res.status(200).json({
    ok: true,
    semester: set.semester,
    kelas,
    nomor,
    soal: paket ? soalPaket(paket, bahasaKelas(kelas)) : undefined,
    soalZh: paket ? soalPaket(paket, "zh") : undefined,
    petunjuk: paket
      ? { [bahasaKelas(kelas)]: paket.petunjuk[bahasaKelas(kelas)], zh: paket.petunjuk.zh }
      : undefined,
    modul: out,
    kabar,
    riwayat,
  });
}

/* ============================================================== the files */

async function handleBerkas(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const id = Number(req.query.id);
  const i = Number(req.query.i ?? 0);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(i) || i < 0)
    return tolak(res, "format_salah");
  const db = getDb();
  const [k] = await db.select().from(tpKiriman).where(eq(tpKiriman.id, id)).limit(1);
  if (!k || (s.role === "praktikan" && k.nim !== s.nim)) return tolak(res, "tidak_ada", 404);
  const b = k.berkas[i];
  if (!b) return tolak(res, "tidak_ada", 404);
  const isi = await ambilIsiTp(db, b);
  if (!isi.ok) return tolak(res, isi.kode, isi.status);
  // A 10-minute read link straight on the relay, which serves ranges and
  // caches, and sandboxes what is not a PDF or an image; nothing streams
  // through this function.
  let url: string;
  try {
    url = await bacaR2(isi.kunci, b.nama, isi.mime || b.mime, req.query.unduh === "1");
  } catch {
    return tolak(res, "penyimpanan_mati", 503);
  }
  res.statusCode = 302;
  res.setHeader("Location", url);
  res.setHeader("Cache-Control", "private, no-store");
  res.end();
}

/** Step 1 of an upload: where to PUT the file (_lib/tp-unggah.ts). */
async function handleTiket(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  if (!m) return tolak(res, "format_salah");
  const db = getDb();
  const r = await mintaTiket(db, await bacaSet(db), s.nim, m, {
    ukuran: b.ukuran,
    sha256: b.sha256,
    halaman: b.halaman,
  });
  if (!r.ok) return tolak(res, r.kode);
  res.status(200).json(r);
}

/** Step 2: the file the page put in R2 becomes the Praktikan's TP. */
async function handleUnggah(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  if (!m) return tolak(res, "format_salah");
  const db = getDb();
  const r = await terimaUnggah(db, await bacaSet(db), s.nim, m, b.tiket);
  if (!r.ok) return tolak(res, r.kode);
  if (!r.sama)
    await writeAudit(s.nim, "tp_unggah", {
      modul: m,
      ukuran: r.ukuran,
      halaman: r.halaman,
      id: r.id,
    });
  res.status(200).json(r);
}

/* ================================================================ Asisten */

async function handleModul(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const m = modulDari(req.query.modul);
  if (!m) return tolak(res, "format_salah");
  const db = getDb();
  const set = await bacaSet(db);
  const orang = await muatOrang(s.nim);
  const kiriman = await db
    .select({ nim: tpKiriman.nim, berkas: tpKiriman.berkas })
    .from(tpKiriman)
    .where(and(eq(tpKiriman.semester, set.semester), eq(tpKiriman.modul, m)));
  const kelasOf = new Map(
    (
      await db
        .select({ nim: praktikan.nim, kelas: praktikan.kelas })
        .from(praktikan)
        .where(eq(praktikan.semester, set.semester))
    ).map((p) => [p.nim, p.kelas]),
  );
  const cermin = Object.entries(await bacaStatusCermin(db)).map(([serverId, c]) => ({
    serverId: Number(serverId),
    ...c,
  }));
  const { per } = await skorModul(db, set.semester, m);
  const dinilai = [...per].filter(([nim, sk]) => tpLengkap(sk, nomorUntuk(nim))).length;
  const kec = new Set([...nimKecuali(set), ...(await nimAsistenTim(db))]);
  // Per class, IRIS's own (Reguler and INT, 2026-10-21; it was the LMS's).
  const perKursus = (["reguler", "internasional"] as const).map((kelas) => {
    const nim = [...kelasOf].filter(([n, k]) => k === kelas && !kec.has(n)).map(([n]) => n);
    const ada = new Set(nim);
    return {
      label: kelas === "reguler" ? "Reguler" : "INT",
      peserta: nim.length,
      masuk: kiriman.filter((x) => ada.has(x.nim) && x.berkas.length).length,
      ada: true,
    };
  });
  res.status(200).json({
    ok: true,
    ...ringkasJendela(set, m),
    pola: set.jendela.pola,
    masuk: kiriman.filter((x) => x.berkas.length && !kec.has(x.nim)).length,
    // The registered Praktikan (IRIS's roster), not the LMS's lists.
    peserta: await pesertaTerdaftar(db, set),
    dinilai,
    perKursus,
    iris: { jumlah: kiriman.filter((x) => x.berkas.length).length },
    cermin,
    bolehUbah: !!orang && boleh(orang, "jadwal"),
    bolehKelola: !!orang && boleh(orang, "tp"),
  });
}

async function handleKelompok(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const m = modulDari(req.query.modul);
  if (!m) return tolak(res, "format_salah");
  const db = getDb();
  const set = await bacaSet(db);
  const data = await kelompokTp(db, set, m, s.nim);
  // Each module's state for the module picker.
  const modul = [1, 2, 3, 4].map((x) => ({ modul: x, ...ringkasJendela(set, x) }));
  const orang = await muatOrang(s.nim);
  res.status(200).json({
    ok: true,
    ...ringkasJendela(set, m),
    modul,
    ...data,
    bolehKelola: !!orang && boleh(orang, "tp"),
    // Groups with no Per Modul seat and Tanpa Kelompok: Admin and Pencipta.
    bolehTanpaPemegang: !!orang && hakPenuh(orang),
  });
}

/** Whether `me` may score `nim`'s TP for `modul`, and who holds them: only
 *  the Per Modul seat; a group with no seat, or a Praktikan in no group, is
 *  the Admin's and the Pencipta's (user, 2026-10-20). */
async function hakNilai(db: Db, set: SetTp, modul: number, nim: string, me: string) {
  const p = await pemegangTp(db, set, modul, nim);
  const holder = p?.nim ?? null;
  if (holder) return { boleh: holder === me, pemegang: holder };
  const orang = await muatOrang(me);
  return { boleh: !!orang && hakPenuh(orang), pemegang: null };
}

async function handlePraktikan(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const m = modulDari(req.query.modul);
  const nim = typeof req.query.nim === "string" ? req.query.nim.trim() : "";
  if (!m || !nim) return tolak(res, "format_salah");
  const db = getDb();
  const set = await bacaSet(db);
  const [k] = await db
    .select()
    .from(tpKiriman)
    .where(
      and(eq(tpKiriman.semester, set.semester), eq(tpKiriman.modul, m), eq(tpKiriman.nim, nim)),
    )
    .limit(1);
  const sk = await db
    .select()
    .from(tpNilai)
    .where(and(eq(tpNilai.semester, set.semester), eq(tpNilai.modul, m), eq(tpNilai.nim, nim)));
  const [p] = await db
    .select({ kelas: praktikan.kelas, nama: praktikan.nama })
    .from(praktikan)
    .where(and(eq(praktikan.nim, nim), eq(praktikan.semester, set.semester)))
    .limit(1);
  const hak = await hakNilai(db, set, m, nim, s.nim);
  const kodeOf = await petaKode(db);
  const lain = (oleh: string) => !!hak.pemegang && oleh !== hak.pemegang && kodeOf.has(oleh);
  const { jendela, keadaan } = ringkasJendela(set, m);
  const sampai = (await perpanjangTp(db, set)).get(m)?.get(nim) ?? null;
  const pada = k?.dikirimPada?.toISOString() ?? null;
  const [pj] = await db
    .select({ sampai: tpPerpanjang.sampai, alasan: tpPerpanjang.alasan, oleh: tpPerpanjang.oleh })
    .from(tpPerpanjang)
    .where(
      and(
        eq(tpPerpanjang.semester, set.semester),
        eq(tpPerpanjang.modul, m),
        eq(tpPerpanjang.nim, nim),
      ),
    )
    .limit(1);
  // The SeeLabs read-back's copy of their session TP stays until graded here.
  const salin = (
    await db
      .select({ skor: nilai.skor, tanggal: sesi.tanggal })
      .from(nilai)
      .innerJoin(sesi, eq(sesi.id, nilai.sesiId))
      .where(
        and(
          eq(nilai.nim, nim),
          eq(nilai.komponen, "TP"),
          eq(nilai.diubahOleh, "seelabs"),
          eq(sesi.modul, m),
          ne(sesi.jenis, "tot"),
        ),
      )
      .orderBy(desc(nilai.diubahPada))
  ).find((r) => semesterDariTanggal(r.tanggal) === set.semester);
  res.status(200).json({
    ok: true,
    nim,
    nama: p?.nama ?? nim,
    kelas: kelasTp(p?.kelas),
    nomor: nomorUntuk(nim),
    keadaan,
    kiriman: k
      ? {
          id: k.id,
          berkas: k.berkas.map((b, i) => ({ i, nama: b.nama, ukuran: b.ukuran, mime: b.mime })),
          dikirimPada: k.dikirimPada?.toISOString() ?? null,
          // Late against their own close; in on an extension is not late.
          telatMenit: telatMenit(pada, jendela && jendelaPribadi(jendela, sampai)),
          perpanjangan: masukPerpanjangan(pada, jendela, sampai) ? sampai : null,
          terimaTelat: k.terimaTelat,
          tanda: k.tanda,
          sumber: k.sumber,
        }
      : null,
    skor: Object.fromEntries(
      sk.map((r) => [
        r.nomor,
        {
          skor: r.skor,
          catatan: r.catatan,
          oleh: r.diubahOleh,
          // Given by someone else before the Per Modul list changed.
          lain: lain(r.diubahOleh) ? kodeOf.get(r.diubahOleh)! : null,
        },
      ]),
    ),
    tpSeelabs: salin?.skor ?? null,
    // Their own extension (2026-10-21, kept in IRIS).
    perpanjang: pj
      ? { sampai: pj.sampai.toISOString(), alasan: pj.alasan, oleh: pj.oleh }
      : sampai
        ? { sampai, alasan: null, oleh: null }
        : null,
    ...hak,
    pemegangKode: hak.pemegang ? (kodeOf.get(hak.pemegang) ?? hak.pemegang) : null,
  });
}

/* ------------------------------------------------------- the question bank */

/** Who may edit a TP bank: the jadwal right (module content) or kode
 *  (the ASO division's journal code). */
const bolehSoal = (o: Orang | null) => !!o && (boleh(o, "jadwal") || boleh(o, "kode"));

async function handlePaket(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const m = modulDari(req.query.modul);
  if (!m) return tolak(res, "format_salah");
  const db = getDb();
  const [set, paket, orang] = await Promise.all([bacaSet(db), muatPaket(db, m), muatOrang(s.nim)]);
  const [oleh] = paket.diubahOleh
    ? await db
        .select({ kode: asisten.kode, nama: asisten.nama })
        .from(asisten)
        .where(eq(asisten.nim, paket.diubahOleh))
        .limit(1)
    : [];
  res.status(200).json({
    ok: true,
    paket: {
      ...paket,
      diubahOleh: oleh ? { kode: oleh.kode.toUpperCase(), nama: oleh.nama } : null,
    },
    beda: nomorBeda(paket.varian),
    ...ringkasJendela(set, m),
    semester: set.semester,
    bolehUbah: bolehSoal(orang),
  });
}

/** The edit right and the module, or the refusal already sent. */
async function bolehUbahSoal(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  if (!m) {
    tolak(res, "format_salah");
    return null;
  }
  if (!bolehSoal(await muatOrang(s.nim))) {
    tolak(res, "tidak_berhak", 403);
    return null;
  }
  const versi = Number(b.versi);
  return { b, m, versi: Number.isInteger(versi) && versi >= 0 ? versi : -1 };
}

async function handleSimpanPaket(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const x = await bolehUbahSoal(req, res, s);
  if (!x) return;
  const varian = periksaVarian(x.b.varian);
  const pilih = varian && periksaPilih(x.b.pilih, varian.length);
  const petunjuk = periksaPetunjuk(x.b.petunjuk);
  if (!varian || !pilih || !petunjuk || x.versi < 0) return tolak(res, "format_salah");
  const db = getDb();
  const r = await simpanPaket(db, x.m, { varian, pilih, petunjuk }, x.versi, s.nim);
  if (!r.ok) return res.status(200).json({ ok: false, kode: "versi_berubah", terbaru: r.terbaru });
  await writeAudit(s.nim, "tp_paket", { modul: x.m, varian: varian.length, versi: r.versi });
  res.status(200).json({ ok: true, versi: r.versi });
}

async function handlePilih(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const x = await bolehUbahSoal(req, res, s);
  if (!x) return;
  const db = getDb();
  const paket = await muatPaket(db, x.m);
  const pilih = periksaPilih(x.b.pilih, paket.varian.length);
  if (!pilih || x.versi < 0) return tolak(res, "format_salah");
  if (x.versi !== paket.versi)
    return res.status(200).json({ ok: false, kode: "versi_berubah", terbaru: paket });
  const r = await simpanPaket(
    db,
    x.m,
    { varian: paket.varian, pilih, petunjuk: paket.petunjuk },
    x.versi,
    s.nim,
  );
  if (!r.ok) return res.status(200).json({ ok: false, kode: "versi_berubah", terbaru: r.terbaru });
  await writeAudit(s.nim, "tp_pilih", { modul: x.m, pilih });
  res.status(200).json({ ok: true, versi: r.versi });
}

async function handleBawaan(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const x = await bolehUbahSoal(req, res, s);
  if (!x) return;
  await hapusPaket(getDb(), x.m);
  await writeAudit(s.nim, "tp_bawaan", { modul: x.m });
  res.status(200).json({ ok: true, versi: 0 });
}

/** Penilaian › Praktikum: every session this semester where I hold a group. */
async function handlePraktikum(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const set = await bacaSet(db);
  const mine = await db
    .select({
      sesiId: sesi.id,
      tanggal: sesi.tanggal,
      slot: sesi.slot,
      mulai: sesi.mulai,
      modul: sesi.modul,
      kelas: sesi.kelas,
      status: sesi.status,
      jenis: sesi.jenis,
      nomor: kelompok.nomor,
    })
    .from(sesiAsisten)
    .innerJoin(sesi, eq(sesi.id, sesiAsisten.sesiId))
    .innerJoin(kelompok, eq(kelompok.id, sesiAsisten.kelompokId))
    .where(
      and(
        eq(sesiAsisten.asistenNim, s.nim),
        ne(sesi.jenis, "tot"),
        inArray(sesi.status, ["berjalan", "selesai"]),
      ),
    )
    .orderBy(desc(sesi.tanggal), desc(sesi.slot), asc(kelompok.nomor));
  const rows = mine.filter((r) => semesterDariTanggal(r.tanggal) === set.semester);
  const ids = [...new Set(rows.map((r) => r.sesiId))];
  const [anggota, skor, absen, kirim] = ids.length
    ? await Promise.all([
        db
          .select({
            sesiId: sesiAnggota.sesiId,
            nomor: sesiAnggota.kelompokNomor,
            nim: sesiAnggota.nim,
          })
          .from(sesiAnggota)
          .where(inArray(sesiAnggota.sesiId, ids)),
        db
          .select({ sesiId: nilai.sesiId, nim: nilai.nim, komponen: nilai.komponen })
          .from(nilai)
          .where(inArray(nilai.sesiId, ids)),
        db
          .select({ sesiId: nilaiAbsen.sesiId, nim: nilaiAbsen.nim })
          .from(nilaiAbsen)
          .where(inArray(nilaiAbsen.sesiId, ids)),
        db
          .select({ sesiId: nilaiKirim.sesiId, nomor: nilaiKirim.kelompokNomor })
          .from(nilaiKirim)
          .where(inArray(nilaiKirim.sesiId, ids)),
      ])
    : [[], [], [], []];
  // L1 is never missing: unless typed it is the system's (rubric), so only
  // the other components are counted.
  const diisi = new Map<string, number>();
  for (const r of skor)
    if (r.komponen !== "L1")
      diisi.set(`${r.sesiId}|${r.nim}`, (diisi.get(`${r.sesiId}|${r.nim}`) ?? 0) + 1);
  const absenSet = new Set(absen.map((a) => `${a.sesiId}|${a.nim}`));
  const kirimSet = new Set(kirim.map((k) => `${k.sesiId}|${k.nomor}`));
  const sesiList = ids.map((id) => {
    const r0 = rows.find((r) => r.sesiId === id)!;
    const grup = rows
      .filter((r) => r.sesiId === id)
      .map((r) => {
        const ms = anggota.filter((a) => a.sesiId === id && a.nomor === r.nomor);
        const lengkap = ms.filter(
          (a) =>
            absenSet.has(`${id}|${a.nim}`) ||
            (diisi.get(`${id}|${a.nim}`) ?? 0) >= NILAI_KOMPONEN.length - 1,
        ).length;
        const state = kirimSet.has(`${id}|${r.nomor}`)
          ? "sent"
          : ms.length && lengkap === ms.length
            ? "ready"
            : "todo";
        return { nomor: r.nomor, anggota: ms.length, lengkap, status: state };
      });
    return {
      sesiId: id,
      tanggal: r0.tanggal,
      slot: r0.slot,
      mulai: r0.mulai,
      modul: r0.modul,
      kelas: r0.kelas,
      jenis: r0.jenis,
      berjalan: r0.status === "berjalan",
      kelompok: grup,
    };
  });
  res.status(200).json({ ok: true, semester: set.semester, sesi: sesiList });
}

async function handleHitung(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const set = await bacaSet(db);
  let n = 0;
  for (const m of [1, 2, 3, 4]) {
    const k = keadaanJendela(jendelaUntuk(set, m));
    if (!k || k === "belum") continue;
    const d = await kelompokTp(db, set, m, s.nim);
    n += d.hitung.perluNilaiku;
  }
  res.setHeader("Cache-Control", "private, max-age=60");
  res.status(200).json({ ok: true, perluNilai: n });
}

/* ------------------------------------------------------------- scoring */

async function handleNilai(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  const nim = typeof b.nim === "string" ? b.nim.trim() : "";
  const nomor = Number(b.nomor);
  const skor = b.skor === null ? null : Number(b.skor);
  const catatan =
    typeof b.catatan === "string" ? b.catatan.trim().slice(0, 500) || null : undefined;
  if (
    !m ||
    !nim ||
    !nomorUntuk(nim).includes(nomor) ||
    (skor !== null && (!Number.isFinite(skor) || skor < 0 || skor > poinNomor(nomor)))
  )
    return tolak(res, "format_salah");
  const db = getDb();
  const set = await bacaSet(db);
  const hak = await hakNilai(db, set, m, nim, s.nim);
  if (!hak.boleh)
    return res.status(200).json({ ok: false, kode: "bukan_pemegang", pemegang: hak.pemegang });
  const [k] = await db
    .select()
    .from(tpKiriman)
    .where(
      and(eq(tpKiriman.semester, set.semester), eq(tpKiriman.modul, m), eq(tpKiriman.nim, nim)),
    )
    .limit(1);
  const umum = jendelaUntuk(set, m);
  // A file in on the Praktikan's own extension needs no Terima Telat.
  const j = umum && jendelaPribadi(umum, (await perpanjangTp(db, set)).get(m)?.get(nim));
  if (k && telatMenit(k.dikirimPada?.toISOString() ?? null, j) !== null && k.terimaTelat !== true)
    return tolak(res, "telat_belum_diterima");
  const kunci = and(
    eq(tpNilai.semester, set.semester),
    eq(tpNilai.modul, m),
    eq(tpNilai.nim, nim),
    eq(tpNilai.nomor, nomor),
  );
  if (skor === null) {
    await db.delete(tpNilai).where(kunci);
  } else {
    const v = Math.round(skor * 10) / 10;
    await db
      .insert(tpNilai)
      .values({
        semester: set.semester,
        modul: m,
        nim,
        nomor,
        skor: v,
        catatan: catatan ?? null,
        diubahOleh: s.nim,
      })
      .onConflictDoUpdate({
        target: [tpNilai.semester, tpNilai.modul, tpNilai.nim, tpNilai.nomor],
        set: {
          skor: v,
          ...(catatan !== undefined ? { catatan } : {}),
          diubahOleh: s.nim,
          diubahPada: new Date(),
        },
      });
  }
  const total = await tulisTotal(db, set.semester, m, nim, s.nim);
  await writeAudit(s.nim, "tp_nilai_set", { modul: m, nim, nomor, skor });
  res.status(200).json({ ok: true, total });
}

/** Every question this NIM answers set to 0 (or the zeros taken off). */
async function nolSemua(db: Db, set: SetTp, m: number, nim: string, oleh: string, nol: boolean) {
  const nomor = nomorUntuk(nim);
  if (nol) {
    await db
      .insert(tpNilai)
      .values(
        nomor.map((no) => ({
          semester: set.semester,
          modul: m,
          nim,
          nomor: no,
          skor: 0,
          diubahOleh: oleh,
        })),
      )
      .onConflictDoUpdate({
        target: [tpNilai.semester, tpNilai.modul, tpNilai.nim, tpNilai.nomor],
        set: { skor: 0, diubahOleh: oleh, diubahPada: new Date() },
      });
  } else {
    await db
      .delete(tpNilai)
      .where(
        and(
          eq(tpNilai.semester, set.semester),
          eq(tpNilai.modul, m),
          eq(tpNilai.nim, nim),
          eq(tpNilai.skor, 0),
        ),
      );
  }
  await tulisTotal(db, set.semester, m, nim, oleh);
}

async function handleTanda(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  const nim = typeof b.nim === "string" ? b.nim.trim() : "";
  if (!m || !nim || typeof b.kosong !== "boolean") return tolak(res, "format_salah");
  const db = getDb();
  const set = await bacaSet(db);
  if (b.kosong && keadaanJendela(jendelaUntuk(set, m)) !== "tutup")
    return tolak(res, "belum_tutup");
  const hak = await hakNilai(db, set, m, nim, s.nim);
  if (!hak.boleh)
    return res.status(200).json({ ok: false, kode: "bukan_pemegang", pemegang: hak.pemegang });
  await db
    .insert(tpKiriman)
    .values({
      semester: set.semester,
      modul: m,
      nim,
      tanda: b.kosong ? "kosong" : null,
      ditandaiOleh: s.nim,
    })
    .onConflictDoUpdate({
      target: [tpKiriman.semester, tpKiriman.modul, tpKiriman.nim],
      set: { tanda: b.kosong ? "kosong" : null, ditandaiOleh: s.nim },
    });
  await nolSemua(db, set, m, nim, s.nim, b.kosong);
  await writeAudit(s.nim, "tp_tanda", { modul: m, nim, kosong: b.kosong });
  res.status(200).json({ ok: true });
}

async function handleTelat(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  const nim = typeof b.nim === "string" ? b.nim.trim() : "";
  if (!m || !nim || typeof b.terima !== "boolean") return tolak(res, "format_salah");
  const db = getDb();
  const set = await bacaSet(db);
  const hak = await hakNilai(db, set, m, nim, s.nim);
  if (!hak.boleh)
    return res.status(200).json({ ok: false, kode: "bukan_pemegang", pemegang: hak.pemegang });
  const upd = await db
    .update(tpKiriman)
    .set({ terimaTelat: b.terima })
    .where(
      and(eq(tpKiriman.semester, set.semester), eq(tpKiriman.modul, m), eq(tpKiriman.nim, nim)),
    )
    .returning({ id: tpKiriman.id });
  if (!upd.length) return tolak(res, "tidak_ada");
  // Refused: the TP scores 0 and the file stays as a record.
  await nolSemua(db, set, m, nim, s.nim, !b.terima);
  await writeAudit(s.nim, "tp_telat", { modul: m, nim, terima: b.terima });
  res.status(200).json({ ok: true });
}

/**
 * One Praktikan's own extension (2026-10-21, in IRIS now): their window
 * closes at `sampai`; null takes it back. The group's TP grader, the TP
 * right, or an Admin.
 */
async function handlePerpanjang(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  const nim = typeof b.nim === "string" ? b.nim.trim() : "";
  const hapus = b.sampai === null;
  const sampai = typeof b.sampai === "string" ? new Date(b.sampai) : null;
  const alasan = typeof b.alasan === "string" ? b.alasan.trim().slice(0, 200) : "";
  if (!m || !nim || (!hapus && (!sampai || Number.isNaN(sampai.getTime()))))
    return tolak(res, "format_salah");
  if (sampai && sampai.getTime() <= Date.now()) return tolak(res, "sudah_lewat");
  const db = getDb();
  const set = await bacaSet(db);
  // Only the TP right (ASO) and the Admin tier give extensions, not whoever
  // holds the group's seat (2026-10-25); the right can still be overridden.
  const orang = await muatOrang(s.nim);
  if (!orang || !(boleh(orang, "tp") || hakPenuh(orang)))
    return res.status(200).json({ ok: false, kode: "bukan_pemegang", pemegang: null });
  const [p] = await db
    .select({ nim: praktikan.nim })
    .from(praktikan)
    .where(and(eq(praktikan.semester, set.semester), eq(praktikan.nim, nim)))
    .limit(1);
  if (!p) return tolak(res, "bukan_praktikan");
  const kunci = and(
    eq(tpPerpanjang.semester, set.semester),
    eq(tpPerpanjang.modul, m),
    eq(tpPerpanjang.nim, nim),
  );
  if (hapus) await db.delete(tpPerpanjang).where(kunci);
  else
    await db
      .insert(tpPerpanjang)
      .values({
        semester: set.semester,
        modul: m,
        nim,
        sampai: sampai!,
        alasan: alasan || null,
        oleh: s.nim,
      })
      .onConflictDoUpdate({
        target: [tpPerpanjang.semester, tpPerpanjang.modul, tpPerpanjang.nim],
        set: { sampai: sampai!, alasan: alasan || null, oleh: s.nim, pada: new Date() },
      });
  await writeAudit(s.nim, "tp_perpanjang", {
    modul: m,
    nim,
    sampai: sampai?.toISOString() ?? null,
    alasan: alasan || null,
  });
  res.status(200).json({ ok: true, sampai: sampai?.toISOString() ?? null });
}

/** One extension for every Praktikan in TP on a module (2026-10-25): the TP
 *  right and Admins reopen it for everyone. Those left out of TP and the
 *  Asisten's own are skipped, and a later extension already there stays. */
async function handlePerpanjangSemua(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  const sampai = typeof b.sampai === "string" ? new Date(b.sampai) : null;
  const alasan = typeof b.alasan === "string" ? b.alasan.trim().slice(0, 200) : "";
  if (!m || !sampai || Number.isNaN(sampai.getTime())) return tolak(res, "format_salah");
  if (sampai.getTime() <= Date.now()) return tolak(res, "sudah_lewat");
  const orang = await muatOrang(s.nim);
  if (!orang || !(boleh(orang, "tp") || hakPenuh(orang)))
    return res.status(200).json({ ok: false, kode: "bukan_pemegang", pemegang: null });
  const db = getDb();
  const set = await bacaSet(db);
  const lewati = new Set([...nimKecuali(set), ...(await nimAsistenTim(db))]);
  const nims = (
    await db
      .select({ nim: praktikan.nim })
      .from(praktikan)
      .where(eq(praktikan.semester, set.semester))
  )
    .map((p) => p.nim)
    .filter((n) => !lewati.has(n));
  if (nims.length)
    await db
      .insert(tpPerpanjang)
      .values(
        nims.map((nim) => ({
          semester: set.semester,
          modul: m,
          nim,
          sampai,
          alasan: alasan || null,
          oleh: s.nim,
        })),
      )
      .onConflictDoUpdate({
        target: [tpPerpanjang.semester, tpPerpanjang.modul, tpPerpanjang.nim],
        set: {
          sampai: sql`greatest(${tpPerpanjang.sampai}, excluded.sampai)`,
          alasan: sql`case when excluded.sampai > ${tpPerpanjang.sampai} then excluded.alasan else ${tpPerpanjang.alasan} end`,
          oleh: sql`case when excluded.sampai > ${tpPerpanjang.sampai} then excluded.oleh else ${tpPerpanjang.oleh} end`,
          pada: new Date(),
        },
      });
  await writeAudit(s.nim, "tp_perpanjang_semua", {
    modul: m,
    sampai: sampai.toISOString(),
    alasan: alasan || null,
    jumlah: nims.length,
  });
  res.status(200).json({ ok: true, jumlah: nims.length, sampai: sampai.toISOString() });
}

/* ------------------------------------------------------------ settings */

async function handleJendela(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const orang = await muatOrang(s.nim);
  if (!orang) return tolak(res, "tidak_berhak", 403);
  const db = getDb();
  const set = await bacaSet(db);
  if (b.pola !== undefined) {
    if (!boleh(orang, "jadwal")) return tolak(res, "tidak_berhak", 403);
    const p = b.pola as Partial<PolaJendela>;
    const hari = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 7;
    if (
      !p ||
      !hari(p.hariBuka) ||
      !hari(p.hariTutup) ||
      !JAM_RE.test(String(p.jamBuka)) ||
      !JAM_RE.test(String(p.jamTutup))
    )
      return tolak(res, "format_salah");
    const pola: PolaJendela = {
      hariBuka: p.hariBuka!,
      jamBuka: p.jamBuka!,
      hariTutup: p.hariTutup!,
      jamTutup: p.jamTutup!,
    };
    await tulisSet(db, KUNCI_TP.jendela, { ...set.jendela, pola }, s.nim);
    await writeAudit(s.nim, "tp_jendela", { pola });
    return res.status(200).json({ ok: true });
  }
  if (!boleh(orang, "jadwal")) return tolak(res, "tidak_berhak", 403);
  const m = modulDari(b.modul);
  if (!m) return tolak(res, "format_salah");
  const modul = { ...set.jendela.modul };
  if (b.hapus === true) delete modul[String(m)];
  else {
    const bagian = (v: unknown) => {
      const o = v as { tanggal?: unknown; jam?: unknown } | undefined;
      return o && TANGGAL_RE.test(String(o.tanggal)) && JAM_RE.test(String(o.jam))
        ? isoWib(String(o.tanggal), String(o.jam))
        : null;
    };
    const buka = bagian(b.buka);
    const tutup = bagian(b.tutup);
    if (!buka || !tutup || Date.parse(tutup) <= Date.parse(buka)) return tolak(res, "format_salah");
    modul[String(m)] = { buka, tutup };
  }
  await tulisSet(db, KUNCI_TP.jendela, { ...set.jendela, modul }, s.nim);
  await writeAudit(s.nim, "tp_jendela", { modul: m, ...modul[String(m)] });
  res.status(200).json({ ok: true });
}

async function petaKode(db: Db): Promise<Map<string, string>> {
  const rows = await db.select({ nim: asisten.nim, kode: asisten.kode }).from(asisten);
  return new Map(rows.map((a) => [a.nim, a.kode.toUpperCase()]));
}

/**
 * Silang Data on Pengaturan TP: who is registered where. SeeLabs from the
 * robot's last KLP pull, and the registered Praktikan who are Asisten as
 * well (five of them on 2026-10-13).
 */
async function silangData(db: Db, set: SetTp, kodeOf: Map<string, string>) {
  const semua = await db
    .select({ nim: praktikan.nim, nama: praktikan.nama, kelas: praktikan.kelas })
    .from(praktikan)
    .where(eq(praktikan.semester, set.semester));
  // The Asisten registered as Praktikan too are listed as both below and
  // counted on neither side (2026-10-18).
  const tim = await nimAsistenTim(db);
  const terdaftar = tanpaAsisten(semua, tim);
  const iris = new Set(terdaftar.map((p) => p.nim));
  const [klp] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_ROBOT.kelompok))
    .limit(1);
  const tarik = klp?.nilai as
    | { pada: string; kelompok: Record<string, { anggota?: { nim: string; nama: string }[] }[]> }
    | undefined;
  let seelabs = null;
  if (tarik?.kelompok) {
    const orang = new Map<string, string>();
    for (const daftar of Object.values(tarik.kelompok))
      for (const g of daftar)
        for (const a of g.anggota ?? []) if (!tim.has(a.nim)) orang.set(a.nim, a.nama);
    seelabs = {
      pada: tarik.pada,
      total: orang.size,
      klp: Object.values(tarik.kelompok).reduce((n, d) => n + d.length, 0),
      bukanIris: [...orang].filter(([nim]) => !iris.has(nim)).map(([nim, nama]) => ({ nim, nama })),
      tanpaSeelabs: terdaftar
        .filter((p) => !orang.has(p.nim))
        .map((p) => ({ nim: p.nim, nama: p.nama, kelas: p.kelas })),
    };
  }
  const juga = semua
    .filter((p) => tim.has(p.nim) && kodeOf.has(p.nim))
    .map((p) => ({
      nim: p.nim,
      nama: p.nama,
      kode: kodeOf.get(p.nim)!,
      kelas: p.kelas,
    }));
  return { iris: terdaftar.length, seelabs, asisten: juga };
}

/** Leave a registered Praktikan out of TP, or take them back. */
async function handleKecuali(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const orang = await muatOrang(s.nim);
  if (!orang || !boleh(orang, "tp")) return tolak(res, "tidak_berhak", 403);
  const b = jsonBody(req);
  const nim = typeof b.nim === "string" ? b.nim.trim() : "";
  if (!/^\d{6,15}$/.test(nim)) return tolak(res, "format_salah");
  const db = getDb();
  const set = await bacaSet(db);
  const daftar = set.kecuali.filter((k) => k.nim !== nim);
  if (b.hapus !== true) {
    const [p] = await db
      .select({ nim: praktikan.nim })
      .from(praktikan)
      .where(and(eq(praktikan.semester, set.semester), eq(praktikan.nim, nim)))
      .limit(1);
    if (!p) return tolak(res, "bukan_praktikan");
    const alasan = typeof b.alasan === "string" ? b.alasan.trim().slice(0, 200) : "";
    daftar.push({ nim, alasan, oleh: s.nim, pada: new Date().toISOString() });
  }
  const nilaiBaru: KecualiSet = { semester: set.semester, daftar };
  await tulisSet(db, KUNCI_TP.kecuali, nilaiBaru, s.nim);
  await writeAudit(s.nim, "tp_kecuali", { nim, hapus: b.hapus === true });
  res.status(200).json({ ok: true, jumlah: daftar.length });
}

/* ------------------------------------------------- Penilaian's lists */

/** IRIS's two classes, in the shape the lists use (2026-10-21). */
const KELAS = [
  { id: 1, label: "Reguler", kelas: "reguler" },
  { id: 2, label: "INT", kelas: "internasional" },
] as const;
const kelasId = (k: string | null | undefined) => (k === "internasional" ? 2 : 1);

/**
 * Who handed in this module's TP, among the Praktikan registered in IRIS
 * (the excluded and the Asisten left out): their class, the newest file's
 * time, and whether it came after their own close.
 */
async function handleKumpul(req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const set = await bacaSet(db);
  const m = modulDari(req.query.modul) ?? 1;
  const j = jendelaUntuk(set, m);
  const kec = new Set([...nimKecuali(set), ...(await nimAsistenTim(db))]);
  const [kiriman, terdaftar] = await Promise.all([
    db
      .select({
        nim: tpKiriman.nim,
        berkas: tpKiriman.berkas,
        pada: tpKiriman.dikirimPada,
        tanda: tpKiriman.tanda,
      })
      .from(tpKiriman)
      .where(and(eq(tpKiriman.semester, set.semester), eq(tpKiriman.modul, m))),
    db
      .select({ nim: praktikan.nim, nama: praktikan.nama, kelas: praktikan.kelas })
      .from(praktikan)
      .where(eq(praktikan.semester, set.semester)),
  ]);
  const kirOf = new Map(kiriman.map((x) => [x.nim, x]));
  const sampaiOf = (await perpanjangTp(db, set)).get(m) ?? new Map<string, string>();
  const baris = terdaftar
    .filter((p) => !kec.has(p.nim))
    .map((p) => {
      const x = kirOf.get(p.nim);
      const ada = !!x && x.berkas.length > 0;
      const pada = ada ? (x.pada?.toISOString() ?? null) : null;
      const sampai = sampaiOf.get(p.nim);
      return {
        nim: p.nim,
        nama: p.nama,
        kursus: kelasId(p.kelas),
        status: ada ? "sudah" : x?.tanda === "kosong" ? "kosong" : "belum",
        pada,
        sumber: ada ? ("iris" as const) : null,
        // Late against their own close; in on an extension is Diperpanjang.
        telat: !!j && telatMenit(pada, jendelaPribadi(j, sampai)) !== null,
        panjang: masukPerpanjangan(pada, j, sampai),
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  res.status(200).json({ ok: true, modul: m, jendela: j, kelas: KELAS, baris });
}

/** Every change to this module's TP files, newest first (tp_jejak). */
async function handleJejak(req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const set = await bacaSet(db);
  const m = modulDari(req.query.modul) ?? 1;
  const nim = typeof req.query.nim === "string" ? req.query.nim.slice(0, 20) : null;
  // n: only the newest few (the live card's Baru Masuk), else up to 500.
  const batas = Math.min(500, Math.max(1, Math.floor(Number(req.query.n)) || 500));
  const kec = nimKecuali(set);
  const [rows, terdaftar] = await Promise.all([
    db
      .select()
      .from(tpJejak)
      .where(
        and(
          eq(tpJejak.semester, set.semester),
          eq(tpJejak.modul, m),
          ...(nim ? [eq(tpJejak.nim, nim)] : []),
        ),
      )
      .orderBy(desc(tpJejak.dicatatPada), desc(tpJejak.id))
      .limit(batas),
    db
      .select({ nim: praktikan.nim, nama: praktikan.nama, kelas: praktikan.kelas })
      .from(praktikan)
      .where(eq(praktikan.semester, set.semester)),
  ]);
  const orangOf = new Map(terdaftar.map((p) => [p.nim, p]));
  res.status(200).json({
    ok: true,
    modul: m,
    jejak: rows
      // Only Praktikan registered in IRIS, as the counts.
      .filter((r) => orangOf.has(r.nim) && !kec.has(r.nim))
      .map((r) => ({
        id: r.id,
        nim: r.nim,
        nama: orangOf.get(r.nim)!.nama,
        kursus: KELAS[kelasId(orangOf.get(r.nim)!.kelas) - 1].label,
        jenis: r.jenis,
        sumber: r.sumber,
        berkas: r.berkas,
        dikirimPada: r.dikirimPada?.toISOString() ?? null,
        dicatatPada: r.dicatatPada.toISOString(),
      })),
    batas: rows.length === batas,
  });
}

/** Penilaian › Pengaturan TP: Peserta TP, the default window, Silang Data. */
async function handlePengaturan(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const orang = await muatOrang(s.nim);
  if (!orang) return tolak(res, "tidak_berhak", 403);
  const db = getDb();
  const set = await bacaSet(db);
  const semua = await db
    .select({ nim: praktikan.nim, nama: praktikan.nama })
    .from(praktikan)
    .where(eq(praktikan.semester, set.semester));
  const terdaftar = tanpaAsisten(semua, await nimAsistenTim(db));
  const namaOf = new Map(semua.map((p) => [p.nim, p.nama]));
  const kodeOf = await petaKode(db);
  const silang = await silangData(db, set, kodeOf);
  // Every extension this semester, the newest end first (2026-10-21).
  const pj = await db
    .select()
    .from(tpPerpanjang)
    .where(eq(tpPerpanjang.semester, set.semester))
    .orderBy(desc(tpPerpanjang.sampai));
  const perpanjang = pj.map((p) => ({
    modul: p.modul,
    nim: p.nim,
    nama: namaOf.get(p.nim) ?? p.nim,
    sampai: p.sampai.toISOString(),
    alasan: p.alasan,
    oleh: kodeOf.get(p.oleh) ?? p.oleh,
    pada: p.pada.toISOString(),
  }));
  res.status(200).json({
    ok: true,
    bolehPola: boleh(orang, "jadwal"),
    bolehKecuali: boleh(orang, "tp"),
    bolehPerpanjang: boleh(orang, "tp") || hakPenuh(orang),
    cek: await perluDicek(db, set, s.nim, silang.seelabs, perpanjang),
    perpanjang,
    peserta: {
      terdaftar: terdaftar.length,
      kecuali: set.kecuali.map((k) => ({
        ...k,
        nama: namaOf.get(k.nim) ?? k.nim,
        oleh: kodeOf.get(k.oleh) ?? k.oleh,
      })),
    },
    pola: set.jendela.pola ?? POLA_BAWAAN,
    silang: { iris: silang.iris, seelabs: silang.seelabs, asisten: silang.asisten },
  });
}

/** One thing on Pengaturan TP's Perlu Dicek, with what it counts. */
type Cek =
  | { k: "jendela"; modul: number }
  | { k: "pemegang" | "nilai"; modul: number; n: number }
  | { k: "tanpaSeelabs" | "bukanIris" | "perpanjang"; n: number };

/**
 * Perlu Dicek (2026-10-21, the LMS Ringkasan's checklist on IRIS's facts):
 * the next module still without a window, groups with files and no Per Modul
 * seat, files left ungraded after a close, the IRIS and SeeLabs mismatches,
 * and extensions ending within a day.
 */
async function perluDicek(
  db: ReturnType<typeof getDb>,
  set: Awaited<ReturnType<typeof bacaSet>>,
  nim: string,
  seelabs: { bukanIris: unknown[]; tanpaSeelabs: unknown[] } | null,
  perpanjang: { sampai: string }[],
): Promise<Cek[]> {
  const out: Cek[] = [];
  // The module after the last one that has a window.
  const ada = [1, 2, 3, 4].filter((m) => jendelaUntuk(set, m));
  const berikut = (ada.length ? Math.max(...ada) : 0) + 1;
  if (berikut <= 4) out.push({ k: "jendela", modul: berikut });
  for (const m of ada) {
    const k = keadaanJendela(jendelaUntuk(set, m));
    if (k !== "buka" && k !== "tutup") continue;
    const d = await kelompokTp(db, set, m, nim);
    const grup = d.slot
      .flatMap((s) => s.kelompok)
      .filter((g) => !g.pemegang && g.anggota.some((a) => !a.kecuali && a.berkas > 0)).length;
    if (grup) out.push({ k: "pemegang", modul: m, n: grup });
    if (k === "tutup") {
      const n = [
        ...d.slot.flatMap((s) => s.kelompok.flatMap((g) => g.anggota)),
        ...d.tanpaKelompok,
      ].filter((a) => !a.kecuali && TP_MENUNGGU.includes(a.status)).length;
      if (n) out.push({ k: "nilai", modul: m, n });
    }
  }
  if (seelabs?.tanpaSeelabs.length) out.push({ k: "tanpaSeelabs", n: seelabs.tanpaSeelabs.length });
  if (seelabs?.bukanIris.length) out.push({ k: "bukanIris", n: seelabs.bukanIris.length });
  const now = Date.now();
  const habis = perpanjang.filter((p) => {
    const t = Date.parse(p.sampai);
    return t > now && t - now < 86_400_000;
  }).length;
  if (habis) out.push({ k: "perpanjang", n: habis });
  return out;
}

/* ============================================================ notices */

const KUNCI_OTO = "tp_kabar_oto";

/** This semester's kept notices, the newest first. */
/**
 * The TP calendar (2026-10-21, the LMS Kalender's): every module's window
 * and practicum week and the postponed weeks. A Praktikan gets their own
 * close (an extension) and their practicum day, nothing about anyone else.
 */
async function handleKalender(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const set = await bacaSet(db);
  const jendela = Object.fromEntries(
    Object.entries(set.jendela.modul).map(([m, j]) => [
      Number(m),
      j ? { buka: j.buka, tutup: j.tutup } : null,
    ]),
  );
  const tunda = (await bacaTunda(db, set.semester)).map((x) => x.senin);
  let pribadi: Parameters<typeof acaraKalender>[0]["pribadi"];
  if (s.role === "praktikan") {
    const [r] = await db
      .select({ hari: rosterSlot.hari, slot: rosterSlot.slot })
      .from(rosterSlot)
      .where(and(eq(rosterSlot.semester, set.semester), eq(rosterSlot.nim, s.nim)))
      .limit(1);
    const [j] = r
      ? await db
          .select({ libur: jadwal.liburTanggal })
          .from(jadwal)
          .where(
            and(
              eq(jadwal.semester, set.semester),
              eq(jadwal.hari, r.hari),
              eq(jadwal.slot, r.slot),
            ),
          )
          .limit(1)
      : [];
    const pj = await perpanjangTp(db, set);
    pribadi = {
      perpanjang: new Map(
        [...pj].flatMap(([m, per]) => (per.has(s.nim) ? [[m, per.get(s.nim)!] as const] : [])),
      ),
      hari: r?.hari ?? null,
      jam: r ? (SLOT_MULAI[r.slot] ?? null) : null,
      libur: daftarLibur(j?.libur ?? null),
    };
  }
  res.status(200).json({
    ok: true,
    semester: set.semester,
    hariIni: hariIniWib(),
    acara: acaraKalender({ jendela, tunda, pribadi }),
  });
}

async function kabarSemester(
  db: ReturnType<typeof getDb>,
  semester: string,
  /** A Praktikan's read: messages to anyone else never leave the database. */
  untuk?: string,
): Promise<KabarSimpan[]> {
  const rows = await db
    .select()
    .from(tpKabar)
    .where(
      and(
        eq(tpKabar.semester, semester),
        untuk === undefined ? undefined : or(ne(tpKabar.sasaran, "satu"), eq(tpKabar.nim, untuk)),
      ),
    )
    .orderBy(desc(tpKabar.mulai), desc(tpKabar.id));
  return rows.map((r) => ({
    id: r.id,
    modul: r.modul,
    jenis: r.jenis,
    sasaran: r.sasaran,
    nim: r.nim,
    judul: r.judul,
    isi: r.isi,
    mulai: r.mulai.toISOString(),
    sampai: r.sampai?.toISOString() ?? null,
  }));
}

/** Which automatic notices are on; both off until someone switches them on. */
async function bacaOto(db: ReturnType<typeof getDb>): Promise<OtoKabar> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_OTO))
    .limit(1);
  const v = (r?.nilai ?? {}) as Partial<OtoKabar>;
  return { buka: v.buka === true, mepet: v.mepet === true };
}

/** Notices are posted by the TP right or an Admin. */
async function bolehKabar(nim: string): Promise<boolean> {
  const orang = await muatOrang(nim);
  return !!orang && (boleh(orang, "tp") || hakPenuh(orang));
}

/** Kelola TP › Pengumuman: every notice this semester, who posted it, the
 *  automatic ones' switches, and each module's window for the templates. */
async function handleKabar(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const set = await bacaSet(db);
  const [rows, oto, kodeOf, bisa] = await Promise.all([
    db
      .select({ id: tpKabar.id, oleh: tpKabar.oleh, pada: tpKabar.pada })
      .from(tpKabar)
      .where(eq(tpKabar.semester, set.semester)),
    bacaOto(db),
    petaKode(db),
    bolehKabar(s.nim),
  ]);
  const olehOf = new Map(rows.map((r) => [r.id, r]));
  const kabar = await kabarSemester(db, set.semester);
  // A message names its Praktikan.
  const nims = [...new Set(kabar.flatMap((k) => (k.nim ? [k.nim] : [])))];
  const namaOf = new Map(
    nims.length
      ? (
          await db
            .select({ nim: praktikan.nim, nama: praktikan.nama })
            .from(praktikan)
            .where(inArray(praktikan.nim, nims))
        ).map((p) => [p.nim, p.nama])
      : [],
  );
  res.status(200).json({
    ok: true,
    boleh: bisa,
    oto,
    jendela: Object.fromEntries([1, 2, 3, 4].map((m) => [m, jendelaUntuk(set, m)])),
    kabar: kabar.map((k) => {
      const o = olehOf.get(k.id);
      return {
        ...k,
        nama: k.nim ? (namaOf.get(k.nim) ?? k.nim) : null,
        oleh: o ? (kodeOf.get(o.oleh) ?? o.oleh) : "",
        pada: o?.pada.toISOString() ?? k.mulai,
        // The sender may take back their own message.
        milikku: o?.oleh === s.nim,
      };
    }),
  });
}

async function handleSimpanKabar(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const modul = b.modul === null || b.modul === undefined ? null : modulDari(b.modul);
  // A message to one Praktikan (sasaran "satu"): its title names the sender.
  const pesan = b.sasaran === "satu";
  const nim = pesan && typeof b.nim === "string" ? b.nim.trim() : "";
  const jenis: JenisKabar | "pesan" | null = pesan
    ? "pesan"
    : JENIS_KABAR.includes(b.jenis as JenisKabar)
      ? (b.jenis as JenisKabar)
      : null;
  const sasaran = pesan ? "satu" : b.sasaran === "belum" ? "belum" : "semua";
  const teks = (x: unknown, maks: number) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const en = typeof o.en === "string" ? o.en.trim() : "";
    return id.length <= maks && en.length <= maks ? { id, en } : null;
  };
  const isi = teks(b.isi, ISI_MAKS);
  const tgl = (x: unknown) => (typeof x === "string" ? new Date(x) : null);
  const sampai = tgl(b.sampai);
  // Jadwalkan: it shows from then; a time already past means now.
  let mulai = tgl(b.mulai);
  if (
    !jenis ||
    (b.modul !== null && b.modul !== undefined && !modul) ||
    !isi?.id ||
    (sasaran === "belum" && !modul) ||
    (pesan && (!modul || !nim)) ||
    (sampai && Number.isNaN(sampai.getTime())) ||
    (mulai && Number.isNaN(mulai.getTime()))
  )
    return tolak(res, "format_salah");
  if (mulai && mulai.getTime() <= Date.now()) mulai = null;
  if (sampai && sampai.getTime() <= Date.now()) return tolak(res, "sudah_lewat");
  if (sampai && mulai && sampai.getTime() <= mulai.getTime())
    return tolak(res, "sampai_sebelum_mulai");
  const db = getDb();
  const set = await bacaSet(db);
  // A message: the TP right and Admins, or the one who grades their TP.
  if (pesan) {
    const [p] = await db
      .select({ nim: praktikan.nim })
      .from(praktikan)
      .where(and(eq(praktikan.nim, nim), eq(praktikan.semester, set.semester)))
      .limit(1);
    if (!p) return tolak(res, "tidak_ada");
    if (!(await bolehKabar(s.nim)) && !(await hakNilai(db, set, modul!, nim, s.nim)).boleh)
      return tolak(res, "tidak_berhak", 403);
  } else if (!(await bolehKabar(s.nim))) return tolak(res, "tidak_berhak", 403);
  const judul = pesan
    ? judulPesan((await petaKode(db)).get(s.nim) ?? s.nim)
    : teks(b.judul, JUDUL_MAKS);
  if (!judul?.id) return tolak(res, "format_salah");
  const [r] = await db
    .insert(tpKabar)
    .values({
      semester: set.semester,
      modul,
      jenis,
      sasaran,
      nim: pesan ? nim : null,
      judul,
      isi,
      ...(mulai ? { mulai } : {}),
      sampai,
      oleh: s.nim,
    })
    .returning({ id: tpKabar.id });
  await writeAudit(s.nim, "tp_kabar", {
    id: r.id,
    modul,
    jenis,
    sasaran,
    ...(pesan ? { nim } : {}),
    judul: judul.id,
    ...(mulai ? { mulai: mulai.toISOString() } : {}),
  });
  res.status(200).json({ ok: true, id: r.id });
}

async function handleHapusKabar(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const id = Number(jsonBody(req).id);
  if (!Number.isInteger(id) || id < 1) return tolak(res, "format_salah");
  // The TP right and Admins remove any; a sender their own message.
  const semua = await bolehKabar(s.nim);
  const db = getDb();
  const gone = await db
    .delete(tpKabar)
    .where(
      and(
        eq(tpKabar.id, id),
        semua ? undefined : and(eq(tpKabar.oleh, s.nim), eq(tpKabar.sasaran, "satu")),
      ),
    )
    .returning({ id: tpKabar.id, modul: tpKabar.modul, judul: tpKabar.judul });
  if (!gone.length && !semua) return tolak(res, "tidak_berhak", 403);
  if (!gone.length) return tolak(res, "tidak_ada");
  await writeAudit(s.nim, "tp_kabar_hapus", { id, modul: gone[0].modul, judul: gone[0].judul.id });
  res.status(200).json({ ok: true });
}

async function handleOtoKabar(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  if (!(await bolehKabar(s.nim))) return tolak(res, "tidak_berhak", 403);
  const b = jsonBody(req);
  const db = getDb();
  const lama = await bacaOto(db);
  const oto: OtoKabar = {
    buka: typeof b.buka === "boolean" ? b.buka : lama.buka,
    mepet: typeof b.mepet === "boolean" ? b.mepet : lama.mepet,
  };
  await db
    .insert(pengaturan)
    .values({ kunci: KUNCI_OTO, nilai: oto, diubahOleh: s.nim })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai: oto, diubahOleh: s.nim, diubahPada: new Date() },
    });
  await writeAudit(s.nim, "tp_kabar_oto", { ...oto });
  res.status(200).json({ ok: true, oto });
}

/* ============================================== the relay's minute timer */

/** The relay's signature over `detak|ts`, at most two minutes old. */
function detakSah(req: ApiRequest): boolean {
  const rahasia = process.env.KONSOL_RELAY_SECRET?.trim();
  const ts = String(req.headers["x-detak-ts"] ?? "");
  const tanda = String(req.headers["x-detak-tanda"] ?? "");
  if (!rahasia || rahasia.length < 32 || !/^\d{9,11}$/.test(ts) || !/^[0-9a-f]{64}$/.test(tanda))
    return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 120) return false;
  const harus = createHmac("sha256", rahasia).update(`detak|${ts}`).digest();
  return timingSafeEqual(harus, Buffer.from(tanda, "hex"));
}

async function handleDetak(req: ApiRequest, res: ApiResponse) {
  if (!detakSah(req)) return tolak(res, "tanda_salah", 403);
  const db = getDb();
  // Phase 18: the lab clock's minute (automatic starts); it never throws.
  await jamLabBilaPerlu(db);
  // The lab clock alone sets the pace now: every minute through the day,
  // asleep from 00:15 to 05:50 so the database can idle (2026-10-21).
  res.status(200).json({ ok: true, tidurDetik: batasTidurJamLab(6 * 3600) });
}

/* ================================================================ route */

async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  const aksi = req.query.aksi;
  const sesiku = currentSession(req);

  if (aksi === "detak") {
    if (!requireMethod(req, res, "POST")) return;
    return handleDetak(req, res);
  }
  if (aksi === "berkas") {
    if (!requireMethod(req, res, "GET")) return;
    if (!sesiku) return tolak(res, "belum_masuk", 401);
    return handleBerkas(req, res, sesiku);
  }
  if (aksi === "kalender") {
    if (!requireMethod(req, res, "GET")) return;
    if (!sesiku) return tolak(res, "belum_masuk", 401);
    return handleKalender(req, res, sesiku);
  }
  if (aksi === "saya") {
    if (!requireMethod(req, res, "GET")) return;
    const s = requireRole(req, res, "praktikan");
    return s ? handleSaya(req, res, s) : undefined;
  }
  if (aksi === "tiket") {
    if (!requireMethod(req, res, "POST")) return;
    const s = requireRole(req, res, "praktikan");
    return s ? handleTiket(req, res, s) : undefined;
  }
  if (aksi === "unggah") {
    if (!requireMethod(req, res, "POST")) return;
    const s = requireRole(req, res, "praktikan");
    return s ? handleUnggah(req, res, s) : undefined;
  }

  const s = requireRole(req, res, "asisten");
  if (!s) return;
  if (req.method === "GET") {
    if (aksi === "modul") return handleModul(req, res, s);
    if (aksi === "kelompok") return handleKelompok(req, res, s);
    if (aksi === "praktikan") return handlePraktikan(req, res, s);
    if (aksi === "paket") return handlePaket(req, res, s);
    if (aksi === "praktikum") return handlePraktikum(req, res, s);
    if (aksi === "hitung") return handleHitung(req, res, s);
    if (aksi === "kumpul") return handleKumpul(req, res);
    if (aksi === "jejak") return handleJejak(req, res);
    if (aksi === "pengaturan") return handlePengaturan(req, res, s);
    if (aksi === "kabar") return handleKabar(req, res, s);
    return tolak(res, "aksi_tidak_dikenal", 404);
  }
  if (!requireMethod(req, res, "POST")) return;
  if (aksi === "nilai") return handleNilai(req, res, s);
  if (aksi === "tanda") return handleTanda(req, res, s);
  if (aksi === "telat") return handleTelat(req, res, s);
  if (aksi === "perpanjang") return handlePerpanjang(req, res, s);
  if (aksi === "perpanjang-semua") return handlePerpanjangSemua(req, res, s);
  if (aksi === "jendela") return handleJendela(req, res, s);
  if (aksi === "paket") return handleSimpanPaket(req, res, s);
  if (aksi === "pilih") return handlePilih(req, res, s);
  if (aksi === "bawaan") return handleBawaan(req, res, s);
  if (aksi === "kecuali") return handleKecuali(req, res, s);
  if (aksi === "kabar") return handleSimpanKabar(req, res, s);
  if (aksi === "kabar-hapus") return handleHapusKabar(req, res, s);
  if (aksi === "kabar-oto") return handleOtoKabar(req, res, s);
  return tolak(res, "aksi_tidak_dikenal", 404);
}

export default denganSiaran("tp", handler);
