import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ApiHandler } from "../../api/_lib/http.js";
import { buatApp } from "../app.js";
import { bisaDikompres, pilihKode } from "../kompres.js";
import type { VercelConfig } from "../rules.js";

const AKAR = resolve(__dirname, "..", "..");
const config: VercelConfig = JSON.parse(readFileSync(join(AKAR, "vercel.json"), "utf8"));

const HTML = `<!doctype html><html><body>${"<p>Halo dari IRIS, ini baris yang berulang.</p>".repeat(200)}</body></html>`;
const JS = `${"export const a = () => 1;\n".repeat(400)}`;
const BESAR = { baris: Array.from({ length: 300 }, (_, i) => ({ id: i, nama: `Nama ${i}` })) };
const KECIL = { ok: true };

let dist: string;
let tutup: () => void;
let port: number;

const api: ApiHandler = (req, res) => {
  res.status(200).json(req.query.kecil ? KECIL : BESAR);
};

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "iris-kompres-"));
  mkdirSync(join(dist, "_astro"), { recursive: true });
  writeFileSync(join(dist, "index.html"), HTML);
  writeFileSync(join(dist, "kecil.html"), "<h1>kecil</h1>");
  writeFileSync(join(dist, "_astro", "app.abc123.js"), JS);
  writeFileSync(join(dist, "foto.png"), Buffer.alloc(5000, 7));
  const { server } = await buatApp({ akar: AKAR, dist, config, muat: async () => api });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
  tutup = () => server.close();
});

afterAll(() => {
  tutup();
  rmSync(dist, { recursive: true, force: true });
});

/** A raw request: node's fetch would decode the body and hide the real byte count. */
function minta(path: string, enc?: string, tambah: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>(
    (ok, gagal) => {
      const headers: Record<string, string> = { ...tambah };
      if (enc !== undefined) headers["Accept-Encoding"] = enc;
      http
        .get({ host: "127.0.0.1", port, path, headers }, (r) => {
          const bagian: Buffer[] = [];
          r.on("data", (c: Buffer) => bagian.push(c));
          r.on("end", () =>
            ok({ status: r.statusCode ?? 0, headers: r.headers, body: Buffer.concat(bagian) }),
          );
        })
        .on("error", gagal);
    },
  );
}

describe("pilihKode", () => {
  it("prefers brotli, falls back to gzip, honours q=0, and says null for nothing", () => {
    expect(pilihKode("gzip, deflate, br")).toBe("br");
    expect(pilihKode("gzip, deflate")).toBe("gzip");
    expect(pilihKode("br;q=0, gzip")).toBe("gzip");
    expect(pilihKode("gzip;q=0")).toBeNull();
    expect(pilihKode("identity")).toBeNull();
    expect(pilihKode(undefined)).toBeNull();
    expect(pilihKode("*")).toBe("gzip");
    expect(pilihKode(["deflate", "BR"])).toBe("br");
  });
  it("knows which types shrink", () => {
    for (const t of [
      "text/html; charset=utf-8",
      "text/javascript",
      "image/svg+xml",
      "application/json",
    ])
      expect(bisaDikompres(t)).toBe(true);
    for (const t of ["image/png", "application/pdf", "font/woff2", "application/octet-stream"])
      expect(bisaDikompres(t)).toBe(false);
  });
});

