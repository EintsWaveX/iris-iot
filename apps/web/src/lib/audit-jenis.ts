/**
 * Reports › Audit (Phase 9 Stage 6b): which audit actions belong to each
 * filter tab. The API filters on these lists, so a tab pages through its
 * own lines instead of a slice of everything. Browser-safe.
 */
export const JENIS_AUDIT = ["pair", "seelabs", "tim", "konsol", "hak", "galat"] as const;
export type JenisAudit = (typeof JENIS_AUDIT)[number];

export const AKSI_PER_JENIS: Record<JenisAudit, readonly string[]> = {
  pair: ["penugasan_ubah", "penugasan_ambil_alih"],
  seelabs: [
    "seelabs_akun",
    "seelabs_simpan",
    "seelabs_belum",
    "seelabs_hubung",
    "seelabs_putus",
    "seelabs_robot",
    "seelabs_kunci",
    "seelabs_tugas",
    "transfer_tandai",
    "transfer_batal",
    "tarif_unit",
    "kas_tarif",
    "kas_pengecualian",
    "kas_pengecualian_hapus",
  ],
  tim: [
    "tim_tambah",
    "tim_ubah",
    "tim_serah_terima",
    "penugasan_bantu",
    "penugasan_minta",
    "penugasan_jawab",
    "penugasan_konfirmasi",
    "penugasan_batal",
    "izin_umumkan",
  ],
  konsol: [
    "konsol_minta",
    "konsol_paksa",
    "konsol_setujui",
    "konsol_tolak",
    "konsol_batal",
    "konsol_buka",
    "konsol_akhiri",
    "konsol_putus",
    "konsol_selesai",
    "konsol_oke",
    "konsol_tanya",
    "konsol_gabung",
    "konsol_minta_gabung",
    "konsol_gabung_setujui",
    "konsol_gabung_tolak",
    "konsol_kendali",
  ],
  // tim_ubah lines that change rights are picked out by their detail.
  hak: ["tim_ubah"],
  // Errors the site saved itself (api/_lib/galat.ts), 2026-10-05.
  galat: ["galat_server", "galat_klien"],
};

export function isJenisAudit(v: unknown): v is JenisAudit {
  return typeof v === "string" && (JENIS_AUDIT as readonly string[]).includes(v);
}

/** The tab a line belongs to; "lain" when none. */
export function jenisAudit(aksi: string, detail: Record<string, unknown>): JenisAudit | "lain" {
  if (aksi === "tim_ubah" && "hakOverride" in detail) return "hak";
  for (const j of JENIS_AUDIT) if (j !== "hak" && AKSI_PER_JENIS[j].includes(aksi)) return j;
  return "lain";
}
