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

/** A slot's status on a date: a holiday that date wins over the semester. */
export function statusSlotTanggal(
  j: { status: "aktif" | "segera" | "kosong"; liburTanggal: string | null },
  tanggal: string,
): StatusSlot {
  if (j.status === "kosong") return "kosong";
  if (j.liburTanggal === tanggal) return "libur";
  return j.status;
}
