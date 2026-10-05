/**
 * Roles and rights (Phase 9 Stage 2). Browser-safe: the API guards and the
 * Tim page read the same matrix.
 *
 * The tier follows the position (jabatan) in the handbook:
 *   Inti (Koordinator, Wakil, Sekretaris, Bendahara) -> admin
 *   Kepala Divisi (one per division)                 -> pengelola
 *   Anggota of a division                            -> asisten
 * Each of the ten head roles has exactly one holder at a time
 * (jabatan_pemegang); whoever holds it first keeps it until a handover
 * (serah_terima) is accepted.
 *
 * Badges are not roles: DEV (the ASO and ARM divisions, who built the site)
 * adds the full Server view; Pencipta (the site's creator) holds every right
 * and can't be reduced. An Admin can override any single right per person.
 *
 * `kode` (the journal code files and their blanks, 2026-10-05) follows the
 * division instead of the tier: the ASO division and every Admin.
 */

export const DIVISI = ["ASO", "ARD", "ADS", "ADC", "AER", "ARM"] as const;
export type Divisi = (typeof DIVISI)[number];

export const TIER = ["admin", "pengelola", "asisten"] as const;
export type Tier = (typeof TIER)[number];

export const STATUS_ORANG = ["aktif", "cuti", "nonaktif", "alumni"] as const;
export type StatusOrang = (typeof STATUS_ORANG)[number];

export const INTI = ["ketua", "wakil", "sekretaris", "bendahara"] as const;
export type Inti = (typeof INTI)[number];

/** The ten head roles: the four Inti and one Kepala per division. */
export const KATEGORI = [...INTI, ...DIVISI.map((d) => `kepala-${d}` as const)] as const;
export type Kategori = (typeof KATEGORI)[number];

export const BADGE = ["dev", "pencipta"] as const;
export type Badge = (typeof BADGE)[number];

/** Divisions whose members get the DEV badge. */
export const DIVISI_DEV: readonly Divisi[] = ["ASO", "ARM"];

/** The rights each tier starts with. "own" means: only their own slot. */
export const HAK = ["own", "pair", "jadwal", "server", "full", "tim", "kode"] as const;
export type HakKey = (typeof HAK)[number];
export type HakNilai = boolean | "own";

const MATRIX: Record<HakKey, Record<Tier, HakNilai>> = {
  // start and end their own slot, score their own groups, write reports
  own: { asisten: true, pengelola: true, admin: true },
  // start any slot, change a group's assistant during a session
  pair: { asisten: "own", pengelola: true, admin: true },
  // edit the Schedule, Module Access, Brief, Slides, Schematics
  jadwal: { asisten: false, pengelola: true, admin: true },
  // control the server (hotspot, services, commands)
  server: { asisten: false, pengelola: true, admin: true },
  // the full Server view: logs, updates, settings, registering a Pi
  full: { asisten: false, pengelola: false, admin: true },
  // edit the Team: people, positions, rights, payments
  tim: { asisten: false, pengelola: false, admin: true },
  // edit the journal code files and their blanks (Admins; ASO below)
  kode: { asisten: false, pengelola: false, admin: true },
};

/** The division that keeps the journal code. */
export const DIVISI_KODE: Divisi = "ASO";

export function isKategori(v: unknown): v is Kategori {
  return typeof v === "string" && (KATEGORI as readonly string[]).includes(v);
}

export function isDivisi(v: unknown): v is Divisi {
  return typeof v === "string" && (DIVISI as readonly string[]).includes(v);
}

/** The tier a position gives; null (no head role) means a division member. */
export function tierUntuk(kategori: Kategori | null): Tier {
  if (!kategori) return "asisten";
  return (INTI as readonly string[]).includes(kategori) ? "admin" : "pengelola";
}

/** The division a Kepala role belongs to ("kepala-ASO" -> "ASO"). */
export function divisiKepala(kategori: Kategori): Divisi | null {
  return kategori.startsWith("kepala-") ? (kategori.slice(7) as Divisi) : null;
}

export interface Orang {
  tier: Tier;
  badges: readonly string[];
  hakOverride: Readonly<Partial<Record<string, boolean>>>;
  /** asisten.divisi; null for the Inti. Only `kode` reads it. */
  divisi?: string | null;
}

export function isPencipta(o: Pick<Orang, "badges">): boolean {
  return o.badges.includes("pencipta");
}

/** What the tier and badges give, before any override. */
export function hakDasar(o: Pick<Orang, "tier" | "badges" | "divisi">, key: HakKey): HakNilai {
  if (isPencipta(o)) return true;
  if (key === "full" && o.badges.includes("dev")) return true;
  if (key === "kode" && o.divisi === DIVISI_KODE) return true;
  return MATRIX[key][o.tier];
}

/** The right after an Admin's override. The Pencipta can't be reduced. */
export function hakDari(o: Orang, key: HakKey): HakNilai {
  if (isPencipta(o)) return true;
  const over = o.hakOverride[key];
  return over === undefined ? hakDasar(o, key) : over;
}

/** True when the person has the right at all (own-slot-only counts). */
export function boleh(o: Orang, key: HakKey): boolean {
  return hakDari(o, key) !== false;
}

/** True only for the full right, not own-slot-only. */
export function bolehPenuh(o: Orang, key: HakKey): boolean {
  return hakDari(o, key) === true;
}
