/**
 * The default password suffix stays off the public site (user, 2026-10-15:
 * "as long as 1715 isn't getting exposed to public, it's all fine"). Every
 * file under src/ can end up in a browser bundle, so none may carry it
 * outside comments, bar the server-only auth.ts, which no component or page
 * imports. The server's copies live in api/_lib.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");
const SERVER_ONLY = ["lib/auth.ts"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "__tests__" || n === "content") return [];
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|astro|js|mjs)$/.test(n) ? [p] : [];
  });
}

const code = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1")
    .replace(/<!--[\s\S]*?-->/g, "");

const rel = (f: string) => relative(SRC, f).split(sep).join("/");

describe("the default password suffix", () => {
  const all = files(SRC);

  it("is in no file a browser could load", () => {
    const hits = all
      .filter((f) => !SERVER_ONLY.includes(rel(f)))
      .filter((f) => code(readFileSync(f, "utf8")).includes("1715"))
      .map(rel);
    expect(hits).toEqual([]);
  });

  it("stays server only where it is kept", () => {
    const importers = all
      .filter((f) => /^(components|pages|layouts)\//.test(rel(f)))
      .filter((f) => /from\s+["'][^"']*lib\/auth(\.js)?["']/.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(importers).toEqual([]);
  });
});
