#!/usr/bin/env node
/**
 * Web delivery baseline (real-time upgrade, Phase 0): for a list of pages, how long the HTML takes
 * (TTFB and total, median of several runs), what the first load has to download (stylesheets, scripts,
 * modulepreloads, transfer bytes with brotli) and whether a repeat visit costs a 304. Read-only GETs.
 *
 *   node scripts/baseline-web.mjs [base] [--runs 5] [--out perf/web-baseline.json]
 *
 * base defaults to https://irisiotlab.com. Run it from a place that is not the PC (a laptop) for the
 * numbers a visitor sees, and from the PC itself with base http://127.0.0.1:8787 for the server alone.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const opt = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = (args.find((a) => /^https?:\/\//.test(a)) ?? "https://irisiotlab.com").replace(
  /\/$/,
  "",
);
const RUNS = Math.max(1, Number(opt("--runs", "5")));
const PAGES = [
  "/",
  "/login",
  "/modules/1",
  "/recruitment",
  "/servers",
  "/dashboard",
  "/session",
  "/team",
];
const H = { "accept-encoding": "br, gzip", "user-agent": "iris-baseline/1" };

const median = (a) => {
  const u = [...a].sort((x, y) => x - y);
  return u.length ? u[Math.floor((u.length - 1) / 2)] : 0;
};
const r1 = (x) => Math.round(x * 10) / 10;

/** One GET: ms to the headers (ttfb), ms to the whole body, bytes on the wire when known. */
async function ambil(url, extra = {}) {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { ...H, ...extra }, redirect: "follow" });
  const ttfb = performance.now() - t0;
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    res,
    ttfb,
    total: performance.now() - t0,
    bytes: Number(res.headers.get("content-length")) || buf.length,
    teks: buf.toString("utf8"),
  };
}

function aset(html) {
  const css = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)].map(
    (m) => m[1],
  );
  const js = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]);
  const pre = [
    ...html.matchAll(/<link[^>]+rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/g),
  ].map((m) => m[1]);
  const isl = [...html.matchAll(/<astro-island[^>]*component-url=["']([^"']+)["']/g)].map(
    (m) => m[1],
  );
  return { css, js, pre, isl: [...new Set(isl)] };
}

const hasil = { cap: new Date().toISOString(), base: BASE, runs: RUNS, halaman: {} };
for (const p of PAGES) {
  const ttfb = [];
  const total = [];
  let html = "";
  let etag = null;
  let modified = null;
  let status = 0;
  let enc = null;
  let cache = null;
  for (let i = 0; i < RUNS; i++) {
    const a = await ambil(BASE + p);
    ttfb.push(a.ttfb);
    total.push(a.total);
    html = a.teks;
    status = a.res.status;
    etag = a.res.headers.get("etag");
    modified = a.res.headers.get("last-modified");
    enc = a.res.headers.get("content-encoding");
    cache = a.res.headers.get("cache-control");
  }
  const { css, js, pre, isl } = aset(html);
  let htmlBytes = 0;
  const a1 = await ambil(BASE + p);
  htmlBytes = a1.bytes;
  // First-load subresources: stylesheets and scripts named in the HTML, plus the island components.
  const urls = [...new Set([...css, ...js, ...pre, ...isl])].map((u) => new URL(u, BASE + p).href);
  let asetBytes = 0;
  const cssBytes = [];
  for (const u of urls) {
    try {
      const x = await ambil(u);
      asetBytes += x.bytes;
      if (css.some((c) => u.endsWith(c) || c.endsWith(new URL(u).pathname))) cssBytes.push(x.bytes);
    } catch {
      /* a missing asset shows as fewer bytes */
    }
  }
  // A repeat visit: the browser sends what it has; 304 means no body crossed the wire.
  let kondisional = null;
  if (etag || modified) {
    const syarat = etag ? { "if-none-match": etag } : { "if-modified-since": modified };
    const c = await fetch(BASE + p, { headers: { ...H, ...syarat } });
    kondisional = c.status;
    await c.arrayBuffer();
  }
  hasil.halaman[p] = {
    status,
    htmlTtfbMs: r1(median(ttfb)),
    htmlTotalMs: r1(median(total)),
    htmlBytes,
    contentEncoding: enc,
    cacheControl: cache,
    stylesheet: css.length,
    stylesheetBytes: cssBytes.reduce((s, x) => s + x, 0),
    script: js.length,
    modulepreload: pre.length,
    islands: isl.length,
    firstLoadBytes: htmlBytes + asetBytes,
    punyaEtag: Boolean(etag),
    punyaLastModified: Boolean(modified),
    ulangKunjungan: kondisional,
  };
}
const out = opt("--out");
const json = JSON.stringify(hasil, null, 2);
console.log(json);
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json + "\n");
}
