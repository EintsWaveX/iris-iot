/**
 * Tugas Pendahuluan from the LMS (Phase 13): settings, the sync, and the
 * data the TP pages read. The route is api/tp/[aksi].ts.
 *
 * Settings live in `pengaturan`:
 * - lms_token   the encrypted app token and whose account it is
 * - lms_kelas   the practicum courses and their "TP Modul N" assignments
 * - lms_status  the last sync's result, and which windows had their sweep
 * - tp_jendela  the semester's default window and each module's own
 *
 * The sync runs with nobody clicking, every minute at most while a window
 * is open and once more after it closes (the sweep): on the relay's minute
 * timer (POST /api/tp/detak, so it doesn't wait for the server PC), on the
 * server PC's heartbeat, and when a TP page opens (2026-10-14: was 5 and 2
 * minutes, and a new or removed LMS file showed late). It writes pointers
 * only (tp_kiriman); files stream from the LMS on view.
 *
 * The question bank (tp_paket, Penilaian › Soal TP) holds each module's
 * variants and the final set's pick; with no row a module uses the default
 * bank in tp-bawaan.ts.
 */
import { and, asc, desc, eq, gte, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  jadwal,
  kelompok,
  lmsPeserta,
  nilai,
  pengaturan,
  praktikan,
  rosterKelompok,
  rosterSlot,
  sesi,
  sesiAnggota,
  sesiAsisten,
  tpKiriman,
  tpNilai,
  tpPaket,
  tpSinkronLog,
  tpUnggah,
  type BerkasTp,
} from "../../src/lib/schema.js";
import { hariIniWib } from "../../src/lib/jadwal.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { tanggalMinggu } from "../../src/lib/penugasan-minggu.js";
import {
  BAHASA_TP,
  MAKS_VARIAN,
  KODE_VARIAN,
  POLA_BAWAAN,
  TP_NOMOR,
  keadaanJendela,
  kelasKursus,
  labelKursus,
  modulTugas,
  nomorUntuk,
  statusTp,
  tanggalSlot,
  telatMenit,
  soalAkhir,
  tampilSoal,
  totalTp,
  tpLengkap,
  type BahasaTp,
  type IsiSoal,
  type JendelaTp,
  type KelasTp,
  type PolaJendela,
  type SoalTampil,
  type SoalTp,
  type StatusTp,
  type VarianTp,
} from "../../src/lib/tp.js";
import { PETUNJUK_BAWAAN, TP_BAWAAN } from "./tp-bawaan.js";
import {
  LmsGalat,
  berkasDari,
  bukaToken,
  infoSitus,
  kirimanTugas,
  kursusPraktikum,
  anggotaKelas,
  nimDari,
  pesertaKursus,
  sandikanToken,
  teksLms,
  tugasKursus,
  type TokenTersimpan,
} from "./lms.js";
import { WebLms, type SimpanKue } from "./lms-web.js";
import { muatTanggal } from "./penugasan-api.js";
import { siarkan } from "./siaran.js";

type Db = ReturnType<typeof getDb>;

export const KUNCI_TP = {
  token: "lms_token",
  kelas: "lms_kelas",
  status: "lms_status",
  jendela: "tp_jendela",
  kecuali: "tp_kecuali",
} as const;

/** IRIS's LMS web session cookie (lms-web.ts), encrypted like the token. */
export const KUNCI_WEB = "lms_web";

export interface TokenSet extends TokenTersimpan {
  akun: { userid: number; nama: string; username: string };
  pada: string;
  oleh: string;
  /** The token's private key, from a link made right after a sign in: it
   *  lets IRIS make, change and delete the TP assignments. */
  privat?: TokenTersimpan | null;
}

/** A registered Praktikan left out of TP (counts, expected files). */
export interface Kecuali {
  nim: string;
  alasan: string;
  oleh: string;
  pada: string;
}

export interface KecualiSet {
  semester: string;
  daftar: Kecuali[];
}

export interface TugasTp {
  id: number;
  cmid: number;
  nama: string;
  buka: string | null;
  tutup: string | null;
}

export interface KursusTp {
  id: number;
  nama: string;
  label: string;
  kelas: KelasTp;
  /** Registered Praktikan enrolled here as students. */
  peserta: number;
  /** Their NIMs (since 2026-10-13; older copies lack it). */
  nim?: string[];
  tugas: Record<string, TugasTp | null>;
}

/** A student in a class course who is not a registered Praktikan. */
export interface LuarLms {
  nim: string | null;
  nama: string;
  kursus: string;
}

export interface KelasSet {
  pada: string;
  pesertaPada: string | null;
  kursus: KursusTp[];
  /** Students the LMS has that IRIS doesn't: never counted. */
  luar?: LuarLms[];
}

export interface StatusSet {
  terakhir: string | null;
  hasil: "ok" | "gagal" | null;
  galat: string | null;
  galatSejak: string | null;
  /** Per module: the window close a sync ran after (the final sweep). */
  sapuan: Record<string, string>;
}

export interface JendelaSet {
  semester: string;
  pola: PolaJendela;
  modul: Record<string, JendelaTp>;
}

export interface SetTp {
  semester: string;
  token: TokenSet | null;
  kelas: KelasSet | null;
  status: StatusSet;
  jendela: JendelaSet;
  kecuali: Kecuali[];
}

export function semesterIni(): string {
  return semesterDariTanggal(hariIniWib());
}

