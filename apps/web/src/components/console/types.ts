/** Shapes the console reads from the API (api/session/[aksi].ts, api/_lib/phase8.ts, api/server). */
import type { Kelas } from "../../lib/kelas";

export interface SesiRunning {
  id: number;
  modul: number;
  tanggal: string;
  mulai: string;
  mulaiPada: string | null;
  slot: number | null;
  butuhAp: boolean;
  status?: string;
  kelas?: Kelas;
  pengumuman?: string | null;
  pengumumanPada?: string | null;
}

export interface RosterGroup {
  id: number;
  nomor: number;
  nama: string;
  aktif?: boolean;
  sesiAktif?: boolean;
  anggota: { nim: string; nama: string }[];
}

export interface Anggota {
  nim: string;
  nama: string;
  hadir: boolean;
}

export interface BlankRinci {
  soalKode: string;
  benar: boolean;
  percobaan: number;
  diubahPada: string;
}

export interface GroupRow {
  id: number;
  nomor: number;
  nama: string;
  sesiAktif: boolean;
  catatan: string | null;
  peran: "beacon" | "hunter" | null;
  anggotaTotal: number;
  hadir: number;
  benar: number;
  total: number;
  anggota: Anggota[];
  blankRinci?: BlankRinci[];
  telemetri?: {
    count: number;
    delayMinMs: number | null;
    delayMedianMs: number | null;
    delayMaxMs: number | null;
  };
}

export interface Stuck {
  kelompokId: number;
  nomor: number | null;
  soalKode: string;
  percobaan: number;
}

export interface Laporan {
  ok: boolean;
  sesi: {
    id: number;
    modul: number;
    tanggal: string;
    mulai: string;
    status: string;
    kelas?: Kelas;
    durasiDetik: number;
  } | null;
  kelompok: GroupRow[];
  stuck: Stuck[];
  tangan?: Record<string, string>;
  pemilik?: Record<string, string>;
}

export interface AsistenRef {
  nim: string;
  kode: string;
  nama: string;
}

export interface Penugasan {
  kelas: Kelas;
  penugasan: { kelompokId: number; asistenNim: string; kode: string; nama: string }[];
  jadwal: {
    asisten: string[];
    pengganti: { kode: string; tag: "fit" | "a24" | null }[];
    kelas: Kelas;
  } | null;
  asisten: AsistenRef[];
}

export interface Heartbeat {
  pada: string;
  jamSelaras: boolean;
  modeJaringan: string | null;
  layanan: Record<string, string> | null;
  cpu?: number | null;
  suhu?: number | null;
  uptimeSec?: number | null;
}

export interface ServerRow {
  id: number;
  nama: string;
  kode: string;
  denyutTerakhir: Heartbeat | null;
  batasLuringDetik: number;
}

export interface Perangkat {
  id: number;
  mac: string;
  ip: string | null;
  vendor: string | null;
  jenis: string | null;
  nama: string | null;
  kelompokNomor: number | null;
  disembunyikan: boolean;
  terakhirTerlihat: string | null;
}

export interface Perintah {
  id: number;
  aksi: string;
  argumen?: Record<string, string> | null;
  status: string;
  dimintaOleh: string | null;
  dimintaPada: string;
  terkirimPada: string | null;
  selesaiPada: string | null;
  keluaran: string | null;
}

export interface ServerDetail {
  server: ServerRow;
  denyutTerakhir: Heartbeat | null;
  batasLuringDetik: number;
  perangkat: Perangkat[];
  perintah: Perintah[];
}

export interface NilaiAnggota {
  nim: string;
  nama: string;
  skor: Partial<Record<string, number>>;
  total: number;
  lengkap: boolean;
}

export interface NilaiKelompok {
  id: number;
  nomor: number;
  nama: string;
  anggota: NilaiAnggota[];
}

export interface NilaiData {
  komponen: string[];
  kelompok: NilaiKelompok[];
  pemilik: Record<string, string>;
}

export type View = "prep" | "board" | "table";

export interface FeedItem {
  id: string;
  at: number;
  g: number | null;
  kind: "hand" | "wrong" | "right" | "done" | "login" | "score" | "device" | "note";
  text: string;
}

export function isOnline(hb: Heartbeat | null, batasDetik: number): boolean {
  if (!hb) return false;
  return Date.now() - new Date(hb.pada).getTime() < batasDetik * 1000;
}
