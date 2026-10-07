/** GET /api/session/bayar, shared by Tim › Pembayaran, the Account page and
 *  the Console home (Phase 9 Stage 6). */
import { useCallback, useEffect, useState } from "react";
import { getJson, postJson } from "../../lib/app";
import type { Kelas, TarifUnit } from "../../lib/bayar";
import { useSiaran } from "../../lib/siaran";

export interface UnitRow {
  id: number;
  sesiId: number;
  kelompokNomor: number;
  tanggal: string;
  nimPenilai: string;
  nimAkunSeelabs: string | null;
  kelas: Kelas;
  kotor: number;
  kasPersen: number;
  kas: number;
  bersih: number;
  modul: number;
  slot: number | null;
}

export interface TransferRow {
  id: number;
  periode: string;
  jenis: "kotor" | "balik";
  nim: string;
  jumlah: number;
  pada: string;
  oleh: string;
}

export interface SisaRow {
  periode: string;
  jenis: "kotor" | "balik";
  nim: string;
  jumlah: number;
  total: number;
}

export interface BayarData {
  semester: string;
  admin: boolean;
  bendahara: string | null;
  tarifUnit: TarifUnit;
  kas: {
    persen: number;
    persenSaya: number;
    riwayat: {
      id: number;
      persen: number;
      berlakuMulai: string;
      oleh: string | null;
      alasan: string | null;
    }[];
    pengecualian: { nim: string; persen: number; alasan: string | null }[];
  };
  units: UnitRow[];
  transfer: TransferRow[];
  sisa: SisaRow[];
}

export function useBayar(enabled = true) {
  const [data, setData] = useState<BayarData | null>(null);
  const [fail, setFail] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await getJson<{ ok: boolean } & BayarData>("/api/session/bayar");
      if (!d.ok) throw new Error("bayar");
      setData(d);
      setFail(false);
    } catch {
      setFail(true);
    }
  }, []);
  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);
  // Pay follows ended sessions, covers and rates (2026-10-07: it loaded once).
  useSiaran(["bayar", "jadwal", "laporan", "tim"], () => void load(), enabled);
  return { data, fail, load };
}

export async function kirimBayar(body: Record<string, unknown>) {
  return postJson<{ ok: boolean; kode?: string; id?: number }>("/api/session/bayar", body).catch(
    () => ({ ok: false, kode: undefined }) as { ok: boolean; kode?: string; id?: number },
  );
}

/** The month today, in Jakarta time. */
export function periodeKini(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
}
