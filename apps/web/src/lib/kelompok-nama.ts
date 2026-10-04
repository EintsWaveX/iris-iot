/** Group star names, shared by the client (lib/app.ts re-exports them) and
 *  the server (sesi.ts's jadwalModul4Hari, so the hunt shows them too). */

export const KELOMPOK_NAMA: Record<number, string> = {
  1: "Vela",
  2: "Lyra",
  3: "Cygnus",
  4: "Orion",
  5: "Carina",
  // Phase 9: up to ten groups a session.
  6: "Draco",
  7: "Pyxis",
  8: "Lepus",
  9: "Corvus",
  10: "Ara",
};

/** A group's display name: the name typed in the roster when it is a real
 *  one, else the group's star name. A roster line with no label saves as
 *  "Kelompok N", which counts as no name. */
export function namaKelompok(nomor: number, nama?: string | null): string {
  const n = (nama ?? "").trim();
  if (n && n.toLowerCase() !== `kelompok ${nomor}` && n.toLowerCase() !== `group ${nomor}`)
    return n;
  return KELOMPOK_NAMA[nomor] ?? `Kelompok ${nomor}`;
}
