/**
 * The TP calendar (2026-10-21, the LMS Kalender's, inside IRIS now): each
 * module's TP window and practicum week, the postponed weeks (Jadwal's
 * Deteksi Modul), and for a Praktikan their own close and practicum day.
 * Browser-safe: GET /api/tp/kalender builds it, the month grid reads it.
 */
import { mingguModulSemua } from "./penugasan-modul.js";
import { bagiWib, tambahHari, type JendelaTp } from "./tp.js";

export type JenisAcara = "tp" | "modul" | "tunda" | "praktikum";

export interface Acara {
  kunci: string;
  jenis: JenisAcara;
  modul: number | null;
  /** WIB dates, both included. */
  dari: string;
  sampai: string;
  /** tp: the window's open and close (their own close with an extension). */
  buka?: string;
  tutup?: string;
  /** tp: their own extension moved the close. */
  panjang?: boolean;
  /** praktikum: the slot's start, "06:30". */
  jam?: string;
  /** praktikum: their slot is off that date. */
  libur?: boolean;
}

const URUT: Record<JenisAcara, number> = { tunda: 0, modul: 1, praktikum: 2, tp: 3 };

/**
 * Every event of the semester, by start date. `pribadi` is one Praktikan's:
 * their extensions (module to the new close), their slot's day (1 Senin to
 * 6 Sabtu) and start, and that slot's holidays.
 */
export function acaraKalender(f: {
  jendela: Partial<Record<number, JendelaTp | null>>;
  tunda?: readonly string[];
  pribadi?: {
    perpanjang?: ReadonlyMap<number, string>;
    hari?: number | null;
    jam?: string | null;
    libur?: readonly string[];
  };
}): Acara[] {
  const out: Acara[] = [];
  const minggu = mingguModulSemua(f.jendela, f.tunda ?? []);
  const p = f.pribadi;
  for (const m of Object.keys(f.jendela)
    .map(Number)
    .sort((a, b) => a - b)) {
    const j = f.jendela[m];
    if (!j) continue;
    const ext = p?.perpanjang?.get(m);
    const tutup = ext && Date.parse(ext) > Date.parse(j.tutup) ? ext : j.tutup;
    out.push({
      kunci: `tp-${m}`,
      jenis: "tp",
      modul: m,
      dari: bagiWib(j.buka).tanggal,
      sampai: bagiWib(tutup).tanggal,
      buka: j.buka,
      tutup,
      ...(tutup !== j.tutup ? { panjang: true } : {}),
    });
    const w = minggu[m];
    if (!w) continue;
    out.push({ kunci: `modul-${m}`, jenis: "modul", modul: m, dari: w.senin, sampai: w.sabtu });
    if (p?.hari && p.hari >= 1 && p.hari <= 6) {
      const t = tambahHari(w.senin, p.hari - 1);
      out.push({
        kunci: `praktikum-${m}`,
        jenis: "praktikum",
        modul: m,
        dari: t,
        sampai: t,
        ...(p.jam ? { jam: p.jam } : {}),
        ...(p.libur?.includes(t) ? { libur: true } : {}),
      });
    }
  }
  for (const senin of f.tunda ?? [])
    out.push({
      kunci: `tunda-${senin}`,
      jenis: "tunda",
      modul: null,
      dari: senin,
      sampai: tambahHari(senin, 5),
    });
  return out.sort(
    (a, b) =>
      a.dari.localeCompare(b.dari) ||
      URUT[a.jenis] - URUT[b.jenis] ||
      (a.modul ?? 0) - (b.modul ?? 0),
  );
}

/** The events on one date. */
export const acaraPada = (acara: readonly Acara[], tgl: string) =>
  acara.filter((a) => a.dari <= tgl && a.sampai >= tgl);

/** A month's grid ("2026-10"): blank days before the 1st (weeks start on
 *  Monday) and its length. */
export function bulanGrid(bulan: string): { y: number; m: number; lead: number; n: number } {
  const [y, m] = bulan.split("-").map(Number);
  const awal = new Date(Date.UTC(y, m - 1, 1));
  return { y, m, lead: (awal.getUTCDay() + 6) % 7, n: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

/** A month moved by `n` ("2026-12", 1 is "2027-01"). */
export function geserBulan(bulan: string, n: number): string {
  const [y, m] = bulan.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
