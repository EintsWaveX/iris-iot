import { afterEach, describe, expect, it, vi } from "vitest";
import { angka } from "../../src/lib/db.js";
import { teks } from "../../api/_lib/galat.js";
import { pantauJeda } from "../jeda.js";

afterEach(() => vi.useRealTimers());

describe("pantauJeda", () => {
  it("reports a timer that ran far later than due, and stays quiet otherwise", () => {
    vi.useFakeTimers();
    let jam = 0;
    const lapor = vi.fn();
    const henti = pantauJeda({ tiap: 500, ambang: 1000, lapor, sekarang: () => jam });
    jam += 500;
    vi.advanceTimersByTime(500); // on time
    expect(lapor).not.toHaveBeenCalled();
    jam += 500 + 3200; // the loop was held for 3.2 s
    vi.advanceTimersByTime(500);
    expect(lapor).toHaveBeenCalledWith(3200);
    henti();
  });
});

describe("angka", () => {
  it("takes a positive whole number and falls back otherwise", () => {
    expect(angka("40", 30)).toBe(40);
    expect(angka(undefined, 30)).toBe(30);
    expect(angka("0", 30)).toBe(30);
    expect(angka("-3", 30)).toBe(30);
    expect(angka("2.5", 30)).toBe(30);
    expect(angka("abc", 30)).toBe(30);
  });
});

describe("teks", () => {
  it("puts the driver's reason in front of drizzle's long message", () => {
    const e = new Error('Failed query: select "id" from "audit"', { cause: new Error("timeout exceeded when trying to connect") });
    expect(teks(e)).toBe('Error: [timeout exceeded when trying to connect] Failed query: select "id" from "audit"');
    expect(teks(new Error("plain"))).toBe("Error: plain");
  });
});