describe("static files", () => {
  it("sends HTML brotli compressed, smaller, with Vary and the same bytes once decoded", async () => {
    const r = await minta("/", "gzip, deflate, br");
    expect(r.status).toBe(200);
    expect(r.headers["content-encoding"]).toBe("br");
    expect(r.headers["vary"]).toBe("Accept-Encoding");
    expect(Number(r.headers["content-length"])).toBe(r.body.length);
    expect(r.body.length).toBeLessThan(Buffer.byteLength(HTML) / 5);
    expect(zlib.brotliDecompressSync(r.body).toString("utf8")).toBe(HTML);
  });

  it("falls back to gzip, and to the plain file when the browser accepts neither", async () => {
    const g = await minta("/", "gzip");
    expect(g.headers["content-encoding"]).toBe("gzip");
    expect(zlib.gunzipSync(g.body).toString("utf8")).toBe(HTML);
    const p = await minta("/", "identity");
    expect(p.headers["content-encoding"]).toBeUndefined();
    expect(p.headers["vary"]).toBe("Accept-Encoding");
    expect(p.body.toString("utf8")).toBe(HTML);
  });

  it("keeps the hashed asset immutable while compressing it", async () => {
    const r = await minta("/_astro/app.abc123.js", "br");
    expect(r.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(r.headers["content-type"]).toContain("text/javascript");
    expect(r.headers["content-encoding"]).toBe("br");
    expect(zlib.brotliDecompressSync(r.body).toString("utf8")).toBe(JS);
  });

  it("serves the same compressed copy again, and a 304 for a matching ETag with no body", async () => {
    const a = await minta("/", "br");
    const b = await minta("/", "br");
    expect(b.body.equals(a.body)).toBe(true);
    const c = await minta("/", "br", { "If-None-Match": String(a.headers["etag"]) });
    expect(c.status).toBe(304);
    expect(c.body.length).toBe(0);
  });

  it("answers 304 to If-Modified-Since too, since Cloudflare hides the ETag from browsers", async () => {
    const a = await minta("/", "br");
    const lm = String(a.headers["last-modified"]);
    const same = await minta("/", "br", { "If-Modified-Since": lm });
    expect(same.status).toBe(304);
    expect(same.body.length).toBe(0);
    const old = await minta("/", "br", {
      "If-Modified-Since": new Date(Date.parse(lm) - 60_000).toUTCString(),
    });
    expect(old.status).toBe(200);
    const junk = await minta("/", "br", { "If-Modified-Since": "not a date" });
    expect(junk.status).toBe(200);
    // If-None-Match wins: a stale ETag is not rescued by a fresh date.
    const both = await minta("/", "br", { "If-None-Match": 'W/"nope"', "If-Modified-Since": lm });
    expect(both.status).toBe(200);
  });

  it("leaves tiny files and already-compressed types alone", async () => {
    const k = await minta("/kecil.html", "br");
    expect(k.headers["content-encoding"]).toBeUndefined();
    expect(k.headers["vary"]).toBeUndefined();
    expect(k.body.toString("utf8")).toBe("<h1>kecil</h1>");
    const f = await minta("/foto.png", "br");
    expect(f.headers["content-encoding"]).toBeUndefined();
    expect(f.body.length).toBe(5000);
  });
});

describe("API JSON", () => {
  it("compresses a large answer and decodes to the same JSON", async () => {
    const mentah = JSON.stringify(BESAR);
    const r = await minta("/api/presentasi/tes", "gzip, br");
    expect(r.headers["content-encoding"]).toBe("br");
    expect(r.headers["vary"]).toBe("Accept-Encoding");
    expect(Number(r.headers["content-length"])).toBe(r.body.length);
    expect(r.body.length).toBeLessThan(Buffer.byteLength(mentah) / 3);
    expect(zlib.brotliDecompressSync(r.body).toString("utf8")).toBe(mentah);
    const g = await minta("/api/presentasi/tes", "gzip");
    expect(g.headers["content-encoding"]).toBe("gzip");
    expect(zlib.gunzipSync(g.body).toString("utf8")).toBe(mentah);
  });

  it("sends the plain body when the browser takes no encoding, and for a small answer", async () => {
    const mentah = JSON.stringify(BESAR);
    const p = await minta("/api/presentasi/tes", "identity");
    expect(p.headers["content-encoding"]).toBeUndefined();
    expect(p.body.toString("utf8")).toBe(mentah);
    const k = await minta("/api/presentasi/tes?kecil=1", "br");
    expect(k.headers["content-encoding"]).toBeUndefined();
    expect(k.headers["vary"]).toBeUndefined();
    expect(k.body.toString("utf8")).toBe(JSON.stringify(KECIL));
  });
});
