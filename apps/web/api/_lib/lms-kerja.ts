/**
 * Phase 15: the LMS menu's work that more than one caller does: the page
 * (api/lms/[aksi].ts) one class at a time, and the Orange Pi heartbeat's
 * automations (lms-otomatis.ts) for every class. Each reads the LMS back
 * after it writes.
 */
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { asisten, lmsPeserta, nilaiKirim, sesi, sesiAnggota } from "../../src/lib/schema.js";
import {
  isoWib,
  keadaanJendela,
  mingguPraktikum,
  nomorUntuk,
  totalTp,
  tpLengkap,
} from "../../src/lib/tp.js";
import { LmsGalat, bukaToken } from "./lms.js";
import { bacaSet, jendelaUntuk, nimKecuali, skorModul, type KursusTp, type SetTp } from "./tp.js";
import {
  KUNCI_LMS,
  NAMA_MODUL,
  acaraKursus,
  bacaCatatan,
  buatAcara,
  forumUmum,
  hapusAcara,
  htmlTeks,
  nilaiLms,
  simpanNilaiLms,
  tulisCatatan,
  tulisUmum,
  umpanBalik,
  type AcaraIris,
  type NilaiTerkirim,
  type UmumIris,
} from "./lms-menu.js";

type Db = ReturnType<typeof getDb>;

const detik = (s: string) => Math.floor(Date.parse(s) / 1000);
const angka = (v: unknown) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const HARI = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

export { bacaSet };

export async function petaKode(db: Db): Promise<Map<string, string>> {
  const rows = await db.select({ nim: asisten.nim, kode: asisten.kode }).from(asisten);
  return new Map(rows.map((a) => [a.nim, a.kode.toUpperCase()]));
}

/** The token, or why there is none. */
export function tokenDari(set: SetTp): string {
  const t = set.token ? bukaToken(set.token) : null;
  if (!t) throw new LmsGalat("belum_tersambung", "no LMS token");
  return t;
}

export function kursusDari(set: SetTp, id: unknown): KursusTp | null {
  const n = angka(id);
  return (set.kelas?.kursus ?? []).find((k) => k.id === n) ?? null;
}

/** The module the overview follows: the open one, else the next to open,
 *  else the latest closed, else Module 1. */
export function modulPilihan(set: SetTp): number {
  const k = [1, 2, 3, 4].map((m) => ({ m, j: jendelaUntuk(set, m) }));
  const buka = k.find((x) => keadaanJendela(x.j) === "buka");
  if (buka) return buka.m;
  const nanti = k
    .filter((x) => keadaanJendela(x.j) === "belum")
    .sort((a, b) => Date.parse(a.j!.buka) - Date.parse(b.j!.buka))[0];
  if (nanti) return nanti.m;
  const lalu = k.filter((x) => keadaanJendela(x.j) === "tutup").pop();
  return lalu?.m ?? 1;
}

/** "Senin-2-K3": the LMS group name of an IRIS group. */
export const namaGrup = (hari: number, slot: number, nomor: number) =>
  `${HARI[hari] ?? hari}-${slot}-K${nomor}`;

/** NIMs whose group's scores for module m went out (Kirim Nilai). */
export async function terkirimModul(db: Db, semester: string, m: number): Promise<Set<string>> {
  const rows = await db
    .select({ nim: sesiAnggota.nim, tanggal: sesi.tanggal })
    .from(sesiAnggota)
    .innerJoin(sesi, eq(sesi.id, sesiAnggota.sesiId))
    .innerJoin(
      nilaiKirim,
      and(
        eq(nilaiKirim.sesiId, sesiAnggota.sesiId),
        eq(nilaiKirim.kelompokNomor, sesiAnggota.kelompokNomor),
      ),
    )
    .where(and(eq(sesi.modul, m), ne(sesi.jenis, "tot")));
  return new Set(rows.filter((r) => semesterDariTanggal(r.tanggal) === semester).map((r) => r.nim));
}

export interface SiapNilai {
  nim: string;
  total: number;
  per: Partial<Record<number, number>>;
  nomor: number[];
}

/** Registered Praktikan whose TP is complete and whose scores went out. */
export async function nilaiSiap(db: Db, set: SetTp, m: number): Promise<Map<string, SiapNilai>> {
  const kec = nimKecuali(set);
  const [{ per }, kirim] = await Promise.all([
    skorModul(db, set.semester, m),
    terkirimModul(db, set.semester, m),
  ]);
  const out = new Map<string, SiapNilai>();
  for (const [nim, sk] of per) {
    if (kec.has(nim) || !kirim.has(nim)) continue;
    const nomor = nomorUntuk(nim);
    if (!tpLengkap(sk, nomor)) continue;
    const total = totalTp(sk, nomor);
    if (total !== null) out.set(nim, { nim, total, per: sk, nomor });
  }
  return out;
}

