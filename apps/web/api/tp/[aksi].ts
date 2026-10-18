/**
 * /api/tp/:aksi — Tugas Pendahuluan from the LMS (Phase 13). The tenth
 * serverless function (the Hobby cap is 12). Settings, the sync and the
 * group data live in api/_lib/tp.ts, the LMS calls in api/_lib/lms.ts.
 *
 * Praktikan:
 * GET  /api/tp/saya[?modul=]        my TP per module: window, my file as IRIS
 *      sees it, my class course in the LMS, and my scores once my group's
 *      scores were sent (Kirim Nilai). With ?modul= also the final set's
 *      questions in my class's language (and Mandarin) and the PDF's
 *      instructions. All read only: TP is written by hand on paper.
 * GET  /api/tp/berkas?id=&i=[&unduh=1]       my own file, streamed from the LMS.
 * Relay (no session; signed `detak|ts` with KONSOL_RELAY_SECRET):
 * POST /api/tp/detak   the minute timer: the TP sync when due and LMS copies
 *      still owed, and the lab clock's automatic starts (_lib/jam-lab.ts);
 *      answers how long the timer may sleep (tidurDetik: a minute).
 *
 * POST /api/tp/unggah { modul, isi }   my TP as one PDF (base64, 3 MB at most)
 *      while the window is open (2026-10-14: the LMS can refuse a student's
 *      upload until the iGracias survey is filled). The newer of this and
 *      the LMS submission counts; IRIS puts a copy in the LMS as a feedback
 *      file (_lib/tp-unggah.ts) and the server PC keeps one too.
 *
 * Asisten:
 * GET  /api/tp/modul?modul=          the module's TP tab: window, counts per
 *      class, the LMS state, uploads made in IRIS and the server PC's copy.
 * GET  /api/tp/kelompok?modul=       Penilaian › TP: every slot's groups that
 *      module's week, each member's status and total.
 * GET  /api/tp/praktikan?modul=&nim= the grader: one Praktikan's files,
 *      scores, notes and typed answers, and whether I may score them.
 * GET  /api/tp/paket?modul=          the module's question bank with its keys
 *      (never to a Praktikan), the final set's pick, who may edit it, and
 *      the LMS assignments it goes to.
 * GET  /api/tp/lampiran?modul=       what each class's TP assignment holds as
 *      attached files right now (asked of the LMS live).
 * GET  /api/tp/praktikum             Penilaian › Praktikum: every session this
 *      semester where I hold a group, with each group's score state.
 * GET  /api/tp/hitung                the navbar badge: my groups' files to grade.
 * GET  /api/tp/berkas?id=&i=         any Praktikan's file.
 * POST /api/tp/nilai  { modul, nim, nomor, skor|null, catatan? }
 * POST /api/tp/tanda  { modul, nim, kosong }      Tidak Mengumpulkan (all 0)
 * POST /api/tp/telat  { modul, nim, terima }      a late file: accept, or 0
 * POST /api/tp/sinkron { modul? }                 Sinkron Sekarang
 * POST /api/tp/jendela { modul, buka, tutup } | { modul, hapus } (jadwal right)
 *                      | { pola } (Pencipta and Admin)
 * POST /api/tp/paket { modul, versi, varian, pilih, petunjuk }  save the bank
 * POST /api/tp/pilih { modul, versi, pilih }      a new draw or a hand pick
 * POST /api/tp/bawaan { modul }                   back to the default bank
 *      (the three: the jadwal or kode right; versi is the one loaded, and a
 *      newer save refuses it with the latest)
 * GET  /api/tp/lms-info                           LMS › Sambungan (every Asisten
 *      reads; connecting and the default window stay Pencipta and Admin)
 * GET  /api/tp/riwayat[?sebelum=id]               the whole sync history, 100 a page
 * POST /api/tp/lms { aksi: sambung, tempel } | { aksi: uji } | { aksi: putus }
 * POST /api/tp/lms-tugas { modul, kursus, langkah: buat|ubah|hapus, tampil?, teks? }
 *      one class course's "TP Modul N" made, set to the window or deleted
 *      in the LMS itself (Pencipta, Admins, the ASO division)
 * POST /api/tp/kecuali { nim, alasan } | { nim, hapus }   leave a registered
 *      Praktikan out of TP, or take them back (the same people)
 *
 * Only the group's holder that week scores its TP (anyone while nobody
 * holds it), the same rule as the session's score table. Every write is
 * audited; a complete TP's total goes into the session's TP component.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { waitUntil } from "@vercel/functions";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonBody, noStore, requireMethod } from "../_lib/http.js";
import { currentSession, requireRole } from "../_lib/session.js";
import { muatOrang } from "../_lib/hak.js";
import { denganSiaran } from "../_lib/siaran.js";
import { getDb } from "../../src/lib/db.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import { boleh, type Orang } from "../../src/lib/hak.js";
import { KUNCI_ROBOT } from "../../src/lib/seelabs-robot.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import {
  asisten,
  lmsPeserta,
  nilai,
  nilaiAbsen,
  nilaiKirim,
  pengaturan,
  praktikan,
  sesi,
  sesiAnggota,
  sesiAsisten,
  kelompok,
  tpKiriman,
  tpNilai,
  tpUnggah,
} from "../../src/lib/schema.js";
import { NILAI_KOMPONEN } from "../../src/lib/nilai-komponen.js";
import {
  JAM_RE,
  POLA_BAWAAN,
  TANGGAL_RE,
  poinNomor,
  bahasaKelas,
  htmlTugasLms,
  isoWib,
  jendelaPribadi,
  masukPerpanjangan,
  keadaanJendela,
  kelasTp,
  nomorBeda,
  modulTugas,
  namaTugasLms,
  nomorUntuk,
  statusTp,
  tanggalSama,
  tanpaAsisten,
  teksTugasLms,
  telatMenit,
  totalTp,
  tpLengkap,
  type PolaJendela,
} from "../../src/lib/tp.js";
import { buatTugas, hapusTugas, lampirTugas, ubahTugas } from "../_lib/lms-web.js";
import { pastikanBagianModul } from "../_lib/lms-isi.js";
import { basikanInfoKelas, otomatisNyala } from "../_lib/lms-menu.js";
import {
  LMS_URL,
  LmsGalat,
  alamatMasuk,
  bacaTempelan,
  bukaToken,
  infoSitus,
  kursusPraktikum,
  sandikanToken,
  tugasKursus,
  unggahDraf,
} from "../_lib/lms.js";
import {
  KUNCI_TP,
  KUNCI_WEB,
  bacaSet,
  hapusPaket,
  hapusSet,
  jendelaUntuk,
  kelompokTp,
  perpanjangTp,
  muatPaket,
  nimKecuali,
  pemegangTp,
  pesertaKursusTp,
  periksaPetunjuk,
  periksaPilih,
  periksaVarian,
  jumlahSinkron,
  nimAsistenTim,
  riwayatSinkron,
  sinkronBilaPerlu,
  simpanPaket,
  sinkronTp,
  skorModul,
  tidurDetik,
  soalPaket,
  tulisSet,
  tulisTotal,
  webLms,
  type KecualiSet,
  type SetTp,
  type TokenSet,
  type TugasTp,
} from "../_lib/tp.js";
import {
  ambilIsiTp,
  kirimTertunda,
  kirimUnggahKeLms,
  pdfUnggah,
  terimaUnggah,
  unggahTerakhir,
} from "../_lib/tp-unggah.js";
import { bacaStatusCermin } from "../_lib/tp-cermin.js";
import { batasTidurJamLab, jamLabBilaPerlu } from "../_lib/jam-lab.js";

type Db = ReturnType<typeof getDb>;

const tolak = (res: ApiResponse, kode: string, status = 200) =>
  res.status(status).json({ ok: false, kode });

const modulDari = (v: unknown) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
};

/** A page opening a TP view syncs when the last run is a minute old. */
const JEDA_HALAMAN = 60_000;

