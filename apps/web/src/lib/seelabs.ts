/**
 * SeeLabs export (Phase 9 Stage 3g, mockup c-seelabs). Browser-safe: the
 * score sheet, the API and the tests share it.
 *
 * SeeLabs (athena.ptrkr.moe) has no API: it is Laravel + Livewire, so the
 * only way in is the Asisten's own signed-in tab. IRIS gives two ways:
 * - "Salin Teks": a TSV in SeeLabs' field order, to type in by hand.
 * - "Salin untuk Bookmarklet": the `IRIS-SEELABS/1` payload below, which
 *   the "IRIS · Isi SeeLabs" bookmarklet (seelabs-helper.ts) reads in the
 *   SeeLabs tab. It fills the form and never presses Simpan Penilaian.
 *
 * SeeLabs pays one account once per session, so an Asisten holding two
 * groups sends the second through another Asisten's account (a lender who
 * isn't teaching the slot). `akunKelompok` works out whose account each
 * group goes through.
 */
import { NILAI_KOMPONEN, type NilaiKomponen } from "./nilai-komponen.js";
import type { Lang } from "./kelas.js";

/** SeeLabs' own column order on Input Nilai Praktikum. */
export const SEELABS_KOLOM = NILAI_KOMPONEN;

export const PAYLOAD_AWALAN = "IRIS-SEELABS/1 ";
export const KLP_AWALAN = "IRIS-KLP/1 ";

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

export interface PayloadSeelabs {
  v: 1;
  kelas: KelasSeelabs;
  /** Every SeeLabs KLP this group's students sit in (two or more only in
   *  a makeup session that mixes groups). Empty when none is known. */
  klp: string[];
  modul: number;
  kelompok: number;
  bahasa: Lang;
  /** One row per student: the NIM and the 8 scores in SEELABS_KOLOM order,
   *  null where IRIS has no score (the bookmarklet leaves that cell). */
  baris: { nim: string; n: (number | null)[] }[];
}

export function buatPayload(p: Omit<PayloadSeelabs, "v" | "baris"> & { baris: BarisSeelabs[] }) {
  const isi: PayloadSeelabs = {
    v: 1,
    kelas: p.kelas,
    klp: p.klp,
    modul: p.modul,
    kelompok: p.kelompok,
    bahasa: p.bahasa,
    baris: p.baris.map((b) => ({ nim: b.nim, n: SEELABS_KOLOM.map((k) => b.skor[k] ?? null) })),
  };
  return PAYLOAD_AWALAN + JSON.stringify(isi);
}

/** The payload back from text, or null when it isn't one. */
export function bacaPayload(teks: string): PayloadSeelabs | null {
  const t = teks.trim();
  if (!t.startsWith(PAYLOAD_AWALAN.trim())) return null;
  try {
    const p = JSON.parse(t.slice(PAYLOAD_AWALAN.trim().length)) as PayloadSeelabs;
    if (p.v !== 1 || !Array.isArray(p.baris)) return null;
    return p;
  } catch {
    return null;
  }
}

/** The plain text copy: a header line, then one TSV row per student. */
export function teksSeelabs(baris: BarisSeelabs[]): string {
  const kepala = ["NIM", "Nama", ...SEELABS_KOLOM].join("\t");
  const isi = baris.map((b) =>
    [b.nim, b.nama, ...SEELABS_KOLOM.map((k) => (b.skor[k] == null ? "" : String(b.skor[k])))].join(
      "\t",
    ),
  );
  return [kepala, ...isi].join("\n");
}

/** A short stable fingerprint of what was copied, so a later look can tell
 *  whether the scores changed after they were saved in SeeLabs. FNV-1a,
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

/**
 * The SeeLabs group list, from either the bookmarklet's list mode
 * (`IRIS-KLP/1 {...}`) or the Input Nilai page copied as text, where each
 * group reads "KLP", its number, then its members' NIMs and names.
 */
export function bacaDaftarKlp(teks: string): KlpSeelabs[] {
  const t = teks.trim();
  if (t.startsWith(KLP_AWALAN.trim())) {
    try {
      const p = JSON.parse(t.slice(KLP_AWALAN.trim().length)) as { kelompok?: unknown };
      if (!Array.isArray(p.kelompok)) return [];
      return p.kelompok
        .map((k) => k as { klp?: unknown; nim?: unknown })
        .filter((k) => typeof k.klp === "string" && Array.isArray(k.nim))
        .map((k) => ({
          klp: k.klp as string,
          nim: (k.nim as unknown[]).filter((n): n is string => typeof n === "string"),
        }));
    } catch {
      return [];
    }
  }
  const hasil: KlpSeelabs[] = [];
  const bagian = t.split(/\bKLP\b[\s:.]*(?=\d)/i);
  for (const b of bagian.slice(1)) {
    const m = b.match(/^(\d{1,4})/);
    if (!m) continue;
    const nim = Array.from(b.slice(m[1].length).matchAll(/\b\d{10,15}\b/g), (x) => x[0]);
    hasil.push({ klp: m[1], nim });
  }
  return hasil;
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

/* ---------------------------------------------------- whose account */

/**
 * Whose SeeLabs account each group goes through. An Asisten's lowest
 * numbered group uses their own account; every further group they hold
 * needs a lender (`pinjam`), and stays null until one is picked. A group
 * with no Asisten has no account.
 */
export function akunKelompok(
  pasangan: Map<number, string | null>,
  pinjam: Map<number, string>,
): Map<number, string | null> {
  const hasil = new Map<number, string | null>();
  const sudah = new Set<string>();
  for (const nomor of [...pasangan.keys()].sort((a, b) => a - b)) {
    const nim = pasangan.get(nomor) ?? null;
    if (!nim) hasil.set(nomor, null);
    else if (!sudah.has(nim)) {
      sudah.add(nim);
      hasil.set(nomor, nim);
    } else hasil.set(nomor, pinjam.get(nomor) ?? null);
  }
  return hasil;
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
