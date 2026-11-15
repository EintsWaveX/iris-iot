import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ApiHandler } from "../../api/_lib/http.js";
import { buatApp } from "../app.js";
import { buatEtag, cocokEtag, ETAG_MIN_BYTE } from "../etag.js";
import type { VercelConfig } from "../rules.js";

const AKAR = resolve(__dirname, "..", "..");
const config: VercelConfig = JSON.parse(readFileSync(join(AKAR, "vercel.json"), "utf8"));

const daftar = (n: number, awalan = "Nama") =>
  Array.from({ length: n }, (_, i) => ({ id: i, nama: `${awalan} ${i}` }));
const BESAR = { baris: daftar(300) };
const KECIL = { ok: true };

let dist: string;
let tutup: () => void;
let port: number;

/** One handler for every route: `?aksi=` picks what it answers. */
const api: ApiHandler = (req, res) => {
  const aksi = String(req.query.aksi ?? "besar");
  const cookie = String(req.headers.cookie ?? "");
  switch (aksi) {
    case "kecil":
      return res.status(200).json(KECIL);
    case "simpan":
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(BESAR);
    case "cookie":
      res.setHeader("Set-Cookie", "x=1; Path=/");
      return res.status(200).json(BESAR);
    case "milik":
      res.setHeader("ETag", '"milik-handler"');
      return res.status(200).json(BESAR);
    case "publik":
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=15");
      return res.status(200).json(BESAR);
    case "pengguna":
      // Per-user answer: the body depends on who asks.
      return res.status(200).json({ untuk: cookie, baris: daftar(300, cookie) });
    case "buat":
      return res.status(201).json(BESAR);
    case "tulis":
      return res.status(200).json(BESAR);
    default:
      return res.status(200).json(BESAR);
  }
};

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "iris-etag-"));
  writeFileSync(join(dist, "index.html"), "<h1>x</h1>");
  const { server } = await buatApp({ akar: AKAR, dist, config, muat: async () => api });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
  tutup = () => server.close();
});

afterAll(() => {
  tutup();
  rmSync(dist, { recursive: true, force: true });
});

function minta(
  path: string,
  headers: Record<string, string> = {},
  method = "GET",
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((ok, gagal) => {
    const r = http.request({ host: "127.0.0.1", port, path, headers, method }, (res) => {
      const bagian: Buffer[] = [];
      res.on("data", (c: Buffer) => bagian.push(c));
      res.on("end", () =>
        ok({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(bagian) }),
      );
    });
    r.on("error", gagal);
    r.end();
  });
}

const URL_API = "/api/session?aksi=";

