/**
 * The exam room (EXAM-ENGINE 5): one reducer for every Master action, the
 * timer math, and the lazy end. Timers live in the state as server time, so
 * nobody has to be online when a part runs out: normalize() ends it at the
 * exact instant on the next read or write. The API stores the result under
 * `UPDATE ... WHERE seq = $seen`.
 */
import type { ExamConfig, PartKey, PartRun, RoomState, RoomViewName } from "./exam-types.js";
import { minutesOf } from "./exam-config.js";

export const GRACE_MS = 5000;
const MIN = 60_000;

export const newRoomState = (): RoomState => ({
  v: 1,
  seq: 0,
  stage: "setup",
  cur: null,
  runs: {},
  startedAt: null,
  finishedAt: null,
  master: null,
  ask: null,
});

/* ------------------------------------------------------------ timer math */

/** The room clock of a part: time run, pauses left out. */
export const clock = (r: PartRun, now: number) =>
  r.usedMs + (r.state === "running" && r.mark != null ? now - r.mark : 0);
export const roomLeft = (r: PartRun, now: number) => Math.max(0, r.durMs - clock(r, now));
export const seatLeft = (r: PartRun, seat: string | number, now: number) =>
  Math.max(0, r.durMs + (r.extra[String(seat)] ?? 0) - clock(r, now));
const maxExtra = (r: PartRun) => Math.max(0, ...Object.values(r.extra));

/** Ends a running part whose clock passed durMs + max(extra), at that exact instant. */
export function normalize(s: RoomState, now: number): RoomState {
  const part = s.cur;
  const r = part ? s.runs[part] : undefined;
  if (!part || !r || r.state !== "running" || r.mark == null) return s;
  const limit = r.durMs + maxExtra(r);
  if (clock(r, now) < limit) return s;
  const endedAt = r.mark + (limit - r.usedMs);
  return {
    ...s,
    runs: {
      ...s.runs,
      [part]: { ...r, usedMs: limit, mark: null, state: "ended", endedAt, endedBy: "time" },
    },
  };
}

/** The name the seats and the console show (5.3), and which part it is about. */
export function roomView(
  state: RoomState,
  now: number,
): { view: RoomViewName; part: PartKey | null } {
  const s = normalize(state, now);
  const part = s.cur;
  switch (s.stage) {
    case "setup":
      return { view: "setup", part: null };
    case "prep":
      return { view: "persiapan", part: null };
    case "spin":
      return { view: "livecode-spin", part: "livecode" };
    case "finished":
      return { view: "finished", part };
  }
  const r = s.runs[part!]!;
  if (r.state === "paused") return { view: "part-paused", part };
  if (r.state === "running") {
    if (clock(r, now) >= r.durMs) return { view: "part-ended", part };
    return { view: part === "livecode" ? "livecode-running" : "part-running", part };
  }
  return { view: now - r.endedAt! < GRACE_MS ? "part-ended" : "lobby", part };
}

/** When a seat's own time ended, as wall time (null while it still has time). */
function seatEnd(r: PartRun, seat: string, now: number): number | null {
  if (r.state === "running")
    return seatLeft(r, seat, now) > 0 ? null : r.mark! + r.durMs + (r.extra[seat] ?? 0) - r.usedMs;
  if (r.state === "paused") return seatLeft(r, seat, now) > 0 ? null : r.pausedAt!;
  if (r.endedBy === "skip") return r.endedAt!;
  return r.endedAt! - (maxExtra(r) - (r.extra[seat] ?? 0));
}

/** The server's one check for every answer write: the seat's time, plus GRACE_MS. */
export function answerOpen(state: RoomState, seatId: number, part: PartKey, now: number): boolean {
  const s = normalize(state, now);
  const r = s.runs[part];
  if (!r || s.stage === "finished") return false;
  const end = seatEnd(r, String(seatId), now);
  return end === null || now <= end + GRACE_MS;
}

/** The budget bar: elapsed wall time, what is still planned, and the projected overrun. */
export function budget(state: RoomState, config: ExamConfig, now: number) {
  const s = normalize(state, now);
  const elapsedMs = s.startedAt == null ? 0 : (s.finishedAt ?? now) - s.startedAt;
  let plannedLeftMs = 0;
  for (const part of config.order) {
    const r = s.runs[part];
    if (!r) plannedLeftMs += minutesOf(config, part) * MIN;
    else if (r.state !== "ended") plannedLeftMs += roomLeft(r, now);
  }
  if (s.stage === "finished") plannedLeftMs = 0;
  const projectedMs = elapsedMs + plannedLeftMs;
  const budgetMs = config.budgetMin * MIN;
  const segments = config.order.flatMap((part) => {
    const r = s.runs[part];
    return r ? [{ part, start: r.startedAt, end: r.endedAt }] : [];
  });
  return {
    elapsedMs,
    plannedLeftMs,
    projectedMs,
    budgetMs,
    overMs: Math.max(0, projectedMs - budgetMs),
    segments,
  };
}

