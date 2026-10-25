/** The Live Coding deal (EXAM-ENGINE 3.4, 9.1): topics like cards, balanced protocols, re-rolls. */
import { describe, expect, it } from "vitest";
import { dealProtocol, dealTopic, rerollProtocol, rerollTopic } from "../recruitment/lc-deal";

const SEED = "ab".repeat(32);
const READY = [11, 12, 13, 14];

describe("dealTopic", () => {
  it("gives every ready topic once before any repeats", () => {
    const first = [0, 1, 2, 3].map((k) => dealTopic(SEED, READY, k));
    expect([...first].sort()).toEqual(READY);
    const second = [4, 5, 6, 7].map((k) => dealTopic(SEED, READY, k));
    expect([...second].sort()).toEqual(READY);
  });
  it("is the same card for the same k", () => {
    expect(dealTopic(SEED, READY, 5)).toBe(dealTopic(SEED, READY, 5));
  });
  it("throws when no topic is ready", () => {
    expect(() => dealTopic(SEED, [], 0)).toThrow();
  });
});

describe("rerollTopic", () => {
  it("takes the next card that differs from the seat's topic and says how many cards it used", () => {
    const k = 0;
    const current = dealTopic(SEED, READY, k);
    const r = rerollTopic(SEED, READY, k, current);
    expect(r.topicId).not.toBe(current);
    expect(r.used).toBeGreaterThanOrEqual(1);
    expect(r.topicId).toBe(dealTopic(SEED, READY, k + r.used - 1));
  });
  it("skips a card equal to the current one", () => {
    // find a k whose next card equals the current topic
    for (let k = 0; k < 8; k++) {
      const cur = dealTopic(SEED, READY, k);
      const r = rerollTopic(SEED, READY, k, cur);
      expect(r.topicId).not.toBe(cur);
    }
  });
  it("with one ready topic it can only deal that one", () => {
    expect(rerollTopic(SEED, [7], 3, 7)).toEqual({ topicId: 7, used: 1 });
  });
});

describe("dealProtocol", () => {
  const all = ["ble", "httpws", "mqtt"] as const;
  it("takes the least used protocol the topic fits", () => {
    expect(
      dealProtocol(["ble", "httpws", "mqtt"], [...all], { ble: 2, httpws: 0, mqtt: 1 }, SEED, 0),
    ).toBe("httpws");
    expect(dealProtocol(["ble", "mqtt"], [...all], { ble: 3, mqtt: 1 }, SEED, 0)).toBe("mqtt");
  });
  it("uses only protocols the edition enables", () => {
    expect(dealProtocol(["ble", "httpws", "mqtt"], ["mqtt"], {}, SEED, 0)).toBe("mqtt");
  });
  it("falls back to the edition's list when the topic fits none of them", () => {
    expect(dealProtocol(["ble"], ["mqtt", "httpws"], {}, SEED, 0)).toMatch(/mqtt|httpws/);
  });
  it("breaks a tie from the seed and k, the same way every time", () => {
    const a = dealProtocol(["ble", "httpws", "mqtt"], [...all], {}, SEED, 3);
    expect(dealProtocol(["ble", "httpws", "mqtt"], [...all], {}, SEED, 3)).toBe(a);
  });
});

describe("rerollProtocol", () => {
  it("never gives the current protocol when another fits", () => {
    for (let k = 0; k < 10; k++)
      expect(
        rerollProtocol("mqtt", ["ble", "httpws", "mqtt"], ["ble", "httpws", "mqtt"], {}, SEED, k),
      ).not.toBe("mqtt");
  });
  it("keeps the current one when it is the only fit", () => {
    expect(rerollProtocol("mqtt", ["mqtt"], ["ble", "httpws", "mqtt"], {}, SEED, 0)).toBe("mqtt");
  });
});
