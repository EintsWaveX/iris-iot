/**
 * /api/lms/:aksi — the LMS menu (Phase 15, Beta). The eleventh serverless
 * function (the Hobby cap is 12). IRIS runs the Telkom LMS's practicum
 * classes from here: every change happens in the real LMS (the app token,
 * or the Teacher web session for what the token can't do) and is read
 * back. The connection itself stays in /api/tp (lms-info, lms, lms-tugas).
 *
 * Every Asisten reads; changes are for the Pencipta, Admins and the ASO
 * division (bolehKelolaLms), the same people who make the TP assignments.
 *
 * GET  /api/lms/ringkas[?modul=]   the live overview: the TP window, who
 *      handed in, each class, what IRIS does by itself, what to check, log
 * GET  /api/lms/kelas[?segar=1]    the class courses with their counts
 * GET  /api/lms/kelas-isi?kursus=&bagian=orang|isi|grup   one class, live
 * GET  /api/lms/tugas              assignments across the classes, live
 * GET  /api/lms/nilai?modul=       IRIS's TP scores against the gradebook
 * GET  /api/lms/umum               the announcements IRIS posted
 * GET  /api/lms/kalender           IRIS's events and where they are
 * GET  /api/lms/materi             the module sections and links
 * GET  /api/lms/log[?sebelum=]     what IRIS did in the LMS, 60 a page
 *
 * POST /api/lms/otomatis { kunci, nyala }
 * POST /api/lms/pesan { userid, kursus, teks }
 * POST /api/lms/perpanjang { tugas, kursus, userid, sampai|null, alasan? }
 * POST /api/lms/kunci { tugas, kursus, kunci }
 * POST /api/lms/kirim-ulang { tugas, kursus, userid }
 * POST /api/lms/nilai { modul, kursus }
 * POST /api/lms/umum { judul, isi: {id, en}, kursus, id? , jadwal? }
 * POST /api/lms/umum-tarik { id, kursus }
 * POST /api/lms/kalender { kursus }
 * POST /api/lms/tampil { kursus, cmid, tampil }
 * POST /api/lms/tugas { langkah: buat|ubah|hapus, kursus, nama, ... }
 * POST /api/lms/materi { modul, kursus }
 * POST /api/lms/grup { kursus }
 *
 * The batch writes take one class course per call, so the page shows each
 * class as it goes and no call nears the time limit.
 */
import { randomBytes } from "node:crypto";
import { and, desc, eq, like, lt, or } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonBody, noStore, requireMethod } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { muatOrang } from "../_lib/hak.js";
import { denganSiaran } from "../_lib/siaran.js";
import { getDb } from "../../src/lib/db.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import { bolehKelolaLms } from "../../src/lib/hak.js";
import { SITE_URL } from "../../src/lib/lab.js";
import {
  asisten,
  audit,
  lmsPeserta,
  praktikan,
  rosterSlot,
  tpKiriman,
} from "../../src/lib/schema.js";
import { keadaanJendela, modulTugas, tanggalSama } from "../../src/lib/tp.js";
import {
  LmsGalat,
  berkasDari,
  kirimanTugas,
  nimDari,
  pelajar,
  teksLms,
  tugasKursus,
} from "../_lib/lms.js";
import {
  buatGrup,
  buatTautan,
  buatTugas,
  hapusTugas,
  isiGrup,
  namaiBagian,
  ubahTugas,
} from "../_lib/lms-web.js";
import {
  bacaSet,
  jendelaUntuk,
  nimKecuali,
  pesertaKursusTp,
  riwayatSinkron,
  webLms,
} from "../_lib/tp.js";
import {
  KUNCI_LMS,
  NAMA_MODUL,
  OTOMATIS,
  bacaCatatan,
  bacaOtomatis,
  benderaTugas,
  grupKursus,
  hapusPost,
  htmlTeks,
  isiKursus,
  kembalikanDraf,
  kirimPesan,
  kunciKiriman,
  nilaiLms,
  orangKursus,
  postPertama,
  sebagian,
  simpanPerpanjang,
  tampilModul,
  tulisCatatan,
  type AcaraIris,
  type MateriIris,
  type Otomatis,
  type OtomatisSet,
  type Perpanjang,
  type UmumIris,
} from "../_lib/lms-menu.js";
import {
  acaraIngin,
  kirimNilaiKursus,
  kursusDari,
  modulPilihan,
  namaGrup,
  nilaiSiap,
  petaKode,
  samakanKalender,
  templatUmum,
  tokenDari,
  umumkanKursus,
} from "../_lib/lms-kerja.js";
import { tulisSet } from "../_lib/tp.js";

type Db = ReturnType<typeof getDb>;

const tolak = (res: ApiResponse, kode: string, status = 200) =>
  res.status(status).json({ ok: false, kode });

const modulDari = (v: unknown) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
};

const angka = (v: unknown) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const iso = (detik: number) => (detik > 0 ? new Date(detik * 1000).toISOString() : null);
const detik = (s: string) => Math.floor(Date.parse(s) / 1000);

/** The Orange Pi syncs every five minutes while a window is open. */
const JEDA_SINKRON_MS = 5 * 60_000;
/** Group and activity counts are read again after this. */
const INFO_SEGAR_MS = 12 * 3_600_000;

/** An LMS failure as the page shows it; anything else is logged. */
function gagal(res: ApiResponse, e: unknown, tempat: string) {
  const kode = e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau";
  if (!(e instanceof LmsGalat)) console.error(`[api/lms ${tempat}] unexpected error:`, e);
  return res.status(200).json({
    ok: false,
    kode,
    rinci: e instanceof Error ? e.message.slice(0, 300) : String(e),
  });
}

/* ========================================================== the overview */

interface BarisLog {
  pada: string;
  oleh: string;
  aksi: string;
  langkah: string | null;
  modul: number | null;
  judul: string | null;
  kelas: number;
  gagal: number;
}

/** What IRIS did in the LMS, the audit's rows grouped: one batch over the
 *  classes is one line ("Buat TP Modul 1 · 11 kelas"). */
