/**
 * Lupa Input Nilai (Phase 18), the pure rules. A group's scores must be
 * sent with Kirim Nilai and saved in SeeLabs by 23:59:59 WIB on the
 * practicum day; reminders follow the holder until then, and a miss is
 * recorded (report only, no pay cut). Browser-safe: the home, the banner,
 * the session end and the lab clock share it.
 */

export type LangkahNilai = "lengkap" | "akun" | "kirim" | "seelabs";
export type TahapNilai = "akhir" | "malam" | "terakhir" | "robot" | "lewat";

export interface KelompokLangkah {
  /** Every present member has all 8 components (absent ones are marked). */
  lengkap: boolean;
  terkirim: boolean;
  tersimpan: boolean;
  /** The newest robot job for the group, when it is waiting or failed. */
  robot: "antre" | "gagal" | null;
  /** The group waits for a SeeLabs lender (status butuh_akun). */
  butuhAkun: boolean;
}

/**
 * The per-group checklist: Nilai Lengkap, then the account, Kirim Nilai and
 * Tersimpan di SeeLabs. `kurang` lists what is still missing, in the order
 * to do it; done means sent and saved.
 */
export function langkahKelompok(g: KelompokLangkah): {
  selesai: boolean;
  kurang: LangkahNilai[];
} {
  const kurang: LangkahNilai[] = [];
  if (!g.terkirim && !g.lengkap) kurang.push("lengkap");
  if (!g.tersimpan && g.butuhAkun) kurang.push("akun");
  if (!g.terkirim) kurang.push("kirim");
  if (!g.tersimpan) kurang.push("seelabs");
  return { selesai: g.terkirim && g.tersimpan, kurang };
}

/** What a missed group lacked, for the record: only the two steps that count. */
export function kurangCatat(g: { terkirim: boolean; tersimpan: boolean }): ("kirim" | "seelabs")[] {
  const out: ("kirim" | "seelabs")[] = [];
  if (!g.terkirim) out.push("kirim");
  if (!g.tersimpan) out.push("seelabs");
  return out;
}

const MENIT = 60_000;

/** The first instant of a WIB date (WIB is UTC+7, no DST). */
const awalHari = (tanggal: string) => new Date(`${tanggal}T00:00:00+07:00`).getTime();

/** The deadline: one second before the next WIB midnight, as an instant. */
export function batasNilai(tanggal: string): Date {
  return new Date(awalHari(tanggal) + 24 * 60 * MENIT - 1000);
}

/**
 * Which reminder applies on the practicum day: from the session end until
 * 20:00 (`akhir`), from 20:00 (`malam`), from 22:30 (`terakhir`, the PJ
 * sees every open group), from 23:00 (`robot`, a robot still queued may not
 * make it) and after 23:59:59 (`lewat`, the late path with a Token Khusus).
 */
export function pengingatNilai(tanggal: string, now: Date): TahapNilai {
  const menit = (now.getTime() - awalHari(tanggal)) / MENIT;
  if (now.getTime() > batasNilai(tanggal).getTime()) return "lewat";
  if (menit >= 23 * 60) return "robot";
  if (menit >= 22 * 60 + 30) return "terakhir";
  if (menit >= 20 * 60) return "malam";
  return "akhir";
}

/** One group of the caller's that is not done yet (the shape the API sends). */
export interface NilaiSaya {
  sesiId: number;
  nomor: number;
  modul: number;
  tanggal: string;
  slot: number | null;
  /** Who holds the group; a PJ sees others' groups too. */
  pemegang: string;
  pemegangKode: string;
  lengkap: boolean;
  terkirim: boolean;
  tersimpan: boolean;
  butuhAkun: boolean;
  robot: "antre" | "gagal" | null;
  /** GALAT_ROBOT code of the failed job, when there is one. */
  galat: string | null;
  kurang: LangkahNilai[];
}

/** A missed group of the caller's (Lupa Input Nilai), until it is put in. */
export interface LupaSaya {
  sesiId: number;
  nomor: number;
  modul: number;
  tanggal: string;
  slot: number | null;
  kurang: ("kirim" | "seelabs")[];
  dicatatPada: string;
  menyusulPada: string | null;
}
