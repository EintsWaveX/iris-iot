/**
 * Reports (Phase 9 Stage 6b, mockups r-home and r-session): the shape of a
 * session row from GET /api/session/riwayat and the sums every tab draws
 * from it. One fetch carries every held session; the filter bar, Overview
 * and Workload all work on the rows in the browser. Browser-safe.
 */
import type { Kelas } from "./kelas.js";

export interface SesiLaporan {
  id: number;
  tanggal: string;
  mulai: string;
  slot: number | null;
  modul: number;
  kelas: Kelas;
  status: "berjalan" | "selesai";
  jenis: "reguler" | "susulan";
  durasiDetik: number | null;
  /** Who holds each group, in group order. */
  pasangan: { nomor: number; nim: string }[];
  /** Present students / students. */
  hadir: [number, number];
  /** Students with at least one score / students. */
  dinilai: [number, number];
  /** Every component score in the session: their sum and how many. */
  skor: { jumlah: number; n: number };
  /** Correct blanks / blanks the session's groups could fill. */
  blank: [number, number];
  /** Lab feedback ratings: their sum and how many. */
  lab: { jumlah: number; n: number };
  /** Telemetry delays in ms: their sum and how many. */
  delay: { jumlah: number; n: number };
  /** Asisten (NIM) who covered a group that wasn't theirs. */
  ganti: string[];
}

export type StatusLaporan = "jalan" | "kurang" | "lengkap";

/** Running, scores incomplete, or complete. */
export function statusLaporan(s: Pick<SesiLaporan, "status" | "dinilai">): StatusLaporan {
  if (s.status === "berjalan") return "jalan";
  return s.dinilai[0] < s.dinilai[1] ? "kurang" : "lengkap";
}

export interface Saringan {
  /** Inclusive ISO dates; null is open. */
  dari: string | null;
  sampai: string | null;
  modul: number | "all";
  slot: number | "all";
  kelas: Kelas | "all";
  /** An Asisten's NIM. */
  asisten: string | "all";
  status: StatusLaporan | "all";
}

export const SARINGAN_AWAL: Saringan = {
  dari: null,
  sampai: null,
  modul: "all",
  slot: "all",
  kelas: "all",
  asisten: "all",
  status: "all",
};

/** How many filters besides the date range are set. */
export function jumlahSaringan(f: Saringan): number {
  return (["modul", "slot", "kelas", "asisten", "status"] as const).filter((k) => f[k] !== "all")
    .length;
}

export function cocok(f: Saringan) {
  return (s: SesiLaporan): boolean =>
    (f.dari == null || s.tanggal >= f.dari) &&
    (f.sampai == null || s.tanggal <= f.sampai) &&
    (f.modul === "all" || s.modul === f.modul) &&
    (f.slot === "all" || s.slot === f.slot) &&
    (f.kelas === "all" || s.kelas === f.kelas) &&
    (f.asisten === "all" ||
      s.pasangan.some((p) => p.nim === f.asisten) ||
      s.ganti.includes(f.asisten)) &&
    (f.status === "all" || statusLaporan(s) === f.status);
}

export type Preset = "7" | "30" | "sem" | "all" | "custom";

/** Shift an ISO date by whole days. */
export function geserTanggal(iso: string, hari: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + hari)).toISOString().slice(0, 10);
}

/** The first day of the semester `hariIni` falls in (Aug or Feb). */
export function awalSemester(hariIni: string): string {
  const [y, m] = hariIni.split("-").map(Number);
  if (m >= 8) return `${y}-08-01`;
  if (m === 1) return `${y - 1}-08-01`;
  return `${y}-02-01`;
}

/** The date range a preset means, on `hariIni`. */
export function rentangPreset(
  p: Exclude<Preset, "custom">,
  hariIni: string,
): [string | null, string | null] {
  if (p === "all") return [null, null];
  if (p === "sem") return [awalSemester(hariIni), hariIni];
  return [geserTanggal(hariIni, -(Number(p) - 1)), hariIni];
}

