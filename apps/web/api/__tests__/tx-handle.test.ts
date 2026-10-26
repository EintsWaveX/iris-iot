/**
 * Inside a transaction, every query goes through the transaction's own handle.
 *
 * A query sent through the outer `db` while the transaction holds a row lock
 * needs a second connection from the pool. When enough requests do that at
 * once (30 seats pressing Putar in one room, prompt 14's rehearsal), every
 * connection ends up waiting on the lock while the lock holder waits for a
 * free connection, and the requests hang until they time out. This test reads
 * the API source and fails on any outer handle used inside the callback of
 * `<db>.transaction(async (tx) => ...)` or `denganKunciNilai(<db>, ...)`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "__tests__" ? [] : files(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The text from `from` up to the bracket that closes the one at `from - 1`. */
function block(src: string, from: number, open: string, close: string): string {
  let depth = 1;
  let i = from;
  while (depth > 0 && i < src.length) {
    if (src[i] === open) depth++;
    else if (src[i] === close) depth--;
    i++;
  }
  return src.slice(from, i);
}

export function outerUses(src: string): { line: number; outer: string; text: string }[] {
  const out: { line: number; outer: string; text: string }[] = [];
  const starts =
    /([\w.]+)\.transaction\(\s*async\s*\(\s*\w+[^)]*\)\s*=>\s*([{(])|denganKunciNilai\(\s*([\w.]+)\s*,[^,]+,\s*async\s*\(\s*\w+\s*\)\s*=>\s*([{(])/g;
  for (const m of src.matchAll(starts)) {
    const outer = m[1] ?? m[3];
    const open = m[2] ?? m[4];
    const at = m.index! + m[0].length;
    const body = block(src, at, open, open === "{" ? "}" : ")");
    const use = new RegExp(`(?<![\\w.])${escape(outer)}(?=[.,)])`);
    const line0 = src.slice(0, at).split("\n").length;
    body.split("\n").forEach((text, k) => {
      if (use.test(text) && !/^\s*(\/\/|\*)/.test(text))
        out.push({ line: line0 + k, outer, text: text.trim() });
    });
  }
  return out;
}

describe("transactions use their own handle", () => {
  it("finds an outer handle inside a callback (the scanner works)", () => {
    const bad = `await db.transaction(async (tx) => {\n  await tx.select();\n  await muat(db, 1);\n});`;
    expect(outerUses(bad)).toEqual([{ line: 3, outer: "db", text: "await muat(db, 1);" }]);
    const lock = `await denganKunciNilai(k.db, k.edisiId, async (tx) => {\n  await f(k.db);\n});`;
    expect(outerUses(lock).map((x) => x.outer)).toEqual(["k.db"]);
    const fine = `await db.transaction(async (tx) => {\n  await muat(tx, 1);\n});\nawait muat(db, 2);`;
    expect(outerUses(fine)).toEqual([]);
  });

  it("no API transaction sends a query through the outer handle", () => {
    const found = files(ROOT).flatMap((f) =>
      outerUses(readFileSync(f, "utf8")).map(
        (u) => `${relative(ROOT, f).replace(/\\/g, "/")}:${u.line} [${u.outer}] ${u.text}`,
      ),
    );
    expect(found).toEqual([]);
  });
});
