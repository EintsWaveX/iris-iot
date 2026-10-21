/**
 * Who teaches a weekly slot on one date (Phase 9 Stage 4). Browser-safe:
 * the Schedule, Tim, the Console home and session start share it.
 *
 * The semester's default pairing is `jadwal.asisten`: one code per group in
 * group order ("" for an empty seat). A shorter list, as the sheet has for
 * some slots, is spread over the groups in contiguous blocks (bagiKelompok).
 * A date then applies its own changes: an excused Asisten (izin) leaves
 * their groups open, and an accepted `penugasan_slot` row with a group
 * seats its person there (a substitute or a volunteer).
 */
import { bagiKelompok } from "./penugasan.js";
import { hariDariTanggal } from "./jadwal-parser.js";

export type StatusSlot = "aktif" | "segera" | "libur" | "kosong";
export type JenisTugas = "tetap" | "pengganti" | "sukarela";

/** One code (or null) per group, from the semester's list. */
export function pasanganSemester(asisten: readonly string[], n: number): (string | null)[] {
  const kode = asisten.map((k) => k.trim().toUpperCase());
  if (kode.length >= n) return kode.slice(0, n).map((k) => k || null);
  const nomor = Array.from({ length: n }, (_, i) => i + 1);
  const peta = bagiKelompok(
    kode.filter((k) => k),
    nomor,
  );
  // Blanks inside a short list mean nothing; spread only the real codes.
  return nomor.map((g) => peta.get(g) ?? null);
}

export interface TugasTanggal {
  kelompokNomor: number | null;
  kode: string;
  jenis: JenisTugas;
  status: "diminta" | "diterima" | "ditolak";
}

export interface IzinTanggal {
  kode: string;
  status: "aktif" | "dicari" | "dibatalkan";
}

export interface KursiKelompok {
  nomor: number;
  /** Who holds the group on that date (null: nobody). */
  kode: string | null;
  jenis: JenisTugas;
  /** The semester's Asisten for the group. */
  tetap: string | null;
  /** True when the semester's Asisten is excused that date. */
  izin: boolean;
}

/** Each group's seat on a date. */
export function pasanganTanggal(
  asisten: readonly string[],
  n: number,
  tugas: readonly TugasTanggal[],
  izinList: readonly IzinTanggal[],
): KursiKelompok[] {
  const izinKode = new Set(
    izinList.filter((x) => x.status !== "dibatalkan").map((x) => x.kode.toUpperCase()),
  );
  const kursi: KursiKelompok[] = pasanganSemester(asisten, n).map((k, i) => ({
    nomor: i + 1,
    kode: k && !izinKode.has(k) ? k : null,
    jenis: "tetap",
    tetap: k,
    izin: !!k && izinKode.has(k),
  }));
  for (const t of tugas) {
    if (t.status !== "diterima" || t.kelompokNomor == null) continue;
    const s = kursi[t.kelompokNomor - 1];
    if (!s) continue;
    s.kode = t.kode.toUpperCase();
    s.jenis = t.jenis;
  }
  return kursi;
}

/** Who grades a group's TP for the module taught that date (user,
 *  2026-10-21): a Substitute or Volunteer seated there takes it over;
 *  otherwise the Per Modul seat keeps it, excused or not. */
export function pemegangTpKursi(k: KursiKelompok): string | null {
  return k.kode && k.jenis !== "tetap" && k.kode !== k.tetap ? k.kode : k.tetap;
}

/** A cover on a seat: its kind and whose seat it is (null: an open seat). */
export interface GantiKursi {
  jenis: "pengganti" | "sukarela";
  untuk: string | null;
}

export function gantiKursi(k: KursiKelompok): GantiKursi | null {
  if (!k.kode || k.jenis === "tetap" || k.kode === k.tetap) return null;
  return { jenis: k.jenis, untuk: k.tetap };
}

/** The slot's PJ on a date (user, 2026-10-21): when the default PJ holds
 *  none of their seats that date and a Substitute or Volunteer covers one,
 *  that cover acts as PJ; otherwise the default PJ stays. */
export function pjTanggal(pj: string | null, kursi: readonly KursiKelompok[]): string | null {
  const p = pj?.trim().toUpperCase();
  if (!p) return null;
  if (kursi.some((k) => k.kode === p)) return p;
  const ganti = kursi.find((k) => k.tetap === p && gantiKursi(k));
  return ganti?.kode ?? p;
}

/** One of my seats on a date, as the "my slots" lists show it. */
export interface KursiSaya {
  nomor: number;
  /** I cover it (Substitute or Volunteer), else null: my own seat. */
  ganti: GantiKursi | null;
  /** My own seat someone else holds that date (or nobody, when excused). */
  lepas: { kode: string | null; izin: boolean } | null;
}

/** The groups `kode` holds that date, covers marked, plus their own seats
 *  handed over or excused (so a Regular still sees them, struck through). */
export function kursiSaya(kursi: readonly KursiKelompok[], kode: string): KursiSaya[] {
  const k0 = kode.trim().toUpperCase();
  if (!k0) return [];
  const out: KursiSaya[] = [];
  for (const k of kursi) {
    if (k.kode === k0) out.push({ nomor: k.nomor, ganti: gantiKursi(k), lepas: null });
    else if (k.tetap === k0)
      out.push({ nomor: k.nomor, ganti: null, lepas: { kode: k.kode, izin: k.izin } });
  }
  return out;
}