/** One class's TP scores into the gradebook (those ready, not yet the same). */
export async function kirimNilaiKursus(
  db: Db,
  set: SetTp,
  m: number,
  kursusId: number,
  oleh: string,
): Promise<{ kirim: number; cocok: boolean }> {
  const k = (set.kelas?.kursus ?? []).find((x) => x.id === kursusId);
  if (!k) throw new LmsGalat("kursus_tidak_ada", "no such course");
  const t = k.tugas[String(m)];
  if (!t) throw new LmsGalat("tidak_ada_di_lms", "no TP assignment");
  const token = tokenDari(set);
  const kec = nimKecuali(set);
  const siap = await nilaiSiap(db, set, m);
  const peserta = await db
    .select({ nim: lmsPeserta.nim, user: lmsPeserta.lmsUser })
    .from(lmsPeserta)
    .where(eq(lmsPeserta.semester, set.semester));
  const userOf = new Map(peserta.map((p) => [p.nim, p.user]));
  const lama = (await nilaiLms(token, [t.id])).get(t.id) ?? new Map<number, number>();
  const kodeOf = await petaKode(db);
  const bahasa = k.kelas === "inter" ? "en" : "id";
  const baris = (k.nim ?? [])
    .filter((n) => !kec.has(n) && siap.has(n) && userOf.has(n))
    .map((n) => ({ n, sp: siap.get(n)!, u: userOf.get(n)! }))
    .filter(({ sp, u }) => {
      const v = lama.get(u);
      return v === undefined || Math.abs(v - sp.total) >= 0.005;
    });
  if (baris.length)
    await simpanNilaiLms(
      token,
      t.id,
      baris.map(({ sp, u }) => ({
        userid: u,
        skor: sp.total,
        umpan: umpanBalik(sp.per, sp.nomor, kodeOf.get(oleh) ?? null, bahasa),
      })),
    );
  const baru = (await nilaiLms(token, [t.id])).get(t.id) ?? new Map<number, number>();
  const cocok = baris.every(({ sp, u }) => Math.abs((baru.get(u) ?? -1) - sp.total) < 0.005);
  const catatan = await bacaCatatan<Record<string, Record<string, NilaiTerkirim>>>(
    db,
    KUNCI_LMS.nilai,
    set.semester,
    {},
  );
  const per = catatan[String(m)] ?? {};
  for (const { n, sp } of baris) per[n] = { skor: sp.total, pada: new Date().toISOString(), oleh };
  catatan[String(m)] = per;
  await tulisCatatan(db, KUNCI_LMS.nilai, set.semester, catatan, oleh);
  return { kirim: baris.length, cocok };
}

/** The templates, filled from the TP window of the module the overview
 *  follows (Indonesian for Reguler, English for International). */
export function templatUmum(set: SetTp) {
  const m = modulPilihan(set);
  const j = jendelaUntuk(set, m);
  const tutup = j ? waktuPanjangWib(j.tutup) : null;
  return {
    modul: m,
    buka: {
      judul: { id: `TP Modul ${m} sudah dibuka`, en: `TP Modul ${m} is open` },
      isi: {
        id: `TP Modul ${m} sudah dibuka${tutup ? ` sampai ${tutup.id}` : ""}. Soal ada di IRIS dan di tugas TP Modul ${m}. Kerjakan di kertas, pindai jadi satu PDF, lalu unggah di tugas itu.`,
        en: `TP Modul ${m} is open${tutup ? ` until ${tutup.en}` : ""}. The questions are in IRIS and in the TP Modul ${m} assignment. Write on paper, scan to one PDF and upload it there.`,
      },
    },
    tutup: {
      judul: { id: `TP Modul ${m} ditutup 3 jam lagi`, en: `TP Modul ${m} closes in 3 hours` },
      isi: {
        id: `Pengingat: TP Modul ${m} ditutup${tutup ? ` ${tutup.id}` : " hari ini"}. Kiriman setelah itu dihitung telat.`,
        en: `Reminder: TP Modul ${m} closes${tutup ? ` ${tutup.en}` : " today"}. Files after that count as late.`,
      },
    },
    nilai: {
      judul: { id: `Nilai TP Modul ${m} sudah keluar`, en: `TP Modul ${m} scores are out` },
      isi: {
        id: `Nilai TP Modul ${m} sudah bisa dilihat di Dasbor IRIS dan di LMS.`,
        en: `TP Modul ${m} scores are on the IRIS Dashboard and in the LMS.`,
      },
    },
  };
}

const HARI_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const BULAN_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const BULAN_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Sabtu, 17 Oktober 2026 · 18:00" in WIB, both languages. */
export function waktuPanjangWib(isoStr: string) {
  const d = new Date(Date.parse(isoStr) + 7 * 3_600_000);
  const jam = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return {
    id: `${HARI_ID[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN_ID[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${jam}`,
    en: `${HARI_EN[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN_EN[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${jam}`,
  };
}

