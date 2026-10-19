/**
 * Praktikummu rows (Phase 21, f13): each row opens its summary, and only the
 * newest practicum offers Beri Umpan Balik, while it still waits for it.
 */

interface Baris {
  sesiId: number;
  tanggal: string;
  status: string;
  sudahUmpanBalik: boolean;
}

/** The session id of the row that offers feedback, if any. */
export function umpanDi(list: Baris[]): number | null {
  const terbaru = list.reduce<Baris | null>(
    (a, b) => (a === null || b.tanggal > a.tanggal ? b : a),
    null,
  );
  return terbaru && terbaru.status === "selesai" && !terbaru.sudahUmpanBalik
    ? terbaru.sesiId
    : null;
}
