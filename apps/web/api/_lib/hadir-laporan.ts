/**
 * Phase 18 reports: what Laporan, the Tim drawer and Akun show of teaching
 * attendance and Lupa Input Nilai. Asisten only (the routes gate it).
 *
 * GET /api/session/rekap?sesiId=      adds `hadirAsisten` and `inputNilai`
 *     (muatHadirSesi, muatInputNilai below, called from laporan-data.ts).
 * GET /api/session/hadirrekap         the semester per person (Laporan ›
 *     Beban Asisten); ?nim= one person's counts and sessions (Tim drawer);
 *     ?saya=1 the signed-in person's own (Akun).
 *
 * A finished session is judged from its rows with the same rule as the
 * live view (src/lib/hadir-mengajar.ts); what Bayar stored at its last
 * rebuild wins for the cut, so a later rate change leaves a settled session
 * alone.
 */
import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  hadirJam,
  hadirMengajar,
  izin,
  lupaNilai,
  nilaiKirim,
  pengaturan,
  seelabsEkspor,
  sesi,
  sesiKejadian,
} from "../../src/lib/schema.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import {
  baseSlot,
  baseSusulan,
  hitungHadir,
  instanWib,
  potonganHadir,
  potonganPada,
  ringkasHadir,
  type RingkasOrang,
  type StatusLive,
} from "../../src/lib/hadir-mengajar.js";
import { batasNilai } from "../../src/lib/lupa-nilai.js";
import { rentangSemester } from "./bayar.js";
import { jamDariMenit } from "../../src/lib/sesi-mulai.js";
import { kunciDariSesi, muatKonteks, statusOrang } from "./hadir-mengajar.js";
import { AKTOR_OTOMATIS } from "./jam-lab.js";

type Db = ReturnType<typeof getDb>;

/* ------------------------------------------------------------ one session */

export interface HadirSesi {
  kunci: string;
  /** When IRIS started the session by itself (the start event's actor is "otomatis"). */
  otomatis: string | null;
  geser: { dari: string; ke: string; alasan: string; oleh: string } | null;
  pj: string | null;
  baris: {
    nim: string;
    kode: string;
    status: StatusLive;
    menit: number | null;
    hadirPada: string | null;
    potong: number;
    nolkanUnit: boolean;
    hitungMangkir: boolean;
    ubah: { status: string; alasan: string | null; oleh: string | null } | null;
  }[];
  /** Groups taken over from someone who never checked in. */
  ambilAlih: { dari: string; nomor: number | null; oleh: string; pada: string }[];
}

/** Everyone's attendance in one session, for its report; null for TOT or a session with no slot. */
export async function muatHadirSesi(
  db: Db,
  s: { id: number; tanggal: string; slot: number | null; jenis: string | null },
  now: Date,
): Promise<HadirSesi | null> {
  const kunci = await kunciDariSesi(db, s);
  if (!kunci) return null;
  const c = await muatKonteks(db, kunci);
  if (!c) return null;
  const baris = (await statusOrang(db, kunci, now, c)).filter((b) => b.status !== "lepas");
  const kej = await db
    .select({
      jenis: sesiKejadian.jenis,
      aktor: sesiKejadian.aktorNim,
      pada: sesiKejadian.pada,
      detail: sesiKejadian.detail,
    })
    .from(sesiKejadian)
    .where(and(eq(sesiKejadian.sesiId, s.id), inArray(sesiKejadian.jenis, ["mulai", "pasangan"])))
    .orderBy(asc(sesiKejadian.id));
  const mulai = kej.find((k) => k.jenis === "mulai");
  const tidakHadir = new Set(baris.filter((b) => !b.hadirPada).map((b) => b.nim));
  const ambilAlih = kej
    .filter((k) => k.jenis === "pasangan")
    .flatMap((k) => {
      const d = k.detail as { dari?: string | null; nomor?: number | null };
      return d.dari && tidakHadir.has(d.dari)
        ? [{ dari: d.dari, nomor: d.nomor ?? null, oleh: k.aktor, pada: k.pada.toISOString() }]
        : [];
    });
  return {
    kunci,
    otomatis: mulai && mulai.aktor === AKTOR_OTOMATIS ? mulai.pada.toISOString() : null,
    geser: c.geser
      ? {
          dari: jamDariMenit(c.geser.dariMenit),
          ke: jamDariMenit(c.baseMenit),
          alasan: c.geser.alasan,
          oleh: c.geser.oleh,
        }
      : null,
    pj: c.pj,
    baris: baris.map((b) => ({
      nim: b.nim,
      kode: b.kode,
      status: b.status,
      menit: b.menit,
      hadirPada: b.hadirPada,
      potong: b.potong,
      nolkanUnit: b.nolkanUnit,
      hitungMangkir: b.hitungMangkir,
      ubah: b.ubah ? { status: b.ubah.status, alasan: b.ubah.alasan, oleh: b.ubah.oleh } : null,
    })),
    ambilAlih,
  };
}