/* ---------------------------------------------------------------- config */

// minutesOf and validateConfig live in exam-config.ts; re-exported for the callers that import them from here.
export { minutesOf, validateConfig } from "./exam-config.js";

/* -------------------------------------------------------------- actions */

type Seq = { seq?: number };
export type Action = Seq &
  (
    | { act: "open" | "start" | "pause" | "resume" | "skip" }
    | { act: "reopen"; addMs: number }
    | { act: "time"; deltaMs: number }
    | { act: "seat-time"; seatId: number; deltaMs: number }
    | { act: "finish"; early?: boolean; reason?: string }
    | { act: "reroll"; seatId: number; what: "topic" | "protocol"; reason: string }
    | { act: "claim" | "ask" | "decline" | "release" }
    | { act: "give"; to: string }
  );

export interface ActCtx {
  now: number;
  /** The actor. */
  nim: string;
  /** Plotted as pengawas for this room, active, never the Pencipta. */
  canBeMaster: (nim: string) => boolean;
  /** The Master has not pinged for 60 s. */
  masterStale: boolean;
  /** The slot's date in WIB is today. */
  isToday: boolean;
  rehearsal: boolean;
  /** Checked-in seat ids. */
  seatsIn: number[];
  poolOk: (part: PartKey) => boolean;
  config: ExamConfig;
}

export type Effect =
  | { kind: "spin-rest" }
  | { kind: "lc-close" }
  | { kind: "reroll"; seatId: number; what: "topic" | "protocol"; reason: string };

export type ActResult =
  { ok: true; state: RoomState; effects: Effect[] } | { ok: false; kode: string };

const MASTER_ACTS = new Set(["claim", "ask", "give", "decline", "release"]);
const fail = (kode: string): ActResult => ({ ok: false, kode });

/** Applies one action after normalize(); refusals carry the API's kode (5.4). */
export function act(state: RoomState, action: Action, ctx: ActCtx): ActResult {
  const s = normalize(state, ctx.now);
  if (s.stage === "finished") return fail("tahap_salah");
  const r = MASTER_ACTS.has(action.act) ? masterAct(s, action, ctx) : controlAct(s, action, ctx);
  if (!r.ok) return r;
  return { ...r, state: { ...r.state, seq: s.seq + 1 } };
}

function masterAct(s: RoomState, a: Action, ctx: ActCtx): ActResult {
  const { now, nim } = ctx;
  const isMaster = s.master?.nim === nim;
  const done = (patch: Partial<RoomState>): ActResult => ({
    ok: true,
    state: { ...s, ...patch },
    effects: [],
  });
  switch (a.act) {
    case "claim":
      if (!ctx.canBeMaster(nim)) return fail("tidak_boleh_master");
      if (s.master && !isMaster && !ctx.masterStale) return fail("ada_master");
      return done({ master: { nim, since: isMaster ? s.master!.since : now }, ask: null });
    case "ask":
      if (!ctx.canBeMaster(nim)) return fail("tidak_boleh_master");
      if (!s.master || isMaster || ctx.masterStale) return fail("tahap_salah");
      return done({ ask: { nim, at: now } });
    case "give":
      if (!isMaster) return fail("bukan_master");
      if (!ctx.canBeMaster(a.to)) return fail("tidak_boleh_master");
      return done({ master: { nim: a.to, since: now }, ask: null });
    case "decline":
      if (!isMaster) return fail("bukan_master");
      if (!s.ask) return fail("tahap_salah");
      return done({ ask: null });
    case "release":
      if (!isMaster) return fail("bukan_master");
      return done({ master: null, ask: null });
  }
  return fail("tahap_salah");
}

const newRun = (durMs: number, now: number): PartRun => ({
  durMs,
  usedMs: 0,
  mark: now,
  state: "running",
  pausedAt: null,
  extra: {},
  startedAt: now,
  endedAt: null,
  endedBy: null,
  leftAtSkip: 0,
  reopened: 0,
});

const wholeMinutes = (ms: number, lo: number, hi: number) =>
  Number.isInteger(ms) && ms % MIN === 0 && ms !== 0 && ms >= lo * MIN && ms <= hi * MIN;

