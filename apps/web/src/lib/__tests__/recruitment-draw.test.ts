/**
 * The draw (EXAM-ENGINE 3): seeds from the edition's salt, the seeded
 * generator, a seat's questions per part, and the Live Coding problems.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Question, SingleQ } from "../recruitment/exam-types";
import { makePerm } from "../recruitment/formats";
import {
  DrawShort,
  drawPart,
  drawProblems,
  drawSeed,
  pickProtocol,
  poolShortfall,
  problemShortfall,
  rngFrom,
  roomSeed,
  topicAt,
  xoshiro128ss,
} from "../recruitment/draw";

const SALT = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

const q = (id: number): SingleQ => ({
  id,
  part: "logika",
  lang: "c",
  format: "single",
  version: 3,
  body: {
    prompt: `Soal ${id}`,
    options: ["a", "b", "c", "d"].map((x) => ({ id: `${x}${id}`, text: x })),
    shuffle: true,
  },
  answer: { correct: `a${id}` },
});
const POOL: Question[] = [11, 12, 13, 14, 21, 22, 23].map(q);
const PLAN = { shown: 3 };

describe("seeds", () => {
  it("drawSeed is HMAC-SHA256(salt, draw:<seat>:<part>) in hex", async () => {
    const want = createHmac("sha256", Buffer.from(SALT, "hex"))
      .update("draw:42:logika")
      .digest("hex");
    expect(await drawSeed(SALT, 42, "logika")).toBe(want);
  });

  it("roomSeed is HMAC-SHA256(salt, room:<id>)", async () => {
    const want = createHmac("sha256", Buffer.from(SALT, "hex")).update("room:7").digest("hex");
    expect(await roomSeed(SALT, 7)).toBe(want);
  });
});

describe("rngFrom", () => {
  it("is xoshiro128** (reference outputs from state 1, 2, 3, 4)", () => {
    const g = xoshiro128ss([1, 2, 3, 4]);
    expect([g.u32(), g.u32(), g.u32()]).toEqual([11520, 0, 5927040]);
  });

  it("is the same for the same seed and tags, different for other tags", async () => {
    const seed = await drawSeed(SALT, 1, "fitb");
    const a = rngFrom(seed, "q", 5);
    const b = rngFrom(seed, "q", 5);
    const c = rngFrom(seed, "q", 6);
    const xs = [a.u32(), a.u32(), a.u32()];
    expect([b.u32(), b.u32(), b.u32()]).toEqual(xs);
    expect([c.u32(), c.u32(), c.u32()]).not.toEqual(xs);
    for (const x of xs) expect(Number.isInteger(x) && x >= 0 && x < 2 ** 32).toBe(true);
  });

  it("spreads evenly enough", async () => {
    const g = rngFrom(await drawSeed(SALT, 9, "fitb"), "pick", "c");
    const bins = new Array(8).fill(0);
    for (let i = 0; i < 8000; i++) bins[g.u32() % 8]++;
    for (const b of bins) expect(b).toBeGreaterThan(850);
  });
});

describe("drawPart", () => {
  it("takes the plan's number of questions, all C, no repeats", async () => {
    const seed = await drawSeed(SALT, 3, "logika");
    const items = drawPart(seed, PLAN, POOL);
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.lang === "c")).toBe(true);
    expect(new Set(items.map((i) => i.q)).size).toBe(3);
    for (const it of items) expect(it.v).toBe(3);
  });

  it("does not depend on the pool's order", async () => {
    const seed = await drawSeed(SALT, 3, "logika");
    expect(drawPart(seed, PLAN, [...POOL].reverse())).toEqual(drawPart(seed, PLAN, POOL));
  });

  it("shuffles each question from the seat and the question only", async () => {
    const seed = await drawSeed(SALT, 3, "logika");
    for (const it of drawPart(seed, PLAN, POOL)) {
      const question = POOL.find((p) => p.id === it.q)!;
      expect(it.perm).toEqual(makePerm(question, rngFrom(seed, "q", it.q)));
    }
  });

  it("gives different seats different draws", async () => {
    const draws = new Set<string>();
    for (let seat = 1; seat <= 20; seat++) {
      const items = drawPart(await drawSeed(SALT, seat, "logika"), PLAN, POOL);
      draws.add(items.map((i) => i.q).join(","));
    }
    expect(draws.size).toBeGreaterThan(5);
  });

  it("showing the whole pool takes every question", async () => {
    const seed = await drawSeed(SALT, 3, "fitb");
    const items = drawPart(seed, { shown: 7 }, POOL);
    expect(items.map((i) => i.q).sort()).toEqual(POOL.map((p) => p.id).sort());
  });

  it("throws DrawShort when the pool has too few", async () => {
    const seed = await drawSeed(SALT, 3, "logika");
    expect(() => drawPart(seed, { shown: 8 }, POOL)).toThrow(DrawShort);
    try {
      drawPart(seed, { shown: 8 }, POOL);
    } catch (e) {
      expect(e).toMatchObject({ need: 8, have: 7 });
    }
  });
});

describe("poolShortfall", () => {
  it("is empty when the pool is enough, and says how short it is otherwise", () => {
    expect(poolShortfall(PLAN, POOL)).toEqual([]);
    expect(poolShortfall({ shown: 9 }, POOL)).toEqual([{ lang: "c", need: 9, have: 7 }]);
  });
});

describe("drawProblems (Live Coding)", () => {
  const POOLP = [
    ...[1, 2, 3, 4].map((id) => ({ id, tier: "easy" as const })),
    ...[5, 6, 7, 8].map((id) => ({ id, tier: "medium" as const })),
  ];
  const DRAW = { easy: 3, medium: 2 };

  it("deals 3 easy then 2 medium, no repeats", async () => {
    const hand = drawProblems(await drawSeed(SALT, 5, "livecode"), DRAW, POOLP);
    expect(hand).toHaveLength(5);
    expect(hand.slice(0, 3).every((id) => id <= 4)).toBe(true);
    expect(hand.slice(3).every((id) => id >= 5)).toBe(true);
    expect(new Set(hand).size).toBe(5);
  });

  it("is the same for the same seed, whatever the pool's order", async () => {
    const seed = await drawSeed(SALT, 5, "livecode");
    expect(drawProblems(seed, DRAW, [...POOLP].reverse())).toEqual(drawProblems(seed, DRAW, POOLP));
  });

  it("a reroll is another hand, and still deterministic", async () => {
    const seed = await drawSeed(SALT, 5, "livecode");
    const hands = [0, 1, 2, 3, 4, 5].map((n) => drawProblems(seed, DRAW, POOLP, n).join(","));
    expect(new Set(hands).size).toBeGreaterThan(1);
    expect(drawProblems(seed, DRAW, POOLP, 3).join(",")).toBe(hands[3]);
  });

  it("spreads over seats: every problem is dealt about as often as its tier says", async () => {
    const seen = new Map<number, number>();
    for (let seat = 1; seat <= 400; seat++)
      for (const id of drawProblems(await drawSeed(SALT, seat, "livecode"), DRAW, POOLP))
        seen.set(id, (seen.get(id) ?? 0) + 1);
    // each easy problem is in 3 of 4 hands (300 of 400), each medium in 2 of 4 (200 of 400)
    for (const id of [1, 2, 3, 4]) expect(seen.get(id)!).toBeGreaterThan(250);
    for (const id of [1, 2, 3, 4]) expect(seen.get(id)!).toBeLessThan(350);
    for (const id of [5, 6, 7, 8]) expect(seen.get(id)!).toBeGreaterThan(150);
    for (const id of [5, 6, 7, 8]) expect(seen.get(id)!).toBeLessThan(250);
  }, 20_000);

  it("throws DrawShort naming the tier that has too few", async () => {
    const seed = await drawSeed(SALT, 5, "livecode");
    const noMedium = POOLP.filter((p) => p.tier === "easy");
    expect(() => drawProblems(seed, DRAW, noMedium)).toThrow(DrawShort);
    try {
      drawProblems(seed, DRAW, noMedium);
    } catch (e) {
      expect(e).toMatchObject({ tier: "medium", need: 2, have: 0 });
    }
  });

  it("problemShortfall lists each tier with fewer ready problems than a seat is dealt", () => {
    expect(problemShortfall(DRAW, POOLP)).toEqual([]);
    expect(
      problemShortfall(
        DRAW,
        POOLP.filter((p) => p.id !== 5 && p.id !== 6 && p.id !== 7),
      ),
    ).toEqual([{ tier: "medium", need: 2, have: 1 }]);
  });
});

describe("topicAt", () => {
  it("deals every topic once per cycle, the same way every time", async () => {
    const seed = await roomSeed(SALT, 4);
    const ids = [8, 3, 5, 1];
    const first = [0, 1, 2, 3].map((k) => topicAt(seed, ids, k));
    const second = [4, 5, 6, 7].map((k) => topicAt(seed, ids, k));
    expect([...first].sort()).toEqual([1, 3, 5, 8]);
    expect([...second].sort()).toEqual([1, 3, 5, 8]);
    expect([0, 1, 2, 3].map((k) => topicAt(seed, [1, 3, 5, 8], k))).toEqual(first);
  });

  it("throws on an empty pool", async () => {
    expect(() => topicAt("ab".repeat(32), [], 0)).toThrow();
  });
});

describe("pickProtocol", () => {
  const seed = "cd".repeat(32);

  it("takes the least used of the topic's protocols", () => {
    expect(pickProtocol(["ble", "httpws", "mqtt"], { ble: 2, httpws: 1, mqtt: 2 }, seed, 0)).toBe(
      "httpws",
    );
    expect(pickProtocol(["ble", "mqtt"], { ble: 2, httpws: 0, mqtt: 1 }, seed, 0)).toBe("mqtt");
  });

  it("breaks ties from the room seed and k, deterministically", () => {
    const seen = new Set<string>();
    for (let k = 0; k < 30; k++) {
      const p = pickProtocol(["ble", "httpws", "mqtt"], {}, seed, k);
      expect(pickProtocol(["ble", "httpws", "mqtt"], {}, seed, k)).toBe(p);
      seen.add(p);
    }
    expect(seen.size).toBe(3);
  });

  it("leaves out exclude, unless it is the only one", () => {
    for (let k = 0; k < 10; k++)
      expect(pickProtocol(["ble", "mqtt"], {}, seed, k, "ble")).toBe("mqtt");
    expect(pickProtocol(["ble"], {}, seed, 0, "ble")).toBe("ble");
  });

  it("keeps a room balanced over many deals", () => {
    const used = { ble: 0, httpws: 0, mqtt: 0 };
    for (let k = 0; k < 30; k++) used[pickProtocol(["ble", "httpws", "mqtt"], used, seed, k)]++;
    expect(used).toEqual({ ble: 10, httpws: 10, mqtt: 10 });
  });
});
