/**
 * What a candidate's page shows from the room's public state (EXAM-ENGINE
 * 5.2, 5.3, 5.6): the phase, the time left, and the clock formats. It builds
 * a room state out of what the relay and GET test hand a seat and asks the
 * same room.ts functions the server asks, so the page and the API cannot
 * disagree about when a seat's time is over. Pure.
 */
import type { PartKey, PartRun, RoomState } from "./exam-types.js";
import { GRACE_MS, normalize, seatLeft } from "./room.js";
import type { RoomPublic, RunPublic } from "./room-relay.js";

export interface SeatSelfLite {
  id: number;
  /** This seat's extra time in the current part, ms */
  extraMs: number;
  /** Parts handed in early */
  done: Partial<Record<PartKey, number>>;
}

export type SeatPhase =
  | { k: "none" }
  | { k: "setup" }
  | { k: "prep" }
  | { k: "spin" }
  | { k: "finished" }
  | { k: "work"; part: PartKey; left: number; paused: boolean }
  | { k: "wait"; part: PartKey; why: "done" | "time" | "lobby" };

/** The seat's own copy of a run: its extra time, and the longest one so the lazy end is right */
export function partRunOf(r: RunPublic, seatId: number, extraMs: number): PartRun {
  return {
    durMs: r.durMs,
    usedMs: r.usedMs,
    mark: r.mark,
    state: r.state,
    pausedAt: r.pausedAt,
    extra: { [String(seatId)]: extraMs, "~max": r.maxExtraMs },
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    endedBy: r.endedBy,
    leftAtSkip: 0,
    reopened: 0,
  };
}

export function seatPhase(room: RoomPublic | null, seat: SeatSelfLite, now: number): SeatPhase {
  if (!room) return { k: "none" };
  switch (room.stage) {
    case "setup":
      return { k: "setup" };
    case "prep":
      return { k: "prep" };
    case "spin":
      return { k: "spin" };
    case "finished":
      return { k: "finished" };
  }
  const part = room.cur;
  const pub = part ? room.runs[part] : undefined;
  if (!part || !pub) return { k: "prep" };
  const run = partRunOf(pub, seat.id, seat.extraMs);
  const st = normalize(
    {
      v: 1,
      seq: room.seq,
      stage: "parts",
      cur: part,
      runs: { [part]: run },
      startedAt: room.startedAt,
      finishedAt: null,
      master: null,
      ask: null,
    } as RoomState,
    now,
  );
  const r = st.runs[part]!;
  if (seat.done[part] != null) return { k: "wait", part, why: "done" };
  if (r.state === "ended")
    return { k: "wait", part, why: now - (r.endedAt ?? now) < GRACE_MS ? "time" : "lobby" };
  const left = seatLeft(r, seat.id, now);
  if (left <= 0) return { k: "wait", part, why: "time" };
  return { k: "work", part, left, paused: r.state === "paused" };
}

/** HH:MM:SS; a part second counts as a whole one, so the clock never shows 00:00:00 early */
export function hms(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

/** Gold under 2 minutes, red under 30 s */
export function tone(leftMs: number): "" | "warn" | "danger" {
  return leftMs <= 30_000 ? "danger" : leftMs <= 120_000 ? "warn" : "";
}
