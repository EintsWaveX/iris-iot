import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import {
  SWITCHES,
  formatReport,
  gain,
  isBaseline,
  noise,
  percentile,
  summarize,
  topScripts,
  type BenchReport,
  type StepResult,
} from "../perf-stats";

/**
 * Phase 0 benchmark maths and switches. The switch checks matter most: a switch whose selector no longer
 * exists would "turn off" nothing, and the report would blame the wrong feature.
 */

const SRC = fileURLToPath(new URL("../../", import.meta.url));

describe("percentile", () => {
  it("takes the nearest rank of an ascending list", () => {
    const l = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(l, 50)).toBe(5);
    expect(percentile(l, 95)).toBe(10);
    expect(percentile(l, 10)).toBe(1);
  });
  it("is 0 for an empty list", () => {
    expect(percentile([], 95)).toBe(0);
  });
});

describe("summarize", () => {
  it("drops the warm-up frame and reports fps, p50, p95, worst", () => {
    // 100 ms warm-up, then ten 20 ms frames: 50 fps, nothing slow
    const s = summarize([100, ...Array(10).fill(20)]);
    expect(s.frames).toBe(10);
    expect(s.fps).toBe(50);
    expect(s.p50).toBe(20);
    expect(s.p95).toBe(20);
    expect(s.worst).toBe(20);
    expect(s.slow).toBe(0);
    expect(s.throttled).toBe(false);
  });

  it("counts frames over 33.4 ms as slow", () => {
    const s = summarize([0, 16, 16, 16, 50, 50]);
    expect(s.slow).toBe(0.4);
    expect(s.worst).toBe(50);
  });

  it("matches the 9.8 fps run measured on the live site (p50 97 ms)", () => {
    const s = summarize([0, ...Array(40).fill(97.5), 187.8]);
    expect(s.fps).toBeGreaterThan(9);
    expect(s.fps).toBeLessThan(11);
    expect(s.throttled).toBe(false);
  });

  it("flags a tab the browser held to about one frame a second as throttled", () => {
    const s = summarize([0, 1000, 1001, 1000, 1000]);
    expect(s.throttled).toBe(true);
    expect(s.fps).toBeCloseTo(1, 0);
  });

  it("ignores NaN, zero and negative gaps, and survives no data", () => {
    expect(summarize([]).frames).toBe(0);
    expect(summarize([5]).frames).toBe(0);
    expect(summarize([0, NaN, 0, -3, 20, 20]).frames).toBe(2);
  });
});

describe("gain", () => {
  it("is the fps a switch gives back over the baseline", () => {
    const a = summarize([0, ...Array(10).fill(100)]);
    const b = summarize([0, ...Array(10).fill(50)]);
    expect(gain(a, b)).toBe(10);
  });
  it("is null when either side has no frames", () => {
    expect(gain(null, summarize([0, 16]))).toBeNull();
    expect(gain(summarize([0, 16, 16]), summarize([]))).toBeNull();
  });
});

describe("noise", () => {
  const at = (ms: number) => summarize([0, ...Array(10).fill(ms)]);
  it("is how far the untouched page moved between the first and last baseline", () => {
    expect(noise(at(10), at(8))).toBe(25); // 100 fps vs 125 fps
    expect(noise(at(10), at(10))).toBe(0);
  });
  it("is null when a baseline is missing, empty or throttled", () => {
    expect(noise(null, at(10))).toBeNull();
    expect(noise(at(10), summarize([]))).toBeNull();
    expect(noise(at(10), summarize([0, 1000, 1000, 1000]))).toBeNull();
  });
});