export type StatusNilai = "tepat" | "menyusul" | "lupa" | "terbuka";

export interface InputNilaiKelompok {
  nomor: number;
  pemegang: string | null;
  kirim: { oleh: string; pada: string } | null;
  simpan: { pada: string; cara: "robot" | "tangan" | null; akun: string } | null;
  /** The part a missed group lacked at the deadline. */
  kurang: ("kirim" | "seelabs")[];
  /** When a missed group was put in later (its record stays). */
  menyusulPada: string | null;
  status: StatusNilai;
}

/**
 * Each group's three steps for the session report: sent, saved in SeeLabs,
 * and whether that was in time (23:59 WIB on the practicum day). A group
 * not done after the deadline reads as Lupa Input Nilai even before the
 * nightly check has written its record.
 */
export async function muatInputNilai(
  db: Db,
  s: { id: number; tanggal: string; status: string; jenis: string | null },
  nomor: number[],
  pemegang: Map<number, string | null>,
  now: Date,
): Promise<InputNilaiKelompok[] | null> {
  if (s.jenis === "tot" || nomor.length === 0) return null;
  const [kirim, simpan, lupa] = await Promise.all([
    db.select().from(nilaiKirim).where(eq(nilaiKirim.sesiId, s.id)),
    db
      .select()
      .from(seelabsEkspor)
      .where(eq(seelabsEkspor.sesiId, s.id))
      .orderBy(desc(seelabsEkspor.disimpanPada)),
    db.select().from(lupaNilai).where(eq(lupaNilai.sesiId, s.id)),
  ]);
  const batas = batasNilai(s.tanggal);
  const lewat = now.getTime() > batas.getTime();
  return nomor.map((n) => {
    const k = kirim.find((x) => x.kelompokNomor === n) ?? null;
    const sv = simpan.find((x) => x.kelompokNomor === n && x.disimpanPada) ?? null;
    const l = lupa.find((x) => x.kelompokNomor === n) ?? null;
    const selesai = !!k && !!sv;
    const terakhir = selesai
      ? Math.max(k!.dikirimPada.getTime(), sv!.disimpanPada!.getTime())
      : null;
    let status: StatusNilai;
    if (selesai) status = l || terakhir! > batas.getTime() ? "menyusul" : "tepat";
    else if (l || (lewat && s.status === "selesai")) status = "lupa";
    else status = "terbuka";
    return {
      nomor: n,
      pemegang: pemegang.get(n) ?? l?.nim ?? null,
      kirim: k ? { oleh: k.dikirimOleh, pada: k.dikirimPada.toISOString() } : null,
      simpan: sv
        ? { pada: sv.disimpanPada!.toISOString(), cara: sv.cara ?? null, akun: sv.akunNim }
        : null,
      kurang: l?.kurang ?? [],
      menyusulPada:
        status === "menyusul" ? (l?.menyusulPada ?? new Date(terakhir!)).toISOString() : null,
      status,
    };
  });
}

