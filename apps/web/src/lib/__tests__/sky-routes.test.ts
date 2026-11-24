import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The painted sky is switched off on the pages that most need their frames (perf work, Nov 2026): the exam room,
 * the QR wall and attendance on a phone. Off means nothing is built, drawn or animated there. The Konsol keeps its
 * background (sky="still", 22 Nov 2026): the sky is painted once and never moves. These hold the wiring: Base's
 * `sky` prop, the views that use it, the CSS rules, and the scripts that honour it.
 */

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

describe("Base.astro", () => {
  const base = read("layouts/Base.astro");
  it("has a sky prop that defaults to on, stamps html[data-sky=off] when it is false and still when it is still", () => {
    expect(base).toMatch(/sky\?: boolean \| "still"/);
    expect(base).toMatch(/sky = true,/);
    expect(base).toMatch(
      /data-sky=\{sky === false \? "off" : sky === "still" \? "still" : undefined\}/,
    );
  });
});

describe("the pages that turn the sky off", () => {
  it.each([
    ["views/RecruitmentTestView.astro", "the exam room"],
    ["views/RecruitmentQrView.astro", "the QR wall"],
    ["views/RecruitmentHadirView.astro", "attendance on a phone"],
  ])("%s (%s) passes sky={false}", (file) => {
    expect(read(file)).toMatch(/<Base[\s\S]*?sky=\{false\}[\s\S]*?>/);
  });

  it("no other page turns it off: a sky off is a decision about a page that needs its frames", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".astro") && /sky=\{false\}/.test(readFileSync(p, "utf8")))
          found.push(relative(root, p).replaceAll("\\", "/"));
      }
    };
    walk(root);
    expect(found.sort()).toEqual([
      "views/RecruitmentHadirView.astro",
      "views/RecruitmentQrView.astro",
      "views/RecruitmentTestView.astro",
    ]);
  });

  it('the Konsol keeps its sky, painted once: it passes sky="still", not off', () => {
    const page = read("views/SessionPage.astro");
    expect(page).toMatch(/<Base[\s\S]*?sky="still"[\s\S]*?>/);
    expect(page).not.toMatch(/sky=\{false\}/);
  });
});

describe("a page with no sky draws nothing", () => {
  it("scene.css hides the sky", () => {
    expect(read("styles/scene.css")).toMatch(/html\[data-sky="off"\] \.sky \{\s*display: none;/);
  });
  it("the page ground there is the theme's own, not kosmik's dark-only gradient", () => {
    expect(read("styles/scene.css")).toMatch(
      /html\[data-sky="off"\] body \{\s*background: var\(--bg\);/,
    );
  });
  it("scene.ts builds nothing and ignores the pointer there", () => {
    const code = read("scripts/scene.ts");
    expect(code).toMatch(/const off = \(\) => html\.dataset\.sky === "off"/);
    expect(code).toMatch(/if \(!off\(\)\) void loadSprites/);
    expect(code).toMatch(/if \(off\(\)\) return;/);
    expect(code).toMatch(/"data-sky"/);
  });
  it("sky-fx.ts stops its loop there", () => {
    const code = read("scripts/cosmos/sky-fx.ts");
    expect(code).toMatch(/html\.dataset\.sky === "off"/);
    expect(code).toMatch(/"data-sky"/);
  });
});

describe("a still sky is painted once and never moves", () => {
  it("scene.css moves no layer and promotes none to a compositor layer", () => {
    const css = read("styles/scene.css");
    expect(css).toMatch(/:not\(\[data-sky="still"\]\) \.scene \.sp \{/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*:root:not\(\[data-detail="ldm"\]\):not\(\[data-motion-tier="0"\]\):not\(\[data-sky="still"\]\) \.scene \{/,
    );
  });
  it("sky-fx.ts draws one frame of sparkles and no loop", () => {
    expect(read("scripts/cosmos/sky-fx.ts")).toMatch(/html\.dataset\.sky === "still"/);
  });
  it("scene.ts does not lean the layers toward the pointer", () => {
    expect(read("scripts/scene.ts")).toMatch(/html\.dataset\.sky === "still"/);
  });
});
