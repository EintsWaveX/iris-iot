/** Penilaian (Phase 13): the shapes /api/tp answers with. */
import type { KeadaanJendela, StatusTp } from "../../lib/tp";
import type { JendelaInfo } from "../tp/shared";

export interface AnggotaTp {
  nim: string;
  nama: string;
  status: StatusTp;
  total: number | null;
  dinilai: number;
  jumlah: number;
  dikirimPada: string | null;
  telatMenit: number | null;
  perpanjangan?: string | null;
  terimaTelat: boolean | null;
  berkas: number;
  kirimanId: number | null;
  kecuali?: boolean;
}

export interface KelompokTp {
  nomor: number;
  klp: string | null;
  pemegang: { nim: string; kode: string; nama: string } | null;
  milikku: boolean;
  /** Codes of Asisten whose scores stand here though the seat is another's. */
  nilaiLain?: string[];
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

export interface InfoSinkron {
  tersambung: boolean;
  terakhir: string | null;
  hasil: "ok" | "gagal" | null;
  galat: string | null;
  galatSejak: string | null;
}

export interface DataKelompok {
  ok: boolean;
  jendela: JendelaInfo | null;
  keadaan: KeadaanJendela | null;
  modul: { modul: number; jendela: JendelaInfo | null; keadaan: KeadaanJendela | null }[];
  slot: SlotTp[];
  tanpaKelompok: AnggotaTp[];
  hitung: { peserta: number; masuk: number; dinilai: number; perluNilaiku: number };
  sinkron: InfoSinkron;
  hilang: { label: string; peserta: number }[];
  bolehLms: boolean;
  bolehKelola?: boolean;
  /** Grades groups with no Per Modul seat and Tanpa Kelompok (Admin, Pencipta). */
  bolehTanpaPemegang?: boolean;
}

/** One group opened in the grader, with where it came from. */
export interface GrupDinilai {
  nomor: number | null;
  klp: string | null;
  pemegang: KelompokTp["pemegang"];
  milikku: boolean;
  anggota: AnggotaTp[];
}

export interface DetailPraktikan {
  ok: boolean;
  nim: string;
  nama: string;
  kelas: "reguler" | "inter";
  nomor: number[];
  keadaan: KeadaanJendela | null;
  kiriman: {
    id: number;
    berkas: { i: number; nama: string; ukuran: number; mime: string }[];
    dikirimPada: string | null;
    telatMenit: number | null;
    /** Their own extension's end, when the file came in on it. */
    perpanjangan: string | null;
    terimaTelat: boolean | null;
    tanda: "kosong" | null;
    /** Uploaded in IRIS or from the LMS (2026-10-14), and the IRIS file's LMS copy. */
    sumber: "lms" | "iris";
    salinanLms: string | null;
  } | null;
  skor: Record<
    string,
    { skor: number; catatan: string | null; oleh: string; lain?: string | null }
  >;
  /** The session TP the SeeLabs read-back copied in (2026-10-17), until graded here. */
  tpSeelabs?: number | null;
  /** Their own extension, if any (2026-10-21). */
  perpanjang?: { sampai: string; alasan: string | null; oleh: string | null } | null;
  boleh: boolean;
  pemegang: string | null;
  pemegangKode?: string | null;
}
