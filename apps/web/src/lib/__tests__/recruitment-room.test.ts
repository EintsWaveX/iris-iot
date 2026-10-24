/**
 * The room (EXAM-ENGINE 5): the reducer, its guards, lazy ends and the timer
 * math. Every time is server milliseconds; MIN is a minute.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_EXAM_CONFIG, type ExamConfig, type RoomState } from "../recruitment/exam-types";
import {
  GRACE_MS,
  act,
  answerOpen,
  budget,
  clock,
  newRoomState,
  normalize,
  roomLeft,
  roomView,
  seatLeft,
  validateConfig,
  type Action,
  type ActCtx,
} from "../recruitment/room";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 17, 12, 0); // 19.00 WIB
const M = "101022300172";

function ctx(now: number, over: Partial<ActCtx> = {}): ActCtx {
  return {
    now,
    nim: M,
    canBeMaster: () => true,
    masterStale: false,
    isToday: true,
    rehearsal: false,
    seatsIn: [1, 2, 3],
    poolOk: () => true,
    config: DEFAULT_EXAM_CONFIG,
    ...over,
  };
}

/** Apply actions in order, failing loudly on a refusal. */
function run(state: RoomState, steps: [number, Action, Partial<ActCtx>?][]): RoomState {
  for (const [now, a, o] of steps) {
    const r = act(state, { ...a, seq: state.seq } as Action, ctx(now, o));
    if (!r.ok) throw new Error(`${a.act} at +${(now - T0) / MIN} min: ${r.kode}`);
    state = r.state;
  }
  return state;
}

const claimed = () => run(newRoomState(), [[T0, { act: "claim" }]]);
const opened = () => run(claimed(), [[T0, { act: "open" }]]);
/** Logika running since T0 + 1 min (15 minutes long). */
const logika = () => run(opened(), [[T0 + MIN, { act: "start" }]]);
const L0 = T0 + MIN;

describe("timer math (5.2)", () => {
  it("clock, roomLeft and seatLeft follow the server time", () => {
    const s = logika();
    const r = s.runs.logika!;
    expect(clock(r, L0 + 4 * MIN)).toBe(4 * MIN);
    expect(roomLeft(r, L0 + 4 * MIN)).toBe(11 * MIN);
    expect(seatLeft(r, "2", L0 + 4 * MIN)).toBe(11 * MIN);
    expect(roomLeft(r, L0 + 20 * MIN)).toBe(0);
  });

  it("a pause freezes the clock", () => {
    const s = run(logika(), [
      [L0 + 5 * MIN, { act: "pause" }],
      [L0 + 9 * MIN, { act: "resume" }],
    ]);
    expect(clock(s.runs.logika!, L0 + 10 * MIN)).toBe(6 * MIN);
    expect(roomView(s, L0 + 10 * MIN)).toEqual({ view: "part-running", part: "logika" });
  });
});

describe("views and lazy end (5.2, 5.3)", () => {
  it("setup, persiapan, then the part runs", () => {
    expect(roomView(newRoomState(), T0).view).toBe("setup");
    expect(roomView(opened(), T0).view).toBe("persiapan");
    expect(roomView(logika(), L0 + MIN).view).toBe("part-running");
  });

  it("ends at the exact instant, then grace, then the lobby", () => {
    const s = logika();
    const end = L0 + 15 * MIN;
    const n = normalize(s, end + 3 * MIN);
    expect(n.runs.logika!.state).toBe("ended");
    expect(n.runs.logika!.endedAt).toBe(end);
    expect(n.runs.logika!.endedBy).toBe("time");
    expect(roomView(s, end + GRACE_MS - 1).view).toBe("part-ended");
    expect(roomView(s, end + GRACE_MS).view).toBe("lobby");
  });

  it("a seat with extra time keeps the part open as part-ended", () => {
    const s = run(logika(), [[L0 + 10 * MIN, { act: "seat-time", seatId: 2, deltaMs: 3 * MIN }]]);
    expect(roomView(s, L0 + 16 * MIN).view).toBe("part-ended");
    expect(seatLeft(s.runs.logika!, "2", L0 + 16 * MIN)).toBe(2 * MIN);
    expect(normalize(s, L0 + 30 * MIN).runs.logika!.endedAt).toBe(L0 + 18 * MIN);
  });

  it("does not change a state that has nothing to end", () => {
    const s = logika();
    expect(normalize(s, L0 + MIN)).toBe(s);
  });
});

