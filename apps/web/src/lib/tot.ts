/**
 * Mode TOT (Training of Trainers, 2026-10-05). Browser-safe: the 60 dummy
 * Praktikan the Asisten play during their weekly practice run, and the pure
 * rules around them. The database side is src/lib/mode-tot.ts and
 * api/_lib/tot.ts.
 *
 * Each division is one group of ten: group 1 is ASO (NIM 100000..100009),
 * group 2 ARD, 3 ADS, 4 ADC, 5 AER, 6 ARM (600000..600009). The accounts
 * live here in code, never in `praktikan`, so they can't show up in the
 * Team, roster editors or SeeLabs.
 */
import { DIVISI, type Divisi } from "./hak.js";

export const TOT_PER_KELOMPOK = 10;
export const TOT_JUMLAH_KELOMPOK = DIVISI.length;

export interface PraktikanTot {
  nim: string;
  nama: string;
  kelompokNomor: number;
  divisi: Divisi;
  /** 1..10 inside the division */
  urut: number;
}

export const PRAKTIKAN_TOT: readonly PraktikanTot[] = DIVISI.flatMap((divisi, i) =>
  Array.from({ length: TOT_PER_KELOMPOK }, (_, n) => ({
    nim: `${i + 1}0000${n}`,
    nama: `TOT ${divisi} ${String(n + 1).padStart(2, "0")}`,
    kelompokNomor: i + 1,
    divisi,
    urut: n + 1,
  })),
);

/** Who takes part in TOT (2026-10-12): the divisions, in group order, and
 *  how many of each division's ten dummies are on the roster. */
export interface AturTot {
  divisi: Divisi[];
  perKelompok: number;
}

export const ATUR_TOT_BAWAAN: AturTot = { divisi: [...DIVISI], perKelompok: TOT_PER_KELOMPOK };

/** A stored or sent setting, cleaned; null when it can't be used. */
export function bacaAturTot(v: unknown): AturTot | null {
  if (!isBaris(v) || !Array.isArray(v.divisi)) return null;
  const divisi = [...new Set(v.divisi.filter((d): d is Divisi => DIVISI.includes(d as Divisi)))];
  const n = Number(v.perKelompok);
  if (!divisi.length || !Number.isInteger(n) || n < 1 || n > TOT_PER_KELOMPOK) return null;
  return { divisi, perKelompok: n };
}

/** The dummies the setting puts on the roster, each with its group number */
export function pesertaTot(atur: AturTot): (PraktikanTot & { kelompok: number })[] {
  return PRAKTIKAN_TOT.filter(
    (p) => atur.divisi.includes(p.divisi) && p.urut <= atur.perKelompok,
  ).map((p) => ({ ...p, kelompok: atur.divisi.indexOf(p.divisi) + 1 }));
}

const NIM_TOT = new Set(PRAKTIKAN_TOT.map((p) => p.nim));

export function isNimTot(nim: string): boolean {
  return NIM_TOT.has(nim.trim().toUpperCase());
}

/** The division a TOT group stands for (1 = ASO .. 6 = ARM). */
export function divisiKelompokTot(nomor: number): Divisi | null {
  return DIVISI[nomor - 1] ?? null;
}

/** May this Praktikan NIM use the site right now? While TOT is on only the
 *  dummies may; while it is off only real Praktikan may. */
export function praktikanBolehMasuk(nim: string, totAktif: boolean): boolean {
  return isNimTot(nim) === totAktif;
}

/* -------------------------------------------- the live roster's backup */

export interface KelompokBaris {
  id: number;
  nomor: number;
  nama: string;
  aktif: boolean;
  klpSeelabs: string | null;
}

export interface AnggotaBaris {
  id: number;
  kelompokId: number;
  nim: string;
  nama: string;
}

/** What `pengaturan.tot` holds. `cadangan` is the live roster exactly as it
 *  was when TOT was switched on; it is null while TOT is off. */
export interface ModeTot {
  aktif: boolean;
  sejak: string | null;
  oleh: string | null;
  cadangan: { kelompok: KelompokBaris[]; anggota: AnggotaBaris[] } | null;
  /** Who takes part; kept when TOT is switched off */
  atur: AturTot;
  /** A dummy signed out by hand: its sign-ins before this time stop working */
  keluar: Record<string, string>;
}

export const MODE_TOT_MATI: ModeTot = {
  aktif: false,
  sejak: null,
  oleh: null,
  cadangan: null,
  atur: ATUR_TOT_BAWAAN,
  keluar: {},
};

/** Was this dummy signed out by hand after its cookie was made? */
export function dikeluarkanTot(mode: ModeTot, nim: string, dibuatMs: number): boolean {
  const k = mode.keluar[nim];
  return !!k && Date.parse(k) > dibuatMs;
}

function isBaris(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Reads `pengaturan.tot` defensively: anything malformed counts as off,
 *  except that a stored backup is never thrown away by this read. */
export function bacaNilaiTot(nilai: unknown): ModeTot {
  if (!isBaris(nilai)) return MODE_TOT_MATI;
  const c = nilai.cadangan;
  const cadangan =
    isBaris(c) && Array.isArray(c.kelompok) && Array.isArray(c.anggota)
      ? {
          kelompok: (c.kelompok as KelompokBaris[]).map((k) => ({
            id: Number(k.id),
            nomor: Number(k.nomor),
            nama: String(k.nama),
            aktif: Boolean(k.aktif),
            klpSeelabs: k.klpSeelabs == null ? null : String(k.klpSeelabs),
          })),
          anggota: (c.anggota as AnggotaBaris[]).map((a) => ({
            id: Number(a.id),
            kelompokId: Number(a.kelompokId),
            nim: String(a.nim),
            nama: String(a.nama),
          })),
        }
      : null;
  const keluar: Record<string, string> = {};
  if (isBaris(nilai.keluar))
    for (const [nim, pada] of Object.entries(nilai.keluar))
      if (isNimTot(nim) && typeof pada === "string") keluar[nim] = pada;
  return {
    aktif: nilai.aktif === true,
    sejak: typeof nilai.sejak === "string" ? nilai.sejak : null,
    oleh: typeof nilai.oleh === "string" ? nilai.oleh : null,
    cadangan,
    atur: bacaAturTot(nilai.atur) ?? ATUR_TOT_BAWAAN,
    keluar,
  };
}

/**
 * The live roster TOT puts in place, given the `kelompok` rows that exist.
 * Rows are only ever updated (sessions cascade from them, see
 * api/_lib/roster.ts), so one group per chosen division is created when
 * missing (in the chosen order) and every other group is switched off.
 */
export function rosterTot(
  ada: Pick<KelompokBaris, "nomor">[],
  atur: AturTot = ATUR_TOT_BAWAAN,
): {
  kelompok: Omit<KelompokBaris, "id">[];
  matikan: number[];
  anggota: { kelompokNomor: number; nim: string; nama: string }[];
} {
  const kelompok = atur.divisi.map((_, i) => ({
    nomor: i + 1,
    nama: `Kelompok ${i + 1}`,
    aktif: true,
    klpSeelabs: null,
  }));
  const matikan = ada.map((k) => k.nomor).filter((n) => n > atur.divisi.length);
  const anggota = pesertaTot(atur).map((p) => ({
    kelompokNomor: p.kelompok,
    nim: p.nim,
    nama: p.nama,
  }));
  return { kelompok, matikan, anggota };
}
