import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postcss, { type AtRule, type Node, type Root, type Rule } from "postcss";

/**
 * The phone and motion rules from the Phase 11 audit, held for every
 * stylesheet under src/ (and the <style> blocks of .astro files):
 * - a :hover rule sits inside @media (hover: hover) and (pointer: fine), so
 *   a tap never leaves a control lifted on a phone;
 * - no 100vh (the phone's address bar makes it taller than the screen);
 *   100dvh instead;
 * - no `transition: all`, which animates layout and colour it never meant to;
 * - no ease-in curve: interface motion starts fast and settles (ease-out),
 *   so a closing menu never seems to hesitate.
 */

const SRC = fileURLToPath(new URL("../../", import.meta.url));

// ---------- Helpers ----------
// ---------- Helpers ----------
// ---------- Helpers ----------

/** Every .css and .astro file under a folder */
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(css|astro)$/.test(name)) out.push(path);
  }
  return out;
}

/** The CSS of a file: the whole of a .css, the <style> blocks of a .astro */
function cssOf(path: string): string {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".css")) return text;
  // Only real blocks, which start a line; a comment may mention "<style>".
  return [...text.matchAll(/^\s*<style[^>]*>([\s\S]*?)<\/style>/gm)].map((m) => m[1]).join("\n");
}

/** True when a node sits inside a hover-capable media query */
function gated(node: Rule): boolean {
  let p: Node | undefined = node.parent as Node | undefined;
  for (; p; p = p.parent as Node | undefined) {
    if (
      p.type === "atrule" &&
      (p as AtRule).name === "media" &&
      /hover:\s*hover/.test((p as AtRule).params)
    )
      return true;
  }
  return false;
}

const SHEETS: [string, Root][] = files(SRC)
  .map((p) => [p.slice(SRC.length).replace(/\\/g, "/"), cssOf(p)] as const)
  .filter(([, css]) => css.trim() !== "")
  .map(([p, css]) => [p, postcss.parse(css)]);

/** "file: selector" for every match, so a failure names the spot */
function find(test: (decl: { prop: string; value: string }) => boolean): string[] {
  const hits: string[] = [];
  for (const [path, root] of SHEETS) {
    root.walkDecls((d) => {
      if (test(d))
        hits.push(`${path}: ${(d.parent as Rule).selector ?? "@"} { ${d.prop}: ${d.value} }`);
    });
  }
  return hits;
}

// ---------- Rules ----------
// ---------- Rules ----------
// ---------- Rules ----------

describe("stylesheet motion and phone rules", () => {
  it("finds the stylesheets", () => {
    expect(SHEETS.length).toBeGreaterThan(30);
  });

  it("gates every :hover rule behind a hover-capable pointer", () => {
    const hits: string[] = [];
    for (const [path, root] of SHEETS) {
      root.walkRules((r) => {
        if (r.selector.includes(":hover") && !gated(r)) hits.push(`${path}: ${r.selector}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("uses dvh, never 100vh", () => {
    expect(find((d) => /\b100vh\b/.test(d.value))).toEqual([]);
  });

  it("never transitions all properties", () => {
    expect(
      find(
        (d) =>
          (d.prop === "transition" && /(^|,)\s*all\b/.test(d.value)) ||
          (d.prop === "transition-property" && /\ball\b/.test(d.value)),
      ),
    ).toEqual([]);
  });

  it("never eases in", () => {
    expect(
      find(
        (d) =>
          /^(transition|animation)(-timing-function)?$/.test(d.prop) &&
          /\bease-in\b(?!-)/.test(d.value),
      ),
    ).toEqual([]);
  });
});
