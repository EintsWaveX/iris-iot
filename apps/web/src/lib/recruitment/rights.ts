/**
 * Who may do what in recruitment, PRD section 4 as a table. Pure: the API
 * checks it in api/_lib/recruitment-rights.ts and the pages only hide what
 * the API already refuses.
 *
 * A person's rights come from their seat on the live edition's committee
 * (rec_committee), not from the lab divisions. hakPenuh holders (the
 * Pencipta and the Admin tier) keep everything, seated or not, and are the
 * only ones who seat the Ketua. An Asisten with no seat has none; a
 * Koordinator has exactly their division's rights (the star is a badge).
 * Overrides of other rights (hak_override) never widen recruitment.
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

/** Each right and the committee divisions that hold it (PRD 4). */
const TABEL: Record<keyof RecRights, readonly CommitteeDivision[]> = {
  calendar: ["ketua", "acara"],
  board: ["ketua"],
  // Only hakPenuh seats the Ketua.
  seatKetua: [],
  candidates: SEMUA,
  documents: ["ketua", "admin"],
  approve: ["ketua", "admin"],
  bank: ["ketua", "akademik"],
  plotting: ["ketua", "akademik", "admin"],
  plotPengawas: ["ketua", "akademik"],
  cuttingPropose: ["ketua", "acara", "akademik", "admin", "logistik", "pdd"],
  cuttingLock: ["ketua"],
  attendance: ["ketua", "acara", "admin"],
  kitLoans: ["ketua", "logistik"],
  accept: ["ketua"],
};

export function hakRekrutmen(p: Pelaku): RecRights {
  const penuh = hakPenuh(p.orang);
  const out = {} as RecRights;
  for (const k of RIGHTS_KEYS) {
    out[k] = penuh || (!!p.kursi && TABEL[k].includes(p.kursi.division));
  }
  return out;
}

/** Whether anyone at all holds a right (a seat, or hakPenuh). */
export function adaHak(p: Pelaku): boolean {
  return hakPenuh(p.orang) || p.kursi !== null;
}

/**
 * Who may sit on the committee and use its rights: an Asisten still with
 * the lab. On leave counts like active (user, 2026-10-23: MCU stays seated);
 * the same set the Ketua picks from.
 */
export const bolehDuduk = (status: string | null | undefined): boolean =>
  status === "aktif" || status === "cuti";

/**
 * Who may press Jadi Master on a test evening: an active Asisten who is
 * not the Pencipta (PRD 7.8). Whether they were plotted as pengawas that
 * evening is the exam engine's check.
 */
export function bolehJadiMaster(o: Pick<Orang, "badges"> & { status?: string }): boolean {
  return !isPencipta(o) && (o.status === undefined || o.status === "aktif");
}
