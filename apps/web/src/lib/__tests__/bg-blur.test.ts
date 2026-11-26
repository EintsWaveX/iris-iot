import { describe, expect, it } from "vitest";
import { BG_BLUR_DEFAULT, parseBgBlur } from "../prefs";

describe("parseBgBlur", () => {
  it("is 60 when nothing was chosen", () => {
    expect(BG_BLUR_DEFAULT).toBe(60);
    expect(parseBgBlur(null)).toBe(60);
    expect(parseBgBlur("")).toBe(60);
    expect(parseBgBlur("  ")).toBe(60);
  });

  it("falls back to 60 for anything that is not a number", () => {
    expect(parseBgBlur("lots")).toBe(60);
    expect(parseBgBlur("NaN")).toBe(60);
    expect(parseBgBlur("Infinity")).toBe(60);
  });

  it("keeps a real choice, including 0, rounded and held between 0 and 100", () => {
    expect(parseBgBlur("0")).toBe(0);
    expect(parseBgBlur("35")).toBe(35);
    expect(parseBgBlur("42.6")).toBe(43);
    expect(parseBgBlur("100")).toBe(100);
    expect(parseBgBlur("250")).toBe(100);
    expect(parseBgBlur("-20")).toBe(0);
  });
});
