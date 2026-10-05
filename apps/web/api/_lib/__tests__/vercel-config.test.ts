import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const vercel = JSON.parse(readFileSync(path.join(here, "../../../vercel.json"), "utf-8"));
const sources = readFileSync(path.join(here, "../sketch-sources.ts"), "utf-8");

describe("vercel.json function bundling", () => {
  it("ships every sketch sketch-sources.ts reads with the modul function", () => {
    // sketch-sources.ts reads its files through a helper, which Vercel's
    // file tracer cannot follow; without this includeFiles entry none of
    // them were bundled, the module threw ENOENT at load, and every
    // /api/modul call (editor drafts, checks, downloads) returned 500.
    const include: string = vercel.functions?.["api/modul/[aksi].ts"]?.includeFiles ?? "";
    const dirs = new Set(
      [...sources.matchAll(/read\("\.\.\/\.\.\/(src\/content\/sketches)\//g)].map((m) => m[1]),
    );
    expect(dirs.size).toBe(1);
    for (const dir of dirs) expect(include.startsWith(dir)).toBe(true);
  });

  it("ships the sketches with every function that reaches kode-aktif.ts", () => {
    // Blank counts on the board and reports fall back to the bundled
    // version 1 (kode-aktif.ts), which reads the same files.
    for (const fn of ["api/modul/[aksi].ts", "api/session/[aksi].ts", "api/session/index.ts"]) {
      const include: string = vercel.functions?.[fn]?.includeFiles ?? "";
      expect(include, fn).toContain("src/content/sketches/**");
    }
  });
});
