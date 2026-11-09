import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ApiHandler } from "../../api/_lib/http.js";
import { BATAS_BADAN, BATAS_BERKAS, batasBadan, buatApp } from "../app.js";
import type { VercelConfig } from "../rules.js";

const AKAR = resolve(__dirname, "..", "..");
const config: VercelConfig = JSON.parse(readFileSync(join(AKAR, "vercel.json"), "utf8"));
const ID = "AAAAAAAAAAAAAAAAAAAAAA";
const PDF = Buffer.from("%PDF-1.4 stand-in");

let dist: string;
let tutup: () => void;
let base: string;

const gema: ApiHandler = (req, res) => {
  const b = req.body;
  res.status(200).json({
    adaBuffer: Buffer.isBuffer(b),
    panjang: Buffer.isBuffer(b) ? b.length : null,
  });
};

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "iris-berkas-"));
  writeFileSync(join(dist, "index.html"), "<h1>home</h1>");
  const { server } = await buatApp({
    akar: AKAR,
    dist,
    config,
    muat: async () => gema,
    bacaBerkas: async (id) => {
      if (id === "rusak") throw new Error("db down");
      return id === ID
        ? { nama: "Slide Modul 1 é.pdf", tipe: "application/pdf", ukuran: PDF.length, isi: PDF }
        : null;
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

describe("GET /f/<id>/<name>", () => {
  it("serves the stored file with its type, a cache time and a name for save-as", async () => {
    const r = await ambil(`/f/${ID}/Slide.pdf`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-length")).toBe(String(PDF.length));
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(r.headers.get("content-disposition")).toContain("filename*=UTF-8''Slide%20Modul%201%20");
    expect(Buffer.from(await r.arrayBuffer()).equals(PDF)).toBe(true);
  });

  it("may be framed by our own pages, unlike the rest of the site", async () => {
    const f = await ambil(`/f/${ID}/x.pdf`);
    expect(f.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    const home = await ambil("/");
    expect(home.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("answers 304 to a matching ETag, and HEAD with no body", async () => {
    const r1 = await ambil(`/f/${ID}/x.pdf`);
    const etag = r1.headers.get("etag")!;
    const r2 = await ambil(`/f/${ID}/x.pdf`, { headers: { "If-None-Match": etag } });
    expect(r2.status).toBe(304);
    const h = await ambil(`/f/${ID}/x.pdf`, { method: "HEAD" });
    expect(h.status).toBe(200);
    expect(await h.text()).toBe("");
  });

  it("is 404 for an unknown id, 503 when the database fails, 405 for a write", async () => {
    expect((await ambil("/f/BBBBBBBBBBBBBBBBBBBBBB/x.pdf")).status).toBe(404);
    expect((await ambil("/f/rusak/x.pdf")).status).toBe(503);
    expect((await ambil(`/f/${ID}/x.pdf`, { method: "POST", body: "x" })).status).toBe(405);
  });
});

describe("request body limits", () => {
  it("lets a file through up to 21 MB and keeps JSON at 4.5 MB", () => {
    expect(batasBadan("application/pdf")).toBe(BATAS_BERKAS);
    expect(batasBadan("image/webp")).toBe(BATAS_BERKAS);
    expect(batasBadan("application/json")).toBe(BATAS_BADAN);
    expect(batasBadan("")).toBe(BATAS_BADAN);
    expect(batasBadan("text/plain; charset=utf-8")).toBe(BATAS_BADAN);
    expect(batasBadan("application/x-www-form-urlencoded")).toBe(BATAS_BADAN);
  });

  it("hands an API action a 6 MB PDF as a Buffer", async () => {
    const isi = Buffer.alloc(6 * 1024 * 1024, 1);
    const r = await ambil("/api/presentasi/slides-unggah", {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: isi,
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ adaBuffer: true, panjang: isi.length });
  });

  it("refuses JSON over 4.5 MB with 413", async () => {
    const json = await ambil("/api/presentasi/slides-unggah", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: "x".repeat(BATAS_BADAN + 10) }),
    });
    expect(json.status).toBe(413);
  });
});