describe("answerOpen", () => {
  it("is open while the seat has time, and GRACE_MS after its end", () => {
    const s = logika();
    const end = L0 + 15 * MIN;
    expect(answerOpen(s, 1, "logika", L0 + MIN)).toBe(true);
    expect(answerOpen(s, 1, "logika", end + GRACE_MS)).toBe(true);
    expect(answerOpen(s, 1, "logika", end + GRACE_MS + 1)).toBe(false);
    expect(answerOpen(s, 1, "fitb", L0 + MIN)).toBe(false);
  });

  it("follows the seat's own extra", () => {
    const s = run(logika(), [[L0 + 2 * MIN, { act: "seat-time", seatId: 3, deltaMs: 2 * MIN }]]);
    expect(answerOpen(s, 3, "logika", L0 + 16 * MIN)).toBe(true);
    expect(answerOpen(s, 1, "logika", L0 + 16 * MIN)).toBe(false);
  });

  it("a skip ends it for everyone at once (after the grace)", () => {
    const s = run(logika(), [[L0 + 5 * MIN, { act: "skip" }]]);
    expect(answerOpen(s, 1, "logika", L0 + 5 * MIN + GRACE_MS)).toBe(true);
    expect(answerOpen(s, 1, "logika", L0 + 5 * MIN + GRACE_MS + 1)).toBe(false);
  });
});

describe("act: the flow of an evening", () => {
  it("logika → lobby → fitb → … → spins → livecode → finish", () => {
    let s = logika();
    let t = L0 + 15 * MIN + GRACE_MS;
    for (const part of ["fitb", "kodingan", "mikro"] as const) {
      s = run(s, [[t, { act: "start" }]]);
      expect(roomView(s, t)).toEqual({ view: "part-running", part });
      t += DEFAULT_EXAM_CONFIG.parts[part].minutes * MIN + GRACE_MS;
      expect(roomView(s, t).view).toBe("lobby");
    }
    const r = act(s, { act: "start", seq: s.seq }, ctx(t));
    expect(r.ok && roomView(r.state, t).view).toBe("livecode-spin");
    s = (r as { state: RoomState }).state;
    const go = act(s, { act: "start", seq: s.seq }, ctx(t + 2 * MIN));
    expect(go.ok && go.effects).toEqual([{ kind: "spin-rest" }]);
    s = (go as { state: RoomState }).state;
    expect(roomView(s, t + 3 * MIN)).toEqual({ view: "livecode-running", part: "livecode" });
    t += 2 * MIN + 45 * MIN + GRACE_MS;
    expect(roomView(s, t).view).toBe("lobby");
    const fin = act(s, { act: "finish", seq: s.seq }, ctx(t));
    expect(fin.ok && fin.effects).toEqual([{ kind: "lc-close" }]);
    expect(fin.ok && roomView(fin.state, t).view).toBe("finished");
    expect(fin.ok && fin.state.finishedAt).toBe(t);
  });

  it("raises seq by one on every accepted action", () => {
    const s = logika();
    expect(s.seq).toBe(3);
  });
});

