/**
 * The CSP allows fonts from the site only (font-src 'self'), so a stylesheet
 * that embeds a font as a data: URL is blocked on every page that loads it
 * and logs a violation. Swiper's own swiper.css does that for its arrow
 * icons; the Lab Profile carries a copy without it (home/profil/swiper-core.css).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..", "..");

function semua(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : semua(p);
    return /\.(css|tsx?|astro)$/.test(e.name) ? [p] : [];
  });
}

describe("fonts under the CSP", () => {
  it("embeds no font as a data: URL", () => {
    const hits = semua(SRC).filter((f) =>
      /@font-face[^}]*url\(\s*['"]?data:/s.test(readFileSync(f, "utf8")),
    );
    expect(hits).toEqual([]);
  });

  it("never imports Swiper's stylesheet with its embedded icon font", () => {
    const hits = semua(SRC).filter((f) =>
      /from\s+["']swiper\/(css|swiper\.css|swiper-bundle\.css|css\/bundle)["']|import\s+["']swiper\/(css|swiper\.css|swiper-bundle\.css|css\/bundle)["']/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(hits).toEqual([]);
  });
});
