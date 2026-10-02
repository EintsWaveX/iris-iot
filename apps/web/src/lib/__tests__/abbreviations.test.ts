/**
 * Phase 9 copy rule: no abbreviations in the interface. Groups, modules and
 * minutes are written out ("Kelompok 3", "Module 2", "30 menit"), and the
 * International class is never "INTER". This scans every string and
 * template literal in the interface code for the forms that used to slip
 * in. Comments, SVG path data and the sheet parser (which reads "INTER" as
 * data from the schedule sheet) are left out.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SKIP_FILES = [/__tests__/, /lib[\\/]jadwal-parser\.ts$/, /lib[\\/]schema\.ts$/, /\.d\.ts$/];

const BANNED: { name: string; re: RegExp }[] = [
  { name: "group as K/G plus a number", re: /(^|[^\w$.#-])[KG](\d+|\$\{)/ },
  {
    name: "module as M plus a number",
    re: /(^|[^\w$.#-])M(\d+(?![\d.,\s]*[\d.,]\s*[A-Za-z]?\d)|\$\{)/,
  },
  { name: "INTER for International", re: /\bINTER\b/ },
  { name: "Prep for Preparation", re: /\bPrep\b/ },
  { name: "mnt for menit", re: /\bmnt\b/ },
  { name: "dtk for detik", re: /\bdtk\b/ },
  { name: "s for seconds", re: /(\d|\})\s?s ago\b/ },
  { name: "h for hours", re: /(\d|\})\s+h\b/ },
  { name: "min for minutes", re: /(\d|\})\s?min\b/ },
];

/** Dates are written out ("Kamis, 1 Oktober 2026"): no short month or
 *  weekday names from Intl. */
const SHORT_DATE = /(month|weekday): "(short|narrow)"/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|astro)$/.test(n) ? [p] : [];
  });
}

/** The text of every "..." / '...' / `...` literal, comments removed. */
function literals(src: string): string[] {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const out: string[] = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  for (let m = re.exec(noComments); m; m = re.exec(noComments)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  // JSX and Astro text between tags: <span>INTER</span>
  const text = />([^<>{}=\n]*[A-Za-z][^<>{}=\n]*)</g;
  for (let m = text.exec(noComments); m; m = text.exec(noComments)) out.push(m[1]);
  return out;
}

/** SVG path data ("M3 8.5l3.2 3L13 4.5") and CSS/class strings are not copy. */
function isPathData(s: string): boolean {
  if (/^M\$\{/.test(s)) return true;
  return /^[MmLlHhVvCcSsQqTtAaZz\d\s.,${}()+*/x-]+$/.test(s.trim()) && /\d/.test(s);
}

describe("no abbreviations in interface copy", () => {
  const hits: string[] = [];
  for (const f of files(join(ROOT))) {
    const rel = relative(ROOT, f);
    if (SKIP_FILES.some((r) => r.test(rel))) continue;
    const src = readFileSync(f, "utf8");
    if (SHORT_DATE.test(src)) hits.push(`${rel}: short month or weekday in a date format`);
    for (const lit of literals(src)) {
      if (isPathData(lit)) continue;
      for (const b of BANNED) {
        if (b.re.test(lit)) hits.push(`${rel}: ${b.name}: ${JSON.stringify(lit.slice(0, 80))}`);
      }
    }
  }

  it("finds none", () => {
    expect(hits).toEqual([]);
  });
});
