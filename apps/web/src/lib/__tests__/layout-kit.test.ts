import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The layout kit (docs/design/home-anatomy.md, Nov 2026): one shared column and one section header band. Home is the
 * first user; these hold the numbers the sign-off agreed and that Home really uses them.
 */

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

describe("layout.css", () => {
  const css = read("styles/layout.css");
  it("caps the column at 1360 px with a gutter that grows from 16 to 56 px", () => {
    expect(css).toMatch(/--col: 1360px;/);
    expect(css).toMatch(/--gutter: clamp\(16px, 3\.4vw, 56px\);/);
  });
  it("has the agreed radius scale and rhythm", () => {
    expect(css).toMatch(/--r-card: 16px;/);
    expect(css).toMatch(/--r-ctl: 12px;/);
    expect(css).toMatch(/--r-pill: 999px;/);
    expect(css).toMatch(/--sec-gap: clamp\(56px, 8vw, 112px\);/);
  });
  it(".page-col is the column plus its gutters, centred", () => {
    expect(css).toMatch(
      /\.page-col \{[^}]*max-width: calc\(var\(--col\) \+ 2 \* var\(--gutter\)\)/,
    );
    expect(css).toMatch(/\.page-col \{[^}]*margin-inline: auto/);
  });
  it("is loaded for every page", () => {
    expect(read("layouts/Base.astro")).toMatch(/import "\.\.\/styles\/layout\.css";/);
  });
});

describe("Home uses the kit", () => {
  it("Home's main is the column, not .page-wide", () => {
    expect(read("views/LandingPage.astro")).toMatch(/<main id="main" class="page-col page-main">/);
  });
  it("every Profil Lab section heading and the Rasi row go through SectionBand", () => {
    expect(read("components/home/profil/parts.tsx")).toMatch(/<SectionBand[\s\S]*?reveal/);
    expect(read("components/home/HomePage.tsx")).toMatch(/<SectionBand title=\{t\.rasiTitle\} \/>/);
  });
  it("the old loose heading plate is gone", () => {
    for (const f of [
      "components/home/profil/profil.css",
      "components/home/observatory.css",
      "components/home/profil/parts.tsx",
    ])
      expect(read(f), f).not.toMatch(/pl-head\b(?!__)/);
  });
});

describe("SectionBand", () => {
  const css = read("components/ui/SectionBand.css");
  it("is one full-width plate with the agreed radius, and drops its action under the heading on a phone", () => {
    expect(css).toMatch(/\.sec-band \{[^}]*width: 100%/);
    expect(css).toMatch(/border-radius: var\(--r-card, 16px\)/);
    expect(css).toMatch(
      /@media \(max-width: 639px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/,
    );
  });
  it("heading is 28 to 44 px at weight 700", () => {
    expect(css).toMatch(/font-size: clamp\(1\.75rem, 1\.3rem \+ 1\.5vw, 2\.75rem\)/);
    expect(css).toMatch(/\.sec-band__title \{[^}]*font-weight: 700/);
  });
  it("falls back to the solid surface at Low Detail and motion tier 0", () => {
    expect(css).toMatch(/:root\[data-detail="ldm"\] \.sec-band/);
    expect(css).toMatch(/background: var\(--surface-1\)/);
  });
});
describe("Praktikum views sit in the shared column", () => {
  const views: [string, RegExp][] = [
    ["views/DashboardPage.astro", /<main id="main" class="page-col page-main">/],
    ["components/ModulesIndexView.astro", /<main id="main" class="page-col page-main">/],
    ["components/ModuleDetailView.astro", /<main id="main" class="page-col page-main modpage"/],
    ["components/ModuleLiveView.astro", /<main id="main" class="page-col page-main">/],
    ["views/AccountView.astro", /<main id="main" class="page-col page-main">/],
  ];
  for (const [file, re] of views)
    it(`${file} uses .page-col`, () => expect(read(file)).toMatch(re));


describe("page header matches the section band", () => {
  const css = read("styles/page-header.css");
  it("has the band's padding, heading size and weight, and sub width", () => {
    expect(css).toMatch(/\.page-header \{[^}]*padding: 20px 28px/);
    expect(css).toMatch(
      /\.page-header__title \{[^}]*font-weight: 700;[^}]*font-size: clamp\(1\.75rem, 1\.3rem \+ 1\.5vw, 2\.75rem\)/,
    );
    expect(css).toMatch(/\.page-header__subtitle \{[^}]*max-width: 60ch/);
    expect(css).toMatch(/\.page-header__title \{[^}]*overflow-wrap: anywhere/);
  });
});