export async function bacaSet(db: Db): Promise<SetTp> {
  const semester = semesterIni();
  const rows = await db
    .select({ kunci: pengaturan.kunci, nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(inArray(pengaturan.kunci, Object.values(KUNCI_TP)));
  const v = (k: string) => rows.find((r) => r.kunci === k)?.nilai as unknown;
  const j = v(KUNCI_TP.jendela) as Partial<JendelaSet> | undefined;
  const st = (v(KUNCI_TP.status) as Partial<StatusSet> | undefined) ?? {};
  const kec = v(KUNCI_TP.kecuali) as KecualiSet | undefined;
  return {
    semester,
    token: (v(KUNCI_TP.token) as TokenSet | undefined) ?? null,
    kelas: (v(KUNCI_TP.kelas) as KelasSet | undefined) ?? null,
    status: {
      terakhir: st.terakhir ?? null,
      hasil: st.hasil ?? null,
      galat: st.galat ?? null,
      galatSejak: st.galatSejak ?? null,
      sapuan: st.sapuan ?? {},
    },
    // A new semester starts from the default pattern with no windows.
    jendela:
      j && j.semester === semester
        ? { semester, pola: j.pola ?? POLA_BAWAAN, modul: j.modul ?? {} }
        : { semester, pola: j?.pola ?? POLA_BAWAAN, modul: {} },
    kecuali: kec && kec.semester === semester ? (kec.daftar ?? []) : [],
  };
}

/** The NIMs left out of TP this semester. */
export const nimKecuali = (set: SetTp) => new Set(set.kecuali.map((k) => k.nim));

/** A course's registered Praktikan, without the excluded. */
export function pesertaKursusTp(k: KursusTp, kecuali: Set<string>): number {
  return k.nim ? k.nim.filter((n) => !kecuali.has(n)).length : k.peserta;
}

/** Where WebLms keeps its cookie: pengaturan, encrypted. */
export function simpanKueLms(db: Db): SimpanKue {
  return {
    async baca() {
      const [r] = await db
        .select({ nilai: pengaturan.nilai })
        .from(pengaturan)
        .where(eq(pengaturan.kunci, KUNCI_WEB))
        .limit(1);
      return r ? bukaToken(r.nilai as TokenTersimpan) : null;
    },
    async tulis(kue) {
      if (kue) await tulisSet(db, KUNCI_WEB, sandikanToken(kue), null);
      else await hapusSet(db, KUNCI_WEB);
    },
  };
}

/** IRIS's LMS web session, or why there can't be one. */
export function webLms(db: Db, set: SetTp): WebLms {
  const token = set.token ? bukaToken(set.token) : null;
  if (!set.token || !token) throw new LmsGalat("belum_tersambung", "no LMS token");
  const privat = set.token.privat ? bukaToken(set.token.privat) : null;
  if (!privat) throw new LmsGalat("perlu_kunci_privat", "the token has no private key");
  return new WebLms(token, privat, set.token.akun.userid, simpanKueLms(db));
}

export async function tulisSet(db: Db, kunci: string, nilaiBaru: unknown, oleh: string | null) {
  await db
    .insert(pengaturan)
    .values({ kunci, nilai: nilaiBaru as object, diubahOleh: oleh, diubahPada: new Date() })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai: nilaiBaru as object, diubahOleh: oleh, diubahPada: new Date() },
    });
}

export async function hapusSet(db: Db, kunci: string) {
  await db.delete(pengaturan).where(eq(pengaturan.kunci, kunci));
}

/** A module's window: IRIS's own, else the LMS assignments' dates. */
export function jendelaUntuk(
  set: SetTp,
  modul: number,
): (JendelaTp & { sumber: "iris" | "lms" }) | null {
  const j = set.jendela.modul[String(modul)];
  if (j) return { ...j, sumber: "iris" };
  const t = (set.kelas?.kursus ?? [])
    .map((k) => k.tugas[String(modul)])
    .filter((x): x is TugasTp => !!x?.buka && !!x.tutup);
  if (!t.length) return null;
  const buka = t.map((x) => x.buka!).sort()[0];
  const tutup = t
    .map((x) => x.tutup!)
    .sort()
    .reverse()[0];
  return { buka, tutup, sumber: "lms" };
}

/* ================================================================ sync */

export interface HasilSinkron {
  ok: boolean;
  kode?: string;
  baru: number;
  diperbarui: number;
  tanpaNim: number;
  durasiMs: number;
}

const JAM6 = 6 * 3_600_000;
const JAM12 = 12 * 3_600_000;
const HARI3 = 3 * 86_400_000;

/** Modules whose window is open, or closed under three days ago. */
export function modulAktif(set: SetTp, now = Date.now()): number[] {
  return [1, 2, 3, 4].filter((m) => {
    const j = jendelaUntuk(set, m);
    if (!j) return false;
    const k = keadaanJendela(j, now);
    return k === "buka" || (k === "tutup" && now - Date.parse(j.tutup) < HARI3);
  });
}

const isoDari = (detik: number) => (detik > 0 ? new Date(detik * 1000).toISOString() : null);

