/**
 * The bridge between the API and the live-update hub that lives in the server process (server/hub/siaran.ts).
 * The server hands its `publish` over at start; the API announces topics through `siarkanLokal` without
 * knowing the hub exists, so tests and scripts (which have no hub) simply reach nobody.
 */
export type Penyiar = (topik: readonly string[]) => number;

let aktif: Penyiar | null = null;

/** The server calls this once at start (and with null when it stops). */
export function pasangPenyiar(p: Penyiar | null): void {
  aktif = p;
}

/** Announces topics to every page connected to this server; returns how many were reached. Never throws. */
export function siarkanLokal(topik: readonly string[]): number {
  if (!aktif || !topik.length) return 0;
  try {
    return aktif(topik);
  } catch {
    return 0;
  }
}