const rasio = (a: number, b: number) => (b > 0 ? a / b : null);

export interface Ikhtisar {
  sesi: number;
  /** Fractions 0..1, or null with no data. */
  hadir: number | null;
  skorRata: number | null;
  blank: number | null;
  labRata: number | null;
  perModul: { modul: number; reguler: number | null; internasional: number | null }[];
}

/** Overview: attendance, average score, blanks correct, lab feedback, and
 *  each module's average score per class. */
export function ikhtisar(rows: SesiLaporan[]): Ikhtisar {
  const sum = (f: (s: SesiLaporan) => number) => rows.reduce((a, s) => a + f(s), 0);
  const skorKelas = (m: number, k: Kelas) => {
    const r = rows.filter((s) => s.modul === m && s.kelas === k);
    return rasio(
      r.reduce((a, s) => a + s.skor.jumlah, 0),
      r.reduce((a, s) => a + s.skor.n, 0),
    );
  };
  return {
    sesi: rows.length,
    hadir: rasio(
      sum((s) => s.hadir[0]),
      sum((s) => s.hadir[1]),
    ),
    skorRata: rasio(
      sum((s) => s.skor.jumlah),
      sum((s) => s.skor.n),
    ),
    blank: rasio(
      sum((s) => s.blank[0]),
      sum((s) => s.blank[1]),
    ),
    labRata: rasio(
      sum((s) => s.lab.jumlah),
      sum((s) => s.lab.n),
    ),
    perModul: [1, 2, 3, 4].map((modul) => ({
      modul,
      reguler: skorKelas(modul, "reguler"),
      internasional: skorKelas(modul, "internasional"),
    })),
  };
}

export interface Beban {
  nim: string;
  /** Sessions this week (Monday to Sunday of `hariIni`). */
  minggu: number;
  sesi: number;
  kelompok: number;
  /** Sessions where they held two groups or more. */
  ganda: number;
  /** Times they covered a group that wasn't theirs. */
  ganti: number;
}

/** The Monday of the week `iso` falls in. */
export function senin(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const hari = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return geserTanggal(iso, -((hari + 6) % 7));
}

/** Workload per Asisten over the rows, busiest first. */
export function beban(rows: SesiLaporan[], hariIni: string): Beban[] {
  const awal = senin(hariIni);
  const akhir = geserTanggal(awal, 6);
  const per = new Map<string, Beban>();
  const ambil = (nim: string) => {
    let b = per.get(nim);
    if (!b) {
      b = { nim, minggu: 0, sesi: 0, kelompok: 0, ganda: 0, ganti: 0 };
      per.set(nim, b);
    }
    return b;
  };
  for (const s of rows) {
    const hitung = new Map<string, number>();
    for (const p of s.pasangan) hitung.set(p.nim, (hitung.get(p.nim) ?? 0) + 1);
    for (const nim of s.ganti) if (!hitung.has(nim)) hitung.set(nim, 0);
    for (const [nim, n] of hitung) {
      const b = ambil(nim);
      b.sesi += 1;
      b.kelompok += n;
      if (n >= 2) b.ganda += 1;
      if (s.tanggal >= awal && s.tanggal <= akhir) b.minggu += 1;
    }
    for (const nim of s.ganti) ambil(nim).ganti += 1;
  }
  return [...per.values()].sort((a, b) => b.sesi - a.sesi || b.kelompok - a.kelompok);
}

