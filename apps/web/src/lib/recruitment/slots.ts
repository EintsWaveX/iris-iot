/**
 * Pilih Jadwal, pure (PRD 6, Shifts): when a stage's picking window is open,
 * whether a pick or a change request may go through, what Auto Isi does.
 * The API calls these on every write and then does the one thing a pure
 * function cannot, counting seats inside a transaction that holds the slot's
 * row lock. The pages use the same functions for display only.
 *
 * Rulings (docs/recruitment/prompts/STATUS.md, 2026-10-23 and 2026-10-24):
 * first come first served, one open change request at a time, a change is
 * allowed until H-1 23.59 of the candidate's current slot, a requested seat
 * is not held while the request waits, Panitia may go over capacity.
 *
 * Time is WIB (UTC+7). A pick event's `dayStart` is when picking opens on its
 * first day and `dayEnd` when it closes on its last day (exclusive, like
 * eventLive); it is not a daily window.
 */
import { addDays } from "./calendar.js";
import { tanggalWib } from "./gates.js";
import type { RecEvent, StageKey } from "./types.js";

export interface SlotInfo {
  id: number;
  stage: StageKey;
  /** The test, interview or teaching event the slot belongs to */
  eventId: number | null;
  room: string;
  /** ISO instants */
  startsAt: string;
  endsAt: string;
  capacity: number;
}

const wib = (tanggal: string, jam: string) => new Date(`${tanggal}T${jam}:00+07:00`);

type Jendela = Pick<RecEvent, "startsOn" | "endsOn" | "dayStart" | "dayEnd">;

/** The instants a pick event opens and closes picking. */
export function pickWindow(e: Jendela): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: wib(e.startsOn, e.dayStart ?? "00:00"),
    closesAt: e.dayEnd ? wib(e.endsOn, e.dayEnd) : wib(addDays(e.endsOn, 1), "00:00"),
  };
}

/**
 * The close as people read it. The window shuts at `dayEnd` exclusive, so a
 * 23:59 close shows as 23:59; one at midnight shows as 23:59 the day before.
 */
export function tutupTampil(closesAt: Date | string): Date {
  const t = new Date(closesAt);
  return tanggalWib(t).jam === "00:00" ? new Date(t.getTime() - 60_000) : t;
}

type Peristiwa = Jendela & Pick<RecEvent, "kind" | "stage">;

/** The Pilih Jadwal event of a stage, if the calendar has one. */
export function pickEvent<T extends Pick<RecEvent, "kind" | "stage">>(
  events: readonly T[],
  stage: StageKey,
): T | null {
  return events.find((e) => e.kind === "pick" && e.stage === stage) ?? null;
}

/** Picking is open now: inside the pick event's window. */
export function pickOpen(events: readonly Peristiwa[], stage: StageKey, now: Date): boolean {
  const e = pickEvent(events, stage);
  if (!e) return false;
  const { opensAt, closesAt } = pickWindow(e);
  return now >= opensAt && now < closesAt;
}

/** The WIB date a slot falls on. */
export const slotDate = (s: Pick<SlotInfo, "startsAt">): string =>
  tanggalWib(new Date(s.startsAt)).tanggal;

/** H-1 23.59 is the last minute: changes stop at the start of the slot's own day. */
export const changeCutoff = (s: Pick<SlotInfo, "startsAt">): Date => wib(slotDate(s), "00:00");

export const canChange = (s: Pick<SlotInfo, "startsAt">, now: Date): boolean =>
  now < changeCutoff(s);

export const seatsLeft = (s: Pick<SlotInfo, "capacity">, taken: number): number =>
  Math.max(0, s.capacity - taken);

export type PickError = "jendela_tutup" | "sudah_pilih" | "penuh" | "slot_salah" | "bukan_peserta";

export interface PickInput {
  open: boolean;
  /** The candidate is in this stage (standing.ts) */
  eligible: boolean;
  hasPick: boolean;
  slot: SlotInfo | null;
  stage: StageKey;
  /** Seats taken now, read under the slot's row lock */
  taken: number;
}

/** Whether a candidate may take this seat. The order is the order of the answers the page can act on. */
export function judgePick(i: PickInput): "ok" | PickError {
  if (!i.eligible) return "bukan_peserta";
  if (!i.slot || i.slot.stage !== i.stage) return "slot_salah";
  if (!i.open) return "jendela_tutup";
  if (i.hasPick) return "sudah_pilih";
  if (i.taken >= i.slot.capacity) return "penuh";
  return "ok";
}

export type ChangeError =
  "belum_memilih" | "lewat_batas" | "sudah_ada_permintaan" | "slot_sama" | "slot_salah" | "penuh";

export interface ChangeInput {
  now: Date;
  from: SlotInfo | null;
  to: SlotInfo | null;
  hasOpen: boolean;
  /** Seats taken in the target at the moment of asking */
  takenTo: number;
}

/** Whether a candidate may ask for another slot. The seat is checked now and not held. */
export function judgeChange(i: ChangeInput): "ok" | ChangeError {
  if (!i.from) return "belum_memilih";
  if (!canChange(i.from, i.now)) return "lewat_batas";
  if (i.hasOpen) return "sudah_ada_permintaan";
  if (!i.to || i.to.stage !== i.from.stage) return "slot_salah";
  if (i.to.id === i.from.id) return "slot_sama";
  if (i.takenTo >= i.to.capacity) return "penuh";
  return "ok";
}

/** Approving a request needs a seat unless Panitia confirm going over; declining never does. */
export function judgeDecision(i: {
  approve: boolean;
  capacity: number;
  taken: number;
  over: boolean;
}): "ok" | "penuh" {
  if (!i.approve || i.over) return "ok";
  return i.taken >= i.capacity ? "penuh" : "ok";
}

export interface FillSlot extends SlotInfo {
  /** Seats already taken, picks included */
  taken: number;
}

/**
 * Auto Isi: those who did not pick, in NIM order, each into the room with the
 * most seats free (ties go to the earlier slot id). Deterministic for the same
 * input whatever order it arrives in. The caller passes only people without
 * a seat and the real counts, so earlier picks are never touched. Whoever
 * finds every room full comes back in `left`.
 */
export function autoFill(
  candidates: readonly { id: number; nim: string }[],
  slots: readonly FillSlot[],
): { placed: { candidateId: number; slotId: number }[]; left: number[] } {
  const bebas = new Map(slots.map((s) => [s.id, s.capacity - s.taken]));
  const urut = [...slots].sort((a, b) => a.id - b.id);
  const orang = [...candidates].sort((a, b) =>
    a.nim < b.nim ? -1 : a.nim > b.nim ? 1 : a.id - b.id,
  );
  const placed: { candidateId: number; slotId: number }[] = [];
  const left: number[] = [];
  for (const c of orang) {
    let pilih: FillSlot | null = null;
    for (const s of urut) {
      const sisa = bebas.get(s.id) ?? 0;
      if (sisa > 0 && (!pilih || sisa > (bebas.get(pilih.id) ?? 0))) pilih = s;
    }
    if (!pilih) {
      left.push(c.id);
      continue;
    }
    bebas.set(pilih.id, (bebas.get(pilih.id) ?? 0) - 1);
    placed.push({ candidateId: c.id, slotId: pilih.id });
  }
  return { placed, left };
}
