/**
 * An ended session at a glance (Phase 9 Stage 3, mockups c-after and
 * c-next): per group, the blanks, how many students have every score, and
 * whether the group note is written, plus the totals for the stat row.
 * Read once from the board's report and the score table.
 */
import { useEffect, useState } from "react";
import { getJson } from "../../lib/app";
import type { Laporan } from "./types";

export interface GrupRingkas {
  id: number;
  nomor: number;
  nama: string;
  asisten: string | null;
  anggota: number;
  lengkap: number;
  benar: number;
  total: number;
  catatan: boolean;
  delay: number | null;
}

export interface RingkasSesi {
  grup: GrupRingkas[];
  siswa: number;
  lengkap: number;
  benar: number;
  total: number;
  delay: number | null;
}

/** A group is unfinished while a blank is still wrong or a student is
 *  missing a score. The note alone doesn't hold a group back. */
export const belumSelesai = (g: GrupRingkas) => g.benar < g.total || g.lengkap < g.anggota;

export function useRingkasSesi(sesiId: number): RingkasSesi | null {
  const [data, setData] = useState<RingkasSesi | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      getJson<Laporan>(`/api/session/laporan?sesiId=${sesiId}`),
      getJson<{
        ok: boolean;
        kelompok: { id: number; anggota: { lengkap: boolean }[] }[];
      }>(`/api/session/nilai?sesiId=${sesiId}`),
    ])
      .then(([lap, nil]) => {
        if (!alive || !lap.ok) return;
        const nilaiBy = new Map((nil.ok ? nil.kelompok : []).map((k) => [k.id, k.anggota]));
        const grup = lap.kelompok
          .filter((g) => g.sesiAktif !== false)
          .map((g) => {
            const a = nilaiBy.get(g.id) ?? [];
            return {
              id: g.id,
              nomor: g.nomor,
              nama: g.nama,
              asisten: lap.pemilik?.[g.id] ?? null,
              anggota: Math.max(g.anggotaTotal, a.length),
              lengkap: a.filter((x) => x.lengkap).length,
              benar: g.benar,
              total: g.total,
              catatan: !!g.catatan?.trim(),
              delay: g.telemetri?.delayMedianMs ?? null,
            };
          })
          // A group nobody sits in has nothing to finish.
          .filter((g) => g.anggota > 0);
        const delays = grup.map((g) => g.delay).filter((d): d is number => d !== null);
        setData({
          grup,
          siswa: grup.reduce((s, g) => s + g.anggota, 0),
          lengkap: grup.reduce((s, g) => s + g.lengkap, 0),
          benar: grup.reduce((s, g) => s + g.benar, 0),
          total: grup.reduce((s, g) => s + g.total, 0),
          delay: delays.length
            ? Math.round(delays.reduce((s, d) => s + d, 0) / delays.length)
            : null,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sesiId]);
  return data;
}