/** A numeric sort key for each Sessions column. */
export const KUNCI_URUT = {
  tanggal: (s: SesiLaporan) => `${s.tanggal} ${s.mulai}`,
  modul: (s: SesiLaporan) => s.modul,
  kelas: (s: SesiLaporan) => s.kelas,
  hadir: (s: SesiLaporan) => rasio(s.hadir[0], s.hadir[1]) ?? -1,
  nilai: (s: SesiLaporan) =>
    s.status === "berjalan" ? 2 : (rasio(s.dinilai[0], s.dinilai[1]) ?? -1),
  lab: (s: SesiLaporan) => rasio(s.lab.jumlah, s.lab.n) ?? -1,
} as const;
export type KolomUrut = keyof typeof KUNCI_URUT;

export function urutkan(rows: SesiLaporan[], kolom: KolomUrut, arah: 1 | -1): SesiLaporan[] {
  const f = KUNCI_URUT[kolom] as (s: SesiLaporan) => string | number;
  return [...rows].sort((a, b) => {
    const x = f(a);
    const y = f(b);
    return (x > y ? 1 : x < y ? -1 : b.id - a.id) * arah;
  });
}

/* ------------------------------------------------- incidents and docs */

/** A line in a session's incident log (GET /api/session/kejadian). */
export interface Kejadian {
  id: number;
  sesiId: number;
  jenis: string;
  detail: Record<string, unknown>;
  aktorNim: string;
  pada: string;
}

/** System lines can't be edited; Asisten notes can. */
export function kejadianAsisten(k: Pick<Kejadian, "jenis">): boolean {
  return k.jenis === "catatan";
}

export const JENIS_DOKUMEN = ["sesi", "kerusakan", "permintaan", "lainnya"] as const;
export type JenisDokumen = (typeof JENIS_DOKUMEN)[number];
export const STATUS_DOKUMEN = ["draf", "terkirim", "diproses", "selesai"] as const;
export type StatusDokumen = (typeof STATUS_DOKUMEN)[number];

/** Text blocks and data blocks pulled from the site (frozen when added). */
export const BLOK_TEKS = ["p", "h", "list", "check", "callout", "div"] as const;
export const BLOK_DATA = [
  "sesi",
  "kelompok",
  "praktikan",
  "nilai",
  "chart",
  "kejadian",
  "foto",
  "serial",
  "slot",
  "bayar",
] as const;
export type JenisBlok = (typeof BLOK_TEKS)[number] | (typeof BLOK_DATA)[number];

export interface Blok {
  id: string;
  k: JenisBlok;
  /** Text for p, h, callout; items for list; [done, text][] for check;
   *  the frozen data for a data block. */
  v?: unknown;
}

export const BLOK_MAKS = 120;
export const JUDUL_MAKS = 160;
export const KOMENTAR_MAKS = 2000;
/** The whole document as JSON, so one report can't grow without bound. */
export const DOKUMEN_BYTE_MAKS = 400_000;

/** True when `b` looks like a block this editor writes. */
export function blokValid(b: unknown): b is Blok {
  if (!b || typeof b !== "object") return false;
  const x = b as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    x.id.length > 0 &&
    x.id.length <= 40 &&
    ([...BLOK_TEKS, ...BLOK_DATA] as readonly string[]).includes(x.k as string)
  );
}

/** Which steps a report goes through: a request to the Admin has two more. */
export function langkahDokumen(jenis: JenisDokumen): StatusDokumen[] {
  return jenis === "permintaan"
    ? ["draf", "terkirim", "diproses", "selesai"]
    : ["draf", "terkirim"];
}

/** Starter blocks for a new report of a type (the mockup's seeds, empty). */
export function blokAwal(jenis: JenisDokumen, id: () => string): Blok[] {
  if (jenis === "permintaan") return [{ id: id(), k: "p", v: "" }];
  if (jenis === "kerusakan")
    return [
      { id: id(), k: "h", v: "" },
      { id: id(), k: "p", v: "" },
      { id: id(), k: "check", v: [[false, ""]] },
    ];
  if (jenis === "sesi")
    return [
      { id: id(), k: "h", v: "" },
      { id: id(), k: "p", v: "" },
    ];
  return [{ id: id(), k: "p", v: "" }];
}