describe("ETag and 304 on API JSON reads", () => {
  it("tags a read, and answers 304 with no body when the browser sends the tag back", async () => {
    const a = await minta(`${URL_API}besar`, { "Accept-Encoding": "br" });
    expect(a.status).toBe(200);
    const etag = String(a.headers.etag);
    expect(etag).toMatch(/^"[A-Za-z0-9_-]+-br"$/); // strong, names the coding
    expect(a.headers["cache-control"]).toBe("private, no-cache");
    expect(a.headers.vary).toMatch(/accept-encoding/i);

    const b = await minta(`${URL_API}besar`, { "Accept-Encoding": "br", "If-None-Match": etag });
    expect(b.status).toBe(304);
    expect(b.body.length).toBe(0);
    expect(b.headers.etag).toBe(etag);
    expect(b.headers["cache-control"]).toBe("private, no-cache");
    expect(b.headers.vary).toMatch(/accept-encoding/i);
    expect(b.headers["content-encoding"]).toBeUndefined();
  });

  it("sends the full answer when the stored tag is stale, listed among others, or weak", async () => {
    const etag = String((await minta(`${URL_API}besar`)).headers.etag);
    expect((await minta(`${URL_API}besar`, { "If-None-Match": '"lama"' })).status).toBe(200);
    expect((await minta(`${URL_API}besar`, { "If-None-Match": `"lama", ${etag}` })).status).toBe(
      304,
    );
    expect((await minta(`${URL_API}besar`, { "If-None-Match": `W/${etag}` })).status).toBe(304);
    expect((await minta(`${URL_API}besar`, { "If-None-Match": "*" })).status).toBe(304);
  });

  it("gives each content coding its own tag", async () => {
    const polos = String((await minta(`${URL_API}besar`)).headers.etag);
    const br = String((await minta(`${URL_API}besar`, { "Accept-Encoding": "br" })).headers.etag);
    const gz = String((await minta(`${URL_API}besar`, { "Accept-Encoding": "gzip" })).headers.etag);
    expect(new Set([polos, br, gz]).size).toBe(3);
    // The Brotli tag does not validate a gzip copy.
    const salah = await minta(`${URL_API}besar`, {
      "Accept-Encoding": "gzip",
      "If-None-Match": br,
    });
    expect(salah.status).toBe(200);
  });

  it("never tags a small answer", async () => {
    const r = await minta(`${URL_API}kecil`);
    expect(JSON.stringify(KECIL).length).toBeLessThan(ETAG_MIN_BYTE);
    expect(r.status).toBe(200);
    expect(r.headers.etag).toBeUndefined();
  });

  it("never tags or 304s a no-store answer, even when asked", async () => {
    const r = await minta(`${URL_API}simpan`, { "If-None-Match": "*" });
    expect(r.status).toBe(200);
    expect(r.headers.etag).toBeUndefined();
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body.length).toBeGreaterThan(0);
  });

  it("never tags an answer that sets a cookie, and leaves a handler's own ETag alone", async () => {
    const c = await minta(`${URL_API}cookie`, { "If-None-Match": "*" });
    expect(c.status).toBe(200);
    expect(c.headers.etag).toBeUndefined();
    const m = await minta(`${URL_API}milik`);
    expect(m.headers.etag).toBe('"milik-handler"');
  });

  it("keeps a Cache-Control the handler chose", async () => {
    const r = await minta(`${URL_API}publik`);
    expect(r.headers["cache-control"]).toBe("public, max-age=0, s-maxage=15");
    expect(r.headers.etag).toBeDefined();
  });

  it("only tags plain 200 reads: not a POST, not a 201", async () => {
    const post = await minta(`${URL_API}tulis`, {}, "POST");
    expect(post.status).toBe(200);
    expect(post.headers.etag).toBeUndefined();
    const dibuat = await minta(`${URL_API}buat`, { "If-None-Match": "*" });
    expect(dibuat.status).toBe(201);
    expect(dibuat.headers.etag).toBeUndefined();
  });

  it("is safe for per-user answers: another person's tag never validates this person's body", async () => {
    const ani = await minta(`${URL_API}pengguna`, { Cookie: "sesi=ani" });
    const budi = await minta(`${URL_API}pengguna`, {
      Cookie: "sesi=budi",
      "If-None-Match": String(ani.headers.etag),
    });
    expect(budi.status).toBe(200);
    expect(JSON.parse(budi.body.toString()).untuk).toBe("sesi=budi");
    expect(budi.headers.etag).not.toBe(ani.headers.etag);
    // And the same person with the same answer is told nothing changed.
    const lagi = await minta(`${URL_API}pengguna`, {
      Cookie: "sesi=ani",
      "If-None-Match": String(ani.headers.etag),
    });
    expect(lagi.status).toBe(304);
  });

  it("changes the tag when one byte of the answer changes", () => {
    const a = Buffer.from(JSON.stringify({ x: "a".repeat(600) }));
    const b = Buffer.from(JSON.stringify({ x: "a".repeat(599) + "b" }));
    expect(buatEtag(a, "")).not.toBe(buatEtag(b, ""));
    expect(buatEtag(a, "br")).toBe(buatEtag(a, "br"));
  });

  it("reads If-None-Match lists the way HTTP does", () => {
    expect(cocokEtag(undefined, '"a"')).toBe(false);
    expect(cocokEtag("", '"a"')).toBe(false);
    expect(cocokEtag('"b", "a"', '"a"')).toBe(true);
    expect(cocokEtag('W/"a"', '"a"')).toBe(true);
    expect(cocokEtag("*", '"a"')).toBe(true);
    expect(cocokEtag(['"x"', '"a"'], '"a"')).toBe(true);
    expect(cocokEtag('"ab"', '"a"')).toBe(false);
  });
});
