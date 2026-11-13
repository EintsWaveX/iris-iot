/**
 * Module 4's board layout: how many Beacons the lab has, and which groups each one serves. With a Beacon
 * per group (the default) nothing is shared. With fewer Beacons than groups (2026-11-13: 5 Hunters and
 * 2 Beacons) a Beacon serves several groups, each in that group's own TDMA slot.
 *
 * Pure on purpose: the browser, the API and the tests all read the layout through this file.
 */

/** "selang": Beacon b serves groups g with (g - 1) % B == b - 1. "berurutan": balanced runs of groups. */
export type PolaBeacon = "selang" | "berurutan";

export interface PengaturanBeacon {
  /** How many Beacons there are; null means one per group (every group has its own) */
  jumlah: number | null;
  pola: PolaBeacon;
}

export const BEACON_BAWAAN: PengaturanBeacon = { jumlah: null, pola: "selang" };
export const BEACON_MAKS = 99;

/** The slots of one 500 ms period (Beacon sketch: TDMA_SLOTS); two served groups on one slot would collide */
export const SLOT_BEACON = 10;

/** Which Beacon (1-based) serves a group, for a lab of `jumlahGrup` groups and `jumlahBeacon` Beacons */
export type PemetaanBeacon = (grup: number, jumlahGrup: number, jumlahBeacon: number) => number;

const selang: PemetaanBeacon = (g, _G, B) => ((g - 1) % B) + 1;

/** Balanced runs: the first G % B Beacons get ceil(G / B) groups, the rest floor(G / B) */
const berurutan: PemetaanBeacon = (g, G, B) => {
  const dasar = Math.floor(G / B);
  const lebih = G % B;
  const besar = lebih * (dasar + 1); // groups held by the larger runs
  return g <= besar ? Math.ceil(g / (dasar + 1)) : lebih + Math.ceil((g - besar) / dasar);
};

export const PEMETAAN: Record<PolaBeacon, PemetaanBeacon> = { selang, berurutan };

/** Reads the stored setting; anything that is not a whole number from 1 to BEACON_MAKS falls back to the default */
export function bacaBeacon(raw: unknown): PengaturanBeacon {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const j = o.jumlah;
  const jumlah =
    typeof j === "number" && Number.isInteger(j) && j >= 1 && j <= BEACON_MAKS ? j : null;
  const pola: PolaBeacon = o.pola === "berurutan" ? "berurutan" : "selang";
  return { jumlah, pola };
}

/** Beacons in use: one per group unless the setting says fewer (never more than the groups) */
export function jumlahBeaconEfektif(p: PengaturanBeacon, jumlahGrup: number): number {
  const G = Math.max(1, Math.floor(jumlahGrup));
  return p.jumlah === null ? G : Math.min(p.jumlah, G);
}

/** The groups a group's Beacon serves, in order, always including the group itself. A group beyond the lab's count is alone. */
export function kelompokDilayani(
  grup: number,
  jumlahGrup: number,
  p: PengaturanBeacon,
  pemetaan?: PemetaanBeacon,
): number[] {
  if (!Number.isInteger(grup) || grup < 1) return [];
  if (grup > jumlahGrup) return [grup];
  const B = jumlahBeaconEfektif(p, jumlahGrup);
  const peta = pemetaan ?? PEMETAAN[p.pola];
  const milik = peta(grup, jumlahGrup, B);
  const hasil: number[] = [];
  for (let g = 1; g <= jumlahGrup; g++) if (peta(g, jumlahGrup, B) === milik) hasil.push(g);
  return hasil;
}

/** The same without the group itself: what a shared Beacon adds to the group's own file */
export function kelompokTambahan(
  grup: number,
  jumlahGrup: number,
  p: PengaturanBeacon,
  pemetaan?: PemetaanBeacon,
): number[] {
  return kelompokDilayani(grup, jumlahGrup, p, pemetaan).filter((g) => g !== grup);
}

/** Which Beacon number (1-based) serves a group; 0 for an invalid group */
export function nomorBeacon(
  grup: number,
  jumlahGrup: number,
  p: PengaturanBeacon,
  pemetaan?: PemetaanBeacon,
): number {
  if (!Number.isInteger(grup) || grup < 1) return 0;
  if (grup > jumlahGrup) return grup;
  return (pemetaan ?? PEMETAAN[p.pola])(grup, jumlahGrup, jumlahBeaconEfektif(p, jumlahGrup));
}

/** True when two of the groups would transmit in the same slot of the period */
export function slotBentrok(grups: number[]): boolean {
  const dipakai = new Set<number>();
  for (const g of grups) {
    const s = (g - 1) % SLOT_BEACON;
    if (dipakai.has(s)) return true;
    dipakai.add(s);
  }
  return false;
}