async function logLms(db: Db, n: number, sebelum?: Date): Promise<BarisLog[]> {
  const rows = await db
    .select({ pada: audit.pada, nim: audit.aktorNim, aksi: audit.aksi, detail: audit.detail })
    .from(audit)
    .where(
      and(
        or(like(audit.aksi, "tp_lms%"), like(audit.aksi, "lms_%")),
        ...(sebelum ? [lt(audit.pada, sebelum)] : []),
      ),
    )
    .orderBy(desc(audit.pada))
    .limit(n * 12);
  const kodeOf = await petaKode(db);
  const out: (BarisLog & { kunci: string; akhir: number })[] = [];
  for (const r of rows) {
    let d: Record<string, unknown> = {};
    try {
      d = r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : {};
    } catch {
      d = {};
    }
    const langkah =
      typeof d.langkah === "string" ? d.langkah : typeof d.aksi === "string" ? d.aksi : null;
    const modul = typeof d.modul === "number" ? d.modul : null;
    const judul =
      typeof d.judul === "string" ? d.judul : typeof d.nama === "string" ? d.nama : null;
    const kunci = `${r.nim}|${r.aksi}|${langkah}|${modul}|${judul}`;
    const t = r.pada.getTime();
    const prev = out[out.length - 1];
    if (prev && prev.kunci === kunci && prev.akhir - t < 15 * 60_000) {
      prev.kelas += 1;
      if (d.gagal) prev.gagal += 1;
      prev.akhir = t;
      continue;
    }
    if (out.length >= n) break;
    out.push({
      kunci,
      akhir: t,
      pada: r.pada.toISOString(),
      oleh: r.nim === "pi" || r.nim === "otomatis" ? r.nim : (kodeOf.get(r.nim) ?? r.nim),
      aksi: r.aksi,
      langkah,
      modul,
      judul,
      kelas: 1,
      gagal: d.gagal ? 1 : 0,
    });
  }
  return out.map(({ kunci: _k, akhir: _a, ...b }) => b);
}

async function handleRingkas(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const set = await bacaSet(db);
  const orang = await muatOrang(s.nim);
  const m = modulDari(req.query.modul) ?? modulPilihan(set);
  const j = jendelaUntuk(set, m);
  const keadaan = keadaanJendela(j);
  const kec = nimKecuali(set);
  const [kiriman, terdaftar, otomatis, info, log, sinkronLog] = await Promise.all([
    db
      .select({
        nim: tpKiriman.nim,
        berkas: tpKiriman.berkas,
        kursus: tpKiriman.lmsKursus,
        pada: tpKiriman.dikirimPada,
      })
      .from(tpKiriman)
      .where(and(eq(tpKiriman.semester, set.semester), eq(tpKiriman.modul, m))),
    db
      .select({ nim: praktikan.nim, nama: praktikan.nama })
      .from(praktikan)
      .where(eq(praktikan.semester, set.semester)),
    bacaOtomatis(db),
    bacaCatatan<InfoKelas | null>(db, KUNCI_LMS.info, set.semester, null),
    logLms(db, 6),
    riwayatSinkron(db, 4),
  ]);
  const namaOf = new Map(terdaftar.map((p) => [p.nim, p.nama]));
  const kursus = set.kelas?.kursus ?? [];
  const labelOf = new Map(kursus.map((k) => [k.id, k.label]));
  const ada = kiriman.filter((x) => x.berkas.length && !kec.has(x.nim));
  const peserta = terdaftar.filter((p) => !kec.has(p.nim)).length;
  const luar = set.kelas?.luar?.length ?? null;
  const diKelas = kursus.reduce((n, k) => n + (k.nim?.length ?? k.peserta), 0);
  const cek: { k: string; n?: number; kelas?: string[]; galat?: string | null }[] = [];
  if (luar) cek.push({ k: "luar", n: luar });
  if (info) {
    const tanpa = kursus.filter((k) => info.per[String(k.id)]?.grup === 0).map((k) => k.label);
    if (tanpa.length) cek.push({ k: "grup", kelas: tanpa });
  }
  if (j) {
    const beda = kursus.filter((k) => {
      const t = k.tugas[String(m)];
      return t && !tanggalSama(t, j);
    });
    if (beda.length) cek.push({ k: "tanggal", n: beda.length, kelas: beda.map((k) => k.label) });
    const hilang = kursus.filter((k) => !k.tugas[String(m)]);
    if (hilang.length)
      cek.push({ k: "hilang", n: hilang.length, kelas: hilang.map((k) => k.label) });
  }
  if (set.token && !set.token.privat) cek.push({ k: "kunci" });
  if (set.status.hasil === "gagal") cek.push({ k: "sinkron", galat: set.status.galat });
  const kodeOf = await petaKode(db);
  res.status(200).json({
    ok: true,
    modul: m,
    jendela: j,
    keadaan,
    masuk: ada.length,
    peserta,
    perKursus: kursus.map((k) => ({
      id: k.id,
      label: k.label,
      kelas: k.kelas,
      peserta: pesertaKursusTp(k, kec),
      masuk: ada.filter((x) => x.kursus === k.id).length,
      ada: !!k.tugas[String(m)],
    })),
    baru: ada
      .filter((x) => x.pada)
      .sort((a, b) => b.pada!.getTime() - a.pada!.getTime())
      .slice(0, 8)
      .map((x) => ({
        nama: namaOf.get(x.nim) ?? x.nim,
        kursus: (x.kursus && labelOf.get(x.kursus)) || null,
        pada: x.pada!.toISOString(),
      })),
    kelasSiap: kursus.filter((k) => !!k.tugas[String(m)]).length,
    kelasJumlah: kursus.length,
    mahasiswaLms: set.kelas?.pesertaPada ? diKelas + (luar ?? 0) : null,
    luar,
    cek,
    otomatis: { nyala: otomatis.nyala, ubah: ubahDenganKode(otomatis, kodeOf) },
    sambungan: {
      ada: !!set.token,
      kelola: !!set.token?.privat,
      akun: set.token?.akun.nama ?? null,
      pada: set.token?.pada ?? null,
    },
    sinkron: {
      terakhir: set.status.terakhir,
      hasil: set.status.hasil,
      galat: set.status.galat,
      jedaMs: JEDA_SINKRON_MS,
    },
    log,
    sinkronLog: sinkronLog.map((r) => ({
      pada: r.mulai.toISOString(),
      oleh: r.oleh.startsWith("manual:")
        ? (kodeOf.get(r.oleh.slice(7)) ?? r.oleh.slice(7))
        : r.oleh,
      hasil: r.hasil,
      baru: r.baru,
      galat: r.galat,
    })),
    boleh: !!orang && bolehKelolaLms(orang),
  });
}

function ubahDenganKode(o: OtomatisSet, kodeOf: Map<string, string>) {
  return Object.fromEntries(
    Object.entries(o.ubah).map(([k, v]) => [
      k,
      v ? { ...v, oleh: kodeOf.get(v.oleh) ?? v.oleh } : v,
    ]),
  );
}

