/**
 * SeeLabs types and rules (Phase 9 Stage 3g, kept by the Phase 14 robot).
 * Browser-safe: the score sheet, the API and the tests share it.
 *
 * SeeLabs (athena.ptrkr.moe) has no API: it is Laravel + Livewire. IRIS puts
 * scores in through the robot (a signed-in session on the PC), which also
 * reads back what SeeLabs holds. There is no copy-and-paste path.
 *
 * SeeLabs pays one account once per session and takes at most two sessions
 * a day from it, so an Asisten holding two groups sends the second through
 * another Asisten's account (a lender who isn't teaching the slot), and one
 * teaching a third session that day sends all of it through a lender.
 * `akunKelompok` works out whose account each group goes through.
 */
import { NILAI_KOMPONEN, type NilaiKomponen } from "./nilai-komponen.js";
import { gantiKursi, type KursiKelompok } from "./penugasan-minggu.js";

/** SeeLabs' own column order on Input Nilai Praktikum. */
export const SEELABS_KOLOM = NILAI_KOMPONEN;

/** SeeLabs' Praktikum names; the INT one ends in "INT". */
export const SEELABS_PRAKTIKUM = {
  reguler: "Pemrograman Perangkat IoT TE",
  internasional: "Pemrograma Perangkat IoT TE INT",
} as const;

export type KelasSeelabs = keyof typeof SEELABS_PRAKTIKUM;

export interface BarisSeelabs {
  nim: string;
  nama: string;
  skor: Partial<Record<NilaiKomponen, number>>;
  /** Phase 14: this student's own SeeLabs KLP, when known. */
  klp?: string | null;
}

/** A short stable fingerprint of the scores sent, so a later look can tell
 *  whether they changed after they were saved in SeeLabs. FNV-1a,
 *  not a security hash: it only has to notice edits. */
