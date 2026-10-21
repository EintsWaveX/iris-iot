/**
 * Tugas Pendahuluan (Phase 13): settings and the data the TP pages read.
 * The route is api/tp/[aksi].ts; uploads are _lib/tp-unggah.ts (since
 * 2026-10-21 TP is handed in and kept only in IRIS).
 *
 * Settings live in `pengaturan`:
 * - tp_jendela  the semester's default window and each module's own
 * - tp_kecuali  the registered Praktikan left out of TP
 *
 * The question bank (tp_paket, Penilaian › Soal TP) holds each module's
 * variants and the final set's pick; with no row a module uses the default
 * bank in tp-bawaan.ts.
 */
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  jadwal,
  nilai,
  pengaturan,
  praktikan,
  rosterKelompok,
  rosterSlot,
  sesi,
  sesiAnggota,
  tpJejak,
  tpKiriman,
  tpNilai,
  tpPaket,
  tpPerpanjang,
} from "../../src/lib/schema.js";
import { hariIniWib } from "../../src/lib/jadwal.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { tanggalMinggu } from "../../src/lib/penugasan-minggu.js";
import {
  BAHASA_TP,
  MAKS_VARIAN,
  KODE_VARIAN,
  POLA_BAWAAN,
  TP_MENUNGGU,
  TP_NOMOR,
  jendelaPribadi,
  masukPerpanjangan,
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
  type PolaJendela,
  type SoalTampil,
  type SoalTp,
  type StatusTp,
  type VarianTp,
} from "../../src/lib/tp.js";
import { PETUNJUK_BAWAAN, TP_BAWAAN } from "./tp-bawaan.js";
import { muatTanggal } from "./penugasan-api.js";

type Db = ReturnType<typeof getDb>;

export const KUNCI_TP = {
  jendela: "tp_jendela",
  kecuali: "tp_kecuali",
} as const;

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

export interface JendelaSet {
  semester: string;
  pola: PolaJendela;
  modul: Record<string, JendelaTp>;
}