async function handleLog(req: ApiRequest, res: ApiResponse) {
  const sebelum = typeof req.query.sebelum === "string" ? new Date(req.query.sebelum) : undefined;
  const db = getDb();
  const baris = await logLms(
    db,
    60,
    sebelum && !Number.isNaN(sebelum.getTime()) ? sebelum : undefined,
  );
  res.status(200).json({ ok: true, log: baris, lagi: baris.length === 60 });
}

/* ============================================================== classes */

interface InfoKelas {
  pada: string;
  per: Record<string, { grup: number; aktivitas: number; bagian: number }>;
}

async function handleKelas(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const set = await bacaSet(db);
  const orang = await muatOrang(s.nim);
  const kursus = set.kelas?.kursus ?? [];
  let info = await bacaCatatan<InfoKelas | null>(db, KUNCI_LMS.info, set.semester, null);
  const basi = !info || Date.now() - Date.parse(info.pada) > INFO_SEGAR_MS;
  let galat: string | null = null;
  if (set.token && kursus.length && (req.query.segar === "1" || basi)) {
    try {
      const token = tokenDari(set);
      const hasil = await sebagian(kursus, 4, async (k) => {
        const [g, isi] = await Promise.all([grupKursus(token, k.id), isiKursus(token, k.id)]);
        return [
          String(k.id),
          {
            grup: g.length,
            aktivitas: isi.reduce((n, b) => n + b.modules.length, 0),
            bagian: isi.length,
          },
        ] as const;
      });
      info = { pada: new Date().toISOString(), per: Object.fromEntries(hasil) };
      await tulisCatatan(db, KUNCI_LMS.info, set.semester, info, null);
    } catch (e) {
      galat = e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau";
    }
  }
  const luarPer = new Map<string, number>();
  for (const l of set.kelas?.luar ?? []) luarPer.set(l.kursus, (luarPer.get(l.kursus) ?? 0) + 1);
  res.status(200).json({
    ok: true,
    galat,
    infoPada: info?.pada ?? null,
    lmsUrl: process.env.LMS_URL || "https://lms.telkomuniversity.ac.id",
    kursus: kursus.map((k) => {
      const i = info?.per[String(k.id)];
      const iris = k.nim?.length ?? k.peserta;
      const luar = luarPer.get(k.label) ?? 0;
      return {
        id: k.id,
        label: k.label,
        nama: k.nama,
        kelas: k.kelas,
        iris,
        luar,
        mahasiswa: set.kelas?.pesertaPada ? iris + luar : null,
        grup: i?.grup ?? null,
        aktivitas: i?.aktivitas ?? null,
      };
    }),
    boleh: !!orang && bolehKelolaLms(orang),
  });
}

async function handleKelasIsi(req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const set = await bacaSet(db);
  const k = kursusDari(set, req.query.kursus);
  if (!k) return tolak(res, "kursus_tidak_ada");
  const bagian = req.query.bagian;
  try {
    const token = tokenDari(set);
    if (bagian === "isi") {
      const isi = await isiKursus(token, k.id);
      return res.status(200).json({
        ok: true,
        bagian: isi.map((b) => ({
          id: b.id,
          nomor: b.section,
          nama: b.name,
          tampil: b.visible !== 0,
          modul: b.modules.map((x) => ({
            cmid: x.id,
            nama: x.name,
            jenis: x.modname,
            tampil: x.visible !== 0,
          })),
        })),
      });
    }
    const [orang, terdaftar, asistenRows, roster] = await Promise.all([
      orangKursus(token, k.id),
      db
        .select({ nim: praktikan.nim, kelas: praktikan.kelas })
        .from(praktikan)
        .where(eq(praktikan.semester, set.semester)),
      db.select({ nim: asisten.nim, kode: asisten.kode }).from(asisten),
      db
        .select({
          nim: rosterSlot.nim,
          hari: rosterSlot.hari,
          slot: rosterSlot.slot,
          nomor: rosterSlot.kelompokNomor,
        })
        .from(rosterSlot)
        .where(eq(rosterSlot.semester, set.semester)),
    ]);
    const daftar = new Set(terdaftar.map((p) => p.nim));
    const kodeOf = new Map(asistenRows.map((a) => [a.nim, a.kode.toUpperCase()]));
    const grupOf = new Map(roster.map((r) => [r.nim, r]));
    if (bagian === "grup") {
      const grup = await grupKursus(token, k.id);
      const anggota = new Map<number, number[]>();
      for (const u of orang)
        for (const g of u.groups ?? []) anggota.set(g.id, [...(anggota.get(g.id) ?? []), u.id]);
      // The IRIS groups of this class's Praktikan, as LMS group names.
      const ingin = new Map<string, number[]>();
      for (const u of orang) {
        if (!pelajar(u)) continue;
        const nim = nimDari(u);
        const r = nim ? grupOf.get(nim) : undefined;
        if (!r) continue;
        const n = namaGrup(r.hari, r.slot, r.nomor);
        ingin.set(n, [...(ingin.get(n) ?? []), u.id]);
      }
      const adaNama = new Map(grup.map((g) => [g.name, g]));
      return res.status(200).json({
        ok: true,
        grup: [
          ...grup.map((g) => {
            const mau = ingin.get(g.name) ?? null;
            const punya = anggota.get(g.id) ?? [];
            const beda = mau ? mau.filter((u) => !punya.includes(u)).length : null;
            return { id: g.id, nama: g.name, anggota: punya.length, iris: !!mau, kurang: beda };
          }),
          ...[...ingin]
            .filter(([n]) => !adaNama.has(n))
            .map(([n, us]) => ({ id: null, nama: n, anggota: 0, iris: true, kurang: us.length })),
        ].sort((a, b) => a.nama.localeCompare(b.nama, "id", { numeric: true })),
      });
    }
    return res.status(200).json({
      ok: true,
      orang: orang
        .map((u) => {
          const nim = nimDari(u);
          const guru = !pelajar(u);
          const kode = nim ? kodeOf.get(nim) : undefined;
          const terdaftarIni = !!nim && daftar.has(nim);
          const r = nim ? grupOf.get(nim) : undefined;
          return {
            id: u.id,
            nama: teksLms(u.fullname),
            nim,
            status: guru
              ? kode && terdaftarIni
                ? "keduanya"
                : kode
                  ? "asisten"
                  : "pengajar"
              : terdaftarIni
                ? "terdaftar"
                : "luar",
            kode: kode ?? null,
            kelompok: r ? { hari: r.hari, slot: r.slot, nomor: r.nomor } : null,
            akses: iso(u.lastcourseaccess ?? 0),
          };
        })
        .sort((a, b) => a.nama.localeCompare(b.nama, "id")),
    });
  } catch (e) {
    return gagal(res, e, "kelas-isi");
  }
}

/* ========================================================= assignments */

