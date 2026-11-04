import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZH_ENABLED } from "../kelas";

const baca = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("the Mandarin font rules", () => {
  it("stay out of fonts.css (300 KB of @font-face on every page)", () => {
    expect(baca("../../styles/fonts.css")).not.toContain("noto-sans-sc");
  });

  it("are imported by Base.astro as soon as Mandarin is switched on", () => {
    if (!ZH_ENABLED) return;
    expect(baca("../../layouts/Base.astro")).toContain("../styles/fonts-zh.css");
  });
});
