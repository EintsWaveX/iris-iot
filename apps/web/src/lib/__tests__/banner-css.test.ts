import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Guards a regression from #212: its edit swallowed the "Banner, richer" block, so the banner's decorative <svg>
 * lost its `.rec-bn__art` rule, became a full-width grid item and stretched the whole Open Recruitment banner to
 * about 600 px tall (and the 52 px form tap size went with it).
 */
const css = readFileSync(
  fileURLToPath(new URL("../../components/recruitment/recruitment.css", import.meta.url)),
  "utf8",
);

describe("recruitment.css keeps the banner and form rules", () => {
  it("takes the banner's drawing out of the flow", () => {
    expect(css).toMatch(/\.rec-bn__art \{[^}]*position: absolute/);
    expect(css).toMatch(/\.rec-bn__art \{[^}]*pointer-events: none/);
  });
  it("styles the banner's top row, sticker and hot title", () => {
    for (const sel of [".rec-bn__top", ".rec-bn__sticker", ".rec-bn__title--hot"]) {
      expect(css).toContain(`${sel} {`);
    }
  });
  it("keeps the 52 px tap size on Oprec forms", () => {
    expect(css).toMatch(/\.rec-form \.field__input,[^{]*\{[^}]*min-height: 52px/);
  });
});