export function sidikPayload(baris: BarisSeelabs[], modul: number): string {
  const teks =
    modul +
    "|" +
    [...baris]
      .sort((a, b) => a.nim.localeCompare(b.nim))
      .map((b) => b.nim + ":" + SEELABS_KOLOM.map((k) => b.skor[k] ?? "").join(","))
      .join(";");
  let h = 0x811c9dc5;
  for (let i = 0; i < teks.length; i++) {
    h ^= teks.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/* ------------------------------------------------------------ KLP match */

export interface KlpSeelabs {
  klp: string;
  nim: string[];
}

export interface CocokKlp {
  nomor: number;
  klp: string | null;
  /** Members found in that KLP, of the group's members. */
  cocok: number;
  total: number;
}

/** Each of our groups gets the SeeLabs KLP sharing the most NIMs with it.
 *  A group sharing none keeps klp null, and the screen flags it. */
export function cocokkanKlp(
  kelompok: { nomor: number; nim: string[] }[],
  daftar: KlpSeelabs[],
): CocokKlp[] {
  return kelompok.map((g) => {
    let terbaik: { klp: string; n: number } | null = null;
    for (const d of daftar) {
      const ada = new Set(d.nim);
      const n = g.nim.filter((x) => ada.has(x)).length;
      if (n > 0 && (!terbaik || n > terbaik.n)) terbaik = { klp: d.klp, n };
    }
    return {
      nomor: g.nomor,
      klp: terbaik?.klp ?? null,
      cocok: terbaik?.n ?? 0,
      total: g.nim.length,
    };
  });
}

/** Where a group and its KLP differ (the yellow badge, 2026-10-18): the
 *  group's NIMs that KLP lacks, each with the KLP SeeLabs has it in, and the
 *  KLP's NIMs the group lacks. */
export function bedaKlp(
  nimKelompok: string[],
  klp: string,
  daftar: KlpSeelabs[],
): { hanyaIris: { nim: string; diKlp: string | null }[]; hanyaSeelabs: string[] } {
  const ini = new Set(daftar.find((d) => d.klp === klp)?.nim ?? []);
  const kami = new Set(nimKelompok);
  return {
    hanyaIris: nimKelompok
      .filter((n) => !ini.has(n))
      .map((nim) => ({ nim, diKlp: daftar.find((d) => d.nim.includes(nim))?.klp ?? null })),
    hanyaSeelabs: [...ini].filter((n) => !kami.has(n)),
  };
}

/* ---------------------------------------------------- whose account */

/** The most sessions one SeeLabs account carries in a day. */
export const AKUN_MAKS_SESI_HARI = 2;

/**
 * Whose SeeLabs account each group goes through. An Asisten's lowest
 * numbered group uses their own account; every further group they hold
 * needs a lender (`pinjam`), and stays null until one is picked. A holder in
 * `penuh` (their account already carries two sessions earlier that day)
 * needs a lender for every group, the lowest included. A group with no
 * Asisten has no account.
 */
export function akunKelompok(
  pasangan: Map<number, string | null>,
  pinjam: Map<number, string>,
  penuh: ReadonlySet<string> = new Set(),
): Map<number, string | null> {
  const hasil = new Map<number, string | null>();
  const sudah = new Set<string>();
  for (const nomor of [...pasangan.keys()].sort((a, b) => a - b)) {
    const nim = pasangan.get(nomor) ?? null;
    if (!nim) hasil.set(nomor, null);
    else if (!penuh.has(nim) && !sudah.has(nim)) {
      sudah.add(nim);
      hasil.set(nomor, nim);
    } else hasil.set(nomor, pinjam.get(nomor) ?? null);
  }
  return hasil;
}

/** Why an Asisten can't lend their account to this session. */
export type AlasanTolak = "pegang" | "dua_sesi" | "dipinjam";

export interface PemberiTolak {
  nim: string;
  alasan: AlasanTolak;
  /** For "dipinjam": the group of this session the account is already lent to. */
  kelompok?: number;
}

/**
 * Splits the active Asisten into who can lend and who can't (with the
 * reason): holding a group here, two other sessions that day, or already
 * lent to another group of this session. The first reason that applies wins.
 */
export function pilahPemberi(p: {
  aktif: string[];
  pegang: ReadonlySet<string>;
  /** Sessions each account carries on the other sessions that day. */
  sesiLain: ReadonlyMap<string, number>;
  /** Account → the group of this session it is already lent to. */
  dipinjam: ReadonlyMap<string, number>;
}): { pemberi: string[]; tolak: PemberiTolak[] } {
  const pemberi: string[] = [];
  const tolak: PemberiTolak[] = [];
  for (const nim of p.aktif) {
    if (p.pegang.has(nim)) tolak.push({ nim, alasan: "pegang" });
    else if ((p.sesiLain.get(nim) ?? 0) >= AKUN_MAKS_SESI_HARI)
      tolak.push({ nim, alasan: "dua_sesi" });
    else if (p.dipinjam.has(nim))
      tolak.push({ nim, alasan: "dipinjam", kelompok: p.dipinjam.get(nim) });
    else pemberi.push(nim);
  }
  return { pemberi, tolak };
}

/**
 * The lender to suggest first for each group a Substitute or Volunteer holds
 * on a seat that belongs to someone (user, 2026-10-22): the Asisten they
 * replace. Own seats, open seats and codes that match no NIM suggest nobody;
 * the Asisten may still pick anyone who can lend.
 */
export function saranPinjam(
  kursi: readonly KursiKelompok[],
  kodeKeNim: ReadonlyMap<string, string>,
): Map<number, string> {
  const hasil = new Map<number, string>();
  for (const k of kursi) {
    const untuk = gantiKursi(k)?.untuk;
    const nim = untuk ? kodeKeNim.get(untuk.trim().toUpperCase()) : undefined;
    if (nim) hasil.set(k.nomor, nim);
  }
  return hasil;
}

/** A group marked as put into SeeLabs by hand ("Sudah Kuinput Sendiri"). */
export interface TandaManual {
  /** The lender's account it went through; null when the scorer's own. */
  akun: string | null;
  pada: Date | null;
}

/**
 * Reads a session's akun_seelabs events, oldest first: the latest lender
 * picked for each group (a cleared pick, null, removes it) and the groups
 * marked as input by hand in SeeLabs (the latest event with `manual` set
 * decides; one without it, a plain lender pick, leaves the mark alone).
 */
export function bacaKejadianAkun(kejadian: readonly { detail: unknown; pada?: Date | null }[]): {
  pinjam: Map<number, string>;
  manual: Map<number, TandaManual>;
} {
  const pinjam = new Map<number, string>();
  const manual = new Map<number, TandaManual>();
  for (const k of kejadian) {
    const d = k.detail as { nomor?: number; akun?: string | null; manual?: boolean };
    if (typeof d.nomor !== "number") continue;
    if (d.akun) pinjam.set(d.nomor, d.akun);
    else pinjam.delete(d.nomor);
    if (d.manual === true) manual.set(d.nomor, { akun: d.akun || null, pada: k.pada ?? null });
    else if (d.manual === false) manual.delete(d.nomor);
  }
  return { pinjam, manual };
}

export type StatusSeelabs = "terkirim" | "berubah" | "siap" | "butuh_akun" | "kosong";

/** One group in GET /api/session/seelabs. */
export interface KelompokSeelabs {
  nomor: number;
  klp: string[];
  penilai: string | null;
  akun: string | null;
  /** True when the account is a lender's, not the scorer's own. */
  pinjam: boolean;
  /** Marked as input by hand in SeeLabs, not yet seen there by a read-back. */
  manual: { pada: string | null; akun: string | null } | null;
  status: StatusSeelabs;
  disalinPada: string | null;
  disimpanPada: string | null;
  baris: BarisSeelabs[];
}

export interface SesiSeelabs {
  sesi: {
    id: number;
    tanggal: string;
    mulai: string;
    slot: number | null;
    modul: number;
    kelas: KelasSeelabs;
    jenis: string;
    status: string;
  };
  kelompok: KelompokSeelabs[];
  /** SeeLabs usernames of the Asisten involved (never a password). */
  namaAkun: Record<string, string | null>;
  /** Holders whose account already carries two earlier sessions today. */
  penuh: string[];
}

/**
 * Where a group stands: Terkirim once marked saved with the scores
 * unchanged since, Berubah when they changed after that, Siap when it can
 * be copied, Butuh Akun when it waits for a lender, Kosong with no scores.
 */
export function statusSeelabs(p: {
  akun: string | null;
  adaNilai: boolean;
  sidikSekarang: string;
  disimpan: { sidik: string } | null;
}): StatusSeelabs {
  if (p.disimpan) return p.disimpan.sidik === p.sidikSekarang ? "terkirim" : "berubah";
  if (!p.adaNilai) return "kosong";
  return p.akun ? "siap" : "butuh_akun";
}
