/**
 * Where each TP file lands on the server PC (2026-10-14): one folder per
 * semester, then module, then the day and session of that module's
 * practicum, then the group.
 *
 *   2026-2027 Ganjil/Modul 1/Kamis 22 Oktober 2026 Sesi 1 (06.30)/Kelompok 01/1032231301 Raka Pradipta.pdf
 *
 * A Praktikan in no group that week goes under "Modul N/Tanpa Kelompok".
 * Pure, so the site and its tests build the same paths.
 */
import { SLOT_MULAI } from "./jadwal.js";

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = [
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

/** A name any file system takes: no separators, no reserved characters. */
export function namaAman(s: string, maks = 120): string {
  const bersih = s
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  return bersih.slice(0, maks).trim() || "_";
}

/** "2026-ganjil" -> "2026-2027 Ganjil"; "2027-genap" -> "2026-2027 Genap". */
export function folderSemester(semester: string): string {
  const m = /^(\d{4})-(ganjil|genap)$/.exec(semester);
  if (!m) return namaAman(semester);
  const y = Number(m[1]);
  return m[2] === "ganjil" ? `${y}-${y + 1} Ganjil` : `${y - 1}-${y} Genap`;
}

/** "2026-10-22", 1 -> "Kamis 22 Oktober 2026 Sesi 1 (06.30)". */
export function folderSesi(tanggal: string, slot: number): string {
  const [y, mo, d] = tanggal.split("-").map(Number);
  const hari = HARI[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const jam = SLOT_MULAI[slot]?.replace(":", ".");
  return `${hari} ${d} ${BULAN[mo - 1]} ${y} Sesi ${slot}${jam ? ` (${jam})` : ""}`;
}

export const folderKelompok = (nomor: number) => `Kelompok ${String(nomor).padStart(2, "0")}`;

export const TANPA_KELOMPOK = "Tanpa Kelompok";

/** The file's own name: NIM and name, numbered when there are several. */
export function namaBerkasCermin(
  nim: string,
  nama: string,
  asli: string,
  i: number,
  jumlah: number,
): string {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(asli)?.[1]?.toLowerCase();
  const dasar = namaAman(`${nim} ${nama}`, 100);
  return `${dasar}${jumlah > 1 ? ` (${i + 1})` : ""}${ext ? `.${ext}` : ""}`;
}

export interface TempatCermin {
  tanggal: string;
  slot: number;
  nomor: number;
}

/** The path under the PC's TP folder, '/' between parts. */
export function jalanCermin(o: {
  semester: string;
  modul: number;
  nim: string;
  nama: string;
  asli: string;
  i: number;
  jumlah: number;
  tempat: TempatCermin | null;
}): string {
  return [
    folderSemester(o.semester),
    `Modul ${o.modul}`,
    ...(o.tempat
      ? [folderSesi(o.tempat.tanggal, o.tempat.slot), folderKelompok(o.tempat.nomor)]
      : [TANPA_KELOMPOK]),
    namaBerkasCermin(o.nim, o.nama, o.asli, o.i, o.jumlah),
  ].join("/");
}
