/** What GET /api/session/schedule returns (Phase 9 Stage 4). */
import type { Kelas } from "../../lib/kelas";
import type { TagPengganti } from "../../lib/jadwal-parser";
import type { MingguSlot } from "../../lib/penugasan-minggu";
import type { StatusOrang } from "../../lib/hak";

export interface JadwalRow {
  id: number;
  semester: string;
  hari: number;
  slot: number;
  kelas: Kelas;
  status: "aktif" | "segera" | "kosong";
  warnaKosong: "oranye" | "merah" | null;
  liburTanggal: string | null;
  asisten: string[];
  pengganti: { kode: string; tag: TagPengganti }[];
  jumlahKelompok: number;
  jendelaMulaiMenit: number | null;
  jendelaDiaturOleh: string | null;
  diubahOleh: string | null;
}

export interface OrangJadwal {
  nim: string;
  kode: string;
  nama: string;
  status: StatusOrang;
}

export interface PengaturanJendela {
  default: number;
  min: number;
  max: number;
}

export interface DataJadwal {
  jadwal: JadwalRow[];
  asisten: OrangJadwal[];
  minggu: Record<string, MingguSlot>;
  jendela: PengaturanJendela;
}

export const HARI = [1, 2, 3, 4, 5, 6] as const;
export const SLOTS = [1, 2, 3, 4] as const;
