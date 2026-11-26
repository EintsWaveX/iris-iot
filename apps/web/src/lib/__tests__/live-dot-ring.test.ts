import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * A live dot's pulse is a ring on its ::after, `position: absolute; inset: 0`, scaled by a transform
 * (styles/app.css). That only works if the dot itself is a positioned box: against a static dot the ring was sized to
 * the nearest positioned ancestor (the whole navbar, 1440 x 64) and scaled x3, which let the page scroll sideways.
 * (Nov 2026, found while building the layout column.)
 */

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

const app = read("styles/app.css");
const nav = read("components/shell/AppNav.css");

/** The classes the ring rule lists */
const ringHosts = (() => {
  const m = app.match(/:is\(([^)]*)\)::after \{\s*animation: live-ring/);
  expect(m, "the live-ring rule").not.toBeNull();
  return m![1].split(",").map((s) => s.trim().replace(/^\./, ""));
})();

describe("live dot rings", () => {
  it("lists the five dots the pulse used to be on", () => {
    expect(ringHosts.sort()).toEqual(
      ["appnav__live-dot", "dot--pulse", "minibar__dot", "rec-labpc__dot", "rec-oprec__dot"].sort(),
    );
  });

  it("every host is a positioned box, so the ring is sized by the dot and not by an ancestor", () => {
    const rel = app.match(/(\.minibar__dot,[^{]*) \{\s*position: relative;\s*\}/);
    expect(rel, "the shared position: relative rule").not.toBeNull();
    const positioned = rel![1].split(",").map((s) => s.trim().replace(/^\./, ""));
    for (const h of ringHosts) {
      // .appnav__live-dot is absolutely positioned by AppNav.css itself
      if (h === "appnav__live-dot")
        expect(nav).toMatch(/\.appnav__live-dot \{[^}]*position: absolute/);
      else expect(positioned, h).toContain(h);
    }
  });

  it("the steady Langsung dot (position: static, no pulse) gets no ring either", () => {
    expect(nav).toMatch(
      /\.appnav__langsung \.appnav__live-dot,[^{]*\{\s*animation: none;\s*position: static;/,
    );
    expect(nav).toMatch(
      /:root:not\(\[data-motion-tier="0"\]\) \.appnav__langsung \.appnav__live-dot::after \{\s*content: none;/,
    );
  });
});
