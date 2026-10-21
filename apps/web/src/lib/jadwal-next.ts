/**
 * Phase 8: an assistant's next scheduled slot, for the landing page's
 * "Sesi berikutnya" card. Pure, so it is tested without a clock.
 *
 * `hari` follows hariDariTanggal (0 = Minggu, 1 = Senin ... 6 = Sabtu). A
 * slot counts as upcoming until its session would have ended (start plus
 * the session cap), so a slot running right now is still "next".
 *
 * With `minggu` (the schedule's seats on each slot's next date, keyed by
 * the slot's id), a slot I cover or help that date counts too, and one
 * whose every seat of mine is handed over or excused doesn't (user,
 * 2026-10-21).
 */
import { SESI_CAP_MENIT, SLOT_MULAI } from "./jadwal";
import type { Kelas } from "./kelas";
import { kursiSaya, orangTanggal, type KursiSaya, type MingguSlot } from "./penugasan-minggu";

export interface BarisJadwal {
  id?: number;
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
  /** 1-based group numbers this assistant holds (by default, or that date). */
  kelompok: number[];
  /** Each group's seat that date, aligned with kelompok (with `minggu`). */
  kursi?: KursiSaya[];
  /** There only as a cover or helper, not on the slot's semester list. */
  ganti?: boolean;
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
  minggu?: Readonly<Record<string, MingguSlot>>,
): SlotBerikutnya | null {
  const k = kode.trim().toUpperCase();
  if (!k) return null;
  const mOf = (j: BarisJadwal) => (j.id != null ? minggu?.[String(j.id)] : undefined);
  const tetapDi = (j: BarisJadwal) => j.asisten.some((a) => a.toUpperCase() === k);
  const milik = jadwal.filter((j) => {
    if (j.status !== "aktif") return false;
    const m = mOf(j);
    // That date's seats: I teach it (my own seat, a cover, or helping).
    if (m) return orangTanggal(m.kursi, m.tugas).has(k);
    return tetapDi(j);
  });
  for (let lagi = 0; lagi < 7; lagi++) {
    const hari = (hariIni + lagi) % 7;
    const hariItu = milik
      .filter((j) => j.hari === hari)
      .filter((j) => lagi > 0 || menitSekarang < mulaiMenit(j.slot) + SESI_CAP_MENIT)
      .sort((a, b) => a.slot - b.slot);
    const j = hariItu[0];
    if (j) {
      const m = mOf(j);
      const kursi = m ? kursiSaya(m.kursi, k).filter((x) => !x.lepas) : undefined;
      return {
        hari,
        slot: j.slot,
        kelas: j.kelas,
        kelompok: kursi
          ? kursi.map((x) => x.nomor)
          : j.asisten.map((a, i) => (a.toUpperCase() === k ? i + 1 : 0)).filter((n) => n > 0),
        ...(kursi ? { kursi, ganti: !tetapDi(j) } : {}),
        hariLagi: lagi,
        sedangBerjalan: lagi === 0 && menitSekarang >= mulaiMenit(j.slot),
      };
    }
  }
  return null;
}
