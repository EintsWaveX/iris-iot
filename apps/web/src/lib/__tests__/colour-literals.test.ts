import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

/**
 * Colour phase 3a (Nov 2026): a component stylesheet never writes a hex or rgb() colour inline. It uses
 * var(--hex-RRGGBB) / rgb(var(--rgb-R-G-B) / alpha) from styles/palette.css, or a themed token. That keeps every
 * colour in a few files, so the palette can be regenerated from seeds (phase 3b) without hunting through 110
 * stylesheets. theme.css, plates.css and palette.css define the colours and are exempt.
 */
const dir = fileURLToPath(new URL("../..", import.meta.url));
const EXEMPT = new Set(["theme.css", "plates.css", "palette.css"]);
const files: string[] = [];
const walk = (d: string) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".css") && !EXEMPT.has(basename(p))) files.push(p);
  }
};
walk(dir);

const STRIP = /"(?:[^"\]|\.)*"|'(?:[^'\]|\.)*'|url\((?:[^()]|\([^)]*\))*\)/g;
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/;

describe("component stylesheets use the palette, not literals", () => {
  it("has no inline hex or rgb() colour outside theme.css, plates.css and palette.css", () => {
    const bad: string[] = [];
    for (const f of files) {
      postcss.parse(readFileSync(f, "utf8")).walkDecls((d) => {
        if (d.parent?.type === "atrule" && d.parent.name === "property") return;
        if (LITERAL.test(d.value.replace(STRIP, "")))
          bad.push(`${f.slice(dir.length)}: ${d.prop}: ${d.value}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("palette.css defines every variable the stylesheets use", () => {
    const palette = readFileSync(join(dir, "styles/palette.css"), "utf8");
    const defined = new Set([...palette.matchAll(/(--(?:hex|rgb)-[0-9a-f-]+):/g)].map((m) => m[1]));
    const missing = new Set<string>();
    for (const f of files)
      for (const m of readFileSync(f, "utf8").matchAll(/var\((--(?:hex|rgb)-[0-9a-f-]+)\)/g))
        if (!defined.has(m[1])) missing.add(m[1]);
    expect([...missing]).toEqual([]);
  });

  it("is loaded first by every page", () => {
    expect(readFileSync(join(dir, "layouts/Base.astro"), "utf8")).toMatch(
      /import "\.\.\/styles\/fonts\.css";[\s\S]*?import "\.\.\/styles\/palette\.css";[\s\S]*?import "\.\.\/\.\.\/\.\.\/\.\.\/packages\/kosmik\/style\/tokens\.css";/,
    );
  });
});