function ringkasJendela(set: SetTp, m: number) {
  const j = jendelaUntuk(set, m);
  return { jendela: j, keadaan: keadaanJendela(j) };
}

function infoSinkron(set: SetTp) {
  return {
    tersambung: !!set.token,
    terakhir: set.status.terakhir,
    hasil: set.status.hasil,
    galat: set.status.galat,
    galatSejak: set.status.galatSejak,
  };
}

/** The courses that have no "TP Modul m" assignment. */
function tugasHilang(set: SetTp, m: number) {
  const kec = nimKecuali(set);
  return (set.kelas?.kursus ?? [])
    .filter((k) => !k.tugas[String(m)])
    .map((k) => ({ label: k.label, peserta: pesertaKursusTp(k, kec) }));
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
  await sinkronBilaPerlu(db, "halaman", JEDA_HALAMAN);
  const set = await bacaSet(db);
  const satu = modulDari(req.query.modul);
  const modul = satu ? [satu] : [1, 2, 3, 4];
  const [p] = await db
    .select({ kelas: praktikan.kelas })
    .from(praktikan)
    .where(and(eq(praktikan.nim, s.nim), eq(praktikan.semester, set.semester)))
    .limit(1);
  const [kursus] = await db
    .select()
    .from(lmsPeserta)
    .where(and(eq(lmsPeserta.semester, set.semester), eq(lmsPeserta.nim, s.nim)))
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
    .select({ modul: sesi.modul })
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
      lmsStatus: tpUnggah.lmsStatus,
      lmsPada: tpUnggah.lmsPada,
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
    const tugas = kursus
      ? set.kelas?.kursus.find((c) => c.id === kursus.lmsKursus)?.tugas[String(m)]
      : undefined;
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
      tugasUrl: tugas ? `${LMS_URL}/mod/assign/view.php?id=${tugas.cmid}` : null,
      sumber: k?.berkas.length ? k.sumber : null,
      // The copy in the LMS of the file uploaded here (feedback file).
      salinanLms:
        k?.sumber === "iris"
          ? (unggahan.find((u) => u.id === k.unggahId)?.lmsStatus ?? null)
          : null,
      // Registered and the window is open: the upload card takes a file.
      bolehUnggah: !!p && keadaan === "buka",
    };
  });
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
    kursus: kursus
      ? { label: kursus.kursus, url: `${LMS_URL}/course/view.php?id=${kursus.lmsKursus}` }
      : null,
    sinkron: { terakhir: set.status.terakhir, tersambung: !!set.token },
    modul: out,
  });
}

