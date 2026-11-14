/**
 * The four answer tiles. Each has a shape as well as a colour, so a colour
 * blind player (or a dim projector) can still tell them apart, and its own
 * text colour, fixed for both themes: a tile is a solid block either way.
 * The pairs are checked for 4.5:1 contrast in __tests__/kuis-warna.test.ts.
 */
export interface WarnaPilihan {
  /** Tile background. */
  bg: string;
  /** Text and shape on the tile. */
  ink: string;
  bentuk: "segitiga" | "belah-ketupat" | "lingkaran" | "kotak";
  nama: { id: string; en: string };
}

export const WARNA_PILIHAN: readonly WarnaPilihan[] = [
  { bg: "#c92a3a", ink: "#ffffff", bentuk: "segitiga", nama: { id: "Merah", en: "Red" } },
  { bg: "#1a6fd1", ink: "#ffffff", bentuk: "belah-ketupat", nama: { id: "Biru", en: "Blue" } },
  { bg: "#f5b544", ink: "#1b1300", bentuk: "lingkaran", nama: { id: "Emas", en: "Gold" } },
  { bg: "#5eead4", ink: "#04201b", bentuk: "kotak", nama: { id: "Hijau Tosca", en: "Teal" } },
];

/** A Benar/Salah question uses blue and red, the way the answer reads. */
export const WARNA_BENAR_SALAH: readonly WarnaPilihan[] = [WARNA_PILIHAN[1], WARNA_PILIHAN[0]];

export function warnaUntuk(jumlahPilihan: number, i: number): WarnaPilihan {
  return (jumlahPilihan === 2 ? WARNA_BENAR_SALAH : WARNA_PILIHAN)[i] ?? WARNA_PILIHAN[0];
}