async function segarkanKelas(token: string, set: SetTp): Promise<KelasSet> {
  const info = await infoSitus(token);
  const kursus = await kursusPraktikum(token, info.userid);
  const tugas = await tugasKursus(
    token,
    kursus.map((k) => k.id),
  );
  const lama = new Map((set.kelas?.kursus ?? []).map((k) => [k.id, k]));
  return {
    pada: new Date().toISOString(),
    pesertaPada: set.kelas?.pesertaPada ?? null,
    luar: set.kelas?.luar,
    kursus: kursus
      .map((k) => {
        const per: Record<string, TugasTp | null> = { "1": null, "2": null, "3": null, "4": null };
        for (const a of tugas.filter((t) => t.course === k.id)) {
          const m = modulTugas(a.name);
          if (m && !per[String(m)])
            per[String(m)] = {
              id: a.id,
              cmid: a.cmid,
              nama: a.name,
              buka: isoDari(a.allowsubmissionsfromdate),
              tutup: isoDari(a.duedate),
            };
        }
        return {
          id: k.id,
          nama: k.fullname,
          label: labelKursus(`${k.shortname} ${k.fullname}`),
          kelas: kelasKursus(`${k.shortname} ${k.fullname}`),
          peserta: lama.get(k.id)?.peserta ?? 0,
          nim: lama.get(k.id)?.nim,
          tugas: per,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

const sederhana = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function segarkanPeserta(db: Db, token: string, set: SetTp, kelas: KelasSet) {
  const daftar = await db
    .select({ nim: praktikan.nim, nama: praktikan.nama })
    .from(praktikan)
    .where(eq(praktikan.semester, set.semester));
  const nimAda = new Set(daftar.map((p) => p.nim));
  const nimAsisten = new Set(
    (await db.select({ nim: asisten.nim }).from(asisten)).map((a) => a.nim),
  );
  const luar: LuarLms[] = [];
  // A name that two Praktikan share is never used to match.
  const perNama = new Map<string, string | null>();
  for (const p of daftar) {
    const k = sederhana(p.nama);
    perNama.set(k, perNama.has(k) ? null : p.nim);
  }
  const baris = new Map<string, { lmsUser: number; lmsKursus: number; kursus: string }>();
  for (const k of kelas.kursus) {
    const orang = await pesertaKursus(token, k.id);
    const nims: string[] = [];
    for (const u of orang) {
      // Students only: Teachers are not counted, nor an Asisten enrolled as a
      // student unless they are also a registered Praktikan.
      if (!anggotaKelas(u, nimAsisten, nimAda)) continue;
      const nim = nimDari(u) ?? perNama.get(sederhana(u.fullname)) ?? null;
      if (!nim || !nimAda.has(nim)) {
        luar.push({ nim, nama: teksLms(u.fullname), kursus: k.label });
        continue;
      }
      nims.push(nim);
      // A class course wins over ADD (which may hold everyone).
      const ada = baris.get(nim);
      if (ada && k.label === "ADD") continue;
      baris.set(nim, { lmsUser: u.id, lmsKursus: k.id, kursus: k.label });
    }
    k.peserta = nims.length;
    k.nim = nims;
  }
  kelas.luar = luar;
  const now = new Date();
  const rows = [...baris].map(([nim, b]) => ({
    semester: set.semester,
    nim,
    ...b,
    diperbarui: now,
  }));
  for (let i = 0; i < rows.length; i += 200)
    await db
      .insert(lmsPeserta)
      .values(rows.slice(i, i + 200))
      .onConflictDoUpdate({
        target: [lmsPeserta.semester, lmsPeserta.nim],
        set: {
          lmsUser: sql`excluded.lms_user`,
          lmsKursus: sql`excluded.lms_kursus`,
          kursus: sql`excluded.kursus`,
          diperbarui: now,
        },
      });
  // Who left every class course since: not theirs any more.
  if (rows.length)
    await db.delete(lmsPeserta).where(
      and(
        eq(lmsPeserta.semester, set.semester),
        notInArray(
          lmsPeserta.nim,
          rows.map((r) => r.nim),
        ),
      ),
    );
  kelas.pesertaPada = now.toISOString();
}

let sedang: Promise<HasilSinkron> | null = null;

/**
 * One sync. `modul` limits it to those modules (default: the open ones and
 * those closed under three days ago); `paksa` reads the courses, the
 * assignments and the class lists again even when the copies are fresh.
 */
export async function sinkronTp(
  db: Db,
  oleh: string,
  opsi: { modul?: number[]; paksa?: boolean } = {},
): Promise<HasilSinkron> {
  if (sedang) return sedang;
  sedang = jalankan(db, oleh, opsi).finally(() => {
    sedang = null;
  });
  return sedang;
}

async function jalankan(
  db: Db,
  oleh: string,
  opsi: { modul?: number[]; paksa?: boolean },
): Promise<HasilSinkron> {
  const t0 = Date.now();
  const set = await bacaSet(db);
  const kosong = { baru: 0, diperbarui: 0, tanpaNim: 0, durasiMs: 0 };
  if (!set.token) return { ok: false, kode: "belum_tersambung", ...kosong };
  const token = bukaToken(set.token);
  const status: StatusSet = { ...set.status };
  let baru = 0;
  let diperbarui = 0;
  let tanpaNim = 0;
  try {
    if (!token) throw new LmsGalat("token_rusak", "the stored token can't be read");
    const now = Date.now();
    let kelas = set.kelas;
    if (opsi.paksa || !kelas || now - Date.parse(kelas.pada) > JAM6) {
      kelas = await segarkanKelas(token, set);
    }
    if (opsi.paksa || !kelas.pesertaPada || now - Date.parse(kelas.pesertaPada) > JAM12) {
      await segarkanPeserta(db, token, set, kelas);
    }
    await tulisSet(db, KUNCI_TP.kelas, kelas, null);
    set.kelas = kelas;

    const modul = opsi.modul ?? modulAktif(set, now);
    if (modul.length) {
      const peserta = await db
        .select({ nim: lmsPeserta.nim, lmsUser: lmsPeserta.lmsUser })
        .from(lmsPeserta)
        .where(eq(lmsPeserta.semester, set.semester));
      const nimOf = new Map(peserta.map((p) => [p.lmsUser, p.nim]));
      for (const m of modul) {
        const tugas = kelas.kursus
          .map((k) => ({ k, t: k.tugas[String(m)] }))
          .filter((x): x is { k: KursusTp; t: TugasTp } => !!x.t);
        if (!tugas.length) continue;
        const kursusOf = new Map(tugas.map((x) => [x.t.id, x.k.id]));
        const hasil = await kirimanTugas(
          token,
          tugas.map((x) => x.t.id),
        );
        const ada = await db
          .select({
            nim: tpKiriman.nim,
            dikirimPada: tpKiriman.dikirimPada,
            berkas: tpKiriman.berkas,
            sumber: tpKiriman.sumber,
          })
          .from(tpKiriman)
          .where(and(eq(tpKiriman.semester, set.semester), eq(tpKiriman.modul, m)));
        const lama = new Map(ada.map((r) => [r.nim, r]));
        const dilihat = new Set<string>();
        for (const a of hasil) {
          for (const s of a.submissions ?? []) {
            const files = berkasDari(s);
            if (!files.length || s.status === "new" || s.status === "reopened") continue;
            const nim = nimOf.get(s.userid);
            if (!nim) {
              tanpaNim++;
              continue;
            }
            dilihat.add(nim);
            const berkas: BerkasTp[] = files.map((f) => ({
              nama: f.filename,
              ukuran: f.filesize,
              mime: f.mimetype ?? "application/octet-stream",
              url: f.fileurl.replace(/[?&]token=[^&]*/, ""),
            }));
            const dikirim = new Date(s.timemodified * 1000);
            const r = lama.get(nim);
            // The newer file wins: an upload in IRIS stays until the LMS
            // has a later submission (2026-10-14).
            if (!lmsMenang(r, dikirim)) continue;
            if (r?.sumber === "iris") await batalkanUnggah(db, set.semester, m, nim);
            if (!r || !r.berkas.length) baru++;
            else if (r.dikirimPada?.getTime() !== dikirim.getTime()) diperbarui++;
            else continue;
            const nilaiBaris = {
              lmsKursus: kursusOf.get(a.assignmentid) ?? null,
              lmsTugas: a.assignmentid,
              lmsKiriman: s.id,
              statusLms: s.status,
              berkas,
              dikirimPada: dikirim,
              sinkronPada: new Date(),
              sumber: "lms" as const,
              unggahId: null,
            };
            await db
              .insert(tpKiriman)
              .values({
                semester: set.semester,
                modul: m,
                nim,
                ...nilaiBaris,
                diambilPada: new Date(),
              })
              .onConflictDoUpdate({
                target: [tpKiriman.semester, tpKiriman.modul, tpKiriman.nim],
                set: {
                  ...nilaiBaris,
                  diambilPada: sql`coalesce(${tpKiriman.diambilPada}, now())`,
                },
              });
          }
        }
        // A file taken back in the LMS: the pointer goes, the scores stay
        // (an upload in IRIS is not the LMS's to take back).
        const hilang = ada
          .filter((r) => r.sumber === "lms" && r.berkas.length && !dilihat.has(r.nim))
          .map((r) => r.nim);
        if (hilang.length) {
          diperbarui += hilang.length;
          await db
            .update(tpKiriman)
            .set({ berkas: [], sinkronPada: new Date() })
            .where(
              and(
                eq(tpKiriman.semester, set.semester),
                eq(tpKiriman.modul, m),
                inArray(tpKiriman.nim, hilang),
              ),
            );
        }
        const j = jendelaUntuk(set, m);
        if (j && keadaanJendela(j, now) === "tutup") status.sapuan[String(m)] = j.tutup;
      }
    }
    status.terakhir = new Date().toISOString();
    status.hasil = "ok";
    status.galat = null;
    status.galatSejak = null;
    const durasiMs = Date.now() - t0;
    await db
      .insert(tpSinkronLog)
      .values({ oleh, hasil: "ok", baru, diperbarui, durasiMs, galat: null });
    await tulisSet(db, KUNCI_TP.status, status, null);
    if (baru || diperbarui) await siarkan(["tp"]);
    return { ok: true, baru, diperbarui, tanpaNim, durasiMs };
  } catch (e) {
    const kode = e instanceof LmsGalat ? e.kode : "galat_sinkron";
    if (!(e instanceof LmsGalat)) console.error("[api/tp sinkron] unexpected error:", e);
    status.terakhir = new Date().toISOString();
    status.hasil = "gagal";
    status.galatSejak = status.galat ? (status.galatSejak ?? status.terakhir) : status.terakhir;
    status.galat = kode;
    const durasiMs = Date.now() - t0;
    await db
      .insert(tpSinkronLog)
      .values({ oleh, hasil: "gagal", baru, diperbarui, durasiMs, galat: kode });
    await tulisSet(db, KUNCI_TP.status, status, null);
    await siarkan(["tp"]);
    return { ok: false, kode, baru, diperbarui, tanpaNim, durasiMs };
  }
}

/** Whether an LMS submission made at `dikirim` replaces what IRIS holds:
 *  nothing yet, an older LMS file, or an older upload in IRIS. */
export function lmsMenang(
  r: { sumber: "lms" | "iris"; dikirimPada: Date | null; berkas: unknown[] } | undefined,
  dikirim: Date,
): boolean {
  if (!r || !r.berkas.length) return true;
  const lama = r.dikirimPada?.getTime() ?? 0;
  return r.sumber === "iris" ? dikirim.getTime() > lama : dikirim.getTime() !== lama;
}

/** A newer LMS file replaced an upload in IRIS: a copy not yet in the LMS
 *  is no longer sent there. */
async function batalkanUnggah(db: Db, semester: string, modul: number, nim: string) {
  await db
    .update(tpUnggah)
    .set({ lmsStatus: "batal", isi: null })
    .where(
      and(
        eq(tpUnggah.semester, semester),
        eq(tpUnggah.modul, modul),
        eq(tpUnggah.nim, nim),
        inArray(tpUnggah.lmsStatus, ["menunggu", "gagal"]),
      ),
    );
}

/**
 * A sync when one is due: a window is open and the last run is `jedaMs`
 * old, or a window closed and its sweep hasn't run. Cheap when nothing is
 * due (one settings read). Never throws.
 */
export async function sinkronBilaPerlu(db: Db, oleh: string, jedaMs: number): Promise<void> {
  try {
    const set = await bacaSet(db);
    if (!set.token) return;
    const now = Date.now();
    const aktif = modulAktif(set, now);
    if (!aktif.length) return;
    const sapuan = aktif.some((m) => {
      const j = jendelaUntuk(set, m)!;
      return keadaanJendela(j, now) === "tutup" && set.status.sapuan[String(m)] !== j.tutup;
    });
    const terakhir = set.status.terakhir ? Date.parse(set.status.terakhir) : 0;
    const bukaAda = aktif.some((m) => keadaanJendela(jendelaUntuk(set, m), now) === "buka");
    // A failing token is tried at most every 30 minutes.
    const jeda = set.status.hasil === "gagal" ? Math.max(jedaMs, 30 * 60_000) : jedaMs;
    if (!sapuan && (!bukaAda || now - terakhir < jeda)) return;
    await sinkronTp(db, oleh, { modul: aktif });
  } catch (e) {
    console.error("[api/tp] background sync failed:", e);
  }
}

/**
 * How long the relay's minute timer may sleep: a minute while a window is
 * open or its sweep is due, else until the next window opens (at most 6
 * hours, so a window set later is still caught).
 */
export function tidurDetik(set: SetTp, adaTertunda: boolean, now = Date.now()): number {
  const MENIT = 60;
  if (adaTertunda) return MENIT;
  for (const m of modulAktif(set, now)) {
    const j = jendelaUntuk(set, m)!;
    if (keadaanJendela(j, now) === "buka") return MENIT;
    if (set.status.sapuan[String(m)] !== j.tutup) return MENIT;
  }
  const berikut = [1, 2, 3, 4]
    .map((m) => jendelaUntuk(set, m))
    .filter((j): j is NonNullable<typeof j> => !!j && Date.parse(j.buka) > now)
    .map((j) => Date.parse(j.buka));
  const sampai = berikut.length ? Math.min(...berikut) : now + 6 * 3600_000;
  return Math.max(MENIT, Math.min(6 * 3600, Math.round((sampai - now) / 1000)));
}

/* ===================================================== groups and holders */

export interface AnggotaTp {
  nim: string;
  nama: string;
  status: StatusTp;
  total: number | null;
  dinilai: number;
  jumlah: number;
  dikirimPada: string | null;
  telatMenit: number | null;
  terimaTelat: boolean | null;
  berkas: number;
  kirimanId: number | null;
  /** Left out of TP (Sumber LMS › Peserta TP): shown, never counted. */
  kecuali: boolean;
}

export interface KelompokTp {
  nomor: number;
  klp: string | null;
  pemegang: { nim: string; kode: string; nama: string } | null;
  milikku: boolean;
  anggota: AnggotaTp[];
}

export interface SlotTp {
  hari: number;
  slot: number;
  kelas: string;
  tanggal: string;
  sesiId: number | null;
  kelompok: KelompokTp[];
}

export interface Kursi {
  hari: number;
  slot: number;
  kelas: string;
  tanggal: string;
  sesiId: number | null;
  /** nomor -> holder's NIM (null: nobody) */
  pemegang: Map<number, string | null>;
  /** nomor -> members */
  anggota: Map<number, { nim: string; nama: string }[]>;
  klp: Map<number, string | null>;
}

/** Each slot's groups and holders for a module's practicum week. */
export async function kursiModul(db: Db, set: SetTp, modul: number): Promise<Kursi[]> {
  const j = jendelaUntuk(set, modul);
  const hariIni = hariIniWib();
  const rows = await db
    .select()
    .from(jadwal)
    .where(and(eq(jadwal.semester, set.semester), ne(jadwal.status, "kosong")))
    .orderBy(asc(jadwal.hari), asc(jadwal.slot));
  if (!rows.length) return [];
  const tanggalOf = new Map(
    rows.map((r) => [r.id, j ? tanggalSlot(j, r.hari) : tanggalMinggu(r.hari, hariIni, 0)]),
  );
  const tanggalan = [...new Set(tanggalOf.values())];
  const sesiRows = await db
    .select({ id: sesi.id, tanggal: sesi.tanggal, slot: sesi.slot })
    .from(sesi)
    .where(
      and(
        inArray(sesi.tanggal, tanggalan),
        eq(sesi.modul, modul),
        eq(sesi.jenis, "reguler"),
        inArray(sesi.status, ["berjalan", "selesai"]),
      ),
    );
  const sesiOf = new Map(sesiRows.map((s) => [`${s.tanggal}|${s.slot}`, s.id]));
  const sesiIds = sesiRows.map((s) => s.id);
  const [snap, holders, kodeRows, minggu, roster, klpRows] = await Promise.all([
    sesiIds.length
      ? db
          .select({
            sesiId: sesiAnggota.sesiId,
            nomor: sesiAnggota.kelompokNomor,
            nim: sesiAnggota.nim,
            nama: sesiAnggota.nama,
          })
          .from(sesiAnggota)
          .where(inArray(sesiAnggota.sesiId, sesiIds))
      : Promise.resolve([]),
    sesiIds.length
      ? db
          .select({
            sesiId: sesiAsisten.sesiId,
            nomor: kelompok.nomor,
            nim: sesiAsisten.asistenNim,
          })
          .from(sesiAsisten)
          .innerJoin(kelompok, eq(kelompok.id, sesiAsisten.kelompokId))
          .where(inArray(sesiAsisten.sesiId, sesiIds))
      : Promise.resolve([]),
    db.select({ nim: asisten.nim, kode: asisten.kode }).from(asisten),
    muatTanggal(db, rows, tanggalOf),
    db
      .select({
        hari: rosterSlot.hari,
        slot: rosterSlot.slot,
        nomor: rosterSlot.kelompokNomor,
        nim: rosterSlot.nim,
        nama: praktikan.nama,
        urutan: rosterSlot.urutan,
      })
      .from(rosterSlot)
      .innerJoin(praktikan, eq(praktikan.nim, rosterSlot.nim))
      .where(eq(rosterSlot.semester, set.semester))
      .orderBy(asc(rosterSlot.urutan), asc(rosterSlot.nim)),
    db
      .select({
        hari: rosterKelompok.hari,
        slot: rosterKelompok.slot,
        nomor: rosterKelompok.nomor,
        klp: rosterKelompok.klpSeelabs,
        aktif: rosterKelompok.aktif,
      })
      .from(rosterKelompok)
      .where(eq(rosterKelompok.semester, set.semester)),
  ]);
  const nimOfKode = new Map(kodeRows.map((a) => [a.kode.toUpperCase(), a.nim]));
  const out: Kursi[] = [];
  for (const r of rows) {
    const tanggal = tanggalOf.get(r.id)!;
    const sid = sesiOf.get(`${tanggal}|${r.slot}`) ?? null;
    const pemegang = new Map<number, string | null>();
    const anggota = new Map<number, { nim: string; nama: string }[]>();
    const klp = new Map<number, string | null>();
    for (const k of klpRows.filter((x) => x.hari === r.hari && x.slot === r.slot))
      klp.set(k.nomor, k.klp);
    if (sid) {
      for (const h of holders.filter((x) => x.sesiId === sid)) pemegang.set(h.nomor, h.nim);
      for (const a of snap.filter((x) => x.sesiId === sid))
        anggota.set(a.nomor, [...(anggota.get(a.nomor) ?? []), { nim: a.nim, nama: a.nama }]);
    } else {
      const m = minggu.get(r.id);
      for (const k of m?.kursi ?? [])
        pemegang.set(k.nomor, k.kode ? (nimOfKode.get(k.kode) ?? null) : null);
      for (const a of roster.filter((x) => x.hari === r.hari && x.slot === r.slot))
        anggota.set(a.nomor, [...(anggota.get(a.nomor) ?? []), { nim: a.nim, nama: a.nama }]);
    }
    if (!anggota.size) continue;
    out.push({
      hari: r.hari,
      slot: r.slot,
      kelas: r.kelas,
      tanggal,
      sesiId: sid,
      pemegang,
      anggota,
      klp,
    });
  }
  return out;
}

/** Who may score `nim`'s TP for `modul`: the group's holder that week (or
 *  anyone when nobody holds it). Null when the Praktikan is in no group. */
export async function pemegangTp(
  db: Db,
  set: SetTp,
  modul: number,
  nim: string,
): Promise<{ nim: string | null } | null> {
  for (const k of await kursiModul(db, set, modul))
    for (const [nomor, list] of k.anggota)
      if (list.some((a) => a.nim === nim)) return { nim: k.pemegang.get(nomor) ?? null };
  return null;
}

interface SkorBaris {
  nim: string;
  nomor: number;
  skor: number;
  catatan: string | null;
}

export async function skorModul(db: Db, semester: string, modul: number, nims?: string[]) {
  const rows: SkorBaris[] = await db
    .select({
      nim: tpNilai.nim,
      nomor: tpNilai.nomor,
      skor: tpNilai.skor,
      catatan: tpNilai.catatan,
    })
    .from(tpNilai)
    .where(
      and(
        eq(tpNilai.semester, semester),
        eq(tpNilai.modul, modul),
        ...(nims ? [inArray(tpNilai.nim, nims.length ? nims : ["-"])] : []),
      ),
    );
  const per = new Map<string, Record<number, number>>();
  for (const r of rows) per.set(r.nim, { ...(per.get(r.nim) ?? {}), [r.nomor]: r.skor });
  return { rows, per };
}

/** The TP tab's groups for one module. */
export async function kelompokTp(db: Db, set: SetTp, modul: number, meNim: string) {
  const j = jendelaUntuk(set, modul);
  const [kursi, kiriman, skor, kodeRows] = await Promise.all([
    kursiModul(db, set, modul),
    db
      .select()
      .from(tpKiriman)
      .where(and(eq(tpKiriman.semester, set.semester), eq(tpKiriman.modul, modul))),
    skorModul(db, set.semester, modul),
    db.select({ nim: asisten.nim, kode: asisten.kode, nama: asisten.nama }).from(asisten),
  ]);
  const orang = new Map(kodeRows.map((a) => [a.nim, a]));
  const kirOf = new Map(kiriman.map((k) => [k.nim, k]));
  const dipakai = new Set<string>();
  const kec = nimKecuali(set);
  const satu = (a: { nim: string; nama: string }): AnggotaTp => {
    dipakai.add(a.nim);
    const k = kirOf.get(a.nim);
    const nomor = nomorUntuk(a.nim);
    const s = skor.per.get(a.nim) ?? {};
    const telat = telatMenit(k?.dikirimPada?.toISOString() ?? null, j);
    return {
      nim: a.nim,
      nama: a.nama,
      status: statusTp({
        adaBerkas: !!k?.berkas.length,
        tanda: k?.tanda ?? null,
        telat: telat !== null,
        lengkap: tpLengkap(s, nomor),
      }),
      total: totalTp(s, nomor),
      dinilai: nomor.filter((no) => s[no] != null).length,
      jumlah: nomor.length,
      dikirimPada: k?.dikirimPada?.toISOString() ?? null,
      telatMenit: telat,
      terimaTelat: k?.terimaTelat ?? null,
      berkas: k?.berkas.length ?? 0,
      kirimanId: k?.id ?? null,
      kecuali: kec.has(a.nim),
    };
  };
  const slot: SlotTp[] = kursi.map((k) => ({
    hari: k.hari,
    slot: k.slot,
    kelas: k.kelas,
    tanggal: k.tanggal,
    sesiId: k.sesiId,
    kelompok: [...k.anggota.keys()]
      .sort((a, b) => a - b)
      .map((nomor) => {
        const p = k.pemegang.get(nomor) ?? null;
        const o = p ? orang.get(p) : undefined;
        return {
          nomor,
          klp: k.klp.get(nomor) ?? null,
          pemegang: p ? { nim: p, kode: o?.kode.toUpperCase() ?? p, nama: o?.nama ?? p } : null,
          milikku: p === meNim,
          anggota: k.anggota.get(nomor)!.map(satu),
        };
      }),
  }));
  // Files from Praktikan in no group yet (placed later, or a typo'd NIM).
  const nama = await db
    .select({ nim: praktikan.nim, nama: praktikan.nama })
    .from(praktikan)
    .where(eq(praktikan.semester, set.semester));
  const namaOf = new Map(nama.map((p) => [p.nim, p.nama]));
  const tanpa = kiriman
    .filter((k) => !dipakai.has(k.nim))
    .map((k) => satu({ nim: k.nim, nama: namaOf.get(k.nim) ?? k.nim }));
  const semua = [...slot.flatMap((s) => s.kelompok.flatMap((g) => g.anggota)), ...tanpa].filter(
    (a) => !a.kecuali,
  );
  return {
    slot,
    tanpaKelompok: tanpa,
    hitung: {
      peserta: semua.length,
      masuk: semua.filter((a) => a.berkas > 0).length,
      dinilai: semua.filter((a) => a.status === "nilai" || a.status === "kosong").length,
      perluNilaiku: slot
        .flatMap((s) => s.kelompok.filter((g) => g.milikku))
        .flatMap((g) => g.anggota)
        .filter((a) => !a.kecuali && (a.status === "masuk" || a.status === "telat")).length,
    },
  };
}

/* ======================================================= scores to nilai */

/**
 * Writes a Praktikan's TP total into the TP component of their session of
 * that module (found through the session's roster snapshot), once every
 * question they answer is scored. Returns the total or null.
 */
export async function tulisTotal(
  db: Db,
  semester: string,
  modul: number,
  nim: string,
  oleh: string,
): Promise<number | null> {
  const { per } = await skorModul(db, semester, modul, [nim]);
  const s = per.get(nim) ?? {};
  const nomor = nomorUntuk(nim);
  if (!tpLengkap(s, nomor)) return null;
  const total = totalTp(s, nomor)!;
  const sesiRows = await db
    .select({ id: sesi.id })
    .from(sesiAnggota)
    .innerJoin(sesi, eq(sesi.id, sesiAnggota.sesiId))
    .where(
      and(
        eq(sesiAnggota.nim, nim),
        eq(sesi.modul, modul),
        ne(sesi.jenis, "tot"),
        inArray(sesi.status, ["berjalan", "selesai"]),
      ),
    );
  for (const r of sesiRows)
    await db
      .insert(nilai)
      .values({ sesiId: r.id, nim, komponen: "TP", skor: total, diubahOleh: oleh })
      .onConflictDoUpdate({
        target: [nilai.sesiId, nilai.nim, nilai.komponen],
        set: { skor: total, diubahOleh: oleh, diubahPada: new Date() },
      });
  return total;
}

/** At session start: TP totals graded before the session go into its
 *  table (fields already typed are left alone). Best effort. */
export async function isiTpSesi(db: Db, sesiId: number): Promise<void> {
  try {
    const [s] = await db.select().from(sesi).where(eq(sesi.id, sesiId)).limit(1);
    if (!s || s.jenis === "tot") return;
    const semester = semesterDariTanggal(s.tanggal);
    const anggota = await db
      .select({ nim: sesiAnggota.nim })
      .from(sesiAnggota)
      .where(eq(sesiAnggota.sesiId, sesiId));
    const nims = anggota.map((a) => a.nim);
    if (!nims.length) return;
    const { per } = await skorModul(db, semester, s.modul, nims);
    const rows = nims
      .map((nim) => ({ nim, s: per.get(nim) ?? {}, nomor: nomorUntuk(nim) }))
      .filter((x) => tpLengkap(x.s, x.nomor))
      .map((x) => ({
        sesiId,
        nim: x.nim,
        komponen: "TP" as const,
        skor: totalTp(x.s, x.nomor)!,
        diubahOleh: "tp",
      }));
    if (rows.length) await db.insert(nilai).values(rows).onConflictDoNothing();
  } catch (e) {
    console.error("[api/tp] TP into the new session failed:", e);
  }
}

/** NIMs of a session whose TP comes from TP grading (all scored). */
export async function tpDariPenilaian(db: Db, sesiId: number): Promise<string[]> {
  const [s] = await db
    .select({ tanggal: sesi.tanggal, modul: sesi.modul })
    .from(sesi)
    .where(eq(sesi.id, sesiId))
    .limit(1);
  if (!s) return [];
  const { per } = await skorModul(db, semesterDariTanggal(s.tanggal), s.modul);
  return [...per].filter(([nim, sk]) => tpLengkap(sk, nomorUntuk(nim))).map(([nim]) => nim);
}

/* ================================================ the latest sync history */

/** The newest `n` syncs, or the `n` before the row `sebelum` (a page further back). */
export async function riwayatSinkron(db: Db, n = 20, sebelum?: number) {
  return db
    .select()
    .from(tpSinkronLog)
    .where(sebelum ? lt(tpSinkronLog.id, sebelum) : undefined)
    .orderBy(desc(tpSinkronLog.id))
    .limit(n);
}

export async function jumlahSinkron(db: Db): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(tpSinkronLog);
  return r?.n ?? 0;
}

/** For the badge: kiriman rows touched in the last two weeks exist. */
export async function adaTpBaru(db: Db, semester: string): Promise<boolean> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tpKiriman)
    .where(
      and(
        eq(tpKiriman.semester, semester),
        gte(tpKiriman.sinkronPada, new Date(Date.now() - 14 * 86_400_000)),
      ),
    );
  return (r?.n ?? 0) > 0;
}

/* ======================================================= the question bank */

export interface PaketTp {
  modul: number;
  varian: VarianTp[];
  /** Which variant each number of the final set comes from. */
  pilih: number[];
  /** The PDF's instructions per language. */
  petunjuk: Record<BahasaTp, string>;
  /** Bumped on every save; a save from an older one is refused. 0: default. */
  versi: number;
  bawaan: boolean;
  diubahOleh: string | null;
  diubahPada: string | null;
}

export function paketBawaan(modul: number): PaketTp {
  return {
    modul,
    varian: TP_BAWAAN[String(modul)] ?? [],
    pilih: Array(TP_NOMOR).fill(0),
    petunjuk: { ...PETUNJUK_BAWAAN },
    versi: 0,
    bawaan: true,
    diubahOleh: null,
    diubahPada: null,
  };
}

export async function muatPaket(db: Db, modul: number): Promise<PaketTp> {
  const [r] = await db.select().from(tpPaket).where(eq(tpPaket.modul, modul)).limit(1);
  if (!r) return paketBawaan(modul);
  return {
    modul,
    varian: r.varian,
    pilih: r.pilih,
    petunjuk: { ...PETUNJUK_BAWAAN, ...r.petunjuk },
    versi: r.versi,
    bawaan: false,
    diubahOleh: r.diubahOleh,
    diubahPada: r.diubahPada.toISOString(),
  };
}

/** The final set as a Praktikan reads it, in one language. */
export function soalPaket(p: PaketTp, b: BahasaTp): SoalTampil[] {
  return soalAkhir(p.varian, p.pilih).map((s) => tampilSoal(s, b));
}

/* ----------------------------------------------- checking an edited bank */

const BATAS = { teks: 3000, bagian: 8, kunci: 30000, nama: 40, gambar: 6, gambarB: 900_000 };
const GAMBAR_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length <= max ? v : null;

function periksaIsi(v: unknown): IsiSoal | null {
  const o = v as Partial<IsiSoal> | null;
  if (!o || typeof o !== "object") return null;
  const teks = str(o.teks, BATAS.teks);
  const kunci = str(o.kunci ?? "", BATAS.kunci);
  if (teks === null || kunci === null) return null;
  if (o.bagian === undefined) return { teks, kunci };
  if (!Array.isArray(o.bagian) || o.bagian.length > BATAS.bagian) return null;
  const bagian = o.bagian.map((x) => str(x, BATAS.teks));
  if (bagian.some((x) => x === null)) return null;
  const isi = (bagian as string[]).filter((x) => x.trim());
  return isi.length ? { teks, bagian: isi, kunci } : { teks, kunci };
}

/** An edited bank from the editor, cleaned, or null when it breaks a rule. */
export function periksaVarian(v: unknown): VarianTp[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAKS_VARIAN) return null;
  const out: VarianTp[] = [];
  for (const [i, x] of v.entries()) {
    const o = x as Partial<VarianTp> | null;
    const nama = str(o?.nama ?? "", BATAS.nama);
    if (!o || nama === null || !Array.isArray(o.soal) || o.soal.length !== TP_NOMOR) return null;
    const soal: SoalTp[] = [];
    for (const q of o.soal as unknown[]) {
      const s = q as Partial<SoalTp> | null;
      const isi = BAHASA_TP.map((b) => periksaIsi(s?.[b]));
      if (isi.some((y) => !y)) return null;
      const [id, en, zh] = isi as IsiSoal[];
      if (!id.teks.trim() || !en.teks.trim()) return null;
      const g = s?.gambar ?? [];
      if (
        !Array.isArray(g) ||
        g.length > BATAS.gambar ||
        g.some((u) => typeof u !== "string" || u.length > BATAS.gambarB || !GAMBAR_RE.test(u))
      )
        return null;
      soal.push(g.length ? { id, en, zh, gambar: g as string[] } : { id, en, zh });
    }
    out.push({ kode: KODE_VARIAN[i], nama: nama.trim(), soal });
  }
  return out;
}

export function periksaPilih(v: unknown, n: number): number[] | null {
  if (!Array.isArray(v) || v.length !== TP_NOMOR) return null;
  return v.every((x) => Number.isInteger(x) && x >= 0 && x < n) ? (v as number[]) : null;
}

export function periksaPetunjuk(v: unknown): Record<BahasaTp, string> | null {
  const o = v as Partial<Record<BahasaTp, unknown>> | null;
  if (!o || typeof o !== "object") return null;
  const out = {} as Record<BahasaTp, string>;
  for (const b of BAHASA_TP) {
    const s = str(o[b] ?? "", BATAS.teks);
    if (s === null) return null;
    out[b] = s;
  }
  return out;
}

/**
 * Saves a module's bank when `versiLama` is still the latest (0 for the
 * default); otherwise nothing changes and the caller gets the newer one.
 */
export async function simpanPaket(
  db: Db,
  modul: number,
  isi: Pick<PaketTp, "varian" | "pilih" | "petunjuk">,
  versiLama: number,
  oleh: string,
): Promise<{ ok: true; versi: number } | { ok: false; terbaru: PaketTp }> {
  const nilaiBaru = { ...isi, diubahOleh: oleh, diubahPada: new Date() };
  const r =
    versiLama === 0
      ? await db
          .insert(tpPaket)
          .values({ modul, ...nilaiBaru, versi: 1 })
          .onConflictDoNothing()
          .returning({ versi: tpPaket.versi })
      : await db
          .update(tpPaket)
          .set({ ...nilaiBaru, versi: versiLama + 1 })
          .where(and(eq(tpPaket.modul, modul), eq(tpPaket.versi, versiLama)))
          .returning({ versi: tpPaket.versi });
  if (r[0]) return { ok: true, versi: r[0].versi };
  return { ok: false, terbaru: await muatPaket(db, modul) };
}

/** Back to the default bank (the row goes). */
export async function hapusPaket(db: Db, modul: number) {
  await db.delete(tpPaket).where(eq(tpPaket.modul, modul));
}
