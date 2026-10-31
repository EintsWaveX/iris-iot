/**
 * The exam config's maths (B7.1): what each part is worth, how an older stored
 * config is read, and when a config is refused.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_EXAM_CONFIG, type ExamConfig } from "../recruitment/exam-types";
import {
  capsOf,
  dealtCount,
  dealtPoints,
  minutesOf,
  upgradeConfig,
  validateConfig,
} from "../recruitment/exam-config";

const fresh = (): ExamConfig => structuredClone(DEFAULT_EXAM_CONFIG);
const fields = (c: ExamConfig) => validateConfig(c).map((e) => `${e.field}:${e.kode}`);

describe("capsOf", () => {
  it("the default is 1600 written (640, 640, 320) and 2400 Live Coding, out of 4000", () => {
    expect(capsOf(DEFAULT_EXAM_CONFIG)).toEqual({
      parts: { logika: 640, fitb: 640, kodingan: 320 },
      written: 1600,
      livecode: 2400,
      total: 4000,
    });
  });

  it("always adds up to 4000 in whole points, whatever the split", () => {
    for (const lc of [0, 1, 33, 50, 60, 77, 100]) {
      for (const shares of [
        [40, 40, 20],
        [34, 33, 33],
        [1, 1, 98],
        [0, 50, 50],
      ]) {
        const c = fresh();
        c.weights = { written: 100 - lc, livecode: lc };
        c.shares = { logika: shares[0], fitb: shares[1], kodingan: shares[2] };
        const k = capsOf(c);
        expect(k.written + k.livecode).toBe(4000);
        expect(k.parts.logika + k.parts.fitb + k.parts.kodingan).toBe(k.written);
        for (const v of Object.values(k.parts)) expect(Number.isInteger(v) && v >= 0).toBe(true);
      }
    }
  });

  it("a 50 / 50 split gives 2000 each, with the written share cut 40 / 40 / 20", () => {
    const c = fresh();
    c.weights = { written: 50, livecode: 50 };
    expect(capsOf(c)).toMatchObject({
      parts: { logika: 800, fitb: 800, kodingan: 400 },
      written: 2000,
      livecode: 2000,
    });
  });
});

describe("the Live Coding hand", () => {
  it("3 easy at 400 and 2 medium at 600 are 5 problems worth exactly the Live Coding share", () => {
    expect(dealtCount(DEFAULT_EXAM_CONFIG)).toBe(5);
    expect(dealtPoints(DEFAULT_EXAM_CONFIG)).toBe(2400);
    expect(dealtPoints(DEFAULT_EXAM_CONFIG)).toBe(capsOf(DEFAULT_EXAM_CONFIG).livecode);
  });
  it("minutesOf reads a written part or Live Coding", () => {
    expect(minutesOf(DEFAULT_EXAM_CONFIG, "logika")).toBe(15);
    expect(minutesOf(DEFAULT_EXAM_CONFIG, "livecode")).toBe(60);
  });
  it("the default evening is 105 minutes of parts in a 120 minute budget", () => {
    const c = DEFAULT_EXAM_CONFIG;
    const total = c.order.reduce((sum, p) => sum + minutesOf(c, p), 0);
    expect(total).toBe(105);
    expect(c.budgetMin - total).toBe(15);
  });
});

describe("upgradeConfig", () => {
  it("reads the current shape back as it is", () => {
    const c = fresh();
    c.parts.fitb.minutes = 20;
    c.parts.fitb.shown = 12;
    c.weights = { written: 30, livecode: 70 };
    c.livecode.runLimit = 25;
    expect(upgradeConfig(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it("reads an old v1 config (Mikro, per-language counts, protocols) as the current one", () => {
    const old = {
      v: 1,
      budgetMin: 130,
      order: ["logika", "fitb", "kodingan", "mikro", "livecode"],
      parts: {
        logika: {
          minutes: 12,
          counts: { cpp: { shown: 10, pool: 20 }, py: { shown: 5, pool: 10 } },
        },
        fitb: { minutes: 15, counts: { cpp: { shown: 8, pool: 16 } } },
        kodingan: { minutes: 10, counts: { py: { shown: 5, pool: 10 } } },
        mikro: { minutes: 20, counts: { any: { shown: 5, pool: 10 } } },
      },
      livecode: { minutes: 45, protocols: ["ble", "httpws", "mqtt"], graders: 2 },
    };
    const c = upgradeConfig(old);
    expect(c.v).toBe(2);
    expect(c.budgetMin).toBe(130);
    expect(c.order).toEqual(DEFAULT_EXAM_CONFIG.order);
    expect(c.parts.logika).toEqual({ minutes: 12, shown: 10, pool: 20 });
    expect(c.parts.fitb).toEqual({ minutes: 15, shown: 8, pool: 16 });
    expect(c.parts.kodingan).toEqual({ minutes: 10, shown: 5, pool: 10 });
    expect("mikro" in c.parts).toBe(false);
    // the old rubric Live Coding has no counterpart: every Live Coding and score setting is the default
    expect(c.livecode).toEqual(DEFAULT_EXAM_CONFIG.livecode);
    expect(c.weights).toEqual(DEFAULT_EXAM_CONFIG.weights);
    expect(validateConfig(c)).toEqual([]);
  });

  it("never throws: junk falls back to the default for that field", () => {
    expect(upgradeConfig(null)).toEqual(DEFAULT_EXAM_CONFIG);
    expect(upgradeConfig("x")).toEqual(DEFAULT_EXAM_CONFIG);
    expect(upgradeConfig({ v: 2, budgetMin: "lots", parts: { logika: { minutes: -5 } } })).toEqual(
      DEFAULT_EXAM_CONFIG,
    );
    expect(upgradeConfig({ v: 2, weights: { written: 70, livecode: 70 } }).weights).toEqual(
      DEFAULT_EXAM_CONFIG.weights,
    );
  });

  it("does not hand back the shared default object", () => {
    const c = upgradeConfig(null);
    c.parts.logika.minutes = 1;
    expect(DEFAULT_EXAM_CONFIG.parts.logika.minutes).toBe(15);
  });
});

describe("validateConfig (scores and Live Coding)", () => {
  it("accepts the default and a changed split that still adds up", () => {
    expect(validateConfig(DEFAULT_EXAM_CONFIG)).toEqual([]);
    const c = fresh();
    c.weights = { written: 50, livecode: 50 };
    c.livecode.points = { easy: 300, medium: 550 };
    expect(capsOf(c).livecode).toBe(2000);
    expect(dealtPoints(c)).toBe(2000);
    expect(validateConfig(c)).toEqual([]);
  });

  it("the weights and the shares must each add up to 100", () => {
    const c = fresh();
    c.weights = { written: 40, livecode: 70 };
    c.shares = { logika: 40, fitb: 40, kodingan: 30 };
    expect(fields(c)).toEqual(["weights:bobot_salah", "shares:bobot_salah"]);
  });

  it("the dealt problems must be worth exactly the Live Coding share", () => {
    const c = fresh();
    c.weights = { written: 50, livecode: 50 };
    expect(fields(c)).toEqual(["livecode.points:poin_tidak_cocok"]);
  });

  it("checks the run limit, the workers, the draw and the points", () => {
    const c = fresh();
    c.livecode.runLimit = -1;
    c.livecode.workers = 0;
    c.livecode.draw.easy = -2;
    c.livecode.points.medium = 0;
    expect(fields(c)).toEqual([
      "livecode.runLimit:batas_salah",
      "livecode.workers:jumlah_salah",
      "livecode.draw.easy:jumlah_salah",
      "livecode.points.medium:poin_salah",
    ]);
  });
});
