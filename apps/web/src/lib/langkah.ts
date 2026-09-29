/**
 * Phase 8: the praktikan dashboard's "Langkah berikutnya" (next step). One
 * pure decision so the dashboard, the landing page's Continue card and the
 * mini-bar all agree on where "Continue" goes.
 */
export type Langkah =
  | { jenis: "tunggu" } // no session, or its module is not open yet
  | { jenis: "persiapan"; modul: number }
  | { jenis: "kode"; modul: number; sisa: number }
  | { jenis: "live"; modul: number }
  | { jenis: "umpan_balik"; modul: number }
  | { jenis: "selesai"; modul: number };

export interface KeadaanPraktikan {
  sesi: { modul: number; selesai: boolean } | null;
  terbuka: readonly number[];
  progres: Readonly<Record<number, { benar: number; total: number }>>;
  persiapanSelesai: boolean;
  sudahUmpanBalik: boolean;
}

export function langkahBerikutnya(k: KeadaanPraktikan): Langkah {
  if (!k.sesi) return { jenis: "tunggu" };
  const modul = k.sesi.modul;
  if (k.sesi.selesai) {
    return k.sudahUmpanBalik ? { jenis: "selesai", modul } : { jenis: "umpan_balik", modul };
  }
  if (!k.terbuka.includes(modul)) return { jenis: "tunggu" };
  if (!k.persiapanSelesai) return { jenis: "persiapan", modul };
  const p = k.progres[modul];
  if (p && p.benar < p.total) return { jenis: "kode", modul, sisa: p.total - p.benar };
  return { jenis: "live", modul };
}
