/**
 * Who may do what in recruitment, PRD section 4 as a table. Pure: the API
 * checks it in api/_lib/recruitment-rights.ts and the pages only hide what
 * the API already refuses.
 *
 * A person's rights come from their seat on the live edition's committee
 * (rec_committee), not from the lab divisions. hakPenuh holders (the
 * Pencipta and the Admin tier) keep everything, seated or not. A Koordinator
 * has exactly their division's rights (the star is a badge).
 * Overrides of other rights (hak_override) never widen recruitment.
 *
 * The table below is only the default (2026-11-09). The Ketua and the
 * Pencipta can change it from the Panitia tab (HakConfig): a switch that
 * opens every right to every active Asisten, and a matrix of which role
 * holds which right, "no seat" included. It is saved in `pengaturan`
 * (api/_lib/recruitment-hak.ts) and never reduces hakPenuh.
 */
import { hakPenuh, isPencipta, type Orang } from "../hak.js";
import { RIGHTS_KEYS, type CommitteeDivision, type RecRights } from "./types.js";

export interface Kursi {
  division: CommitteeDivision;
  isKoor: boolean;
}

export interface Pelaku {
  orang: Pick<Orang, "tier" | "badges">;
  kursi: Kursi | null;
}

export function pelakuDari(orang: Pick<Orang, "tier" | "badges">, kursi: Kursi | null): Pelaku {
  return { orang, kursi };
}

const SEMUA: readonly CommitteeDivision[] = [
  "ketua",
  "wakil",
  "acara",
  "akademik",
  "logistik",
  "admin",
  "pdd",
];

/** A column of the matrix: a committee division, or an Asisten with no seat. */
export type Peran = CommitteeDivision | "tanpa";
export const PERAN: readonly Peran[] = [...SEMUA, "tanpa"];

/**
 * The seats that run the edition (5 Nov 2026): the Ketua, and the Akademik
 * and Admin seats with the same control rules (lock, unlock and roll back a
 * stage, Penerimaan, hide Oprec, calendar, kit loans, seat the committee).
 */
export const KURSI_KENDALI: readonly CommitteeDivision[] = ["ketua", "akademik", "admin"];

/** Each right and the committee divisions that hold it by default (PRD 4). */
const TABEL: Record<keyof RecRights, readonly CommitteeDivision[]> = {
  calendar: [...KURSI_KENDALI, "acara"],
  board: KURSI_KENDALI,
  // Only hakPenuh seats the Ketua, unless the matrix says otherwise.
  seatKetua: [],
  candidates: SEMUA,
  documents: ["ketua", "admin"],
  approve: ["ketua", "admin"],
  bank: ["ketua", "akademik"],
  plotting: ["ketua", "akademik", "admin"],
  plotPengawas: ["ketua", "akademik"],
  cuttingPropose: ["ketua", "acara", "akademik", "admin", "logistik", "pdd"],
  cuttingLock: KURSI_KENDALI,
  attendance: ["ketua", "acara", "admin"],
  kitLoans: [...KURSI_KENDALI, "logistik"],
  accept: KURSI_KENDALI,
};

/**
 * What the Ketua and the Pencipta can change. `semua` opens every right to
 * every active Asisten, seated or not (the matrix is kept but ignored while
 * it is on); `peran` lists, for each right, the roles that hold it.
 */
export interface HakConfig {
  semua: boolean;
  peran: Record<keyof RecRights, Peran[]>;
}

export const HAK_BAWAAN: HakConfig = {
  semua: false,
  peran: Object.fromEntries(RIGHTS_KEYS.map((k) => [k, [...TABEL[k]]])) as HakConfig["peran"],
};

const adaPeran = (v: unknown): v is Peran => (PERAN as readonly unknown[]).includes(v);

/**
 * Reads a saved config forgivingly: anything that is not an object gives the
 * default, and a right that is missing or malformed keeps its default, so a
 * right added later never opens or closes by accident.
 */
export function bacaHakConfig(v: unknown): HakConfig {
  if (!v || typeof v !== "object" || Array.isArray(v)) return HAK_BAWAAN;
  const o = v as { semua?: unknown; peran?: unknown };
  const peran = (o.peran && typeof o.peran === "object" ? o.peran : {}) as Record<string, unknown>;
  const out = {} as HakConfig["peran"];
  for (const k of RIGHTS_KEYS) {
    const daftar = peran[k];
    out[k] = Array.isArray(daftar)
      ? [...new Set(daftar.filter(adaPeran))]
      : [...HAK_BAWAAN.peran[k]];
  }
  return { semua: o.semua === true, peran: out };
}

/** Checks a config someone is saving, strictly: every right, valid roles only. Null when it is not one. */
export function cekHakConfig(v: unknown): HakConfig | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as { semua?: unknown; peran?: unknown };
  if (typeof o.semua !== "boolean") return null;
  if (!o.peran || typeof o.peran !== "object" || Array.isArray(o.peran)) return null;
  const peran = o.peran as Record<string, unknown>;
  const out = {} as HakConfig["peran"];
  for (const k of RIGHTS_KEYS) {
    const daftar = peran[k];
    if (!Array.isArray(daftar) || !daftar.every(adaPeran)) return null;
    out[k] = [...new Set(daftar)];
  }
  return { semua: o.semua, peran: out };
}

export function hakRekrutmen(p: Pelaku, config: HakConfig = HAK_BAWAAN): RecRights {
  const penuh = hakPenuh(p.orang) || config.semua;
  const peran: Peran = p.kursi ? p.kursi.division : "tanpa";
  const out = {} as RecRights;
  for (const k of RIGHTS_KEYS) {
    out[k] = penuh || config.peran[k].includes(peran);
  }
  return out;
}

/** Whether anyone at all holds a right (a seat, or hakPenuh). */
export function adaHak(p: Pelaku): boolean {
  return hakPenuh(p.orang) || p.kursi !== null;
}

/**
 * Who may change the config: the Ketua seat and the Pencipta, nobody else
 * (user, 2026-11-09). Not the Admin tier, and not through the switch itself.
 */
export function bolehAturHak(
  orang: Pick<Orang, "badges">,
  kursi: { division: CommitteeDivision } | null,
): boolean {
  return isPencipta(orang) || kursi?.division === "ketua";
}

/**
 * Who may sit on the committee and use its rights: an Asisten still with
 * the lab. On leave counts like active (user, 2026-10-23: MCU stays seated);
 * the same set the Ketua picks from.
 */
export const bolehDuduk = (status: string | null | undefined): boolean =>
  status === "aktif" || status === "cuti";

/**
 * Who may press Jadi Master on a test evening: any active Asisten, the
 * Pencipta included (user, 2026-11-06: PRD 7.8 used to exclude the Pencipta,
 * which hid real-room bugs from the one person testing them). Whether they
 * were plotted as pengawas that evening is the exam engine's check.
 */
export function bolehJadiMaster(o: Pick<Orang, "badges"> & { status?: string }): boolean {
  return o.status === undefined || o.status === "aktif";
}
