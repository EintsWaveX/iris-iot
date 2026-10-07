/**
 * When a Praktikan's own practicum next opens (2026-10-07, user): signing in
 * to someone else's running session is refused, right code or wrong, and
 * says when theirs opens. That is their weekly slot's next meeting (a
 * holiday or No Practicum week skipped) at its start minus the slot's start
 * window (the general default, 15 minutes, unless the slot sets its own),
 * the same moment an Asisten may start it (api/session/index.ts). Nothing is
 * stored: every try asks the schedule again, so the gate lifts by itself.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./db.js";
import { jadwal, pengaturan, rosterSlot } from "./schema.js";
import { hariDariTanggal, semesterDariTanggal } from "./jadwal-parser.js";
import { hariIniWib, slotToMulai, SESI_CAP_MENIT } from "./jadwal.js";
import { jendelaValid } from "./sesi-mulai.js";
import { statusSlotTanggal } from "./penugasan-minggu.js";

export interface SesiBerikutnya {
  /** ISO date of the meeting, YYYY-MM-DD (WIB). */
  tanggal: string;
  /** When sign-in opens, HH:MM WIB (the slot's start minus its window). */
  buka: string;
  /** The same moment as an instant, for countdowns. */
  bukaPada: string;
  slot: number;
}

const menit = (jam: string) => {
  const [h, m] = jam.split(":").map(Number);
  return h * 60 + m;
};
const jam = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const tambahHari = (tanggal: string, n: number) => {
  const [y, mo, d] = tanggal.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
};
/** A WIB wall-clock time on a date, as an instant (WIB is UTC+7, no DST). */
const instanWib = (tanggal: string, m: number) =>
  new Date(`${tanggal}T${jam(Math.max(0, m))}:00+07:00`);

export async function sesiBerikutnya(
  nim: string,
  now = new Date(),
): Promise<SesiBerikutnya | null> {
  const db = getDb();
  const hariIni = hariIniWib();
  const semester = semesterDariTanggal(hariIni);
  const [r] = await db
    .select({ hari: rosterSlot.hari, slot: rosterSlot.slot })
    .from(rosterSlot)
    .where(and(eq(rosterSlot.semester, semester), eq(rosterSlot.nim, nim)))
    .limit(1);
  if (!r) return null;
  const mulai = slotToMulai(r.slot);
  if (!mulai) return null;
  const [j] = await db
    .select()
    .from(jadwal)
    .where(and(eq(jadwal.semester, semester), eq(jadwal.hari, r.hari), eq(jadwal.slot, r.slot)))
    .limit(1);
  const [def] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, "jendela_mulai_default"))
    .limit(1);
  const jendela = j?.jendelaMulaiMenit ?? jendelaValid(def?.nilai);
  // Up to a term ahead: the slot's next date whose window hasn't closed.
  for (let d = 0; d < 7 * 20; d++) {
    const tanggal = tambahHari(hariIni, d);
    if (hariDariTanggal(tanggal) !== r.hari) continue;
    if (j && statusSlotTanggal(j, tanggal) !== "aktif") continue;
    if (instanWib(tanggal, menit(mulai) + SESI_CAP_MENIT) <= now) continue;
    const buka = menit(mulai) - jendela;
    return {
      tanggal,
      buka: jam(buka),
      bukaPada: instanWib(tanggal, buka).toISOString(),
      slot: r.slot,
    };
  }
  return null;
}
