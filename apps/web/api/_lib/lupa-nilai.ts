/**
 * Lupa Input Nilai (Phase 18), the data side: which groups of ended
 * sessions are not done yet (sent with Kirim Nilai and saved in SeeLabs),
 * who holds each, and the lupa_nilai rows. The home, the banner (GET
 * /api/session/hadirku) and the lab clock read it; the rules are pure in
 * src/lib/lupa-nilai.ts.
 */
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { muatSeelabs } from "./seelabs.js";
import type { getDb } from "../../src/lib/db.js";
import {
  asisten,
  kelompok,
  lupaNilai,
  nilai,
  nilaiAbsen,
  nilaiKirim,
  seelabsBaca,
  seelabsEkspor,
  seelabsTugas,
  sesiAnggota,
  sesiAsisten,
  sesi,
} from "../../src/lib/schema.js";
import { NILAI_KOMPONEN } from "../../src/lib/nilai-komponen.js";
import { langkahKelompok, type LupaSaya, type NilaiSaya } from "../../src/lib/lupa-nilai.js";

type Db = ReturnType<typeof getDb>;

/**
 * Groups SeeLabs already held before IRIS put them in, as "sesiId.nomor":
 * the group's first finished robot save was an edit through Input Ulang
 * (the entry was in that account's Lihat Nilai), or the read-back found it
 * only in SeeLabs. SeeLabs limits only a first input to the practicum day;
 * an entry that is already there is edited at any time, so IRIS's later
 * send of such a group is an edit, never a late input (user, 2026-10-22).
 */
export async function sudahAdaDiSeelabs(db: Db, sesiIds: number[]): Promise<Set<string>> {
  const ada = new Set<string>();
  if (sesiIds.length === 0) return ada;
  const [tugas, baca] = await Promise.all([
    db
      .select({
        sesiId: seelabsTugas.sesiId,
        nomor: seelabsTugas.kelompokNomor,
        bukti: seelabsTugas.bukti,
      })
      .from(seelabsTugas)
      .where(
        and(
          inArray(seelabsTugas.sesiId, sesiIds),
          eq(seelabsTugas.jenis, "nilai"),
          eq(seelabsTugas.status, "selesai"),
        ),
      )
      .orderBy(asc(seelabsTugas.id)),
    db
      .select({ sesiId: seelabsBaca.sesiId, nomor: seelabsBaca.kelompokNomor })
      .from(seelabsBaca)
      .where(and(inArray(seelabsBaca.sesiId, sesiIds), eq(seelabsBaca.status, "hanya_seelabs"))),
  ]);
  const lihat = new Set<string>();
  for (const t of tugas) {
    if (t.sesiId === null || t.nomor === null) continue;
    const k = `${t.sesiId}.${t.nomor}`;
    if (lihat.has(k)) continue; // only the group's first save tells
    lihat.add(k);
    if ((t.bukti as { ulang?: boolean } | null)?.ulang === true) ada.add(k);
  }
  for (const b of baca) ada.add(`${b.sesiId}.${b.nomor}`);
  return ada;
}

/**
 * Every group of the given ended sessions that is not done, with its
 * holder and checklist. TOT sessions and sessions without a snapshot of
 * their groups give nothing. Groups nobody holds are left out (there is
 * no one to remind).
 */
