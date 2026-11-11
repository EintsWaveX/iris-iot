/**
 * The day's Module 4 roster as the PC's hunt scoreboard takes it: one person
 * belongs to one slot.
 *
 * sesi.ts's jadwalModul4Hari() builds each slot's groups from the same
 * `kelompok` and `anggota` rows, so every unfinished slot of the day carried
 * everybody. The scoreboard refuses a NIM that sits in two slots of one day
 * (it would send the person to the wrong group without a word), and it refuses
 * the whole later slot, so a session that ran after another unfinished one
 * (a TOT rehearsal in a free slot, a slot nobody ended) found its NIMs "not on
 * the list". An ended slot already hands its people back (2026-10-09); this
 * does the same for every slot the people are not playing in.
 */
import type { JadwalModul4 } from "./sesi.js";

type SlotJadwal = JadwalModul4["sesi"][number];

/**
 * Each NIM stays in one slot: the one whose hunt is on (`berburu`), else a
 * running session, else the earliest slot. A group that loses all its members
 * to another slot is dropped from this one; a group that never had any stays.
 */
export function satuSlotPerNim(
  slots: readonly SlotJadwal[],
  berjalan: ReadonlySet<number>,
): SlotJadwal[] {
  const urutan = [...slots].sort((a, b) => {
    const rank = (s: SlotJadwal) => (s.berburu ? 0 : berjalan.has(s.id) ? 1 : 2);
    return rank(a) - rank(b) || a.id - b.id;
  });

  const dipakai = new Set<string>();
  const hasil = new Map<number, SlotJadwal>();
  for (const slot of urutan) {
    const regu: SlotJadwal["regu"] = {};
    for (const [nomor, kelompok] of Object.entries(slot.regu)) {
      const anggota = kelompok.anggota.filter((a) => !dipakai.has(a.nim));
      if (anggota.length === 0 && kelompok.anggota.length > 0) continue;
      for (const a of anggota) dipakai.add(a.nim);
      regu[nomor] = { ...kelompok, anggota };
    }
    hasil.set(slot.id, { ...slot, regu });
  }
  return slots.map((s) => hasil.get(s.id)!);
}
