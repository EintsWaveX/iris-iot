import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ApiHandler } from "../../api/_lib/http.js";
import { BATAS_BADAN, buatApp, uraiBadan } from "../app.js";
import type { VercelConfig } from "../rules.js";

const AKAR = resolve(__dirname, "..", "..");
const config: VercelConfig = JSON.parse(readFileSync(join(AKAR, "vercel.json"), "utf8"));

let dist: string;
let tutup: () => void;
let base: string;
let dbHidup = true;

/** Every route answers with what it was handed, so the test sees the plumbing. */
const gema: ApiHandler = (req, res) => {
  res.status(201).json({ query: req.query, body: req.body, method: req.method, url: req.url });
};

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "iris-dist-"));
  const tulis = (p: string, isi: string) => {
    mkdirSync(join(dist, p, ".."), { recursive: true });
    writeFileSync(join(dist, p), isi);
  };
  tulis("index.html", "<h1>home</h1>");
  tulis("404.html", "<h1>not found</h1>");
  tulis("en/modules/3/index.html", "<h1>module 3</h1>");
  tulis("en/about.html", "<h1>about</h1>");
  tulis("_astro/a.js", "console.log(1)");
  tulis("handbook/x.pdf", "%PDF");
  const { server } = await buatApp({
    akar: AKAR,
    dist,
    config,
    sha: "abc123",
    muat: async (r) =>
      r.berkas === "api/server/index.ts"
        ? () => {
            throw new Error("boom");
          }
        : gema,
    periksaDb: async () => {
      if (!dbHidup) throw new Error("down");
    },
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tutup = () => server.close();
});

afterAll(() => {
  tutup();
  rmSync(dist, { recursive: true, force: true });
});

const ambil = (path: string, init?: RequestInit) =>
  fetch(base + path, { redirect: "manual", ...init });