/* -------------------------------------------------------------- semester */

export interface RiwayatHadir {
  sesiId: number;
  tanggal: string;
  slot: number | null;
  status: StatusLive;
  menit: number | null;
  /** The check-in time, "HH:MM", when they checked in. */
  hadirPada: string | null;
  potong: number;
  nolkanUnit: boolean;
  hitungMangkir: boolean;
  alasan: string | null;
}

export interface RiwayatNilai {
  sesiId: number;
  tanggal: string;
  slot: number | null;
  modul: number;
  nomor: number;
  kurang: ("kirim" | "seelabs")[];
  dicatatPada: string;
  menyusulPada: string | null;
}

export interface OrangHadir extends RingkasOrang {
  nim: string;
  /** Lupa Input Nilai records, and how many of them were put in later. */
  lupa: number;
  lupaMenyusul: number;
}

/** Every judged row of finished sessions in a date range, with the status it ends up at. */
async function muatBaris(db: Db, dari: string, sampai: string, nim?: string) {
  const rows = await db
    .select({
      h: hadirMengajar,
      tanggal: sesi.tanggal,
      slot: sesi.slot,
      mulai: sesi.mulai,
      jam: hadirJam.baseMenit,
    })
    .from(hadirMengajar)
    .innerJoin(sesi, eq(sesi.id, hadirMengajar.sesiId))
    .leftJoin(hadirJam, eq(hadirJam.kunci, hadirMengajar.kunci))
    .where(
      and(
        eq(sesi.status, "selesai"),
        ne(sesi.jenis, "tot"),
        gte(sesi.tanggal, dari),
        lte(sesi.tanggal, sampai),
        nim ? eq(hadirMengajar.nim, nim) : undefined,
      ),
    )
    .orderBy(desc(sesi.tanggal), asc(hadirMengajar.nim));
  if (rows.length === 0) return [];
  const izinRows = await db
    .select({ nim: izin.nim, jadwalId: izin.jadwalId, tanggal: izin.tanggal })
    .from(izin)
    .where(and(gte(izin.tanggal, dari), lte(izin.tanggal, sampai), ne(izin.status, "dibatalkan")));
  const izinSet = new Set(izinRows.map((i) => `${i.jadwalId}:${i.tanggal}:${i.nim}`));
  const [p] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, "potongan_telat"))
    .limit(1);
  const now = new Date();
  const out: (RiwayatHadir & { nim: string; kunci: string })[] = [];
  for (const r of rows) {
    const h = r.h;
    const ubah = h.ubahStatus ? { status: h.ubahStatus, menit: h.ubahMenit } : null;
    const izinKu =
      !ubah && h.jadwalId !== null && izinSet.has(`${h.jadwalId}:${r.tanggal}:${h.nim}`);
    if (!h.diharapkan && !izinKu && !ubah) continue;
    const baseMenit =
      r.jam ?? (r.slot !== null ? baseSlot(r.tanggal, r.slot) : baseSusulan(r.mulai));
    const hitung = hitungHadir({
      hadir: h.hadirPada,
      base: instanWib(r.tanggal, baseMenit),
      izin: izinKu,
      diharapkan: true,
      selesai: true,
      now,
      ubah,
    });
    const hitungan = potonganHadir(hitung, h.hitungMangkir, potonganPada(p?.nilai, r.tanggal));
    // What Bayar stored at its last rebuild wins over a recomputation.
    const nolkan = h.nolkanTercatat ?? hitungan.nolkanUnit;
    const potong = nolkan ? 0 : (h.potongTercatat ?? hitungan.potong);
    out.push({
      nim: h.nim,
      kunci: h.kunci,
      sesiId: h.sesiId as number,
      tanggal: r.tanggal,
      slot: r.slot,
      status: hitung.status,
      menit: hitung.menit,
      hadirPada: h.hadirPada ? h.hadirPada.toISOString() : null,
      potong,
      nolkanUnit: nolkan,
      hitungMangkir: h.hitungMangkir,
      alasan: h.alasan && h.alasan !== "ambil_alih" ? h.alasan : null,
    });
  }
  return out;
}

