import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Enforces the contrast contract from docs/design-system.md against the
 * live token values, not a comment promising they were checked once.
 * Modeled on the sibling D'Magis project's tokens.test.ts, which caught
 * exactly this class of bug there: an ink measured against the easiest
 * surface it happens to be used on, rather than the worst one.
 *
 * This is what turns the primary-button contrast bug (Button.astro's own
 * header once explained it, before the fix: --sweep's --neb-violet and
 * --neb-teal stops measured 1.55:1 and 1.65:1 against the near-black label
 * ink painted on top of them, so the label went nearly invisible twice per
 * hover loop) into a build failure if the same mistake is ever
 * reintroduced, instead of something only a real hover would reveal.
 */

const TOKENS_PATH = fileURLToPath(
  new URL("../../../../../packages/kosmik/style/tokens.css", import.meta.url),
);
const tokensSource = readFileSync(TOKENS_PATH, "utf8");

// ---------------------------------------------------------------------
// A tiny custom-property reader. Not a general CSS parser: tokens.css is
// hand-written and simple enough (no nested rules inside :root, no
// semicolons inside any value) that two regexes cover it, and a real
// parser dependency would be more code to trust than the thing being
// checked.
// ---------------------------------------------------------------------

function extractDeclarations(css: string): Map<string, string> {
  const map = new Map<string, string>();
  // `[^;]+` deliberately spans newlines (a negated character class isn't
  // affected by the lack of the `s` flag), which is what lets this match
  // the multi-line linear-gradient() values as one declaration.
  const re = /--([a-z0-9-]+):\s*([^;]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    map.set(m[1], m[2].replace(/\s+/g, " ").trim());
  }
  return map;
}

const raw = extractDeclarations(tokensSource);

function resolve(value: string, seen: Set<string> = new Set()): string {
  const varRe = /var\(--([a-z0-9-]+)(?:,\s*([^)]+))?\)/gi;
  let out = value;
  let guard = 0;
  while (varRe.test(out)) {
    if (++guard > 20) {
      throw new Error(`var() resolution did not converge for: ${value}`);
    }
    varRe.lastIndex = 0;
    out = out.replace(varRe, (_m, name: string, fallback?: string) => {
      if (seen.has(name)) throw new Error(`circular var() reference on --${name}`);
      const next = raw.get(name);
      if (next === undefined) {
        if (fallback !== undefined) return fallback.trim();
        throw new Error(`--${name} is referenced but never declared in tokens.css`);
      }
      return resolve(next, new Set(seen).add(name));
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// WCAG relative luminance and contrast, the real piecewise sRGB decode
// rather than a linear approximation — the same formula the portfolio's
// sky.js contrast floor uses, per Phase 5's plan.
// ---------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean.slice(0, 6);
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function relLum([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrast(aHex: string, bHex: string): number {
  const la = relLum(hexToRgb(aHex));
  const lb = relLum(hexToRgb(bHex));
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function isHex(value: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(value.trim());
}

const AA = 4.5;

// ---------------------------------------------------------------------
// 1. Ink on surface — every pair checked against the WORST surface it is
//    actually drawn on, per the rule the D'Magis review learned the hard
//    way: a colour used on more than one surface has to clear the worst
//    of them, not the easiest.
// ---------------------------------------------------------------------

const SURFACES = ["--bg", "--bg-elevated"] as const;

const INK_SURFACE_PAIRS: { ink: string; surfaces: readonly string[] }[] = [
  { ink: "--text", surfaces: SURFACES },
  { ink: "--text-muted", surfaces: SURFACES },
  { ink: "--text-faint", surfaces: SURFACES },
  { ink: "--group-1", surfaces: SURFACES },
  { ink: "--group-2", surfaces: SURFACES },
  { ink: "--group-3", surfaces: SURFACES },
  { ink: "--group-4", surfaces: SURFACES },
  { ink: "--group-5", surfaces: SURFACES },
];

describe("contrast contract: ink on surface", () => {
  for (const { ink, surfaces } of INK_SURFACE_PAIRS) {
    it(`${ink} clears ${AA}:1 on the worst of ${surfaces.join(", ")}`, () => {
      const inkHex = resolve(`var(${ink})`);
      expect(isHex(inkHex)).toBe(true);
      const ratios = surfaces.map((s) => contrast(inkHex, resolve(`var(${s})`)));
      const worst = Math.min(...ratios);
      expect(worst).toBeGreaterThanOrEqual(AA);
    });
  }
});

// ---------------------------------------------------------------------
// 2. Text-bearing gradients — sampled along their whole length, not just
//    at their declared stops, because the failure mode this test exists
//    to catch is a dark patch BETWEEN two light stops, which a
//    stops-only check would miss.
// ---------------------------------------------------------------------

function gradientHexStops(gradientValue: string): string[] {
  const inner = gradientValue.replace(/^linear-gradient\(/, "").replace(/\)$/, "");
  const parts = inner.split(",").map((p) => p.trim());
  const stops = parts.filter((p) => !/^-?\d+(\.\d+)?deg$/.test(p));
  return stops.map((s) => resolve(s));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function worstContrastAlongGradient(
  hexStops: string[],
  against: string,
  steps = 20,
): { worst: number; at: string } {
  let worst = Infinity;
  let worstHex = hexStops[0];
  for (let i = 0; i < hexStops.length - 1; i++) {
    const a = hexToRgb(hexStops[i]);
    const b = hexToRgb(hexStops[i + 1]);
    for (let t = 0; t <= steps; t++) {
      const frac = t / steps;
      const mixed: [number, number, number] = [
        lerp(a[0], b[0], frac),
        lerp(a[1], b[1], frac),
        lerp(a[2], b[2], frac),
      ];
      const mixedHex =
        "#" + mixed.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
      const c = contrast(mixedHex, against);
      if (c < worst) {
        worst = c;
        worstHex = mixedHex;
      }
    }
  }
  return { worst, at: worstHex };
}

describe("contrast contract: text-bearing gradients", () => {
  it("--sweep-surface clears 4.5:1 against --accent-ink at every sampled point, not just its declared stops", () => {
    const gradient = raw.get("sweep-surface");
    expect(gradient, "--sweep-surface must be declared in tokens.css").toBeDefined();
    const stops = gradientHexStops(gradient!);
    expect(stops.every(isHex)).toBe(true);
    const inkHex = resolve("var(--accent-ink)");
    const { worst, at } = worstContrastAlongGradient(stops, inkHex);
    expect(worst, `worst point sampled was ${at} at ${worst.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      AA,
    );
  });

  it("--sweep-surface never references a --neb-* token, unlike --sweep-ring which may", () => {
    // The bug this whole file exists to prevent, stated directly: a
    // text-bearing gradient must never resolve to a background-only hue.
    // tokens.css's own NEBULA comment says "never put text on these" —
    // this makes that a check rather than a warning.
    const surfaceRaw = raw.get("sweep-surface")!;
    expect(surfaceRaw).not.toMatch(/--neb-/);
  });
});

// ---------------------------------------------------------------------
// 3. Group hue count — the practicum is fixed at five groups for the
//    whole term, across every module. Groups 6 and 7 are a deletion, not
//    a renumbering, so this both confirms the five survivors exist and
//    guards against either deleted one quietly coming back.
// ---------------------------------------------------------------------

describe("contrast contract: group hue count", () => {
  it("declares exactly groups 1 through 5", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(raw.has(`group-${n}`), `--group-${n} should be declared`).toBe(true);
    }
    for (const n of [6, 7, 8]) {
      expect(raw.has(`group-${n}`), `--group-${n} should have been deleted`).toBe(false);
    }
  });
});