/** Posts one announcement in one class's Announcements forum. */
export async function umumkanKursus(
  db: Db,
  set: SetTp,
  id: string,
  kursusId: number,
  oleh: string,
): Promise<boolean> {
  const daftar = await bacaCatatan<UmumIris[]>(db, KUNCI_LMS.umum, set.semester, []);
  const u = daftar.find((x) => x.id === id);
  const k = (set.kelas?.kursus ?? []).find((x) => x.id === kursusId);
  if (!u || !k) throw new LmsGalat("format_salah", "no such announcement or course");
  if (u.kursus[String(kursusId)]) return true;
  const token = tokenDari(set);
  const forum = (await forumUmum(token, [kursusId])).get(kursusId);
  if (!forum) throw new LmsGalat("lms_tanpa_forum", "no Announcements forum");
  const teks = k.kelas === "inter" ? u.isi.en : u.isi.id;
  const judul = k.kelas === "inter" ? u.judulEn || u.judul : u.judul;
  const r = await tulisUmum(token, forum, judul, htmlTeks(teks));
  const segar = await bacaCatatan<UmumIris[]>(db, KUNCI_LMS.umum, set.semester, []);
  const v = segar.find((x) => x.id === id);
  if (v)
    v.kursus[String(kursusId)] = {
      diskusi: r.diskusi,
      post: r.post,
      pada: new Date().toISOString(),
    };
  await tulisCatatan(db, KUNCI_LMS.umum, set.semester, segar, oleh);
  return true;
}

export interface AcaraIngin {
  kunci: string;
  nama: { id: string; en: string };
  mulai: string;
  selesai: string;
  jenis: "tp" | "modul";
  modul: number;
}

/** What IRIS's schedule puts in every class calendar: each TP window and
 *  each module's practicum week. Never a slot, a group or an Asisten. */
export function acaraIngin(set: SetTp): AcaraIngin[] {
  const out: AcaraIngin[] = [];
  for (const m of [1, 2, 3, 4]) {
    const j = jendelaUntuk(set, m);
    if (!j) continue;
    out.push({
      kunci: `tp${m}`,
      nama: { id: `TP Modul ${m}`, en: `TP Modul ${m}` },
      mulai: j.buka,
      selesai: j.tutup,
      jenis: "tp",
      modul: m,
    });
    const w = mingguPraktikum(j);
    out.push({
      kunci: `mod${m}`,
      nama: {
        id: `Minggu Modul ${m} · ${NAMA_MODUL[m]}`,
        en: `Module ${m} week · ${NAMA_MODUL[m]}`,
      },
      mulai: isoWib(w.senin, "00:00"),
      selesai: isoWib(w.sabtu, "23:59"),
      jenis: "modul",
      modul: m,
    });
  }
  return out;
}

/** Makes one class's calendar match IRIS's events (moved ones replaced). */
export async function samakanKalender(
  db: Db,
  set: SetTp,
  kursusId: number,
  oleh: string,
): Promise<{ baru: number; hapus: number; cocok: boolean }> {
  const k = (set.kelas?.kursus ?? []).find((x) => x.id === kursusId);
  if (!k) throw new LmsGalat("kursus_tidak_ada", "no such course");
  const token = tokenDari(set);
  const catatan = await bacaCatatan<Record<string, AcaraIris[]>>(
    db,
    KUNCI_LMS.kalender,
    set.semester,
    {},
  );
  const punya = catatan[String(kursusId)] ?? [];
  const ingin = acaraIngin(set);
  const tetap: AcaraIris[] = [];
  const buang: number[] = [];
  for (const p of punya) {
    const a = ingin.find((x) => x.kunci === p.kunci);
    if (a && a.mulai === p.mulai && a.selesai === p.selesai) tetap.push(p);
    else buang.push(p.id);
  }
  // Events taken down by hand in the LMS are made again.
  const dari =
    Math.min(...ingin.map((a) => detik(a.mulai)), Math.floor(Date.now() / 1000)) - 86_400;
  const sampai = Math.max(...ingin.map((a) => detik(a.selesai)), 0) + 86_400;
  const adaDiLms = ingin.length
    ? new Set((await acaraKursus(token, [kursusId], dari, sampai)).map((e) => e.id))
    : new Set<number>();
  const hidup = tetap.filter((p) => adaDiLms.has(p.id));
  if (buang.length) await hapusAcara(token, buang).catch(() => undefined);
  const bahasa = k.kelas === "inter" ? "en" : "id";
  let baru = 0;
  for (const a of ingin) {
    if (hidup.some((p) => p.kunci === a.kunci)) continue;
    const id = await buatAcara(token, kursusId, {
      nama: a.nama[bahasa],
      teks: "",
      mulai: detik(a.mulai),
      selesai: detik(a.selesai),
    });
    hidup.push({ kunci: a.kunci, id, mulai: a.mulai, selesai: a.selesai, nama: a.nama[bahasa] });
    baru++;
  }
  const segar = await bacaCatatan<Record<string, AcaraIris[]>>(
    db,
    KUNCI_LMS.kalender,
    set.semester,
    {},
  );
  segar[String(kursusId)] = hidup;
  await tulisCatatan(db, KUNCI_LMS.kalender, set.semester, segar, oleh);
  const kini = ingin.length
    ? new Set((await acaraKursus(token, [kursusId], dari, sampai)).map((e) => e.id))
    : new Set<number>();
  return { baru, hapus: buang.length, cocok: hidup.every((p) => kini.has(p.id)) };
}