describe("act: guards", () => {
  const no = (s: RoomState, a: Action, now: number, o: Partial<ActCtx> = {}) => {
    const r = act(s, { seq: s.seq, ...a } as Action, ctx(now, o));
    return r.ok ? "ok" : r.kode;
  };

  it("only the Master runs the controls", () => {
    expect(no(claimed(), { act: "open" }, T0, { nim: "999" })).toBe("bukan_master");
    expect(no(newRoomState(), { act: "open" }, T0)).toBe("bukan_master");
  });

  it("a stale seq is versi_lama", () => {
    const s = opened();
    expect(act(s, { act: "start", seq: s.seq - 1 }, ctx(T0)).ok).toBe(false);
    expect(no(s, { act: "start", seq: s.seq - 1 } as Action, T0)).toBe("versi_lama");
  });

  it("open only on the slot's day, unless it is a rehearsal", () => {
    expect(no(claimed(), { act: "open" }, T0, { isToday: false })).toBe("bukan_hari_ini");
    expect(no(claimed(), { act: "open" }, T0, { isToday: false, rehearsal: true })).toBe("ok");
  });

  it("start needs the pool and a checked-in seat, and only from persiapan, lobby or the spins", () => {
    expect(no(opened(), { act: "start" }, T0, { poolOk: () => false })).toBe("bank_kurang");
    expect(no(opened(), { act: "start" }, T0, { seatsIn: [] })).toBe("kursi_kosong");
    expect(no(logika(), { act: "start" }, L0 + MIN)).toBe("tahap_salah");
    expect(no(logika(), { act: "start" }, L0 + 15 * MIN + 1)).toBe("tahap_salah");
  });

  it("time: whole minutes from −10 to +30, only while the room has time", () => {
    const s = logika();
    expect(no(s, { act: "time", deltaMs: 30_000 }, L0 + MIN)).toBe("nilai_salah");
    expect(no(s, { act: "time", deltaMs: 31 * MIN }, L0 + MIN)).toBe("nilai_salah");
    expect(no(s, { act: "time", deltaMs: 0 }, L0 + MIN)).toBe("nilai_salah");
    expect(no(s, { act: "time", deltaMs: MIN }, L0 + 15 * MIN + 1)).toBe("tahap_salah");
    const x = run(s, [[L0 + 10 * MIN, { act: "seat-time", seatId: 1, deltaMs: 5 * MIN }]]);
    expect(no(x, { act: "time", deltaMs: MIN }, L0 + 16 * MIN)).toBe("waktu_ruang_habis");
  });

  it("time: a cut can end the room now but never in the past", () => {
    const s = run(logika(), [[L0 + 10 * MIN, { act: "time", deltaMs: -10 * MIN }]]);
    expect(s.runs.logika!.durMs).toBe(10 * MIN);
    const plus = run(logika(), [[L0 + 10 * MIN, { act: "time", deltaMs: 5 * MIN }]]);
    expect(roomLeft(plus.runs.logika!, L0 + 10 * MIN)).toBe(10 * MIN);
  });

  it("seat-time needs a checked-in seat and 1 to 30 whole minutes", () => {
    expect(no(logika(), { act: "seat-time", seatId: 8, deltaMs: MIN }, L0)).toBe(
      "kursi_tak_dikenal",
    );
    expect(no(logika(), { act: "seat-time", seatId: 1, deltaMs: 31 * MIN }, L0)).toBe(
      "nilai_salah",
    );
  });

  it("seat-time in the lobby reruns the part for that seat alone; Start waits for it", () => {
    const lobby = L0 + 15 * MIN + GRACE_MS;
    const s = run(logika(), [[lobby, { act: "seat-time", seatId: 2, deltaMs: 3 * MIN }]]);
    expect(roomView(s, lobby + MIN).view).toBe("part-ended");
    expect(answerOpen(s, 2, "logika", lobby + MIN)).toBe(true);
    expect(answerOpen(s, 1, "logika", lobby + MIN)).toBe(false);
    expect(no(s, { act: "start" }, lobby + MIN)).toBe("tahap_salah");
    expect(roomView(s, lobby + 3 * MIN + GRACE_MS).view).toBe("lobby");
    expect(answerOpen(s, 2, "logika", lobby + 3 * MIN + GRACE_MS + 1)).toBe(false);
  });

  it("seat-time after a skip gives exactly the delta, and nobody else gets time back", () => {
    const s = run(logika(), [
      [L0 + 5 * MIN, { act: "seat-time", seatId: 1, deltaMs: 2 * MIN }],
      [L0 + 6 * MIN, { act: "skip" }],
      [L0 + 7 * MIN, { act: "seat-time", seatId: 3, deltaMs: 4 * MIN }],
    ]);
    expect(seatLeft(s.runs.logika!, "3", L0 + 7 * MIN)).toBe(4 * MIN);
    expect(seatLeft(s.runs.logika!, "1", L0 + 7 * MIN)).toBe(0);
    expect(seatLeft(s.runs.logika!, "2", L0 + 7 * MIN)).toBe(0);
  });

  it("skip keeps what was left; reopen gives it back, clears extras", () => {
    const skipped = run(logika(), [
      [L0 + 3 * MIN, { act: "seat-time", seatId: 1, deltaMs: MIN }],
      [L0 + 5 * MIN, { act: "skip" }],
    ]);
    expect(skipped.runs.logika!.leftAtSkip).toBe(10 * MIN);
    const t = L0 + 5 * MIN + GRACE_MS;
    const re = run(skipped, [[t, { act: "reopen", addMs: MIN }]]);
    expect(roomLeft(re.runs.logika!, t)).toBe(11 * MIN);
    expect(re.runs.logika!.extra).toEqual({});
    expect(re.runs.logika!.reopened).toBe(1);
    expect(re.runs.logika!.leftAtSkip).toBe(0);
  });

  it("reopen of a part that ran out needs added time", () => {
    const t = L0 + 15 * MIN + GRACE_MS;
    expect(no(logika(), { act: "reopen", addMs: 0 }, t)).toBe("perlu_waktu");
    expect(no(logika(), { act: "reopen", addMs: 2 * MIN }, t)).toBe("ok");
  });

  it("reopen only for the last part started", () => {
    let s = logika();
    const t = L0 + 15 * MIN + GRACE_MS;
    s = run(s, [[t, { act: "start" }]]);
    const t2 = t + 15 * MIN + GRACE_MS;
    expect(no(s, { act: "reopen", addMs: MIN, part: "logika" } as Action, t2)).toBe("ok"); // part is ignored: cur only
    expect(roomView(s, t2).part).toBe("fitb");
  });

  it("pause and resume only where they make sense", () => {
    expect(no(opened(), { act: "pause" }, T0)).toBe("tahap_salah");
    expect(no(logika(), { act: "resume" }, L0)).toBe("tahap_salah");
    expect(no(logika(), { act: "pause" }, L0 + 15 * MIN + 1)).toBe("tahap_salah");
  });

  it("finish: from the last lobby freely, earlier only early with a reason, persiapan only with a reason", () => {
    const lobby = L0 + 15 * MIN + GRACE_MS;
    expect(no(logika(), { act: "finish" }, lobby)).toBe("perlu_alasan");
    expect(no(logika(), { act: "finish", early: true }, lobby)).toBe("perlu_alasan");
    expect(no(logika(), { act: "finish", early: true, reason: "Listrik padam" }, lobby)).toBe("ok");
    expect(no(opened(), { act: "finish" }, T0)).toBe("perlu_alasan");
    expect(no(opened(), { act: "finish", reason: "Batal" }, T0)).toBe("ok");
    expect(no(logika(), { act: "finish", early: true, reason: "x" }, L0 + MIN)).toBe("tahap_salah");
  });

  it("nothing after finished", () => {
    const f = run(opened(), [[T0, { act: "finish", reason: "Batal" }]]);
    expect(no(f, { act: "open" }, T0)).toBe("tahap_salah");
    expect(no(f, { act: "claim" }, T0)).toBe("tahap_salah");
  });

  it("reroll needs a reason and Live Coding", () => {
    expect(no(logika(), { act: "reroll", seatId: 1, what: "topic", reason: "x" }, L0)).toBe(
      "tahap_salah",
    );
    const spin = { ...logika(), stage: "spin" as const, cur: "livecode" as const };
    expect(no(spin, { act: "reroll", seatId: 1, what: "topic", reason: " " }, L0)).toBe(
      "perlu_alasan",
    );
    const r = act(
      spin,
      { act: "reroll", seatId: 1, what: "protocol", reason: "Papan rusak", seq: spin.seq },
      ctx(L0),
    );
    expect(r.ok && r.effects).toEqual([
      { kind: "reroll", seatId: 1, what: "protocol", reason: "Papan rusak" },
    ]);
    expect(r.ok && r.state.seq).toBe(spin.seq + 1);
  });
});