async function muatLupa(db: Db, dari: string, sampai: string, nim?: string) {
  const rows = await db
    .select({
      sesiId: lupaNilai.sesiId,
      nim: lupaNilai.nim,
      nomor: lupaNilai.kelompokNomor,
      kurang: lupaNilai.kurang,
      dicatatPada: lupaNilai.dicatatPada,
      menyusulPada: lupaNilai.menyusulPada,
      tanggal: sesi.tanggal,
      slot: sesi.slot,
      modul: sesi.modul,
    })
    .from(lupaNilai)
    .innerJoin(sesi, eq(sesi.id, lupaNilai.sesiId))
    .where(
      and(
        gte(sesi.tanggal, dari),
        lte(sesi.tanggal, sampai),
        nim ? eq(lupaNilai.nim, nim) : undefined,
      ),
    )
    .orderBy(desc(sesi.tanggal), asc(lupaNilai.kelompokNomor));
  return rows;
}

/** The semester per person, or one person's counts with their sessions. */
export async function muatRekapHadir(db: Db, semester: string, nim?: string) {
  const [dari, sampai] = rentangSemester(semester);
  const [baris, lupa] = await Promise.all([
    muatBaris(db, dari, sampai, nim),
    muatLupa(db, dari, sampai, nim),
  ]);
  const hitung = ringkasHadir(baris);
  const nimSemua = new Set([...hitung.keys(), ...lupa.map((l) => l.nim)]);
  const orang: OrangHadir[] = [...nimSemua].map((n) => {
    const r = hitung.get(n) ?? {
      tepat: 0,
      telat: 0,
      mm: 0,
      mangkir: 0,
      izin: 0,
      potong: 0,
      sesiNol: 0,
    };
    const l = lupa.filter((x) => x.nim === n);
    return { nim: n, ...r, lupa: l.length, lupaMenyusul: l.filter((x) => x.menyusulPada).length };
  });
  return {
    semester,
    orang,
    ...(nim
      ? {
          // Everything except an on-time check-in, newest first.
          riwayat: baris
            .filter((b) => b.status !== "tepat" && b.status !== "lepas")
            .map(({ nim: _n, kunci: _k, ...b }) => b),
          lupa: lupa.map((l) => ({
            sesiId: l.sesiId,
            tanggal: l.tanggal,
            slot: l.slot,
            modul: l.modul,
            nomor: l.nomor,
            kurang: l.kurang,
            dicatatPada: l.dicatatPada.toISOString(),
            menyusulPada: l.menyusulPada?.toISOString() ?? null,
          })) satisfies RiwayatNilai[],
        }
      : {}),
  };
}

const NIM_RE = /^[A-Za-z0-9]{6,20}$/;

/** GET /api/session/hadirrekap: the semester, one person (?nim=) or the caller (?saya=1). */
export async function handleHadirRekap(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const db = getDb();
  const sem =
    typeof req.query.semester === "string" && /^\d{4}-(ganjil|genap)$/.test(req.query.semester)
      ? req.query.semester
      : semesterDariTanggal(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
  let nim: string | undefined;
  if (req.query.saya === "1") nim = session.nim;
  else if (typeof req.query.nim === "string") {
    if (!NIM_RE.test(req.query.nim)) {
      res.status(200).json({ ok: false, kode: "format_salah" });
      return;
    }
    const [ada] = await db
      .select({ nim: asisten.nim })
      .from(asisten)
      .where(eq(asisten.nim, req.query.nim))
      .limit(1);
    if (!ada) {
      res.status(200).json({ ok: false, kode: "tidak_ada" });
      return;
    }
    nim = ada.nim;
  }
  res.status(200).json({ ok: true, ...(await muatRekapHadir(db, sem, nim)) });
}