export async function muatNilaiTerbuka(db: Db, sesiIds: number[]): Promise<NilaiSaya[]> {
  if (sesiIds.length === 0) return [];
  const sesiRows = await db
    .select({
      id: sesi.id,
      modul: sesi.modul,
      tanggal: sesi.tanggal,
      slot: sesi.slot,
      jenis: sesi.jenis,
      status: sesi.status,
    })
    .from(sesi)
    .where(inArray(sesi.id, sesiIds));
  const layak = sesiRows.filter((s) => s.status === "selesai" && s.jenis !== "tot");
  if (layak.length === 0) return [];
  const ids = layak.map((s) => s.id);

  const [orang, pegang, grup, kirim, simpan, absen, skor, tugas, ases] = await Promise.all([
    db
      .select({
        sesiId: sesiAnggota.sesiId,
        nomor: sesiAnggota.kelompokNomor,
        nim: sesiAnggota.nim,
      })
      .from(sesiAnggota)
      .where(inArray(sesiAnggota.sesiId, ids)),
    db
      .select({
        sesiId: sesiAsisten.sesiId,
        kelompokId: sesiAsisten.kelompokId,
        nim: sesiAsisten.asistenNim,
      })
      .from(sesiAsisten)
      .where(inArray(sesiAsisten.sesiId, ids)),
    db.select({ id: kelompok.id, nomor: kelompok.nomor }).from(kelompok),
    db
      .select({ sesiId: nilaiKirim.sesiId, nomor: nilaiKirim.kelompokNomor })
      .from(nilaiKirim)
      .where(inArray(nilaiKirim.sesiId, ids)),
    db
      .select({ sesiId: seelabsEkspor.sesiId, nomor: seelabsEkspor.kelompokNomor })
      .from(seelabsEkspor)
      .where(and(inArray(seelabsEkspor.sesiId, ids), isNotNull(seelabsEkspor.disimpanPada))),
    db
      .select({ sesiId: nilaiAbsen.sesiId, nim: nilaiAbsen.nim })
      .from(nilaiAbsen)
      .where(inArray(nilaiAbsen.sesiId, ids)),
    db
      .select({ sesiId: nilai.sesiId, nim: nilai.nim, komponen: nilai.komponen })
      .from(nilai)
      .where(inArray(nilai.sesiId, ids)),
    db
      .select({
        sesiId: seelabsTugas.sesiId,
        nomor: seelabsTugas.kelompokNomor,
        status: seelabsTugas.status,
        galat: seelabsTugas.galatKode,
      })
      .from(seelabsTugas)
      .where(and(inArray(seelabsTugas.sesiId, ids), eq(seelabsTugas.jenis, "nilai")))
      .orderBy(desc(seelabsTugas.id)),
    db.select({ nim: asisten.nim, kode: asisten.kode }).from(asisten),
  ]);

  const nomorDariId = new Map(grup.map((g) => [g.id, g.nomor]));
  const kodeDariNim = new Map(ases.map((a) => [a.nim, a.kode]));
  const key = (sesiId: number, nomor: number) => `${sesiId}.${nomor}`;
  const terkirim = new Set(kirim.map((k) => key(k.sesiId, k.nomor)));
  const tersimpan = new Set(simpan.map((k) => key(k.sesiId, k.nomor)));
  const absenSet = new Set(absen.map((a) => `${a.sesiId}.${a.nim}`));
  // L1 is never missing: unless typed it is the system's (rubric), so only
  // the other components are counted.
  const hitung = new Map<string, number>();
  for (const r of skor) {
    if (r.komponen === "L1") continue;
    const k = `${r.sesiId}.${r.nim}`;
    hitung.set(k, (hitung.get(k) ?? 0) + 1);
  }
  // The newest job of each group decides the robot's state.
  const robot = new Map<string, { status: string; galat: string | null }>();
  for (const t of tugas) {
    if (t.nomor === null || t.sesiId === null) continue;
    const k = key(t.sesiId, t.nomor);
    if (!robot.has(k)) robot.set(k, { status: t.status, galat: t.galat });
  }

  const out: NilaiSaya[] = [];
  for (const s of layak) {
    const nomorSesi = [...new Set(orang.filter((o) => o.sesiId === s.id).map((o) => o.nomor))].sort(
      (a, b) => a - b,
    );
    let status: Map<number, string> | null = null;
    for (const nomor of nomorSesi) {
      const k = key(s.id, nomor);
      const pemegang = pegang
        .filter((p) => p.sesiId === s.id && nomorDariId.get(p.kelompokId) === nomor)
        .map((p) => p.nim)[0];
      if (!pemegang) continue;
      const lengkap = orang
        .filter((o) => o.sesiId === s.id && o.nomor === nomor)
        .every(
          (o) =>
            absenSet.has(`${s.id}.${o.nim}`) ||
            (hitung.get(`${s.id}.${o.nim}`) ?? 0) >= NILAI_KOMPONEN.length - 1,
        );
      const dasar = {
        lengkap,
        terkirim: terkirim.has(k),
        tersimpan: tersimpan.has(k),
        robot: null as "antre" | "gagal" | null,
        butuhAkun: false,
      };
      const r = robot.get(k);
      if (r?.status === "gagal") dasar.robot = "gagal";
      else if (r && (r.status === "antre" || r.status === "diambil")) dasar.robot = "antre";
      if (langkahKelompok(dasar).selesai) continue;
      // The lender check reads the whole session, so only for open groups.
      if (!dasar.tersimpan) {
        if (!status) {
          const data = await muatSeelabs(db, s.id);
          status = new Map((data?.kelompok ?? []).map((g) => [g.nomor, g.status]));
        }
        dasar.butuhAkun = status.get(nomor) === "butuh_akun";
      }
      const { kurang } = langkahKelompok(dasar);
      out.push({
        sesiId: s.id,
        nomor,
        modul: s.modul,
        tanggal: s.tanggal,
        slot: s.slot,
        pemegang,
        pemegangKode: kodeDariNim.get(pemegang) ?? "",
        lengkap,
        terkirim: dasar.terkirim,
        tersimpan: dasar.tersimpan,
        butuhAkun: dasar.butuhAkun,
        robot: dasar.robot,
        galat: dasar.robot === "gagal" ? (r?.galat ?? null) : null,
        kurang,
      });
    }
  }
  return out;
}

/**
 * The lupa_nilai rows of a holder that are not put in yet, and the ones put
 * in during the last day (so the banner can say "Diinput Menyusul"), newest first.
 */
export async function muatLupaSaya(db: Db, nim: string, now: Date): Promise<LupaSaya[]> {
  const rows = await db
    .select({
      sesiId: lupaNilai.sesiId,
      nomor: lupaNilai.kelompokNomor,
      kurang: lupaNilai.kurang,
      dicatatPada: lupaNilai.dicatatPada,
      menyusulPada: lupaNilai.menyusulPada,
      modul: sesi.modul,
      tanggal: sesi.tanggal,
      slot: sesi.slot,
    })
    .from(lupaNilai)
    .innerJoin(sesi, eq(sesi.id, lupaNilai.sesiId))
    .where(eq(lupaNilai.nim, nim))
    .orderBy(desc(lupaNilai.dicatatPada));
  return rows
    .filter((r) => !r.menyusulPada || now.getTime() - r.menyusulPada.getTime() < 86_400_000)
    .map((r) => ({
      sesiId: r.sesiId,
      nomor: r.nomor,
      modul: r.modul,
      tanggal: r.tanggal,
      slot: r.slot,
      kurang: r.kurang,
      dicatatPada: r.dicatatPada.toISOString(),
      menyusulPada: r.menyusulPada?.toISOString() ?? null,
    }));
}
