#!/usr/bin/env node
/**
 * Verifies every hashed asset a built script or page names (a chunk's
 * stylesheet, an import, a preload) exists in dist/_astro.
 *
 * This exists because of a real outage (2026-10-23, 16:17 to 16:24 WIB):
 * the Open Recruitment navbar imported Avatar from the AppNav island, which
 * made AppNav shared code in one of the merged `app` chunks (the
 * codeSplitting groups in astro.config.mjs). The build then had HomePage.js
 * ask for that chunk's stylesheet under a name it never wrote, the preload
 * failed, and Home rendered blank in production. check, lint, the tests and
 * the build all passed, and the rig runs `astro dev`, which never splits
 * chunks. Run this after `astro build` (dist/ must exist).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const astro = join(dist, "_astro");
if (!existsSync(astro)) {
  console.error("dist/_astro not found: run `npm run build` first.");
  process.exit(2);
}
const ada = new Set(readdirSync(astro));
// name.<8-char hash>.css|js, with Rolldown's ~ and _ group separators.
const NAMA = /[A-Za-z0-9_~-]+(?:\.[A-Za-z0-9_-]+)*\.[A-Za-z0-9_-]{8}\.(?:css|js)/g;
const hilang = new Map();
let dibaca = 0;

function periksa(path) {
  dibaca++;
  for (const [nama] of readFileSync(path, "utf8").matchAll(NAMA)) {
    if (!ada.has(nama)) hilang.set(nama, [...(hilang.get(nama) ?? []), path.slice(dist.length)]);
  }
}

function jelajah(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) jelajah(p);
    else if (/\.(js|mjs|html|css)$/.test(f)) periksa(p);
  }
}

jelajah(dist);
for (const [nama, dari] of hilang) console.error(`missing ${nama} (named in ${dari.join(", ")})`);
if (hilang.size) {
  console.error(`${hilang.size} referenced asset(s) missing from dist/_astro.`);
  process.exit(1);
}
console.log(`ok: ${dibaca} files scanned, every referenced asset of ${ada.size} exists.`);
