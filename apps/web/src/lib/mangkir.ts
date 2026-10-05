/**
 * Mangkir (2026-10-05): did a scheduled Asisten turn up on time. Pure and
 * browser safe; the API stores the result (kehadiran_asisten) and the
 * running session's Preparation shows it.
 *
 * The deadline is the session's scheduled start ("06:30" on its date, WIB)
 * plus TELAT_MENIT. Turning up means the first sign of them in the session
 * (opening it, any action in it, or Tandai Hadir), see api/_lib/sesi-hadir.
 *
 * - tepat           by the deadline
 * - mangkir_ngajar  after it, but they still taught ("Mangkir/Ngajar")
 * - mangkir         never turned up (final once the session has ended)
 * While the session runs, someone not here yet is "belum" before the
 * deadline and "lewat" after it.
 */
export const TELAT_MENIT = 5;

/** The first date Mangkir is recorded for. Older sessions have no trail
 *  of who turned up when, so they are never judged. */
export const MANGKIR_SEJAK = "2026-10-05";

export const STATUS_HADIR = ["tepat", "mangkir_ngajar", "mangkir"] as const;
export type StatusHadir = (typeof STATUS_HADIR)[number];
export type StatusHadirLive = StatusHadir | "belum" | "lewat";

export function statusHadirValid(v: unknown): v is StatusHadir {
  return typeof v === "string" && (STATUS_HADIR as readonly string[]).includes(v);
}

/** The scheduled start as an instant: "2026-10-06" + "06:30" in WIB. */
export function mulaiTerjadwal(tanggal: string, mulai: string): Date {
  return new Date(`${tanggal}T${mulai}:00+07:00`);
}

export interface NilaiHadir {
  status: StatusHadirLive;
  /** Minutes after the scheduled start, for mangkir_ngajar. */
  telatMenit: number | null;
}

export function nilaiKehadiran(
  tanggal: string,
  mulai: string,
  datang: Date | string | null,
  selesai: boolean,
  now: Date = new Date(),
): NilaiHadir {
  const awal = mulaiTerjadwal(tanggal, mulai).getTime();
  const batas = awal + TELAT_MENIT * 60_000;
  if (datang) {
    const t = (typeof datang === "string" ? new Date(datang) : datang).getTime();
    if (t <= batas) return { status: "tepat", telatMenit: null };
    return { status: "mangkir_ngajar", telatMenit: Math.floor((t - awal) / 60_000) };
  }
  if (selesai) return { status: "mangkir", telatMenit: null };
  return { status: now.getTime() > batas ? "lewat" : "belum", telatMenit: null };
}
