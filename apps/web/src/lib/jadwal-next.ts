/**
 * Phase 8: an assistant's next scheduled slot, for the landing page's
 * "Sesi berikutnya" card. Pure, so it is tested without a clock.
 *
 * `hari` follows hariDariTanggal (0 = Minggu, 1 = Senin ... 6 = Sabtu). A
 * slot counts as upcoming until its session would have ended (start plus
 * the session cap), so a slot running right now is still "next".
 */
import { SESI_CAP_MENIT, SLOT_MULAI } from "./jadwal";
import type { Kelas } from "./kelas";

export interface BarisJadwal {
  hari: number;
  slot: number;
  kelas: Kelas;
  status: "aktif" | "segera";
  asisten: string[];
}

export interface SlotBerikutnya {
  hari: number;
  slot: number;
  kelas: Kelas;
  /** 1-based group numbers this assistant holds by default. */
  kelompok: number[];
  /** 0 = today, 1 = tomorrow, and so on. */
  hariLagi: number;
  sedangBerjalan: boolean;
}

function mulaiMenit(slot: number): number {
  const [h, m] = (SLOT_MULAI[slot] ?? "00:00").split(":").map(Number);
  return h * 60 + m;
}

export function slotBerikutnya(
  jadwal: readonly BarisJadwal[],
  kode: string,
  hariIni: number,
  menitSekarang: number,
): SlotBerikutnya | null {
  const k = kode.trim().toUpperCase();
  if (!k) return null;
  const milik = jadwal.filter(
    (j) => j.status === "aktif" && j.asisten.some((a) => a.toUpperCase() === k),
  );
  for (let lagi = 0; lagi < 7; lagi++) {
    const hari = (hariIni + lagi) % 7;
    const hariItu = milik
      .filter((j) => j.hari === hari)
      .filter((j) => lagi > 0 || menitSekarang < mulaiMenit(j.slot) + SESI_CAP_MENIT)
      .sort((a, b) => a.slot - b.slot);
    const j = hariItu[0];
    if (j) {
      return {
        hari,
        slot: j.slot,
        kelas: j.kelas,
        kelompok: j.asisten.map((a, i) => (a.toUpperCase() === k ? i + 1 : 0)).filter((n) => n > 0),
        hariLagi: lagi,
        sedangBerjalan: lagi === 0 && menitSekarang >= mulaiMenit(j.slot),
      };
    }
  }
  return null;
}