export interface SetTp {
  semester: string;
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
  const kec = v(KUNCI_TP.kecuali) as KecualiSet | undefined;
  return {
    semester,
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

/** A row of a TP file's history (tp_jejak): names and sizes, no links. */
export interface Jejak {
  semester: string;
  modul: number;
  nim: string;
  jenis: "baru" | "ganti" | "tarik" | "unggah";
  sumber: "lms" | "iris";
  berkas: { nama: string; ukuran: number }[];
  dikirimPada: Date | null;
}

/** Writes history rows; a failure here never stops the upload. */
export async function catatJejak(db: Db, rows: Jejak[]): Promise<void> {
  if (!rows.length) return;
  try {
    await db.insert(tpJejak).values(
      rows.map((r) => ({
        ...r,
        berkas: r.berkas.map((b) => ({ nama: b.nama, ukuran: b.ukuran })),
      })),
    );
  } catch (e) {
    console.error("[tp] history row not written:", e);
  }
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

/** The per Praktikan extensions on each module, NIM to the date (tp_perpanjang). */
export async function perpanjangTp(db: Db, set: SetTp): Promise<Map<number, Map<string, string>>> {
  const out = new Map<number, Map<string, string>>();
  for (const p of await db
    .select({ modul: tpPerpanjang.modul, nim: tpPerpanjang.nim, sampai: tpPerpanjang.sampai })
    .from(tpPerpanjang)
    .where(eq(tpPerpanjang.semester, set.semester))) {
    const per = out.get(p.modul) ?? new Map<string, string>();
    per.set(p.nim, p.sampai.toISOString());
    out.set(p.modul, per);
  }
  return out;
}

/** A module's window, as IRIS keeps it. */
export function jendelaUntuk(set: SetTp, modul: number): (JendelaTp & { sumber: "iris" }) | null {
  const j = set.jendela.modul[String(modul)];
  return j ? { ...j, sumber: "iris" } : null;
}

/** The NIMs of the Asisten still on the team (active or on leave): someone
 *  registered as a Praktikan too is not counted as one (2026-10-18). */
export async function nimAsistenTim(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ nim: asisten.nim })
    .from(asisten)
    .where(inArray(asisten.status, ["aktif", "cuti"]));
  return new Set(rows.map((r) => r.nim));
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
  /** Their own extension's end, when the file came in on it. */
  perpanjangan: string | null;
  terimaTelat: boolean | null;
  berkas: number;
  kirimanId: number | null;
  /** Left out of TP (Pengaturan TP › Peserta TP): shown, never counted. */
  kecuali: boolean;
}

export interface KelompokTp {
  nomor: number;
  klp: string | null;
  pemegang: { nim: string; kode: string; nama: string } | null;
  milikku: boolean;
  /** Codes of Asisten whose scores stand here though the seat is another's:
   *  given before the Per Modul list changed. */
  nilaiLain: string[];
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
  /** nomor -> the Per Modul seat's NIM (null: nobody) */
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
  const [snap, kodeRows, minggu, roster, klpRows] = await Promise.all([
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
    db.select({ nim: asisten.nim, kode: asisten.kode }).from(asisten),
    muatTanggal(db, rows, tanggalOf, new Map(rows.map((r) => [r.id, modul]))),
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
    // The TP is the Per Modul seat's (user, 2026-10-20): an izin, a cover
    // or a take-over in the session never moves it.
    for (const k of minggu.get(r.id)?.kursi ?? [])
      pemegang.set(k.nomor, k.tetap ? (nimOfKode.get(k.tetap.toUpperCase()) ?? null) : null);
    if (sid) {
      for (const a of snap.filter((x) => x.sesiId === sid))
        anggota.set(a.nomor, [...(anggota.get(a.nomor) ?? []), { nim: a.nim, nama: a.nama }]);
    } else {
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

/** Who holds `nim`'s TP for `modul`: their group's Per Modul seat (nim null
 *  when the seat is empty). Null when the Praktikan is in no group. */
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
  diubahOleh: string;
}

export async function skorModul(db: Db, semester: string, modul: number, nims?: string[]) {
  const rows: SkorBaris[] = await db
    .select({
      nim: tpNilai.nim,
      nomor: tpNilai.nomor,
      skor: tpNilai.skor,
      catatan: tpNilai.catatan,
      diubahOleh: tpNilai.diubahOleh,
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
  const [kursi, kiriman, skor, kodeRows, perpanjang] = await Promise.all([
    kursiModul(db, set, modul),
    db
      .select()
      .from(tpKiriman)
      .where(and(eq(tpKiriman.semester, set.semester), eq(tpKiriman.modul, modul))),
    skorModul(db, set.semester, modul),
    db.select({ nim: asisten.nim, kode: asisten.kode, nama: asisten.nama }).from(asisten),
    perpanjangTp(db, set),
  ]);
  const orang = new Map(kodeRows.map((a) => [a.nim, a]));
  const kirOf = new Map(kiriman.map((k) => [k.nim, k]));
  const sampaiOf = perpanjang.get(modul) ?? new Map<string, string>();
  const dipakai = new Set<string>();
  const kec = nimKecuali(set);
  const satu = (a: { nim: string; nama: string }): AnggotaTp => {
    dipakai.add(a.nim);
    const k = kirOf.get(a.nim);
    const nomor = nomorUntuk(a.nim);
    const s = skor.per.get(a.nim) ?? {};
    const pada = k?.dikirimPada?.toISOString() ?? null;
    const sampai = sampaiOf.get(a.nim);
    const telat = telatMenit(pada, j && jendelaPribadi(j, sampai));
    const panjang = masukPerpanjangan(pada, j, sampai);
    return {
      nim: a.nim,
      nama: a.nama,
      status: statusTp({
        adaBerkas: !!k?.berkas.length,
        tanda: k?.tanda ?? null,
        telat: telat !== null,
        panjang,
        lengkap: tpLengkap(s, nomor),
      }),
      perpanjangan: panjang ? sampai! : null,
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
        const nims = new Set(k.anggota.get(nomor)!.map((a) => a.nim));
        const lain = p
          ? skor.rows
              .filter((r) => nims.has(r.nim) && r.diubahOleh !== p)
              .map((r) => orang.get(r.diubahOleh)?.kode.toUpperCase())
              .filter((x): x is string => !!x)
          : [];
        return {
          nomor,
          klp: k.klp.get(nomor) ?? null,
          pemegang: p ? { nim: p, kode: o?.kode.toUpperCase() ?? p, nama: o?.nama ?? p } : null,
          milikku: p === meNim,
          nilaiLain: [...new Set(lain)].sort(),
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
    .filter((k) => !dipakai.has(k.nim) && !orang.has(k.nim))
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
        .filter((a) => !a.kecuali && TP_MENUNGGU.includes(a.status)).length,
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
