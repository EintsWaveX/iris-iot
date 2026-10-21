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
 * and Pencipta (the site's creator). The Pencipta and every Admin hold every
 * right and can't be reduced. An Admin can override any single right of
 * anyone else.
 *
 * A person's rights are the union of what their tier, their division and
 * their badges give (Phase 20, 2026-10-18):
 *   ASO  -> kode, tp         ADS -> hadir        ARM -> server
 *   ADC  -> profil
 *   DEV  -> jadwal, server, full, profil (the technical rights plus the
 *           Schedule and the Lab Profile)
 *   Kepala of any division -> jadwal and full pair, on top of the division
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
export const HAK = [
  "own",
  "pair",
  "jadwal",
  "server",
  "full",
  "tim",
  "kode",
  "tp",
  "hadir",
  "audit",
  "profil",
] as const;
export type HakKey = (typeof HAK)[number];
export type HakNilai = boolean | "own";

const MATRIX: Record<HakKey, Record<Tier, HakNilai>> = {
  // start and end their own slot, score their own groups, write reports
  own: { asisten: true, pengelola: true, admin: true },
  // start any slot, change a group's assistant during a session
  pair: { asisten: "own", pengelola: true, admin: true },
  // edit the Schedule, Module Access, Brief, Slides, Schematics
  jadwal: { asisten: false, pengelola: true, admin: true },
  // control the server (hotspot, services, commands); ARM below
  server: { asisten: false, pengelola: false, admin: true },
  // the full Server view: logs, updates, settings, command output,
  // registering a PC, Sumber SeeLabs
  full: { asisten: false, pengelola: false, admin: true },
  // edit the Team: people, positions, rights, payments
  tim: { asisten: false, pengelola: false, admin: true },
  // edit the journal code files and their blanks (Admins; ASO below)
  kode: { asisten: false, pengelola: false, admin: true },
  // run TP: Peserta TP, anyone's extension (2026-10-21, it was the LMS
  // right; ASO below)
  tp: { asisten: false, pengelola: false, admin: true },
  // everyone's attendance and Rp cuts, the PJ actions on every slot (ADS)
  hadir: { asisten: false, pengelola: false, admin: true },
  // the Audit tab, other people's trails and rights, the score change log
  audit: { asisten: false, pengelola: false, admin: true },
  // the Lab Profile on Home: division photos and texts, team photos,
  // events (ADC and DEV below)
  profil: { asisten: false, pengelola: false, admin: true },
};

/** The division that keeps the journal code. */
export const DIVISI_KODE: Divisi = "ASO";

/** The rights each division adds for all its members. */
const HAK_DIVISI: Partial<Record<Divisi, readonly HakKey[]>> = {
  ASO: ["kode", "tp"],
  ADS: ["hadir"],
  ADC: ["profil"],
  ARM: ["server"],
};

/** The rights the DEV badge adds. */
const HAK_DEV: readonly HakKey[] = ["jadwal", "server", "full", "profil"];

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
  /** asisten.divisi; null for the Inti. Adds the division's tools. */
  divisi?: string | null;
}

export function isPencipta(o: Pick<Orang, "badges">): boolean {
  return o.badges.includes("pencipta");
}

/** Every right, never reduced: the Pencipta and the Admin tier. */
export function hakPenuh(o: Pick<Orang, "tier" | "badges">): boolean {
  return isPencipta(o) || o.tier === "admin";
}

/**
 * Reset Sandi on the Tim page (2026-10-16): clears an Asisten's own password
 * so they sign in with the starting one again. The Tim right only, never on
 * oneself (the Akun page changes one's own), and never on the Pencipta.
 */
export function bolehResetSandi(
  adminTim: boolean,
  sendiri: boolean,
  target: Pick<Orang, "badges">,
): boolean {
  return adminTim && !sendiri && !isPencipta(target);
}

/** What the tier, division and badges give, before any override. */
export function hakDasar(o: Pick<Orang, "tier" | "badges" | "divisi">, key: HakKey): HakNilai {
  if (hakPenuh(o)) return true;
  if (isDivisi(o.divisi) && HAK_DIVISI[o.divisi]?.includes(key)) return true;
  if (o.badges.includes("dev") && HAK_DEV.includes(key)) return true;
  return MATRIX[key][o.tier];
}

