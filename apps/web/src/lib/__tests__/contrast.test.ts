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
 * Phase 9: the web app's tokens are kosmik's tokens.css plus
 * src/styles/theme.css, whose :root block refreshes the dark theme and
 * whose :root[data-theme="light"] block is the Daylight sky theme. Both
 * themes are built here the way the cascade builds them and checked with
 * the same rules.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const tokensSource = read("../../../../../packages/kosmik/style/tokens.css");
const themeSource = read("../../styles/theme.css");

// ---------------------------------------------------------------------
// A tiny custom-property reader. Not a general CSS parser: both files are
// hand-written and simple enough (no nested rules inside a theme block, no
// semicolons inside any value) that a few regexes cover them.
// ---------------------------------------------------------------------

function extractDeclarations(css: string): Map<string, string> {
  const map = new Map<string, string>();
  // `[^;]+` deliberately spans newlines, which is what lets this match the
  // multi-line linear-gradient() values as one declaration.
  const re = /--([a-z0-9-]+):\s*([^;]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    map.set(m[1], m[2].replace(/\s+/g, " ").trim());
  }
  return map;
}

function themeBlock(selector: string): string {
  const start = themeSource.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`theme.css has no ${selector} block`);
  return themeSource.slice(start, themeSource.indexOf("\n}", start));
}

const DARK = new Map([
  ...extractDeclarations(tokensSource),
  ...extractDeclarations(themeBlock(":root")),
]);
const LIGHT = new Map([...DARK, ...extractDeclarations(themeBlock(':root[data-theme="light"]'))]);
const THEMES = [
  ["dark", DARK],
  ["light", LIGHT],
] as const;

function resolve(raw: Map<string, string>, value: string, seen: Set<string> = new Set()): string {
  const varRe = /var\(--([a-z0-9-]+)(?:,\s*([^)]+))?\)/gi;
  let out = value;
  let guard = 0;
  while (varRe.test(out)) {
    if (++guard > 20) throw new Error(`var() resolution did not converge for: ${value}`);
    varRe.lastIndex = 0;
    out = out.replace(varRe, (_m, name: string, fallback?: string) => {
      if (seen.has(name)) throw new Error(`circular var() reference on --${name}`);
      const next = raw.get(name);
      if (next === undefined) {
        if (fallback !== undefined) return fallback.trim();
        throw new Error(`--${name} is referenced but never declared`);
      }
      return resolve(raw, next, new Set(seen).add(name));
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// WCAG relative luminance and contrast. Colours with alpha are composited
// over the surface they are measured against, the way they are painted.
// ---------------------------------------------------------------------

type Rgba = [number, number, number, number];

function parseColor(value: string): Rgba {
  const v = value.trim();
  if (v.startsWith("#")) {
    const clean = v.slice(1);
    const full =
      clean.length === 3
        ? clean
            .split("")
            .map((c) => c + c)
            .join("")
        : clean.slice(0, 6);
    const int = parseInt(full, 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255, 1];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (!m) throw new Error(`not a colour: ${value}`);
  const [r, g, b, a = 1] = m[1].split(",").map((p) => Number(p.trim()));
  return [r, g, b, a];
}

function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function relLum([r, g, b]: Rgba): number {
  const chan = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrast(fg: Rgba, bg: Rgba): number {
  const la = relLum(over(fg, bg));
  const lb = relLum(bg);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const color = (raw: Map<string, string>, token: string) =>
  parseColor(resolve(raw, `var(${token})`));

const AA = 4.5;
const UI = 3;

// Every surface text and controls are drawn on; each ink has to clear the
// worst of them, not the easiest.
const SURFACES = ["--bg", "--bg-elevated", "--surface-1", "--surface-2", "--surface-3"];

const TEXT_INKS = [
  "--text",
  "--text-muted",
  "--text-faint",
  "--accent-bright",
  "--ok",
  "--warn",
  "--danger",
  "--gold",
  "--violet",
  "--teal",
  "--orange",
  "--red",
  "--yellow",
  ...Array.from({ length: 10 }, (_, i) => `--group-${i + 1}`),
];

describe.each(THEMES)("contrast contract, %s theme", (_name, raw) => {
  it.each(TEXT_INKS)(`%s clears ${AA}:1 on every surface`, (ink) => {
    const worst = Math.min(...SURFACES.map((s) => contrast(color(raw, ink), color(raw, s))));
    expect(worst).toBeGreaterThanOrEqual(AA);
  });

  it(`--control-border clears ${UI}:1 on every surface`, () => {
    const worst = Math.min(
      ...SURFACES.map((s) => contrast(color(raw, "--control-border"), color(raw, s))),
    );
    expect(worst).toBeGreaterThanOrEqual(UI);
  });

  it.each([
    ["--sel-ink", "--sel-bg"],
    ["--accent-ink", "--accent"],
    ["--invert-ink", "--invert-bg"],
    ["--danger-ink", "--danger-solid"],
  ])(`%s on %s clears ${AA}:1`, (ink, bg) => {
    expect(contrast(color(raw, ink), color(raw, bg))).toBeGreaterThanOrEqual(AA);
  });

  it("--sweep-surface clears 4.5:1 against --accent-ink at every sampled point", () => {
    const gradient = raw.get("sweep-surface");
    expect(gradient, "--sweep-surface must be declared").toBeDefined();
    const inner = gradient!.replace(/^linear-gradient\(/, "").replace(/\)$/, "");
    const stops = inner
      .split(",")
      .map((p) => p.trim())
      .filter((p) => !/^-?\d+(\.\d+)?deg$/.test(p))
      .map((p) => parseColor(resolve(raw, p)));
    const ink = color(raw, "--accent-ink");
    let worst = Infinity;
    for (let i = 0; i < stops.length - 1; i++) {
      for (let t = 0; t <= 20; t++) {
        const f = t / 20;
        const mixed: Rgba = [0, 1, 2]
          .map((c) => stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f)
          .concat(1) as Rgba;
        worst = Math.min(worst, contrast(ink, mixed));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(AA);
  });

  it("--sweep-surface never references a --neb-* token, unlike --sweep-ring which may", () => {
    // A text-bearing gradient must never resolve to a background-only hue.
    expect(raw.get("sweep-surface")!).not.toMatch(/--neb-/);
  });

  it("declares a hue for every group a session can hold (up to ten)", () => {
    for (let n = 1; n <= 10; n++) {
      expect(raw.has(`group-${n}`), `--group-${n} should be declared`).toBe(true);
    }
  });
});