describe("SWITCHES", () => {
  it("starts with the untouched baseline and has unique ids", () => {
    expect(SWITCHES[0].id).toBe("baseline");
    expect(SWITCHES[0].css).toBe("");
    const ids = SWITCHES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("puts the everything-off ceiling before a second, untouched baseline that measures the noise", () => {
    expect(SWITCHES[SWITCHES.length - 2].id).toBe("bare");
    const end = SWITCHES[SWITCHES.length - 1];
    expect(end.id).toBe("baseline-end");
    expect(end.css).toBe("");
    expect(SWITCHES.filter((s) => isBaseline(s.id)).map((s) => s.id)).toEqual([
      "baseline",
      "baseline-end",
    ]);
  });

  it("is valid CSS where every declaration is !important", () => {
    for (const s of SWITCHES.filter((x) => x.css)) {
      const root = postcss.parse(s.css);
      let decls = 0;
      root.walkDecls((d) => {
        decls += 1;
        expect(d.important, `${s.id}: ${d.prop}`).toBe(true);
      });
      expect(decls, s.id).toBeGreaterThan(0);
    }
  });

  it("still points at things that exist in the stylesheets", () => {
    for (const s of SWITCHES) {
      for (const a of s.anchors) {
        const text = readFileSync(SRC + a.file, "utf8");
        expect(text.includes(a.text), `${s.id}: "${a.text}" not found in ${a.file}`).toBe(true);
      }
    }
  });
});

describe("topScripts", () => {
  it("adds up one script across frames and keeps the biggest few", () => {
    const top = topScripts(
      [
        { src: "a.js", ms: 40 },
        { src: "b.js", ms: 10 },
        { src: "a.js", ms: 35 },
        { src: "c.js", ms: 5 },
      ],
      2,
    );
    expect(top).toEqual([
      { src: "a.js", ms: 75 },
      { src: "b.js", ms: 10 },
    ]);
  });
});

describe("formatReport", () => {
  const frames = (ms: number) => summarize([0, ...Array(20).fill(ms)]);
  const step = (
    id: string,
    label: string,
    idleMs: number,
    scrollMs: number | null,
  ): StepResult => ({
    id,
    label,
    idle: frames(idleMs),
    scroll: scrollMs === null ? null : frames(scrollMs),
    loaf: { n: 2, totalMs: 300, scriptMs: 120, forcedMs: 10 },
  });
  const report: BenchReport = {
    v: 1,
    at: "2026-11-19T13:00:00.000Z",
    env: {
      path: "/dashboard",
      detail: "ldm",
      motionTier: "0",
      theme: "dark",
      signedIn: "yes",
      dpr: 2.625,
      viewport: "390x844",
      cores: 8,
      memoryGb: 4,
      saveData: false,
      userAgent: "UA",
      animations: 12,
      animationList: ["kit-sweep on button.btn.btn--primary::before x2"],
      backdropElements: 9,
      domNodes: 800,
      scrollable: true,
    },
    steps: [
      step("baseline", "As it is", 100, 125),
      step("no-backdrop", "No backdrop blur", 50, 50),
    ],
    scripts: [{ src: "https://x/y.js", ms: 80 }],
    startup: {
      loaf: { n: 3, totalMs: 1800, scriptMs: 1700, forcedMs: 20 },
      scripts: [{ src: "https://x/sky.js", ms: 1687 }],
    },
    notes: ["note one"],
  };
  const text = formatReport(report);

  it("shows each step with its fps, its gain over the baseline and its long frames", () => {
    expect(text).toContain("As it is");
    expect(text).toMatch(/No backdrop blur\s+idle 20 fps/);
    expect(text).toContain("[+10]");
    expect(text).toContain("long frames 2 (300 ms, script 120 ms)");
  });
  it("reports the freeze from the page load, with the script that caused it", () => {
    expect(text).toContain(
      "Page load froze the main thread: 3 long frames, 1800 ms (script 1700 ms) before the test",
    );
    expect(text).toContain("1687 ms  https://x/sky.js");
  });
  it("says nothing about startup when there was none or the browser cannot tell", () => {
    expect(formatReport({ ...report, startup: null })).not.toContain("Page load froze");
    const calm = { loaf: { n: 0, totalMs: 0, scriptMs: 0, forcedMs: 0 }, scripts: [] };
    expect(formatReport({ ...report, startup: calm })).not.toContain("Page load froze");
  });
  it("names the animations that were running", () => {
    expect(text).toContain("Running: kit-sweep on button.btn.btn--primary::before x2");
  });
  it("prints the noise when a second baseline exists, and never gives it a gain", () => {
    const withEnd = formatReport({
      ...report,
      steps: [...report.steps, step("baseline-end", "As it is (again)", 125, 125)],
    });
    expect(withEnd).toMatch(
      /Noise \(the untouched page, first vs last\): idle 2 fps, scroll 0 fps/,
    );
    const row = withEnd.split("\n").find((l) => l.startsWith("As it is (again)")) ?? "";
    expect(row).not.toMatch(/\[[+-]/);
  });
  it("lists the costly scripts and the notes", () => {
    expect(text).toContain("80 ms  https://x/y.js");
    expect(text).toContain("! note one");
  });
  it("carries the path but never a query or hash", () => {
    expect(text).toContain("/dashboard |");
    expect(text).not.toMatch(/[?#]/);
  });
  it("says n/a for scroll on a page that cannot scroll and never prints throttled fps", () => {
    const short = formatReport({ ...report, steps: [step("baseline", "As it is", 100, null)] });
    expect(short).toContain("scroll n/a");
    const held = formatReport({
      ...report,
      steps: [
        { ...step("baseline", "As it is", 100, 100), idle: summarize([0, 1000, 1000, 1000]) },
      ],
    });
    expect(held).toContain("THROTTLED");
  });
});
