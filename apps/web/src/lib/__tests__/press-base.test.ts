import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

/**
 * The press feedback base layer (styles/press.css): every selector is wrapped in :where() so a component's own
 * rule always wins, it uses the compositor's `scale`, and it sits behind the reduced-motion query.
 */
const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
const root = postcss.parse(read("styles/press.css"));

describe("press.css", () => {
  it("is zero specificity: every selector is one :where(...)", () => {
    let n = 0;
    root.walkRules((r) => {
      n++;
      for (const s of r.selectors) expect(s.trim(), s).toMatch(/^:where\([\s\S]*\)$/);
    });
    expect(n).toBeGreaterThanOrEqual(2);
  });
  it("only animates scale, and only without reduced motion", () => {
    root.walkDecls((d) => {
      if (d.prop === "transition") expect(d.value).toMatch(/^scale /);
      expect(["transition", "scale"]).toContain(d.prop);
    });
    expect(read("styles/press.css")).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
  });
  it("leaves .btn and .control-hover to controls.css, and is loaded after it", () => {
    expect(read("styles/press.css")).toMatch(/\.btn,\s*\.control-hover/);
    expect(read("layouts/Base.astro")).toMatch(
      /styles\/controls\.css";[\s\S]*?styles\/press\.css";/,
    );
  });
});