/** Whether `kode` teaches the slot: on its semester list, or seated or
 *  helping on the date `m` holds (when given). */
export function mengajarDi(
  j: { asisten: readonly string[] },
  m: { kursi: readonly KursiKelompok[]; tugas: readonly TugasTanggal[] } | undefined,
  kode: string,
): boolean {
  const k0 = kode.trim().toUpperCase();
  if (!k0) return false;
  if (j.asisten.some((a) => a.trim().toUpperCase() === k0)) return true;
  return !!m && orangTanggal(m.kursi, m.tugas).has(k0);
}

/** Everyone who may teach the slot that date: seated, or helping. */
export function orangTanggal(kursi: readonly KursiKelompok[], tugas: readonly TugasTanggal[]) {
  const s = new Set(kursi.map((k) => k.kode).filter((k): k is string => !!k));
  for (const t of tugas) if (t.status === "diterima") s.add(t.kode.toUpperCase());
  return s;
}

/** The next date (today included) that falls on `hari` (1 Monday to 6
 *  Saturday), as "YYYY-MM-DD". */
export function tanggalBerikut(hari: number, hariIni: string): string {
  const now = hariDariTanggal(hariIni);
  const tambah = (hari - now + 7) % 7;
  const [y, m, d] = hariIni.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + tambah));
  return t.toISOString().slice(0, 10);
}

/** How many weeks past its next date Tim › Penugasan Slot can plan a slot. */
export const GESER_MAKS = 16;

/** The slot's date `geser` weeks after its next one. */
export function tanggalMinggu(hari: number, hariIni: string, geser = 0): string {
  const [y, m, d] = tanggalBerikut(hari, hariIni).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 7 * geser)).toISOString().slice(0, 10);
}

/** Whether `v` is a real "YYYY-MM-DD" that falls on a Monday. */
export function seninSah(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v && t.getUTCDay() === 1;
}

/** Whether `tanggal` falls in a later Monday to Sunday week than `hariIni`
 *  (a slot's next date can be next week: "Minggu depan", not "Minggu ini"). */
export function mingguDepan(tanggal: string, hariIni: string): boolean {
  const senin = (x: string) =>
    Date.parse(`${x}T00:00:00Z`) / 86_400_000 - ((hariDariTanggal(x) + 6) % 7);
  return senin(tanggal) > senin(hariIni);
}

/** Which week past its next date `tanggal` is for a slot on `hari`, or
 *  null when it is before the next date or not on that day. */
export function geserDari(hari: number, hariIni: string, tanggal: string): number | null {
  const hari0 = Date.parse(`${tanggalBerikut(hari, hariIni)}T00:00:00Z`);
  const beda = (Date.parse(`${tanggal}T00:00:00Z`) - hari0) / 86_400_000;
  return beda >= 0 && beda % 7 === 0 ? beda / 7 : null;
}

/** A slot's holiday dates. `jadwal.libur_tanggal` holds them comma
 *  separated (2026-10-12: weeks ahead can each have one); a single date,
 *  as before, reads the same. */
export function daftarLibur(v: string | null): string[] {
  return (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
}

/** The holiday list with `tanggal` on or off; dates already past drop. */
export function aturLibur(
  v: string | null,
  tanggal: string,
  libur: boolean,
  hariIni: string,
): string | null {
  const s = new Set(daftarLibur(v).filter((x) => x >= hariIni));
  if (libur) s.add(tanggal);
  else s.delete(tanggal);
  return s.size ? [...s].sort().join(",") : null;
}

/** A slot's status on a date: a holiday that date wins over the semester. */
export function statusSlotTanggal(
  j: { status: "aktif" | "segera" | "kosong"; liburTanggal: string | null },
  tanggal: string,
): StatusSlot {
  if (j.status === "kosong") return "kosong";
  if (daftarLibur(j.liburTanggal).includes(tanggal)) return "libur";
  return j.status;
}

/* ---------------------------------------- the API shapes (schedule GET) */

export interface TugasInfo {
  id: number;
  nim: string;
  kode: string;
  kelompokNomor: number | null;
  jenis: "tetap" | "pengganti" | "sukarela";
  status: "diminta" | "diterima" | "ditolak";
  tag: "fit" | "a24" | null;
  dimintaOleh: string;
  dikonfirmasiOleh: string | null;
}

export interface IzinInfo {
  id: number;
  nim: string;
  kode: string;
  status: "aktif" | "dicari" | "dibatalkan";
  alasan: string | null;
  penggantiNim: string | null;
}

export interface MingguSlot {
  tanggal: string;
  status: StatusSlot;
  kursi: KursiKelompok[];
  tugas: TugasInfo[];
  izin: IzinInfo[];
  /** The module that date teaches while the semester pairs per module
   *  (penugasan-modul.ts), else null. */
  modul?: number | null;
  modulSumber?: "sesi" | "tp" | "terbuka" | null;
}