describe("the built site", () => {
  it("serves the home page with vercel.json's security headers", async () => {
    const r = await ambil("/");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("<h1>home</h1>");
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("strict-transport-security")).toContain("max-age=63072000");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(r.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
  });

  it("finds a page as a folder index, a .html file, and with a trailing slash", async () => {
    expect(await (await ambil("/en/modules/3")).text()).toBe("<h1>module 3</h1>");
    expect(await (await ambil("/en/modules/3/")).text()).toBe("<h1>module 3</h1>");
    expect(await (await ambil("/en/about")).text()).toBe("<h1>about</h1>");
  });

  it("answers an unknown path with the 404 page and a 404", async () => {
    const r = await ambil("/nope");
    expect(r.status).toBe(404);
    expect(await r.text()).toBe("<h1>not found</h1>");
    expect(r.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
  });

  it("caches hashed assets for a year and answers a repeat with 304", async () => {
    const r = await ambil("/_astro/a.js");
    expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(r.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    const etag = r.headers.get("etag")!;
    expect(etag).toMatch(/^W\//);
    const again = await ambil("/_astro/a.js", { headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
  });

  it("gives the handbook its own CSP and cache time", async () => {
    const r = await ambil("/handbook/x.pdf");
    expect(r.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect(r.headers.get("cache-control")).toBe(
      "public, max-age=86400, stale-while-revalidate=604800",
    );
  });

  it("answers HEAD without a body and refuses POST on a page", async () => {
    const h = await ambil("/", { method: "HEAD" });
    expect(h.status).toBe(200);
    expect(await h.text()).toBe("");
    expect((await ambil("/", { method: "POST" })).status).toBe(405);
  });

  it("never serves a file from outside dist", async () => {
    const dapat = await new Promise<number>((ok) => {
      const u = new URL(base);
      http
        .get({ host: u.hostname, port: u.port, path: "/%2e%2e/%2e%2e/package.json" }, (res) => {
          res.resume();
          ok(res.statusCode ?? 0);
        })
        .on("error", () => ok(0));
    });
    expect(dapat).toBe(404);
  });
});

describe("redirects", () => {
  it("redirects like vercel.json, keeping the query", async () => {
    const r = await ambil("/lms?a=1");
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe("/grading?a=1");
    const t = await ambil("/zh/modules/3");
    expect(t.status).toBe(307);
    expect(t.headers.get("location")).toBe("/en/modules/3");
  });

  it("gives a redirect only its Location and the platform HSTS, as Vercel does", async () => {
    const r = await ambil("/lms");
    expect(r.headers.get("content-security-policy")).toBeNull();
    expect(r.headers.get("x-content-type-options")).toBeNull();
    expect(r.headers.get("strict-transport-security")).toBe("max-age=63072000");
    expect(r.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
  });

  // fetch will not let a test choose the Host header, so these use http directly.
  const dengan = (path: string, host: string, method = "GET", badan = "") =>
    new Promise<{ status: number; location?: string }>((ok, no) => {
      const u = new URL(base);
      const req = http.request(
        {
          host: u.hostname,
          port: u.port,
          path,
          method,
          headers: { host, "content-type": "application/json" },
        },
        (res) => {
          res.resume();
          ok({ status: res.statusCode ?? 0, location: res.headers.location });
        },
      );
      req.on("error", no);
      req.end(badan);
    });

  it("forwards the old Vercel host's pages but never its /api", async () => {
    const r = await dengan("/en/modules/3?tab=x", "iris-praktikum-jurnal.vercel.app");
    expect(r).toEqual({ status: 308, location: "https://irisiotlab.com/en/modules/3?tab=x" });
    const api = await dengan("/api/agen", "iris-praktikum-jurnal.vercel.app", "POST", "{}");
    expect(api.status).toBe(201);
    const baru = await dengan("/en/modules/3", "irisiotlab.com");
    expect(baru.status).toBe(200);
  });
});

describe("the API", () => {
  it("hands a handler Vercel's request: merged query, parsed JSON body", async () => {
    const r = await ambil("/api/auth/student?x=1&x=2&y=3", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nim: "123" }),
    });
    expect(r.status).toBe(201);
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await r.json()).toMatchObject({
      query: { aksi: "student", x: ["1", "2"], y: "3" },
      body: { nim: "123" },
      method: "POST",
    });
  });

  it("applies rewrites before routing, and the headers reach API answers", async () => {
    const r = await ambil("/api/agen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(r.status).toBe(201);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    const s = await ambil("/api/sesi/kelompok");
    expect((await s.json()).query).toEqual({ aksi: "group" });
  });

  it("answers malformed JSON with 400, like Vercel", async () => {
    const r = await ambil("/api/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, kode: "json_tidak_sah" });
  });

  it("refuses a body over Vercel's 4.5 MB", async () => {
    const r = await ambil("/api/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: Buffer.alloc(BATAS_BADAN + 1024, 97),
    }).catch(() => null);
    // The server may close the socket as it answers; either way nothing got through.
    if (r) expect(r.status).toBe(413);
  });

  it("answers 404 JSON for an unknown API path and 500 JSON when a handler throws", async () => {
    const n = await ambil("/api/zzz");
    expect(n.status).toBe(404);
    expect(await n.json()).toEqual({ ok: false, kode: "tidak_ditemukan" });
    const e = await ambil("/api/server");
    expect(e.status).toBe(500);
    expect(await e.json()).toEqual({ ok: false, kode: "galat_server" });
  });
});

describe("/api/sehat", () => {
  it("answers without touching the database by default", async () => {
    const r = await ambil("/api/sehat");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, sha: "abc123", latar: 0 });
  });

  it("checks the database on request and goes 503 when it is down", async () => {
    expect((await (await ambil("/api/sehat?db=1")).json()).db).toBe(true);
    dbHidup = false;
    const r = await ambil("/api/sehat?db=1");
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false, db: false });
    dbHidup = true;
  });
});

describe("uraiBadan", () => {
  it("reads a body the way Vercel does", () => {
    expect(uraiBadan("application/json", Buffer.from('{"a":1}'))).toEqual({ a: 1 });
    expect(uraiBadan("application/json", Buffer.from("{"))).toBeUndefined();
    expect(uraiBadan("application/x-www-form-urlencoded", Buffer.from("a=1&b=2"))).toEqual({
      a: "1",
      b: "2",
    });
    expect(uraiBadan("text/plain", Buffer.from("hi"))).toBe("hi");
    expect(Buffer.isBuffer(uraiBadan("application/octet-stream", Buffer.from("x")))).toBe(true);
    expect(uraiBadan("application/json", Buffer.alloc(0))).toBeUndefined();
  });
});
