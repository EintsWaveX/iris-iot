/**
 * Every file a Vercel function loads runs under Node's own ESM loader, which
 * needs the extension on a relative import ("./hak.js", not "./hak"). The
 * rig and the tests go through tsx and Vite, which resolve either form, so
 * a missing extension only shows up in production. It crashed every API
 * route on the 2026-10-05 deploy. This walks the import graph from api/
 * and fails on any relative import without one.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const IMPORT =
  /(?:import|export)\s+(type\s+)?[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

function source(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec.replace(/\.js$/, ""));
  for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(base + ext)) return base + ext;
  return null;
}

function entries(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : entries(p);
    return e.name.endsWith(".ts") ? [p] : [];
  });
}

describe("API import graph", () => {
  it("names the .js extension on every relative runtime import", () => {
    const seen = new Set<string>();
    const bad: string[] = [];
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
        if (m[1]) continue; // `import type` is erased
        const spec = m[2] ?? m[3];
        if (!/\.(js|mjs|json)$/.test(spec)) bad.push(`${relative(ROOT, file)} -> ${spec}`);
        const next = source(file, spec);
        if (next) walk(next);
      }
    };
    entries(join(ROOT, "api")).forEach(walk);
    expect(seen.size).toBeGreaterThan(50);
    expect(bad).toEqual([]);
  });
});