/* ============================================================== the files */

/** The file types a TP file may be shown as, on this origin. */
const TIPE_INLINE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

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
  const set = await bacaSet(db);
  const range = typeof req.headers.range === "string" ? req.headers.range : undefined;
  const isi = await ambilIsiTp(db, set, b, range);
  if (!isi.ok) return tolak(res, isi.kode, isi.status);
  // An upload in IRIS not yet in the LMS: its bytes, whole.
  const r =
    isi.jenis === "lms"
      ? isi.res
      : new Response(new Uint8Array(isi.isi), {
          headers: { "content-type": "application/pdf", "content-length": String(isi.isi.length) },
        });
  const jenis = r.headers.get("content-type") ?? "";
  res.statusCode = r.status;
  // A Praktikan's upload is untrusted: only a PDF or a plain image is shown
  // inline; anything else (an HTML or SVG file) only downloads, typed as
  // bytes, and the response may never run script on this origin.
  const tipe = (b.mime || jenis).split(";")[0].trim().toLowerCase();
  const aman = TIPE_INLINE.has(tipe);
  res.setHeader("Content-Type", aman ? tipe : "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // (Chrome won't show a PDF under a sandbox, and a PDF or image can't run
  // script here anyway; everything else gets one.)
  if (!aman) res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  for (const h of ["content-length", "content-range", "accept-ranges", "last-modified", "etag"]) {
    const v = r.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  if (!r.headers.get("accept-ranges")) res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, no-store");
  const nama = b.nama.replace(/["\\\r\n]/g, "_");
  res.setHeader(
    "Content-Disposition",
    `${req.query.unduh === "1" || !aman ? "attachment" : "inline"}; filename="${nama}"; filename*=UTF-8''${encodeURIComponent(b.nama)}`,
  );
  await new Promise<void>((ok, gagal) => {
    const src = Readable.fromWeb(r.body as import("node:stream/web").ReadableStream);
    src.on("error", gagal);
    res.on("close", () => ok());
    src.pipe(res);
  }).catch(() => res.destroy());
}

/** A Praktikan's TP uploaded here, then its copy to the LMS (after the answer). */
async function handleUnggah(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  if (!m) return tolak(res, "format_salah");
  const isi = pdfUnggah(b.isi);
  if (!isi) return tolak(res, "bukan_pdf");
  const db = getDb();
  const set = await bacaSet(db);
  const r = await terimaUnggah(db, set, s.nim, m, isi);
  if (!r.ok) return tolak(res, r.kode);
  if (!r.sama) await writeAudit(s.nim, "tp_unggah", { modul: m, ukuran: isi.length, id: r.id });
  res.status(200).json({ ok: true, sama: r.sama });
  if (!r.sama) waitUntil(kirimUnggahKeLms(db, r.id));
}

/* ================================================================ Asisten */

async function handleModul(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const m = modulDari(req.query.modul);
  if (!m) return tolak(res, "format_salah");
  const db = getDb();
  await sinkronBilaPerlu(db, "halaman", JEDA_HALAMAN);
  const set = await bacaSet(db);
  const orang = await muatOrang(s.nim);
  const kiriman = await db
    .select({
      nim: tpKiriman.nim,
      berkas: tpKiriman.berkas,
      kursus: tpKiriman.lmsKursus,
      sumber: tpKiriman.sumber,
      unggahId: tpKiriman.unggahId,
    })
    .from(tpKiriman)
    .where(and(eq(tpKiriman.semester, set.semester), eq(tpKiriman.modul, m)));
  const idIris = kiriman.filter((x) => x.sumber === "iris" && x.unggahId).map((x) => x.unggahId!);
  const salinan = idIris.length
    ? await db
        .select({ status: tpUnggah.lmsStatus })
        .from(tpUnggah)
        .where(inArray(tpUnggah.id, idIris))
    : [];
  const cermin = Object.entries(await bacaStatusCermin(db)).map(([serverId, c]) => ({
    serverId: Number(serverId),
    ...c,
  }));
  const { per } = await skorModul(db, set.semester, m);
  const dinilai = [...per].filter(([nim, sk]) => tpLengkap(sk, nomorUntuk(nim))).length;
  const kec = nimKecuali(set);
  const perKursus = (set.kelas?.kursus ?? []).map((k) => ({
    label: k.label,
    peserta: pesertaKursusTp(k, kec),
    masuk: kiriman.filter((x) => x.kursus === k.id && x.berkas.length && !kec.has(x.nim)).length,
    ada: !!k.tugas[String(m)],
  }));
  res.status(200).json({
    ok: true,
    ...ringkasJendela(set, m),
    pola: set.jendela.pola,
    masuk: kiriman.filter((x) => x.berkas.length && !kec.has(x.nim)).length,
    // The registered Praktikan (IRIS's roster), not the LMS's lists.
    peserta: await pesertaTerdaftar(db, set),
    dinilai,
    perKursus,
    hilang: tugasHilang(set, m),
    sinkron: infoSinkron(set),
    // Files uploaded in IRIS, and how many of their LMS copies are still owed.
    iris: {
      jumlah: idIris.length,
      diLms: salinan.filter((x) => x.status === "terkirim").length,
      tertunda: salinan.filter((x) => x.status === "menunggu" || x.status === "gagal").length,
      tanpaLms: salinan.filter((x) => x.status === "tanpa_lms").length,
    },
    cermin,
    bolehUbah: !!orang && boleh(orang, "jadwal"),
    bolehLms: !!orang && boleh(orang, "full"),
    bolehKelola: !!orang && boleh(orang, "lms"),
  });
}

async function handleKelompok(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const m = modulDari(req.query.modul);
  if (!m) return tolak(res, "format_salah");
  const db = getDb();
  await sinkronBilaPerlu(db, "halaman", JEDA_HALAMAN);
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
    sinkron: infoSinkron(set),
    hilang: tugasHilang(set, m),
    bolehLms: !!orang && boleh(orang, "full"),
    bolehKelola: !!orang && boleh(orang, "lms"),
  });
}

/** Whether `me` may score `nim`'s TP for `modul`, and who holds them. */
async function hakNilai(db: Db, set: SetTp, modul: number, nim: string, me: string) {
  const p = await pemegangTp(db, set, modul, nim);
  const holder = p?.nim ?? null;
  return { boleh: holder === null || holder === me, pemegang: holder };
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
  const { jendela, keadaan } = ringkasJendela(set, m);
  const sampai = (await perpanjangTp(db, set)).get(m)?.get(nim) ?? null;
  const pada = k?.dikirimPada?.toISOString() ?? null;
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
          salinanLms:
            k.sumber === "iris"
              ? ((await unggahTerakhir(db, set.semester, m, nim))?.lmsStatus ?? null)
              : null,
        }
      : null,
    skor: Object.fromEntries(
      sk.map((r) => [r.nomor, { skor: r.skor, catatan: r.catatan, oleh: r.diubahOleh }]),
    ),
    tpSeelabs: salin?.skor ?? null,
    ...hak,
  });
}

