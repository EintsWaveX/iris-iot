import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dropIconWeights } from "../../../vite/phosphor-weights";

const icon = `import * as e from "react";
const a = new Map([
  ["bold", e.createElement("path", { d: "M1,2[3]" })],
  ["light", e.createElement(e.Fragment, null, e.createElement("path", { d: "M4,5" }), e.createElement("path", { d: "M6,7" }))],
  ["regular", e.createElement("path", { d: "M8,9" })],
  ["thin", e.createElement("path", { d: "M10,11" })]
]);
export { a as default };`;

describe("dropIconWeights", () => {
  const out = dropIconWeights(icon);
  it("removes thin and light and keeps the rest", () => {
    expect(out).not.toContain('"thin"');
    expect(out).not.toContain('"light"');
    expect(out).toContain('"bold"');
    expect(out).toContain('"regular"');
    expect(out).toContain("M8,9");
    expect(out).not.toContain("M6,7");
  });
  it("keeps the brackets and parentheses balanced", () => {
    const count = (s: string, c: string) => s.split(c).length - 1;
    expect(count(out, "[") - count(out, "]")).toBe(count(icon, "[") - count(icon, "]"));
    expect(count(out, "(")).toBe(count(out, ")"));
  });
  it("leaves a module alone when it has no such entries", () => {
    expect(dropIconWeights("const a = 1;")).toBe("const a = 1;");
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(f)) out.push(p);
  }
  return out;
}

describe("icons in the app", () => {
  it('never ask for the "thin" or "light" weight (the build drops those drawings)', () => {
    const bad = walk(join(__dirname, "../../components")).filter((f) =>
      /weight=\{?["'](thin|light)["']/.test(readFileSync(f, "utf8")),
    );
    expect(bad).toEqual([]);
  });
});