function controlAct(s: RoomState, a: Action, ctx: ActCtx): ActResult {
  const { now } = ctx;
  if (s.master?.nim !== ctx.nim) return fail("bukan_master");
  if (a.seq !== s.seq) return fail("versi_lama");
  const view = roomView(s, now).view;
  const part = s.cur;
  const r = part ? s.runs[part] : undefined;
  const ok = (patch: Partial<RoomState>, effects: Effect[] = []): ActResult => ({
    ok: true,
    state: { ...s, ...patch },
    effects,
  });
  const withRun = (run: PartRun, patch: Partial<RoomState> = {}) =>
    ok({ ...patch, runs: { ...s.runs, [part!]: run } });
  const isLast = part === ctx.config.order[ctx.config.order.length - 1];

  switch (a.act) {
    case "open":
      if (s.stage !== "setup") return fail("tahap_salah");
      if (!ctx.isToday && !ctx.rehearsal) return fail("bukan_hari_ini");
      return ok({ stage: "prep" });

    case "start": {
      let next: PartKey;
      if (view === "persiapan") next = ctx.config.order[0];
      else if (view === "lobby" && !isLast)
        next = ctx.config.order[ctx.config.order.indexOf(part!) + 1];
      else if (view === "livecode-spin") next = "livecode";
      else return fail("tahap_salah");
      if (!ctx.poolOk(next)) return fail("bank_kurang");
      if (ctx.seatsIn.length === 0) return fail("kursi_kosong");
      const startedAt = s.startedAt ?? now;
      if (next === "livecode" && view !== "livecode-spin")
        return ok({ stage: "spin", cur: "livecode", startedAt });
      const run = newRun(minutesOf(ctx.config, next) * MIN, now);
      return ok(
        { stage: "parts", cur: next, startedAt, runs: { ...s.runs, [next]: run } },
        view === "livecode-spin" ? [{ kind: "spin-rest" }] : [],
      );
    }

    case "pause":
      if (!r || r.state !== "running") return fail("tahap_salah");
      return withRun({ ...r, usedMs: clock(r, now), mark: null, state: "paused", pausedAt: now });

    case "resume":
      if (!r || r.state !== "paused") return fail("tahap_salah");
      return withRun({ ...r, mark: now, state: "running", pausedAt: null });

    case "skip":
      if (!r || r.state === "ended") return fail("tahap_salah");
      return withRun({
        ...r,
        usedMs: clock(r, now),
        mark: null,
        state: "ended",
        pausedAt: null,
        endedAt: now,
        endedBy: "skip",
        leftAtSkip: roomLeft(r, now),
      });

    case "reopen": {
      if (view !== "lobby" || !r) return fail("tahap_salah");
      if (!Number.isInteger(a.addMs) || a.addMs < 0) return fail("nilai_salah");
      if (r.leftAtSkip + a.addMs <= 0) return fail("perlu_waktu");
      return withRun({
        ...r,
        durMs: r.usedMs + r.leftAtSkip + a.addMs,
        mark: now,
        state: "running",
        extra: {},
        endedAt: null,
        endedBy: null,
        leftAtSkip: 0,
        reopened: r.reopened + 1,
      });
    }

    case "time": {
      if (!wholeMinutes(a.deltaMs, -10, 30)) return fail("nilai_salah");
      if (!r || r.state === "ended") return fail("tahap_salah");
      if (roomLeft(r, now) <= 0) return fail("waktu_ruang_habis");
      const c = clock(r, now);
      return withRun({ ...r, durMs: Math.max(c, r.durMs + a.deltaMs) });
    }

    case "seat-time": {
      if (!ctx.seatsIn.includes(a.seatId)) return fail("kursi_tak_dikenal");
      if (!wholeMinutes(a.deltaMs, 1, 30)) return fail("nilai_salah");
      if (!r) return fail("tahap_salah");
      const seat = String(a.seatId);
      if (r.state !== "ended") {
        const c = clock(r, now);
        return withRun({
          ...r,
          extra: { ...r.extra, [seat]: Math.max(r.extra[seat] ?? 0, c - r.durMs) + a.deltaMs },
        });
      }
      // Over for everyone: the part runs again for this seat alone, exactly deltaMs.
      const durMs = Math.min(r.durMs, r.usedMs);
      return withRun({
        ...r,
        durMs,
        extra: { [seat]: r.usedMs - durMs + a.deltaMs },
        mark: now,
        state: "running",
        endedAt: null,
        endedBy: null,
      });
    }

    case "finish": {
      const reason = a.reason?.trim();
      if (view === "lobby" && isLast)
        return ok({ stage: "finished", finishedAt: now }, [{ kind: "lc-close" }]);
      if (view === "lobby" || view === "livecode-spin") {
        if (!a.early || !reason) return fail("perlu_alasan");
      } else if (view === "persiapan") {
        if (!reason) return fail("perlu_alasan");
      } else return fail("tahap_salah");
      return ok({ stage: "finished", finishedAt: now }, [{ kind: "lc-close" }]);
    }

    case "reroll": {
      const live = view === "livecode-spin" || (part === "livecode" && r && r.state !== "ended");
      if (!live) return fail("tahap_salah");
      const reason = a.reason?.trim();
      if (!reason) return fail("perlu_alasan");
      return ok({}, [{ kind: "reroll", seatId: a.seatId, what: a.what, reason }]);
    }
  }
  return fail("tahap_salah");
}
