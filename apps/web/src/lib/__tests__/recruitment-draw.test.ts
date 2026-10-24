/**
 * The draw (EXAM-ENGINE 3): seeds from the edition's salt, the seeded
 * generator, a seat's questions per part, and the Live Coding deals.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PartCount, Question, SingleQ } from "../recruitment/exam-types";
import { makePerm } from "../recruitment/formats";
import {
  DrawShort,
  drawPart,
  drawSeed,
  pickProtocol,
  poolShortfall,
  rngFrom,
  roomSeed,
  topicAt,
  xoshiro128ss,
} from "../recruitment/draw";

const SALT = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

const q = (id: number, lang: "cpp" | "py"): SingleQ => ({
  id,
  part: "logika",
  lang,
  format: "single",
  version: 3,
  body: {
    prompt: `Soal ${id}`,
    options: ["a", "b", "c", "d"].map((x) => ({ id: `${x}${id}`, text: x })),
    shuffle: true,
  },
  answer: { correct: `a${id}` },
});
const POOL: Question[] = [
  q(11, "cpp"),
  q(12, "cpp"),
  q(13, "cpp"),
  q(14, "cpp"),
  q(21, "py"),
  q(22, "py"),
  q(23, "py"),
];
const COUNTS: Partial<Record<"cpp" | "py" | "any", PartCount>> = {
  cpp: { shown: 2, pool: 4 },
  py: { shown: 1, pool: 3 },
};

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
    const g = rngFrom(await drawSeed(SALT, 9, "mikro"), "pick", "any");
    const bins = new Array(8).fill(0);
    for (let i = 0; i < 8000; i++) bins[g.u32() % 8]++;
    for (const b of bins) expect(b).toBeGreaterThan(850);
  });
});

describe("drawPart", () => {
  it("takes the counts per language, C++ first, no repeats", async () => {
    const seed = await drawSeed(SALT, 3, "logika");
    const items = drawPart(seed, COUNTS, POOL);
    expect(items.map((i) => i.lang)).toEqual(["cpp", "cpp", "py"]);
    expect(new Set(items.map((i) => i.q)).size).toBe(3);
    for (const it of items) expect(it.v).toBe(3);
  });

  it("does not depend on the pool's order", async () => {
    const seed = await drawSeed(SALT, 3, "logika");
    expect(drawPart(seed, COUNTS, [...POOL].reverse())).toEqual(drawPart(seed, COUNTS, POOL));
  });

  it("shuffles each question from the seat and the question only", async () => {
    const seed = await drawSeed(SALT, 3, "logika");
    for (const it of drawPart(seed, COUNTS, POOL)) {
      const question = POOL.find((p) => p.id === it.q)!;
      expect(it.perm).toEqual(makePerm(question, rngFrom(seed, "q", it.q)));
    }
  });

  it("gives different seats different draws", async () => {
    const draws = new Set<string>();
    for (let seat = 1; seat <= 20; seat++) {
      const items = drawPart(await drawSeed(SALT, seat, "logika"), COUNTS, POOL);
      draws.add(items.map((i) => i.q).join(","));
    }
    expect(draws.size).toBeGreaterThan(5);
  });

  it("an any count takes questions of every language", async () => {
    const seed = await drawSeed(SALT, 3, "mikro");
    const items = drawPart(seed, { any: { shown: 7, pool: 10 } }, POOL);
    expect(items.map((i) => i.q).sort()).toEqual(POOL.map((p) => p.id).sort());
    expect(items.every((i) => i.lang === "any")).toBe(true);
  });

  it("throws DrawShort when a language has too few", async () => {
    const seed = await drawSeed(SALT, 3, "logika");
    expect(() => drawPart(seed, { cpp: { shown: 5, pool: 5 } }, POOL)).toThrow(DrawShort);
  });
});

describe("poolShortfall", () => {
  it("lists each language that has fewer than shown", () => {
    expect(poolShortfall(COUNTS, POOL)).toEqual([]);
    expect(poolShortfall({ cpp: { shown: 6, pool: 6 }, py: { shown: 3, pool: 3 } }, POOL)).toEqual([
      { lang: "cpp", need: 6, have: 4 },
    ]);
    expect(poolShortfall({ any: { shown: 9, pool: 9 } }, POOL)).toEqual([
      { lang: "any", need: 9, have: 7 },
    ]);
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