async function handleTugas(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const set = await bacaSet(db);
  const orang = await muatOrang(s.nim);
  const kursus = set.kelas?.kursus ?? [];
  try {
    const token = tokenDari(set);
    const tugas = await tugasKursus(
      token,
      kursus.map((k) => k.id),
    );
    const ids = tugas.map((t) => t.id);
    const [kir, bendera, peserta, terdaftar, catatan] = await Promise.all([
      kirimanTugas(token, ids),
      benderaTugas(token, ids),
      db
        .select({ nim: lmsPeserta.nim, user: lmsPeserta.lmsUser })
        .from(lmsPeserta)
        .where(eq(lmsPeserta.semester, set.semester)),
      db
        .select({ nim: praktikan.nim, nama: praktikan.nama })
        .from(praktikan)
        .where(eq(praktikan.semester, set.semester)),
      bacaCatatan<Perpanjang[]>(db, KUNCI_LMS.perpanjang, set.semester, []),
    ]);
    const kodeOf = await petaKode(db);
    const nimOf = new Map(peserta.map((p) => [p.user, p.nim]));
    const namaOf = new Map(terdaftar.map((p) => [p.nim, p.nama]));
    const kirOf = new Map(kir.map((a) => [a.assignmentid, a.submissions]));
    const labelOf = new Map(kursus.map((k) => [k.id, k]));
    // One row per name: the same assignment in every class.
    const per = new Map<string, typeof tugas>();
    for (const t of tugas) {
      const n = t.name.trim().replace(/\s+/g, " ");
      per.set(n.toLowerCase(), [...(per.get(n.toLowerCase()) ?? []), t]);
    }
    const daftar = [...per.values()].map((ts) => {
      const kelas = ts
        .filter((t) => labelOf.has(t.course))
        .map((t) => {
          const k = labelOf.get(t.course)!;
          const fl = bendera.get(t.id) ?? [];
          const ext = new Map(
            fl.filter((f) => f.extensionduedate > 0).map((f) => [f.userid, f.extensionduedate]),
          );
          const subs = (kirOf.get(t.id) ?? []).filter(
            (x) => x.status === "submitted" || berkasDari(x).length > 0,
          );
          const telat = subs.filter(
            (x) => t.duedate > 0 && x.timemodified > (ext.get(x.userid) ?? t.duedate),
          ).length;
          return {
            kursus: k.id,
            label: k.label,
            kelas: k.kelas,
            id: t.id,
            cmid: t.cmid,
            buka: iso(t.allowsubmissionsfromdate),
            tutup: iso(t.duedate),
            siswa:
              (k.nim?.length ?? k.peserta) +
              (set.kelas?.luar ?? []).filter((l) => l.kursus === k.label).length,
            masuk: subs.length,
            telat,
            terkunci: fl.filter((f) => f.locked).length,
            lampiran: t.lampiran.map((f) => f.nama),
            perpanjang: [...ext].map(([userid, sampai]) => {
              const nim = nimOf.get(userid) ?? null;
              const c = catatan.find((x) => x.tugas === t.id && x.userid === userid);
              return {
                userid,
                nim,
                nama: (nim && namaOf.get(nim)) || null,
                sampai: iso(sampai),
                alasan: c?.alasan ?? null,
                oleh: c ? (kodeOf.get(c.oleh) ?? c.oleh) : null,
              };
            }),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
      const nama = ts[0].name.trim();
      const sama =
        kelas.length > 0 &&
        kelas.every((k) => k.buka === kelas[0].buka && k.tutup === kelas[0].tutup);
      return {
        nama,
        tp: modulTugas(nama),
        buka: kelas[0]?.buka ?? null,
        tutup: kelas[0]?.tutup ?? null,
        sama,
        kelas,
      };
    });
    daftar.sort(
      (a, b) =>
        (a.tp ?? 9) - (b.tp ?? 9) ||
        (a.buka ?? "").localeCompare(b.buka ?? "") ||
        a.nama.localeCompare(b.nama),
    );
    res.status(200).json({
      ok: true,
      tugas: daftar,
      kursus: kursus.map((k) => ({ id: k.id, label: k.label, kelas: k.kelas })),
      kelasJumlah: kursus.length,
      boleh: !!orang && bolehKelolaLms(orang),
      kelola: !!set.token?.privat,
    });
  } catch (e) {
    return gagal(res, e, "tugas");
  }
}

/** A student of that class (never an arbitrary LMS user): their NIM. */
async function siswaKelas(token: string, kursus: number, userid: number) {
  const u = (await orangKursus(token, kursus)).find((x) => x.id === userid);
  if (!u || !pelajar(u)) throw new LmsGalat("tidak_di_kelas", "not a student of that class");
  return { nim: nimDari(u) ?? "", nama: teksLms(u.fullname) };
}

async function handlePerpanjang(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const set = await bacaSet(db);
  const k = kursusDari(set, b.kursus);
  const tugas = angka(b.tugas);
  const userid = angka(b.userid);
  const sampai =
    typeof b.sampai === "string" && !Number.isNaN(Date.parse(b.sampai)) ? b.sampai : null;
  if (!k || !tugas || !userid || (b.sampai !== null && !sampai)) return tolak(res, "format_salah");
  const alasan = typeof b.alasan === "string" ? b.alasan.trim().slice(0, 200) : "";
  try {
    const token = tokenDari(set);
    const { nim } = await siswaKelas(token, k.id, userid);
    const ts = await tugasKursus(token, [k.id]);
    const t = ts.find((x) => x.id === tugas);
    if (!t) return tolak(res, "tidak_ada_di_lms");
    await simpanPerpanjang(token, tugas, userid, sampai ? detik(sampai) : 0);
    const fl = (await benderaTugas(token, [tugas])).get(tugas) ?? [];
    const kini = fl.find((f) => f.userid === userid)?.extensionduedate ?? 0;
    const cocok = sampai ? Math.abs(kini - detik(sampai)) < 60 : kini === 0;
    const daftar = (
      await bacaCatatan<Perpanjang[]>(db, KUNCI_LMS.perpanjang, set.semester, [])
    ).filter((x) => !(x.tugas === tugas && x.userid === userid));
    if (sampai)
      daftar.push({
        tugas,
        nama: t.name,
        kursus: k.id,
        nim,
        userid,
        sampai,
        alasan,
        oleh: s.nim,
        pada: new Date().toISOString(),
      });
    await tulisCatatan(db, KUNCI_LMS.perpanjang, set.semester, daftar, s.nim);
    await writeAudit(s.nim, "lms_perpanjang", {
      langkah: sampai ? "perpanjang" : "cabut",
      nama: t.name,
      kursus: k.label,
      nim,
    });
    res.status(200).json({ ok: true, cocok });
  } catch (e) {
    return gagal(res, e, "perpanjang");
  }
}

async function handleKunci(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const set = await bacaSet(db);
  const k = kursusDari(set, b.kursus);
  const tugas = angka(b.tugas);
  if (!k || !tugas || typeof b.kunci !== "boolean") return tolak(res, "format_salah");
  try {
    const token = tokenDari(set);
    const ts = await tugasKursus(token, [k.id]);
    const t = ts.find((x) => x.id === tugas);
    if (!t) return tolak(res, "tidak_ada_di_lms");
    const orang = (await orangKursus(token, k.id)).filter(pelajar).map((u) => u.id);
    if (orang.length) await kunciKiriman(token, tugas, orang, b.kunci);
    const fl = (await benderaTugas(token, [tugas])).get(tugas) ?? [];
    const terkunci = fl.filter((f) => f.locked).length;
    await writeAudit(s.nim, "lms_kunci", {
      langkah: b.kunci ? "kunci" : "buka",
      nama: t.name,
      kursus: k.label,
    });
    res.status(200).json({
      ok: true,
      cocok: b.kunci ? terkunci >= orang.length : terkunci === 0,
      terkunci,
    });
  } catch (e) {
    return gagal(res, e, "kunci");
  }
}

async function handleKirimUlang(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const set = await bacaSet(db);
  const k = kursusDari(set, b.kursus);
  const tugas = angka(b.tugas);
  const userid = angka(b.userid);
  if (!k || !tugas || !userid) return tolak(res, "format_salah");
  try {
    const token = tokenDari(set);
    const { nim } = await siswaKelas(token, k.id, userid);
    if (!(await tugasKursus(token, [k.id])).some((x) => x.id === tugas))
      return tolak(res, "tidak_ada_di_lms");
    await kembalikanDraf(token, tugas, userid);
    await writeAudit(s.nim, "lms_kirim_ulang", { kursus: k.label, nim, tugas });
    res.status(200).json({ ok: true });
  } catch (e) {
    return gagal(res, e, "kirim-ulang");
  }
}

/** Any assignment in one class (Buat Tugas): made, changed or deleted. */
async function handleTugasTulis(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const set = await bacaSet(db);
  const k = kursusDari(set, b.kursus);
  const langkah = b.langkah;
  const nama = typeof b.nama === "string" ? b.nama.trim().slice(0, 120) : "";
  if (!k || !nama || !["buat", "ubah", "hapus"].includes(String(langkah)))
    return tolak(res, "format_salah");
  // TP Modul N belongs to the TP's own make/match (its window is IRIS's).
  if (modulTugas(nama)) return tolak(res, "nama_tp");
  const buka = typeof b.buka === "string" && !Number.isNaN(Date.parse(b.buka)) ? b.buka : null;
  const tutup = typeof b.tutup === "string" && !Number.isNaN(Date.parse(b.tutup)) ? b.tutup : null;
  if (langkah !== "hapus" && (!buka || !tutup || Date.parse(tutup) <= Date.parse(buka)))
    return tolak(res, "tanggal_salah");
  const teks =
    typeof b.teks === "object" && b.teks
      ? (b.teks as Record<string, unknown>)[k.kelas === "inter" ? "en" : "id"]
      : null;
  try {
    const token = tokenDari(set);
    const web = webLms(db, set);
    const cari = async () =>
      (await tugasKursus(token, [k.id])).find(
        (t) => t.name.trim().toLowerCase() === nama.toLowerCase(),
      ) ?? null;
    const ada = await cari();
    if (langkah === "buat" && ada) return tolak(res, "sudah_ada");
    if (langkah !== "buat" && !ada) return tolak(res, "tidak_ada_di_lms");
    const rencana = {
      nama,
      buka: buka!,
      tutup: tutup!,
      deskripsi: htmlTeks(typeof teks === "string" ? teks.slice(0, 4000) : ""),
      tampil: b.tampil !== false,
      ...(b.hanyaPdf === true ? { berkas: { jenis: ".pdf", maksByte: 10 * 1024 * 1024 } } : {}),
    };
    if (langkah === "buat") await buatTugas(web, k.id, rencana);
    else if (langkah === "ubah") await ubahTugas(web, ada!.cmid, rencana);
    else await hapusTugas(web, ada!.cmid);
    const sesudah = await cari();
    const cocok =
      langkah === "hapus"
        ? !sesudah
        : !!sesudah &&
          Math.abs(sesudah.allowsubmissionsfromdate - detik(buka!)) < 60 &&
          Math.abs(sesudah.duedate - detik(tutup!)) < 60;
    await writeAudit(s.nim, "lms_tugas", {
      langkah,
      nama,
      kursus: k.label,
      cmid: sesudah?.cmid ?? null,
    });
    res.status(200).json({ ok: true, cocok, cmid: sesudah?.cmid ?? null });
  } catch (e) {
    await writeAudit(s.nim, "lms_tugas", {
      langkah,
      nama,
      kursus: k.label,
      gagal: e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau",
    });
    return gagal(res, e, "tugas");
  }
}

/* =============================================================== grades */

async function handleNilaiBaca(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const m = modulDari(req.query.modul) ?? 1;
  const db = getDb();
  const set = await bacaSet(db);
  const orang = await muatOrang(s.nim);
  const kursus = set.kelas?.kursus ?? [];
  const kec = nimKecuali(set);
  const [siap, peserta, otomatis] = await Promise.all([
    nilaiSiap(db, set, m),
    db
      .select({ nim: lmsPeserta.nim, user: lmsPeserta.lmsUser })
      .from(lmsPeserta)
      .where(eq(lmsPeserta.semester, set.semester)),
    bacaOtomatis(db),
  ]);
  const userOf = new Map(peserta.map((p) => [p.nim, p.user]));
  let lms = new Map<number, Map<number, number>>();
  let galat: string | null = null;
  const ids = kursus.map((k) => k.tugas[String(m)]?.id).filter((x): x is number => !!x);
  if (set.token && ids.length) {
    try {
      lms = await nilaiLms(tokenDari(set), ids);
    } catch (e) {
      galat = e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau";
    }
  }
  const perKursus = kursus.map((k) => {
    const t = k.tugas[String(m)];
    const nims = (k.nim ?? []).filter((n) => !kec.has(n));
    const g = t ? (lms.get(t.id) ?? new Map<number, number>()) : new Map<number, number>();
    let sama = 0;
    let beda = 0;
    let belum = 0;
    for (const n of nims) {
      const sp = siap.get(n);
      const u = userOf.get(n);
      const v = u !== undefined ? g.get(u) : undefined;
      if (!sp) continue;
      if (v === undefined) belum++;
      else if (Math.abs(v - sp.total) < 0.005) sama++;
      else beda++;
    }
    return {
      id: k.id,
      label: k.label,
      ada: !!t,
      praktikan: nims.length,
      siap: nims.filter((n) => siap.has(n)).length,
      sama,
      beda,
      belum,
    };
  });
  const contoh = [...siap.values()][0] ?? null;
  res.status(200).json({
    ok: true,
    modul: m,
    galat,
    perKursus,
    jumlah: {
      siap: siap.size,
      sama: perKursus.reduce((n, k) => n + k.sama, 0),
      beda: perKursus.reduce((n, k) => n + k.beda, 0),
      belum: perKursus.reduce((n, k) => n + k.belum, 0),
    },
    contoh: contoh
      ? {
          total: contoh.total,
          baris: contoh.nomor.map((n) => ({ nomor: n, skor: contoh.per[n] ?? 0 })),
        }
      : null,
    otomatis: otomatis.nyala.nilai === true,
    boleh: !!orang && bolehKelolaLms(orang),
  });
}

async function handleNilaiKirim(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  const db = getDb();
  const set = await bacaSet(db);
  const k = kursusDari(set, b.kursus);
  if (!m || !k) return tolak(res, "format_salah");
  try {
    const r = await kirimNilaiKursus(db, set, m, k.id, s.nim);
    await writeAudit(s.nim, "lms_nilai", {
      langkah: "kirim",
      modul: m,
      kursus: k.label,
      n: r.kirim,
    });
    res.status(200).json({ ok: true, ...r });
  } catch (e) {
    await writeAudit(s.nim, "lms_nilai", {
      langkah: "kirim",
      modul: m,
      kursus: k.label,
      gagal: e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau",
    });
    return gagal(res, e, "nilai");
  }
}

/* ======================================================== announcements */

async function handleUmumBaca(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const set = await bacaSet(db);
  const orang = await muatOrang(s.nim);
  const [daftar, otomatis, kodeOf] = await Promise.all([
    bacaCatatan<UmumIris[]>(db, KUNCI_LMS.umum, set.semester, []),
    bacaOtomatis(db),
    petaKode(db),
  ]);
  const kursus = set.kelas?.kursus ?? [];
  res.status(200).json({
    ok: true,
    umum: daftar
      .filter((u) => !u.ditarik)
      .map((u) => ({
        id: u.id,
        judul: u.judul,
        judulEn: u.judulEn,
        isi: u.isi,
        oleh: kodeOf.get(u.oleh) ?? u.oleh,
        pada: u.pada,
        jadwal: u.jadwal,
        tujuan: u.tujuan.length,
        terkirim: Object.values(u.kursus).filter(Boolean).length,
      }))
      .reverse(),
    templat: templatUmum(set),
    kursus: kursus.map((k) => ({ id: k.id, label: k.label, kelas: k.kelas })),
    otomatis: otomatis.nyala.umum === true,
    boleh: !!orang && bolehKelolaLms(orang),
  });
}

async function handleUmumTulis(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const set = await bacaSet(db);
  const k = kursusDari(set, b.kursus);
  if (!k) return tolak(res, "format_salah");
  let id = typeof b.id === "string" && /^[a-f0-9]{12}$/.test(b.id) ? b.id : null;
  // The first class of a batch writes the announcement down; the rest name it.
  if (!id) {
    const judul =
      typeof b.judul === "object" && b.judul ? (b.judul as Record<string, unknown>) : {};
    const isi = typeof b.isi === "object" && b.isi ? (b.isi as Record<string, unknown>) : {};
    const jid = typeof judul.id === "string" ? judul.id.trim().slice(0, 200) : "";
    const jen = typeof judul.en === "string" ? judul.en.trim().slice(0, 200) : "";
    const iid = typeof isi.id === "string" ? isi.id.trim().slice(0, 6000) : "";
    const ien = typeof isi.en === "string" ? isi.en.trim().slice(0, 6000) : "";
    const tujuan = Array.isArray(b.tujuan) ? b.tujuan.map(Number).filter(Number.isInteger) : [k.id];
    const jadwal =
      typeof b.jadwal === "string" && Date.parse(b.jadwal) > Date.now() ? b.jadwal : null;
    if (!jid || !iid) return tolak(res, "format_salah");
    id = randomBytes(6).toString("hex");
    const daftar = await bacaCatatan<UmumIris[]>(db, KUNCI_LMS.umum, set.semester, []);
    daftar.push({
      id,
      judul: jid,
      judulEn: jen || jid,
      isi: { id: iid, en: ien || iid },
      oleh: s.nim,
      pada: new Date().toISOString(),
      jadwal,
      kursus: Object.fromEntries(tujuan.map((t: number) => [String(t), null])),
      tujuan,
    });
    await tulisCatatan(db, KUNCI_LMS.umum, set.semester, daftar.slice(-200), s.nim);
    await writeAudit(s.nim, "lms_umum", { langkah: jadwal ? "jadwal" : "tulis", judul: jid });
    // A scheduled one goes out with the Orange Pi's heartbeat at its time.
    if (jadwal) return res.status(200).json({ ok: true, id, jadwal });
  }
  try {
    await umumkanKursus(db, set, id, k.id, s.nim);
    await writeAudit(s.nim, "lms_umum", { langkah: "kirim", kursus: k.label, id });
    res.status(200).json({ ok: true, id, cocok: true });
  } catch (e) {
    await writeAudit(s.nim, "lms_umum", {
      langkah: "kirim",
      kursus: k.label,
      id,
      gagal: e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau",
    });
    return gagal(res, e, "umum");
  }
}

async function handleUmumTarik(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const set = await bacaSet(db);
  const id = typeof b.id === "string" ? b.id : "";
  const daftar = await bacaCatatan<UmumIris[]>(db, KUNCI_LMS.umum, set.semester, []);
  const u = daftar.find((x) => x.id === id);
  if (!u) return tolak(res, "tidak_ada");
  // Without a class: a scheduled one that never went out is just dropped.
  const k = kursusDari(set, b.kursus);
  try {
    if (k) {
      const p = u.kursus[String(k.id)];
      if (p) {
        const token = tokenDari(set);
        const post = p.post ?? (await postPertama(token, p.diskusi));
        if (post) await hapusPost(token, post);
      }
      u.kursus[String(k.id)] = null;
    }
    if (!Object.values(u.kursus).some(Boolean))
      u.ditarik = { oleh: s.nim, pada: new Date().toISOString() };
    await tulisCatatan(db, KUNCI_LMS.umum, set.semester, daftar, s.nim);
    await writeAudit(s.nim, "lms_umum", {
      langkah: "tarik",
      kursus: k?.label ?? null,
      judul: u.judul,
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    return gagal(res, e, "umum-tarik");
  }
}

/* ============================================================ calendar */

async function handleKalenderBaca(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const set = await bacaSet(db);
  const orang = await muatOrang(s.nim);
  const [catatan, otomatis] = await Promise.all([
    bacaCatatan<Record<string, AcaraIris[]>>(db, KUNCI_LMS.kalender, set.semester, {}),
    bacaOtomatis(db),
  ]);
  const kursus = set.kelas?.kursus ?? [];
  const ingin = acaraIngin(set);
  res.status(200).json({
    ok: true,
    acara: ingin.map((a) => {
      const di = kursus.filter((k) =>
        (catatan[String(k.id)] ?? []).some(
          (x) => x.kunci === a.kunci && x.mulai === a.mulai && x.selesai === a.selesai,
        ),
      ).length;
      const lama = kursus.filter((k) =>
        (catatan[String(k.id)] ?? []).some(
          (x) => x.kunci === a.kunci && (x.mulai !== a.mulai || x.selesai !== a.selesai),
        ),
      ).length;
      return { ...a, di, lama };
    }),
    kelasJumlah: kursus.length,
    otomatis: otomatis.nyala.kalender === true,
    boleh: !!orang && bolehKelolaLms(orang),
  });
}

async function handleKalenderTulis(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const set = await bacaSet(db);
  const k = kursusDari(set, b.kursus);
  if (!k) return tolak(res, "format_salah");
  try {
    const r = await samakanKalender(db, set, k.id, s.nim);
    await writeAudit(s.nim, "lms_kalender", { langkah: "samakan", kursus: k.label, ...r });
    res.status(200).json({ ok: true, ...r });
  } catch (e) {
    await writeAudit(s.nim, "lms_kalender", {
      langkah: "samakan",
      kursus: k.label,
      gagal: e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau",
    });
    return gagal(res, e, "kalender");
  }
}

/* ============================================================ materials */

const urlModul = (m: number, inter: boolean) => `${SITE_URL}${inter ? "/en" : ""}/modules/${m}`;
const namaBagian = (m: number, inter: boolean) =>
  `${inter ? "Module" : "Modul"} ${m} · ${NAMA_MODUL[m]}`;
const namaTautan = (m: number, inter: boolean) =>
  inter
    ? `Module ${m} in IRIS (handbook, slides, journal)`
    : `Modul ${m} di IRIS (handbook, slide, jurnal)`;

async function handleMateriBaca(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const set = await bacaSet(db);
  const orang = await muatOrang(s.nim);
  const catatan = await bacaCatatan<Record<string, Record<string, MateriIris>>>(
    db,
    KUNCI_LMS.materi,
    set.semester,
    {},
  );
  const kursus = set.kelas?.kursus ?? [];
  res.status(200).json({
    ok: true,
    modul: [1, 2, 3, 4].map((m) => ({
      modul: m,
      nama: NAMA_MODUL[m],
      bagian: namaBagian(m, false),
      tautan: namaTautan(m, false),
      url: urlModul(m, false),
      di: kursus.filter((k) => {
        const c = catatan[String(m)]?.[String(k.id)];
        return !!c && !!c.url.modul;
      }).length,
    })),
    kelasJumlah: kursus.length,
    boleh: !!orang && bolehKelolaLms(orang),
    kelola: !!set.token?.privat,
  });
}

async function handleMateriTulis(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const m = modulDari(b.modul);
  const db = getDb();
  const set = await bacaSet(db);
  const k = kursusDari(set, b.kursus);
  if (!m || !k) return tolak(res, "format_salah");
  const inter = k.kelas === "inter";
  try {
    const token = tokenDari(set);
    const web = webLms(db, set);
    const cari = async () => (await isiKursus(token, k.id)).find((x) => x.section === m) ?? null;
    let bagian = await cari();
    if (!bagian) return tolak(res, "bagian_tidak_ada");
    const nama = namaBagian(m, inter);
    if (bagian.name !== nama) await namaiBagian(web, bagian.id, nama);
    const tNama = namaTautan(m, inter);
    if (!bagian.modules.some((x) => x.modname === "url" && x.name === tNama))
      await buatTautan(web, k.id, m, {
        nama: tNama,
        url: urlModul(m, inter),
        teks: htmlTeks(
          inter
            ? "Open to everyone: the handbook. After attending: the slides and your journal."
            : "Terbuka untuk semua: handbook. Setelah hadir: slide dan jurnalmu.",
        ),
      });
    bagian = await cari();
    const tautan = bagian?.modules.find((x) => x.modname === "url" && x.name === tNama) ?? null;
    const cocok = !!bagian && bagian.name === nama && !!tautan;
    const catatan = await bacaCatatan<Record<string, Record<string, MateriIris>>>(
      db,
      KUNCI_LMS.materi,
      set.semester,
      {},
    );
    catatan[String(m)] = {
      ...(catatan[String(m)] ?? {}),
      [String(k.id)]: {
        bagian: bagian?.id ?? null,
        nama: bagian?.name ?? null,
        url: tautan ? { modul: tautan.id } : {},
        pada: new Date().toISOString(),
      },
    };
    await tulisCatatan(db, KUNCI_LMS.materi, set.semester, catatan, s.nim);
    await writeAudit(s.nim, "lms_materi", { langkah: "pasang", modul: m, kursus: k.label });
    res.status(200).json({ ok: true, cocok });
  } catch (e) {
    await writeAudit(s.nim, "lms_materi", {
      langkah: "pasang",
      modul: m,
      kursus: k.label,
      gagal: e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau",
    });
    return gagal(res, e, "materi");
  }
}

async function handleTampil(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const set = await bacaSet(db);
  const k = kursusDari(set, b.kursus);
  const cmid = angka(b.cmid);
  if (!k || !cmid || typeof b.tampil !== "boolean") return tolak(res, "format_salah");
  try {
    const token = tokenDari(set);
    await tampilModul(token, cmid, b.tampil);
    const isi = await isiKursus(token, k.id);
    const x = isi.flatMap((g) => g.modules).find((y) => y.id === cmid);
    await writeAudit(s.nim, "lms_tampil", {
      langkah: b.tampil ? "tampil" : "sembunyi",
      kursus: k.label,
      nama: x?.name ?? String(cmid),
    });
    res.status(200).json({ ok: true, cocok: !!x && (x.visible !== 0) === b.tampil });
  } catch (e) {
    return gagal(res, e, "tampil");
  }
}

/* ============================================================== groups */

async function handleGrup(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const set = await bacaSet(db);
  const k = kursusDari(set, b.kursus);
  if (!k) return tolak(res, "format_salah");
  try {
    const token = tokenDari(set);
    const web = webLms(db, set);
    const [orang, roster] = await Promise.all([
      orangKursus(token, k.id),
      db
        .select({
          nim: rosterSlot.nim,
          hari: rosterSlot.hari,
          slot: rosterSlot.slot,
          nomor: rosterSlot.kelompokNomor,
        })
        .from(rosterSlot)
        .where(eq(rosterSlot.semester, set.semester)),
    ]);
    const grupOf = new Map(roster.map((r) => [r.nim, r]));
    const ingin = new Map<string, number[]>();
    for (const u of orang) {
      if (!pelajar(u)) continue;
      const nim = nimDari(u);
      const r = nim ? grupOf.get(nim) : undefined;
      if (!r) continue;
      const n = namaGrup(r.hari, r.slot, r.nomor);
      ingin.set(n, [...(ingin.get(n) ?? []), u.id]);
    }
    let grup = await grupKursus(token, k.id);
    let dibuat = 0;
    for (const n of ingin.keys())
      if (!grup.some((g) => g.name === n)) {
        await buatGrup(web, k.id, n);
        dibuat++;
      }
    if (dibuat) grup = await grupKursus(token, k.id);
    const punya = new Map<number, Set<number>>();
    for (const u of orang)
      for (const g of u.groups ?? []) punya.set(g.id, (punya.get(g.id) ?? new Set()).add(u.id));
    let diisi = 0;
    for (const [n, us] of ingin) {
      const g = grup.find((x) => x.name === n);
      if (!g) continue;
      const kurang = us.filter((u) => !punya.get(g.id)?.has(u));
      if (kurang.length) {
        await isiGrup(web, g.id, kurang);
        diisi += kurang.length;
      }
    }
    // Read back: every IRIS group exists and holds its members.
    const segar = await orangKursus(token, k.id);
    const kini = new Map<number, Set<number>>();
    for (const u of segar)
      for (const g of u.groups ?? []) kini.set(g.id, (kini.get(g.id) ?? new Set()).add(u.id));
    const cocok = [...ingin].every(([n, us]) => {
      const g = grup.find((x) => x.name === n);
      return !!g && us.every((u) => kini.get(g.id)?.has(u));
    });
    await writeAudit(s.nim, "lms_grup", { langkah: "samakan", kursus: k.label, dibuat, diisi });
    res.status(200).json({ ok: true, cocok, dibuat, diisi });
  } catch (e) {
    await writeAudit(s.nim, "lms_grup", {
      langkah: "samakan",
      kursus: k.label,
      gagal: e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau",
    });
    return gagal(res, e, "grup");
  }
}

/* ============================================================ messages */

async function handlePesan(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const set = await bacaSet(db);
  const k = kursusDari(set, b.kursus);
  const userid = angka(b.userid);
  const teks = typeof b.teks === "string" ? b.teks.trim().slice(0, 4000) : "";
  if (!k || !userid || !teks) return tolak(res, "format_salah");
  try {
    const token = tokenDari(set);
    // Only someone in that class: never an arbitrary LMS user.
    const orang = await orangKursus(token, k.id);
    const u = orang.find((x) => x.id === userid);
    if (!u) return tolak(res, "tidak_di_kelas");
    await kirimPesan(token, userid, htmlTeks(teks));
    await writeAudit(s.nim, "lms_pesan", { kursus: k.label, ke: nimDari(u) ?? userid });
    res.status(200).json({ ok: true });
  } catch (e) {
    return gagal(res, e, "pesan");
  }
}

/* ========================================================= automations */

async function handleOtomatis(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const kunci = b.kunci as Otomatis;
  if (!OTOMATIS.includes(kunci) || typeof b.nyala !== "boolean") return tolak(res, "format_salah");
  const db = getDb();
  const o = await bacaOtomatis(db);
  o.nyala[kunci] = b.nyala;
  o.ubah[kunci] = { oleh: s.nim, pada: new Date().toISOString() };
  await tulisSet(db, KUNCI_LMS.otomatis, o, s.nim);
  await writeAudit(s.nim, "lms_otomatis", { langkah: b.nyala ? "nyala" : "mati", nama: kunci });
  res.status(200).json({ ok: true, nyala: o.nyala });
}

/* ================================================================ route */

async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  const aksi = req.query.aksi;
  const s = requireRole(req, res, "asisten");
  if (!s) return;
  if (req.method === "GET") {
    if (aksi === "ringkas") return handleRingkas(req, res, s);
    if (aksi === "kelas") return handleKelas(req, res, s);
    if (aksi === "kelas-isi") return handleKelasIsi(req, res);
    if (aksi === "tugas") return handleTugas(req, res, s);
    if (aksi === "nilai") return handleNilaiBaca(req, res, s);
    if (aksi === "umum") return handleUmumBaca(req, res, s);
    if (aksi === "kalender") return handleKalenderBaca(req, res, s);
    if (aksi === "materi") return handleMateriBaca(req, res, s);
    if (aksi === "log") return handleLog(req, res);
    return tolak(res, "aksi_tidak_dikenal", 404);
  }
  if (!requireMethod(req, res, "POST")) return;
  // Every change: the Pencipta, Admins and the ASO division.
  const orang = await muatOrang(s.nim);
  if (!orang || !bolehKelolaLms(orang)) return tolak(res, "tidak_berhak", 403);
  if (aksi === "otomatis") return handleOtomatis(req, res, s);
  if (aksi === "pesan") return handlePesan(req, res, s);
  if (aksi === "perpanjang") return handlePerpanjang(req, res, s);
  if (aksi === "kunci") return handleKunci(req, res, s);
  if (aksi === "kirim-ulang") return handleKirimUlang(req, res, s);
  if (aksi === "nilai") return handleNilaiKirim(req, res, s);
  if (aksi === "umum") return handleUmumTulis(req, res, s);
  if (aksi === "umum-tarik") return handleUmumTarik(req, res, s);
  if (aksi === "kalender") return handleKalenderTulis(req, res, s);
  if (aksi === "tampil") return handleTampil(req, res, s);
  if (aksi === "tugas") return handleTugasTulis(req, res, s);
  if (aksi === "materi") return handleMateriTulis(req, res, s);
  if (aksi === "grup") return handleGrup(req, res, s);
  return tolak(res, "aksi_tidak_dikenal", 404);
}

export default denganSiaran("lms", handler);
