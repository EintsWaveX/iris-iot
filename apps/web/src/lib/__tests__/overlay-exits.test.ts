import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Overlays that used to vanish at once now fade out (motion phase 5b): Radix keeps a dialog mounted while its
 * `data-state="closed"` rule animates, so each of these needs that rule, and the one that is unmounted by its
 * parent (the Profil lightbox) holds itself open for the length of the fade.
 */
const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

describe("overlay exits", () => {
  it("the command palette and its overlay fade out, and the palette moves by `translate`, not `transform`", () => {
    const css = read("components/ui/CommandPalette.css");
    expect(css).toMatch(/\.palette__overlay\[data-state="closed"\][^}]*animation: dialog-fade-out/);
    expect(css).toMatch(/\.palette\[data-state="closed"\][^}]*animation: palette-out/);
    expect(css).toMatch(/@keyframes palette-out \{[^}]*translate:/);
    expect(css).not.toMatch(/@keyframes palette-(in|out) \{[^}]*transform:/);
  });
  it("the schematic viewer and its overlay fade out", () => {
    const css = read("components/ui/SchematicViewer.css");
    expect(css).toMatch(/\.schemv__overlay\[data-state="closed"\][^}]*animation: dialog-fade-out/);
    expect(css).toMatch(/\.schemv\[data-state="closed"\][^}]*animation: dialog-fade-out/);
  });
  it("the Profil lightbox fades out and unmounts itself after the fade", () => {
    const css = read("components/home/profil/profil.css");
    expect(css).toMatch(/\.pl-lb\[data-state="closed"\][^}]*animation: dialog-fade-out 150ms/);
    const tsx = read("components/home/profil/Lightbox.tsx");
    expect(tsx).toMatch(/const EXIT_MS = 150;/);
    expect(tsx).toMatch(/<RadixDialog\.Root open=\{open\}/);
    expect(tsx).toMatch(/calmMotion\(\)/);
  });
});
