import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

/**
 * The blur diet (perf work, Nov 2026): real backdrop blur only at High Detail, on a short list of elements.
 * styles/plates.css decides by selector, so these tests parse it and hold the three things that make it work:
 * the kill rules cover every tier and pseudo-element, the High Detail list stays short, and the plates stay opaque.
 */

const css = readFileSync(
  fileURLToPath(new URL("../../styles/plates.css", import.meta.url)),
  "utf8",
);
const root = postcss.parse(css);

function rulesWith(prop: string) {
  const out: { selectors: string[]; decls: Record<string, string> }[] = [];
  root.walkRules((r) => {
    const decls: Record<string, string> = {};
    r.walkDecls((d) => {
      if (d.parent === r) decls[d.prop] = d.value + (d.important ? " !important" : "");
    });
    if (prop in decls)
      out.push({ selectors: r.selector.split(/,\s*(?![^()]*\))/).map((s) => s.trim()), decls });
  });
  return out;
}

describe("plates.css kills the backdrop blur", () => {
  const kills = rulesWith("backdrop-filter").filter((r) =>
    r.decls["backdrop-filter"].startsWith("none"),
  );
  const selectors = kills.flatMap((k) => k.selectors);

  it("uses !important, so the ~100 older declarations cannot win by specificity or load order", () => {
    expect(kills.length).toBeGreaterThanOrEqual(2);
    for (const k of kills) {
      expect(k.decls["backdrop-filter"]).toMatch(/^none\s*!important$/);
      expect(k.decls["-webkit-backdrop-filter"]).toMatch(/^none\s*!important$/);
    }
  });

  it("covers Low Detail and Normal (anything that is not hd), and motion tier 0", () => {
    expect(selectors).toContain(':root:not([data-detail="hd"]) *');
    expect(selectors).toContain(':root[data-motion-tier="0"] *');
  });

  it("covers ::before and ::after at every tier, because some blurs live on pseudo-elements", () => {
    for (const p of ["::before", "::after"]) {
      expect(selectors).toContain(`:root:not([data-detail="hd"]) *${p}`);
      expect(selectors).toContain(`:root[data-motion-tier="0"] *${p}`);
      expect(selectors).toContain(`:root[data-detail="hd"] *${p}`);
    }
  });

  it("at High Detail spares only a short list of elements", () => {
    const hd = selectors.find((s) => /:not\(\s*\.appnav/.test(s));
    expect(hd).toBeDefined();
    const spared = [...hd!.matchAll(/:not\(([^)]*)\)\s*$/g)][0][1].split(",").map((s) => s.trim());
    // The navbar, the phone bottom bar, whichever overlay is open, and the page heading: never more than five
    expect(spared.length).toBeLessThanOrEqual(6);
    expect(spared).toEqual(
      expect.arrayContaining([".appnav", ".dialog__panel", ".drawer", ".popover__panel"]),
    );
    // Nothing else may join it without this test changing: a card, a list or a table must never be blurred
    const allowed = [
      ".appnav",
      ".appbar",
      ".dialog__panel",
      ".drawer",
      ".popover__panel",
      ".page-header",
    ];
    for (const s of spared) expect(allowed, s).toContain(s);
  });
});

describe("the plates stay opaque enough to read without a blur", () => {
  const alphaOf = (decl: string) => {
    const layers = [...decl.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map((m) => Number(m[1]));
    // The base colour is the last rgba in a token (the gradient before it only adds a highlight)
    return layers[layers.length - 1];
  };
  const tokens: Record<string, Record<string, string>> = { dark: {}, light: {} };
  root.walkRules((r) => {
    if (!/--glass-|--nav-bg|--panel-bg/.test(r.toString())) return;
    const which = r.selector.includes('data-theme="light"') ? "light" : "dark";
    r.walkDecls((d) => {
      if (d.prop.startsWith("--")) tokens[which][d.prop] = d.value;
    });
  });

  it("defines the same tokens for both themes", () => {
    expect(Object.keys(tokens.dark).sort()).toEqual(Object.keys(tokens.light).sort());
    expect(Object.keys(tokens.dark)).toEqual(
      expect.arrayContaining(["--glass-panel", "--glass-frost", "--glass-clear", "--nav-bg"]),
    );
  });

  it.each(["dark", "light"])(
    "%s: every plate is at least 86 % opaque (base colour alone, or on top of white for light)",
    (theme) => {
      for (const [name, v] of Object.entries(tokens[theme])) {
        const base = alphaOf(v);
        // Light plates also have a white gradient on top, so judge them by the stronger of the layers
        const top = [...v.matchAll(/rgba\(255, 255, 255, ([\d.]+)\)/g)].map((m) => Number(m[1]));
        const effective =
          theme === "light" && top.length >= 3
            ? 1 - (1 - Math.min(top[0], top[1])) * (1 - top[2])
            : base;
        expect(effective, name).toBeGreaterThanOrEqual(0.86);
      }
    },
  );
});

describe("no other stylesheet declares a blur (Phase 2 deleted them)", () => {
  const ALLOWED = /\.(appnav|appbar|dialog__panel|drawer|popover__panel|page-header)\b/;
  const dir = fileURLToPath(new URL("../..", import.meta.url));
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(css|astro)$/.test(e.name) && !p.endsWith("plates.css")) files.push(p);
    }
  };
  walk(dir);

  it("a backdrop-filter that blurs sits only on the High Detail allowlist", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (!src.includes("backdrop-filter")) continue;
      const css = f.endsWith(".astro")
        ? [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n")
        : src;
      postcss.parse(css).walkDecls(/^(-webkit-)?backdrop-filter$/, (d) => {
        if (d.value.trim() === "none") return;
        const sel = d.parent && "selector" in d.parent ? String(d.parent.selector) : "";
        if (!ALLOWED.test(sel))
          bad.push(`${f.slice(dir.length)}: ${sel.replace(/\s+/g, " ").slice(0, 80)}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
