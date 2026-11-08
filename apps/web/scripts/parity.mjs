#!/usr/bin/env node
/**
 * Parity check: does the self-hosted server answer like the live site?
 *
 *   node scripts/parity.mjs <reference-url> <candidate-url> [--dist dist] [--limit 400]
 *
 * It requests the same paths from both (read-only GETs, redirects not
 * followed): every built page, a sample of assets, the redirects and the API
 * rewrites from vercel.json, and a few paths that must 404. For each path it
 * compares the status, `location`, content type and the headers that matter
 * (security headers, CSP, cache-control), and for HTML pages a hash of the
 * body. Differences are printed; the exit code is 1 when any is a real one.
 *
 * Known, accepted differences are listed in IGNORE below, with the reason.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const [ref, cand, ...rest] = process.argv.slice(2);
if (!ref || !cand) {
  console.error("usage: parity.mjs <reference-url> <candidate-url> [--dist dist] [--limit 400]");
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : fallback;
};
const dist = opt("--dist", "dist");
const limit = Number(opt("--limit", "400"));

const HEADERS = [
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "content-security-policy",
  "cache-control",
];
// Header differences that are expected between Vercel and the self-hosted server.
const IGNORE = {
  // Compared loosely: only the presence of "no-store" and "immutable" must agree.
  "cache-control": (a, b) =>
    ["no-store", "immutable"].every((t) => (a ?? "").includes(t) === (b ?? "").includes(t)),
};
// Every Astro build renames its chunks and picks new island ids, so a page is
// compared with those blanked out.
const stable = (html) =>
  html.replace(/\/_astro\/[A-Za-z0-9_.-]+/g, "/_astro/H").replace(/uid="[^"]*"/g, 'uid=""');

function pages(root) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) {
        let u = "/" + relative(root, p).split(sep).join("/");
        u = u.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
        out.push(u === "/404" ? "/__no_such_page__" : u);
      }
    }
  };
  walk(root);
  return out.sort();
}

const config = JSON.parse(readFileSync("vercel.json", "utf8"));
const paths = new Set(pages(dist).slice(0, limit));
for (const r of config.redirects ?? []) {
  if (r.has) continue;
  // A concrete example for each redirect source.
  const ex = r.source
    .replace("/((?!api/).*)", "/en")
    .replace("(.*)", "modules/3")
    .replace(/:[a-z]+\*/, "x");
  paths.add(ex);
}
for (const r of config.rewrites ?? []) paths.add(r.source.replace(/\/:[a-z]+\*/, "/x"));
// Unknown paths, and API routes asked without a sign-in (the answers must agree,
// whatever they are: a 401 or 405 JSON, never a crash).
for (const p of [
  "/api/nope",
  "/en/nope",
  "/favicon.ico",
  "/robots.txt",
  "/api/session",
  "/api/server",
  "/api/auth/student",
  "/api/tp/saya",
  "/api/agen",
  "/api/sesi",
  "/api/profil/saya",
  "/api/modul/daftar",
  "/api/presentasi/daftar",
])
  paths.add(p);

async function get(base, path) {
  const r = await fetch(base.replace(/\/$/, "") + path, { redirect: "manual" });
  const buf = Buffer.from(await r.arrayBuffer());
  return {
    status: r.status,
    location: r.headers.get("location"),
    type: (r.headers.get("content-type") ?? "").split(";")[0],
    headers: Object.fromEntries(HEADERS.map((h) => [h, r.headers.get(h)])),
    hash: (r.headers.get("content-type") ?? "").includes("html")
      ? createHash("sha1")
          .update(stable(buf.toString("utf8")))
          .digest("hex")
          .slice(0, 10)
      : (r.headers.get("content-type") ?? "").includes("json")
        ? createHash("sha1").update(buf).digest("hex").slice(0, 10)
        : null,
  };
}

let bad = 0;
let n = 0;
const list = [...paths];
const batch = 8;
for (let i = 0; i < list.length; i += batch) {
  await Promise.all(
    list.slice(i, i + batch).map(async (p) => {
      let a, b;
      try {
        [a, b] = await Promise.all([get(ref, p), get(cand, p)]);
      } catch (e) {
        console.log(`ERR   ${p}  ${e.message}`);
        bad++;
        return;
      }
      n++;
      const diffs = [];
      if (a.status !== b.status) diffs.push(`status ${a.status} vs ${b.status}`);
      // A redirect to the other base compares by path and query only.
      const norm = (l, base) => (l ? l.replace(base.replace(/\/$/, ""), "") : l);
      if (norm(a.location, ref) !== norm(b.location, cand))
        diffs.push(`location ${a.location} vs ${b.location}`);
      if (a.type !== b.type && a.status < 300) diffs.push(`type ${a.type} vs ${b.type}`);
      for (const h of HEADERS) {
        if (a.headers[h] === b.headers[h]) continue;
        // An error page's caching is each platform's own business.
        if (h === "cache-control" && a.status >= 400) continue;
        if (IGNORE[h]?.(a.headers[h], b.headers[h])) continue;
        diffs.push(`${h}: ${a.headers[h]} vs ${b.headers[h]}`);
      }
      if (a.hash && b.hash && a.hash !== b.hash)
        diffs.push(`html body differs (${a.hash} vs ${b.hash})`);
      if (diffs.length) {
        bad++;
        console.log(`DIFF  ${p}\n        ${diffs.join("\n        ")}`);
      }
    }),
  );
}
console.log(`\n${n} paths compared, ${bad} with differences.`);
process.exit(bad ? 1 : 0);