/* ------------------------------------------------------- the question bank */

/** Who may edit a TP bank: the jadwal right (module content) or kode
 *  (the ASO division's journal code). */
const bolehSoal = (o: Orang | null) => !!o && (boleh(o, "jadwal") || boleh(o, "kode"));

/** The LMS assignments a module's PDF goes to, one per class course. */
function tujuanLms(set: SetTp, m: number) {
  return (set.kelas?.kursus ?? []).map((k) => {
    const t = k.tugas[String(m)];
    return {
      id: k.id,
      label: k.label,
      kelas: k.kelas,
      cmid: t?.cmid ?? null,
      lihat: t ? `${LMS_URL}/mod/assign/view.php?id=${t.cmid}` : null,
      ubah: t ? `${LMS_URL}/course/modedit.php?update=${t.cmid}` : null,
    };
  });
}

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
    bolehKelola: !!orang && boleh(orang, "lms"),
    // Phase 15: Soal TP attaches the PDF itself after a save when on.
    otomatisPdf: await otomatisNyala(db, "pdf"),
    lms: {
      tersambung: !!set.token,
      siap: !!set.token?.privat,
      url: LMS_URL,
      tujuan: tujuanLms(set, m),
    },
  });
}

/** What each class's TP assignment holds as attachments, asked live. */
async function handleLampiran(req: ApiRequest, res: ApiResponse) {
  const m = modulDari(req.query.modul);
  if (!m) return tolak(res, "format_salah");
  const db = getDb();
  const set = await bacaSet(db);
  const token = set.token ? bukaToken(set.token) : null;
  if (!token) return tolak(res, "belum_tersambung");
  const tujuan = tujuanLms(set, m);
  let tugas;
  try {
    tugas = await tugasKursus(
      token,
      tujuan.map((t) => t.id),
    );
  } catch (e) {
    return tolak(res, e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau");
  }
  res.status(200).json({
    ok: true,
    pada: new Date().toISOString(),
    kelas: tujuan.map((t) => ({
      ...t,
      lampiran: tugas.find((a) => a.cmid === t.cmid)?.lampiran ?? [],
    })),
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

async function handleSinkron(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  const db = getDb();
  const r = await sinkronTp(db, `manual:${s.nim}`, {
    ...(m ? { modul: [m] } : {}),
    paksa: b.paksa === true,
  });
  if (r.ok) {
    await writeAudit(s.nim, "tp_sinkron", { modul: m, baru: r.baru, diperbarui: r.diperbarui });
    // A press brings the rest up to date too (2026-10-16): the Kelas tab's
    // groups and contents read again on its next open, and the copies the
    // LMS is still owed go now instead of on the relay's next beat.
    if (b.paksa === true) await basikanInfoKelas(db, (await bacaSet(db)).semester);
    waitUntil(kirimTertunda(db));
  }
  res.status(200).json(r);
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

/** A sync row for the page: who ran it by Asisten code, not NIM. */
function barisRiwayat(
  r: Awaited<ReturnType<typeof riwayatSinkron>>[number],
  kodeOf: Map<string, string>,
) {
  const nim = r.oleh.startsWith("manual:") ? r.oleh.slice(7) : null;
  return {
    id: r.id,
    mulai: r.mulai.toISOString(),
    oleh: nim ? `manual:${kodeOf.get(nim) ?? nim}` : r.oleh,
    hasil: r.hasil,
    baru: r.baru,
    diperbarui: r.diperbarui,
    durasiMs: r.durasiMs,
    galat: r.galat,
  };
}

async function petaKode(db: Db): Promise<Map<string, string>> {
  const rows = await db.select({ nim: asisten.nim, kode: asisten.kode }).from(asisten);
  return new Map(rows.map((a) => [a.nim, a.kode.toUpperCase()]));
}

/** The whole sync history, newest first, 100 a page (?sebelum= the last id seen). */
async function handleRiwayat(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const orang = await muatOrang(s.nim);
  if (!orang) return tolak(res, "tidak_berhak", 403);
  const sebelum = Number(req.query.sebelum);
  const db = getDb();
  const [rows, total, kodeOf] = await Promise.all([
    riwayatSinkron(db, 101, Number.isInteger(sebelum) && sebelum > 0 ? sebelum : undefined),
    jumlahSinkron(db),
    petaKode(db),
  ]);
  res.status(200).json({
    ok: true,
    total,
    lagi: rows.length > 100,
    log: rows.slice(0, 100).map((r) => barisRiwayat(r, kodeOf)),
  });
}

/**
 * Silang Data on Sumber LMS: who is registered where. SeeLabs from the
 * robot's last KLP pull, the LMS's students per class (ADD too), and the
 * registered Praktikan who are Asisten as well (Teachers in every class,
 * students in their own; five of them on 2026-10-13).
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
  const kursus = set.kelas?.kursus ?? [];
  const luar = set.kelas?.luar ?? [];
  const perKelas = kursus.map((k) => {
    const lain = luar.filter((x) => x.kursus === k.label).length;
    return {
      label: k.label,
      iris: k.nim?.length ?? k.peserta,
      luar: lain,
      lms: (k.nim?.length ?? k.peserta) + lain,
    };
  });
  const juga = semua
    .filter((p) => tim.has(p.nim) && kodeOf.has(p.nim))
    .map((p) => ({
      nim: p.nim,
      nama: p.nama,
      kode: kodeOf.get(p.nim)!,
      kelas: p.kelas,
    }));
  return {
    iris: terdaftar.length,
    lms: perKelas.reduce((n, k) => n + k.lms, 0),
    adaData: kursus.some((k) => k.nim),
    perKelas,
    seelabs,
    asisten: juga,
  };
}

async function handleLmsInfo(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const orang = await muatOrang(s.nim);
  if (!orang) return tolak(res, "tidak_berhak", 403);
  const db = getDb();
  const set = await bacaSet(db);
  const [oleh] = set.token
    ? await db
        .select({ kode: asisten.kode, nama: asisten.nama })
        .from(asisten)
        .where(eq(asisten.nim, set.token.oleh))
        .limit(1)
    : [];
  const [log, logTotal] = await Promise.all([riwayatSinkron(db, 10), jumlahSinkron(db)]);
  // Registered Praktikan in no class course, and the exclusions with names
  // (the Asisten registered as Praktikan too count as neither).
  const semua = await db
    .select({ nim: praktikan.nim, nama: praktikan.nama, kelas: praktikan.kelas })
    .from(praktikan)
    .where(eq(praktikan.semester, set.semester));
  const terdaftar = tanpaAsisten(semua, await nimAsistenTim(db));
  const namaOf = new Map(semua.map((p) => [p.nim, p]));
  const kodeOf = await petaKode(db);
  const diLms = new Set((set.kelas?.kursus ?? []).flatMap((k) => k.nim ?? []));
  const adaDaftar = (set.kelas?.kursus ?? []).some((k) => k.nim);
  const [web] = await db
    .select({ pada: pengaturan.diubahPada })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_WEB))
    .limit(1);
  res.status(200).json({
    ok: true,
    bolehSambung: boleh(orang, "full"),
    kelola: {
      boleh: boleh(orang, "lms"),
      siap: !!set.token?.privat,
      sesiPada: web?.pada.toISOString() ?? null,
      jendela: Object.fromEntries([1, 2, 3, 4].map((m) => [m, jendelaUntuk(set, m)])),
    },
    peserta: {
      terdaftar: terdaftar.length,
      cocok: diLms.size,
      luar: set.kelas?.luar ?? null,
      tanpaLms: adaDaftar
        ? terdaftar
            .filter((p) => !diLms.has(p.nim))
            .map((p) => ({ nim: p.nim, nama: p.nama, kelas: p.kelas }))
        : null,
      kecuali: set.kecuali.map((k) => ({
        ...k,
        nama: namaOf.get(k.nim)?.nama ?? k.nim,
        oleh: kodeOf.get(k.oleh) ?? k.oleh,
      })),
    },
    token: set.token
      ? {
          akhir: set.token.akhir,
          akun: set.token.akun,
          pada: set.token.pada,
          oleh: oleh ? { kode: oleh.kode.toUpperCase(), nama: oleh.nama } : null,
        }
      : null,
    kursus: set.kelas?.kursus ?? [],
    kelasPada: set.kelas?.pada ?? null,
    pola: set.jendela.pola ?? POLA_BAWAAN,
    sinkron: infoSinkron(set),
    log: log.map((r) => barisRiwayat(r, kodeOf)),
    logTotal,
    silang: await silangData(db, set, kodeOf),
    alamatMasuk: alamatMasuk(),
    lmsUrl: LMS_URL,
  });
}

async function handleLms(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const orang = await muatOrang(s.nim);
  if (!orang || !boleh(orang, "full")) return tolak(res, "tidak_berhak", 403);
  const b = jsonBody(req);
  const db = getDb();
  // The body's step (not the route's aksi): sambung, uji or putus.
  const langkah = b.aksi;
  if (langkah === "putus") {
    for (const k of [KUNCI_TP.token, KUNCI_TP.kelas, KUNCI_TP.status, KUNCI_WEB])
      await hapusSet(db, k);
    await writeAudit(s.nim, "tp_lms", { aksi: "putus" });
    return res.status(200).json({ ok: true });
  }
  if (langkah === "uji") {
    const set = await bacaSet(db);
    const token = set.token ? bukaToken(set.token) : null;
    if (!token) return tolak(res, "belum_tersambung");
    const t0 = Date.now();
    try {
      const info = await infoSitus(token);
      const kursus = await kursusPraktikum(token, info.userid);
      return res.status(200).json({ ok: true, ms: Date.now() - t0, kursus: kursus.length });
    } catch (e) {
      return tolak(res, e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau");
    }
  }
  if (langkah !== "sambung" || typeof b.tempel !== "string") return tolak(res, "format_salah");
  const tempel = bacaTempelan(b.tempel);
  if (!tempel) return tolak(res, "tempelan_salah");
  const token = tempel.token;
  let info;
  let kursus;
  try {
    info = await infoSitus(token);
    kursus = await kursusPraktikum(token, info.userid);
  } catch (e) {
    // The reason goes back to the Pencipta or Admin connecting (never the token).
    return res.status(200).json({
      ok: false,
      kode: e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau",
      rinci: e instanceof Error ? e.message.slice(0, 200) : String(e),
    });
  }
  const lama = await bacaSet(db);
  const baru = sandikanToken(token);
  // The private key comes only right after a sign in: a later paste of the
  // same token keeps the one IRIS has.
  const privat = tempel.privat
    ? sandikanToken(tempel.privat)
    : lama.token?.sidik === baru.sidik
      ? (lama.token.privat ?? null)
      : null;
  const simpan: TokenSet = {
    ...baru,
    akun: { userid: info.userid, nama: info.fullname, username: info.username },
    pada: new Date().toISOString(),
    oleh: s.nim,
    privat,
  };
  await tulisSet(db, KUNCI_TP.token, simpan, s.nim);
  await hapusSet(db, KUNCI_WEB);
  // A new account: the old one's courses and errors go.
  await hapusSet(db, KUNCI_TP.kelas);
  await hapusSet(db, KUNCI_TP.status);
  await writeAudit(s.nim, "tp_lms", {
    aksi: "sambung",
    akun: info.username,
    kursus: kursus.length,
    kelola: !!privat,
  });
  const sinkron = await sinkronTp(db, `manual:${s.nim}`, { paksa: true });
  res
    .status(200)
    .json({ ok: true, akun: simpan.akun, kursus: kursus.length, kelola: !!privat, sinkron });
}

/**
 * One class course's TP assignment, in the LMS itself: made (buat), set to
 * IRIS's window (ubah), given the TP's PDF (lampir) or deleted (hapus).
 * Buat and ubah attach the PDF too when the page sends one (`pdf`, built in
 * the browser from the saved set). One course per call, so the
 * page shows each class as it goes and no call nears the time limit. The
 * LMS is asked again before and after, so a stale copy never makes a
 * second assignment, and the answer says whether the dates read back.
 */
async function handleLmsTugas(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const orang = await muatOrang(s.nim);
  if (!orang || !boleh(orang, "lms")) return tolak(res, "tidak_berhak", 403);
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  const langkah = b.langkah;
  const kursusId = Number(b.kursus);
  if (
    !m ||
    !Number.isInteger(kursusId) ||
    !["buat", "ubah", "lampir", "hapus"].includes(String(langkah))
  )
    return tolak(res, "format_salah");
  const pdf = pdfDari(b.pdf);
  if (pdf === false || (langkah === "lampir" && !pdf)) return tolak(res, "format_salah");
  const teks = typeof b.teks === "string" ? b.teks.slice(0, 4000) : "";
  const db = getDb();
  const set = await bacaSet(db);
  const token = set.token ? bukaToken(set.token) : null;
  if (!token) return tolak(res, "belum_tersambung");
  const k = (set.kelas?.kursus ?? []).find((x) => x.id === kursusId);
  if (!k) return tolak(res, "kursus_tidak_ada");
  const j = jendelaUntuk(set, m);
  if (langkah !== "hapus" && !j) return tolak(res, "jendela_belum_ada");

  let lampiran: { nama: string; ukuran: number; waktu: string | null }[] = [];
  const tugasNya = async (): Promise<TugasTp | null> => {
    const a = (await tugasKursus(token, [kursusId])).find(
      (t) => t.course === kursusId && modulTugas(t.name) === m,
    );
    const iso = (d: number) => (d > 0 ? new Date(d * 1000).toISOString() : null);
    lampiran = a?.lampiran ?? [];
    return a
      ? {
          id: a.id,
          cmid: a.cmid,
          nama: a.name,
          buka: iso(a.allowsubmissionsfromdate),
          tutup: iso(a.duedate),
          batas: iso(a.cutoffdate),
        }
      : null;
  };
  let sesudah: TugasTp | null;
  try {
    const web = webLms(db, set);
    const ada = await tugasNya();
    const rencana = j && {
      nama: namaTugasLms(m),
      buka: j.buka,
      tutup: j.tutup,
      deskripsi: htmlTugasLms(
        teks.trim() || teksTugasLms(m, j.tutup, k.kelas === "inter" ? "en" : "id"),
      ),
      tampil: b.tampil !== false,
    };
    if (langkah === "buat" && ada) return tolak(res, "sudah_ada");
    if (langkah !== "buat" && !ada) return tolak(res, "tidak_ada_di_lms");
    // The PDF goes to a draft area first; the form then names it.
    const draf = pdf && langkah !== "hapus" ? await unggahDraf(token, pdf.nama, pdf.isi) : 0;
    if (langkah === "buat") {
      // TP Modul m lives in Module m's section, made first when missing.
      const bagian = await pastikanBagianModul(web, token, kursusId, m, k.kelas === "inter");
      await buatTugas(web, kursusId, { ...rencana!, lampiran: draf || undefined }, bagian.section);
    } else if (langkah === "ubah") {
      await ubahTugas(web, ada!.cmid, { ...rencana!, lampiran: draf || undefined });
    } else if (langkah === "lampir") {
      await lampirTugas(web, ada!.cmid, draf);
    } else {
      await hapusTugas(web, ada!.cmid);
    }
    sesudah = await tugasNya();
  } catch (e) {
    const kode = e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau";
    if (!(e instanceof LmsGalat)) console.error("[api/tp lms-tugas] unexpected error:", e);
    await writeAudit(s.nim, "tp_lms_tugas", { modul: m, kursus: k.label, langkah, gagal: kode });
    return res.status(200).json({
      ok: false,
      kode,
      rinci: e instanceof Error ? e.message.slice(0, 300) : String(e),
    });
  }
  // The copy IRIS reads its windows and banners from.
  const segar = await bacaSet(db);
  if (segar.kelas) {
    const kk = segar.kelas.kursus.find((x) => x.id === kursusId);
    if (kk) kk.tugas[String(m)] = sesudah;
    await tulisSet(db, KUNCI_TP.kelas, segar.kelas, null);
  }
  await writeAudit(s.nim, "tp_lms_tugas", {
    modul: m,
    kursus: k.label,
    langkah,
    cmid: sesudah?.cmid ?? null,
    ...(pdf ? { pdf: pdf.nama } : {}),
  });
  // Read back: the dates, and the PDF when one was sent.
  const adaPdf = !pdf || lampiran.some((f) => f.nama === pdf.nama);
  const cocok =
    langkah === "hapus"
      ? !sesudah
      : !!sesudah && adaPdf && (langkah === "lampir" || (!!j && tanggalSama(sesudah, j)));
  res.status(200).json({ ok: true, cocok, tugas: sesudah, lampiran });
}

/** The TP's PDF the page sends: a .pdf name and its bytes, base64. Absent
 *  is null; malformed is false. */
function pdfDari(v: unknown): { nama: string; isi: Uint8Array } | null | false {
  if (v === undefined || v === null) return null;
  const o = v as { nama?: unknown; isi?: unknown };
  if (typeof o.nama !== "string" || !/^[\w.-]{1,96}\.pdf$/.test(o.nama)) return false;
  if (typeof o.isi !== "string" || o.isi.length > PDF_MAKS * 1.4) return false;
  const isi = new Uint8Array(Buffer.from(o.isi, "base64"));
  if (
    isi.length < 8 ||
    isi.length > PDF_MAKS ||
    Buffer.from(isi.subarray(0, 5)).toString() !== "%PDF-"
  )
    return false;
  return { nama: o.nama, isi };
}

/** Under Vercel's 4.5 MB request body once base64 */
const PDF_MAKS = 3 * 1024 * 1024;

/** Leave a registered Praktikan out of TP, or take them back. */
async function handleKecuali(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const orang = await muatOrang(s.nim);
  if (!orang || !boleh(orang, "lms")) return tolak(res, "tidak_berhak", 403);
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
  // Phase 18: the lab clock's minute (automatic starts) rides the same
  // beat, first, as it keeps time; it never throws, so the TP part runs.
  await jamLabBilaPerlu(db);
  // 50 s, not 60: the timer fires once a minute with a little drift, and a
  // run 59.9 s ago would otherwise skip a whole minute.
  await sinkronBilaPerlu(db, "relay", 50_000);
  await kirimTertunda(db);
  res.status(200).json({ ok: true, tidurDetik: batasTidurJamLab(tidurDetik()) });
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
  if (aksi === "saya") {
    if (!requireMethod(req, res, "GET")) return;
    const s = requireRole(req, res, "praktikan");
    return s ? handleSaya(req, res, s) : undefined;
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
    if (aksi === "lampiran") return handleLampiran(req, res);
    if (aksi === "praktikum") return handlePraktikum(req, res, s);
    if (aksi === "hitung") return handleHitung(req, res, s);
    if (aksi === "lms-info") return handleLmsInfo(req, res, s);
    if (aksi === "riwayat") return handleRiwayat(req, res, s);
    return tolak(res, "aksi_tidak_dikenal", 404);
  }
  if (!requireMethod(req, res, "POST")) return;
  if (aksi === "nilai") return handleNilai(req, res, s);
  if (aksi === "tanda") return handleTanda(req, res, s);
  if (aksi === "telat") return handleTelat(req, res, s);
  if (aksi === "sinkron") return handleSinkron(req, res, s);
  if (aksi === "jendela") return handleJendela(req, res, s);
  if (aksi === "paket") return handleSimpanPaket(req, res, s);
  if (aksi === "pilih") return handlePilih(req, res, s);
  if (aksi === "bawaan") return handleBawaan(req, res, s);
  if (aksi === "lms") return handleLms(req, res, s);
  if (aksi === "lms-tugas") return handleLmsTugas(req, res, s);
  if (aksi === "kecuali") return handleKecuali(req, res, s);
  return tolak(res, "aksi_tidak_dikenal", 404);
}

export default denganSiaran("tp", handler);
