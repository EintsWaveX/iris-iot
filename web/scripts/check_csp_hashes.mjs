#!/usr/bin/env node
/**
 * Verifies vercel.json's Content-Security-Policy `script-src` hash allowlist
 * matches every inline <script> actually shipped in the build output.
 *
 * This exists because of a real, severe bug: the CSP has said `script-src
 * 'self'` (no 'unsafe-inline', no hashes) since the very first Phase 1
 * commit, silently blocking every inline <script> the site ships --
 * including the login form handler and the tab switcher. It went
 * undetected because this project's own verification has always gone
 * through curl/API-level checks, which never load a real browser and so
 * never enforce CSP at all. Run this after `astro build` (dist/ must exist)
 * so a future change to any inline script's content -- which changes its
 * hash -- fails CI loudly instead of silently breaking the live site again.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(root, "dist");
const vercelJsonPath = join(root, "vercel.json");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

function extractInlineScriptHashes(html) {
  const hashes = new Set();
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const content = m[1];
    if (!content.trim()) continue;
    const digest = createHash("sha256").update(content, "utf-8").digest("base64");
    hashes.add(`sha256-${digest}`);
  }
  return hashes;
}

let htmlFiles;
try {
  htmlFiles = walk(distDir);
} catch {
  console.error(`dist/ not found at ${distDir} -- run \`npm run build\` first.`);
  process.exit(1);
}

const builtHashes = new Set();
for (const file of htmlFiles) {
  for (const h of extractInlineScriptHashes(readFileSync(file, "utf-8"))) {
    builtHashes.add(h);
  }
}

const vercelJson = JSON.parse(readFileSync(vercelJsonPath, "utf-8"));
const cspHeader = vercelJson.headers?.[0]?.headers?.find(
  (h) => h.key === "Content-Security-Policy",
);
if (!cspHeader) {
  console.error("No Content-Security-Policy header found in vercel.json.");
  process.exit(1);
}
const configuredHashes = new Set(
  [...cspHeader.value.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]),
);

const missing = [...builtHashes].filter((h) => !configuredHashes.has(h));
const stale = [...configuredHashes].filter((h) => !builtHashes.has(h));

if (missing.length > 0) {
  console.error("CSP is missing hashes for inline scripts actually in the build:");
  for (const h of missing) console.error(`  '${h}'`);
  console.error(
    "\nAdd these to script-src in web/vercel.json, or the affected page's inline\n" +
      "script will be silently blocked by the browser -- exactly the bug this\n" +
      "check exists to catch.",
  );
}
if (stale.length > 0) {
  console.error("CSP has hashes that no longer match any inline script in the build:");
  for (const h of stale) console.error(`  '${h}'`);
  console.error("\nRemove these from web/vercel.json -- they're dead weight, not a fix.");
}

if (missing.length > 0 || stale.length > 0) process.exit(1);
console.log(`CSP hash allowlist matches the build: ${builtHashes.size} inline script(s), all accounted for.`);