/** The right after an Admin's override. Full holders can't be reduced. */
export function hakDari(o: Orang, key: HakKey): HakNilai {
  if (hakPenuh(o)) return true;
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

/** Every right as the person holds it now, for /me, the Tim page and Lihat sebagai Peran. */
export function petaHak(o: Orang): Record<HakKey, HakNilai> {
  return Object.fromEntries(HAK.map((k) => [k, hakDari(o, k)])) as Record<HakKey, HakNilai>;
}

/** Everyone's Rp cuts: ADS (hadir) and whoever runs the Team's pay (tim). */
export function lihatRpSemua(o: Orang | null): boolean {
  return !!o && (boleh(o, "hadir") || boleh(o, "tim"));
}

/** Other people's rights and trails: the audit right, or the Tim right that edits them. */
export function lihatHakOrang(o: Orang | null): boolean {
  return !!o && (boleh(o, "audit") || boleh(o, "tim"));
}

/** Where a right comes from, for Akun's Hak Saya. */
export type AsalHak = "inti" | "pencipta" | "kepala" | "divisi" | "dev" | "admin";

/**
 * Why a person holds `key` at the value `nilai`: an Admin's override (the
 * value differs from what tier, division and badges give), else the first
 * of Inti, Pencipta, the division, DEV and the Kepala position that gives
 * it. Null for a right held by everyone (own) or not held at all.
 */
export function asalHak(
  o: Pick<Orang, "tier" | "badges" | "divisi">,
  key: HakKey,
  nilai: HakNilai,
): AsalHak | null {
  if (nilai === false) return null;
  if (o.tier === "admin") return "inti";
  if (isPencipta(o)) return "pencipta";
  if (nilai !== hakDasar(o, key)) return "admin";
  if (isDivisi(o.divisi) && HAK_DIVISI[o.divisi]?.includes(key)) return "divisi";
  if (o.badges.includes("dev") && HAK_DEV.includes(key)) return "dev";
  if (o.tier === "pengelola" && MATRIX[key].pengelola !== MATRIX[key].asisten) return "kepala";
  return null;
}

/** One change to someone's rights: the right, on (true), off (false) or back to the default (null). */
export interface UbahHak {
  pada: string;
  oleh: string;
  key: HakKey;
  jadi: boolean | null;
}

/**
 * The changes to one person's rights from their Tim trail. Each `tim_ubah`
 * line that set overrides carries the whole new map, so each is compared
 * with the one before it. Newest first, like the trail.
 */
export function perubahanHak(
  jejak: readonly { pada: string; aktorNim: string; aksi: string; detail: string | null }[],
): UbahHak[] {
  const baris: UbahHak[][] = [];
  let lama: Record<string, boolean> = {};
  const urut = [...jejak].sort((a, b) => a.pada.localeCompare(b.pada));
  for (const j of urut) {
    if (j.aksi !== "tim_ubah") continue;
    let d: { hakOverride?: unknown } = {};
    try {
      d = JSON.parse(j.detail ?? "{}") as { hakOverride?: unknown };
    } catch {
      continue;
    }
    if (typeof d.hakOverride !== "object" || d.hakOverride === null) continue;
    const baru = d.hakOverride as Record<string, boolean>;
    baris.push(
      HAK.filter((key) => baru[key] !== lama[key]).map((key) => ({
        pada: j.pada,
        oleh: j.aktorNim,
        key,
        jadi: baru[key] ?? null,
      })),
    );
    lama = baru;
  }
  return baris.reverse().flat();
}

/* ------------------------------------------------- Lihat sebagai Peran */

/** The roles an Admin can preview the site as. */
export const PRESET_PERAN = [
  "anggota",
  "aso",
  "ads",
  "arm",
  "kepala",
  "kepala-arm",
  "dev",
  "admin",
] as const;
export type PresetPeran = (typeof PRESET_PERAN)[number];

export function isPresetPeran(v: unknown): v is PresetPeran {
  return typeof v === "string" && (PRESET_PERAN as readonly string[]).includes(v);
}

/** A stand-in person for a preset, with no overrides. */
export function presetOrang(p: PresetPeran): Orang {
  const susun = (tier: Tier, divisi: Divisi | null, badges: string[] = []): Orang => ({
    tier,
    divisi,
    badges,
    hakOverride: {},
  });
  switch (p) {
    case "anggota":
      return susun("asisten", "ADC");
    case "aso":
      return susun("asisten", "ASO");
    case "ads":
      return susun("asisten", "ADS");
    case "arm":
      return susun("asisten", "ARM");
    case "kepala":
      return susun("pengelola", "ADC");
    case "kepala-arm":
      return susun("pengelola", "ARM");
    case "dev":
      return susun("asisten", "ARD", ["dev"]);
    case "admin":
      return susun("admin", null);
  }
}
