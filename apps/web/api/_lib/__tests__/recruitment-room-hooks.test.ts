/**
 * The room's two Live Coding hooks that used to do nothing: the topic re-roll (a seat is dealt the
 * next attempt of its seeded hand) and the close (claimed jobs a dead PC left are let go of).
 * The database is a scripted fake keyed by table.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_EXAM_CONFIG } from "../../../src/lib/recruitment/exam-types";
import { recCProblem, recExamConfig, recExamSeat } from "../../../src/lib/schema";
import { roomHooks } from "../recruitment-room";
import type { Db } from "../recruitment-data";

type Write = { table: unknown; set: Record<string, unknown> };

function fake(tables: Map<unknown, unknown[]>) {
  const writes: Write[] = [];
  const executed: number[] = [];
  const select = () => {
    let t: unknown;
    const p: Record<string, unknown> = {};
    p.from = (x: unknown) => ((t = x), p);
    for (const m of ["where", "limit", "orderBy"]) p[m] = () => p;
    p.then = (ok: (v: unknown) => unknown) => ok(tables.get(t) ?? []);
    return p;
  };
  const update = (t: unknown) => {
    const p: Record<string, unknown> = {};
    p.set = (v: Record<string, unknown>) => (writes.push({ table: t, set: v }), p);
    p.where = () => p;
    p.then = (ok: (v: unknown) => unknown) => ok([]);
    return p;
  };
  const db = { select, update, execute: async () => (executed.push(1), []) } as unknown as Db;
  return { db, writes, executed };
}

/** 8 ready problems of each tier, ids 1 to 24. */
const pool = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  tier: (["easy", "medium", "hard"] as const)[Math.floor(i / 8)],
}));

/** The hand a write stored: the one JSON param inside the drizzle `sql` of `draw`. */
function tangan(w: Write) {
  const chunks = (w.set.draw as { queryChunks: unknown[] }).queryChunks;
  for (const c of chunks) {
    const v = (c as { value?: unknown }).value ?? c;
    if (typeof v === "string" && v.startsWith("{")) return JSON.parse(v);
  }
  throw new Error("no hand in the write");
}

const tabel = (hand: object | null, rehearsal = true) =>
  new Map<unknown, unknown[]>([
    [recExamSeat, [{ id: 5, editionId: 1, rehearsal, draw: hand ? { livecode: hand } : {} }]],
    [recExamConfig, [{ config: DEFAULT_EXAM_CONFIG, salt: "ab".repeat(32) }]],
    [recCProblem, pool],
  ]);

describe("roomHooks.reroll", () => {
  it("deals the seat another hand and keeps the old one for the audit", async () => {
    const lama = [1, 2, 9, 10, 17];
    const { db, writes } = fake(tabel({ at: 1, room: 3, problems: lama }));
    await roomHooks.reroll(db, 3, 5, "topic", "topik_terlalu_mirip");
    const w = writes.find((x) => x.table === recExamSeat)!;
    const baru = tangan(w);
    expect(baru.problems).toHaveLength(5);
    expect(baru.problems).not.toEqual(lama);
    expect(baru.attempt).toBe(1);
    expect(baru.prev).toEqual([lama]);
    // the same tiers as before: 2 easy, 2 medium, 1 hard
    const tier = (id: number) => (id <= 8 ? "easy" : id <= 16 ? "medium" : "hard");
    expect(baru.problems.map(tier)).toEqual(["easy", "easy", "medium", "medium", "hard"]);
  });

  it("deals a hand even to a seat that had none yet, and counts up on the next re-roll", async () => {
    const a = fake(tabel(null));
    await roomHooks.reroll(a.db, 3, 5, "topic", "lainnya");
    const one = tangan(a.writes.find((x) => x.table === recExamSeat)!);
    expect(one.attempt).toBe(1);
    const b = fake(tabel({ at: 1, room: 3, problems: one.problems, attempt: 1, prev: [] }));
    await roomHooks.reroll(b.db, 3, 5, "topic", "lainnya");
    const two = tangan(b.writes.find((x) => x.table === recExamSeat)!);
    expect(two.attempt).toBeGreaterThanOrEqual(2);
    expect(two.prev).toEqual([one.problems]);
  });

  it("does nothing for the old protocol re-roll, and for a seat that is not in the room", async () => {
    const a = fake(tabel({ at: 1, room: 3, problems: [1, 2, 9, 10, 17] }));
    await roomHooks.reroll(a.db, 3, 5, "protocol", "kit_rusak");
    expect(a.writes).toHaveLength(0);
    const sepi = tabel(null);
    sepi.set(recExamSeat, []);
    const b = fake(sepi);
    await roomHooks.reroll(b.db, 3, 5, "topic", "lainnya");
    expect(b.writes).toHaveLength(0);
  });

  it("leaves the hand alone when the bank cannot deal a hand (too few ready problems)", async () => {
    const t = tabel({ at: 1, room: 3, problems: [1, 2, 9, 10, 17] });
    t.set(recCProblem, pool.slice(0, 5));
    const { db, writes } = fake(t);
    await roomHooks.reroll(db, 3, 5, "topic", "lainnya");
    expect(writes).toHaveLength(0);
  });
});

describe("roomHooks.lcClose", () => {
  it("lets go of the claims a quiet PC left", async () => {
    const { db, executed } = fake(new Map());
    await roomHooks.lcClose(db, 3);
    expect(executed.length).toBe(2);
  });
});