describe("act: the Master", () => {
  const as = (s: RoomState, a: Action, nim: string, o: Partial<ActCtx> = {}) =>
    act(s, { seq: s.seq, ...a } as Action, ctx(T0, { nim, ...o }));

  it("claim: only an allowed pengawas, only when free or stale", () => {
    const r = as(newRoomState(), { act: "claim" }, "201", { canBeMaster: () => false });
    expect(!r.ok && r.kode).toBe("tidak_boleh_master");
    const s = claimed();
    expect(s.master).toEqual({ nim: M, since: T0 });
    const taken = as(s, { act: "claim" }, "201");
    expect(!taken.ok && taken.kode).toBe("ada_master");
    const stale = as(s, { act: "claim" }, "201", { masterStale: true });
    expect(stale.ok && stale.state.master?.nim).toBe("201");
  });

  it("ask, then give or decline", () => {
    const s = claimed();
    const asked = as(s, { act: "ask" }, "201");
    expect(asked.ok && asked.state.ask).toEqual({ nim: "201", at: T0 });
    const a = (asked as { state: RoomState }).state;
    const declined = as(a, { act: "decline" }, M);
    expect(declined.ok && declined.state.ask).toBeNull();
    const given = as(a, { act: "give", to: "201" }, M);
    expect(given.ok && given.state.master?.nim).toBe("201");
    expect(given.ok && given.state.ask).toBeNull();
    const notMaster = as(a, { act: "give", to: "202" }, "201");
    expect(!notMaster.ok && notMaster.kode).toBe("bukan_master");
  });

  it("give only to someone who may be Master", () => {
    const r = as(claimed(), { act: "give", to: "301" }, M, { canBeMaster: (n) => n !== "301" });
    expect(!r.ok && r.kode).toBe("tidak_boleh_master");
  });

  it("release leaves the room without a Master; the timers do not care", () => {
    const s = logika();
    const r = as(s, { act: "release" }, M);
    expect(r.ok && r.state.master).toBeNull();
    expect(r.ok && roomView(r.state, L0 + 5 * MIN).view).toBe("part-running");
  });
});

describe("budget (5.2)", () => {
  it("projects the evening against the 120 minute budget", () => {
    const s = logika();
    const b = budget(s, DEFAULT_EXAM_CONFIG, L0 + 5 * MIN);
    expect(b.elapsedMs).toBe(5 * MIN);
    // logika has 10 left; fitb 15, kodingan 10, mikro 20, livecode 45 not started
    expect(b.plannedLeftMs).toBe((10 + 15 + 10 + 20 + 45) * MIN);
    expect(b.projectedMs).toBe(105 * MIN);
    expect(b.budgetMs).toBe(120 * MIN);
    expect(b.overMs).toBe(0);
    expect(b.segments).toEqual([{ part: "logika", start: L0, end: null }]);
  });

  it("warns once the projection passes the budget", () => {
    const s = run(logika(), [[L0 + MIN, { act: "time", deltaMs: 25 * MIN }]]);
    expect(budget(s, DEFAULT_EXAM_CONFIG, L0 + 5 * MIN).overMs).toBe(10 * MIN);
  });
});

describe("validateConfig (2)", () => {
  const fields = (c: ExamConfig) => validateConfig(c).map((e) => `${e.field}:${e.kode}`);
  it("accepts the default", () => {
    expect(validateConfig(DEFAULT_EXAM_CONFIG)).toEqual([]);
  });
  it("checks minutes, counts and the order", () => {
    const c: ExamConfig = structuredClone(DEFAULT_EXAM_CONFIG);
    c.parts.logika.minutes = 0;
    c.parts.fitb.counts.cpp = { shown: 0, pool: 5 };
    c.parts.kodingan.counts.py = { shown: 6, pool: 5 };
    c.parts.mikro.counts = { any: { shown: 5, pool: 10 }, cpp: { shown: 1, pool: 1 } };
    c.livecode.minutes = 5;
    c.order = ["fitb", "logika", "kodingan", "livecode", "mikro"];
    expect(fields(c)).toEqual([
      "order:urutan_salah",
      "parts.logika.minutes:menit_salah",
      "parts.fitb.counts.cpp:jumlah_salah",
      "parts.kodingan.counts.py:jumlah_salah",
      "parts.mikro.counts:bahasa_salah",
      "livecode.minutes:menit_salah",
    ]);
  });
});
