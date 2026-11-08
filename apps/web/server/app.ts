/**
 * The IRIS site and API as one plain Node HTTP server, for the PC Server
 * (and the laptop standby) behind a Cloudflare Tunnel.
 *
 * It does what Vercel did and nothing more: vercel.json's redirects,
 * rewrites and headers (server/rules.ts), file routing for api/
 * (server/routes.ts), the built site (server/static.ts), and Vercel's
 * conveniences on the request and response (`req.query`, a parsed
 * `req.body`, `res.status().json()`), so every handler runs unchanged.
 *
 * It listens on 127.0.0.1 only; the tunnel is the one way in.
 */
import http from "node:http";
import { hostname } from "node:os";
import { pathToFileURL } from "node:url";
import type { ApiHandler, ApiRequest, ApiResponse } from "../api/_lib/http.js";
import { jumlahLatar } from "../api/_lib/tunggu.js";
import { compileRules, type VercelConfig } from "./rules.js";
import { cocokkanRute, petaRute, type Rute } from "./routes.js";
import { cariBerkas, sajikan } from "./static.js";

/** Vercel's own body limit, kept so a handler sees what it sees there. */
export const BATAS_BADAN = 4.5 * 1024 * 1024;
/** Vercel's default function time; vercel.json's `maxDuration` narrows it per route. */
export const DURASI_BAWAAN_DETIK = 300;

export interface OpsiApp {
  /** apps/web (holds api/, vercel.json and what handlers read from disk). */
  akar: string;
  /** The built site. */
  dist: string;
  config: VercelConfig;
  /** The commit this build is, for /api/sehat. */
  sha?: string;
  /** Loads a route's handler; the default imports the file. Tests pass fakes. */
  muat?: (rute: Rute) => Promise<ApiHandler>;
  /** Ran by /api/sehat?db=1; it rejects when the database does not answer. */
  periksaDb?: () => Promise<void>;
}

const tak = (res: http.ServerResponse, status: number, badan: unknown) => {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(badan));
};

function ambilQuery(url: URL, param: Record<string, string>): ApiRequest["query"] {
  const q: Record<string, string | string[]> = {};
  for (const [k, v] of url.searchParams) {
    const ada = q[k];
    q[k] = ada === undefined ? v : Array.isArray(ada) ? [...ada, v] : [ada, v];
  }
  return { ...q, ...param };
}

/** Reads the body up to the limit; null when it is over. */
async function bacaBadan(req: http.IncomingMessage): Promise<Buffer | null> {
  const potong: Buffer[] = [];
  let jumlah = 0;
  for await (const c of req) {
    const b = c as Buffer;
    jumlah += b.length;
    if (jumlah > BATAS_BADAN) return null;
    potong.push(b);
  }
  return Buffer.concat(potong);
}

/** What Vercel puts in `req.body` for a content type. `undefined` means invalid JSON. */
export function uraiBadan(jenis: string, mentah: Buffer): unknown {
  if (mentah.length === 0) return undefined;
  const t = jenis.toLowerCase();
  if (t.includes("application/json")) {
    try {
      return JSON.parse(mentah.toString("utf8"));
    } catch {
      return undefined;
    }
  }
  if (t.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(mentah.toString("utf8")));
  }
  if (t.startsWith("text/")) return mentah.toString("utf8");
  return mentah;
}

export async function buatApp(opsi: OpsiApp): Promise<{ server: http.Server; rute: Rute[] }> {
  const aturan = compileRules(opsi.config);
  const rute = petaRute(opsi.akar);
  const muat =
    opsi.muat ??
    (async (r: Rute) => {
      const mod = (await import(pathToFileURL(r.mutlak).href)) as { default?: unknown };
      if (typeof mod.default !== "function") throw new Error(`${r.berkas} has no default handler`);
      return mod.default as ApiHandler;
    });
  // Eager, so a handler that fails to load stops the start instead of the first visitor.
  const penangan = new Map<string, ApiHandler>();
  for (const r of rute) penangan.set(r.berkas, await muat(r));
  const mulai = Date.now();
  const halamanTiada = cariBerkas(opsi.dist, "/404.html");

  const jalankan = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    path: string,
  ): Promise<void> => {
    const hit = cocokkanRute(rute, path);
    if (!hit) return tak(res, 404, { ok: false, kode: "tidak_ditemukan" });
    const handler = penangan.get(hit.rute.berkas)!;
    const baca = req.method !== "GET" && req.method !== "HEAD";
    let badan: unknown;
    if (baca) {
      const mentah = await bacaBadan(req);
      if (mentah === null) {
        res.setHeader("Connection", "close");
        return tak(res, 413, { ok: false, kode: "badan_terlalu_besar" });
      }
      badan = uraiBadan(String(req.headers["content-type"] ?? ""), mentah);
      if (
        badan === undefined &&
        mentah.length > 0 &&
        String(req.headers["content-type"] ?? "").includes("json")
      ) {
        return tak(res, 400, { ok: false, kode: "json_tidak_sah" });
      }
    }
    const r = req as ApiRequest;
    r.query = ambilQuery(url, hit.param);
    r.body = badan;
    const s = res as ApiResponse;
    s.status = (kode: number) => {
      res.statusCode = kode;
      return s;
    };
    s.json = (b: unknown) => {
      if (!res.getHeader("Content-Type"))
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(b));
    };
    const detik = aturan.durasiMaks(hit.rute.berkas) ?? DURASI_BAWAAN_DETIK;
    const batas = setTimeout(() => {
      if (!res.writableEnded) tak(res, 504, { ok: false, kode: "kehabisan_waktu" });
    }, detik * 1000);
    try {
      await handler(r, s);
    } catch (err) {
      console.error(`[server] ${hit.rute.berkas} threw:`, err);
      tak(res, 500, { ok: false, kode: "galat_server" });
    } finally {
      clearTimeout(batas);
    }
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      let url: URL;
      try {
        url = new URL(req.url ?? "/", "http://iris.local");
      } catch {
        return tak(res, 400, { ok: false, kode: "alamat_tidak_sah" });
      }
      const asli = url.pathname;

      // As on Vercel, a redirect carries only its Location (and the platform's
      // own HSTS), not vercel.json's header rules.
      const alih = aturan.alihkan(String(req.headers.host ?? ""), asli, url.search);
      if (alih) {
        res.statusCode = alih.status;
        res.setHeader("Location", alih.lokasi);
        res.setHeader("Strict-Transport-Security", "max-age=63072000");
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        res.end();
        return;
      }

      // vercel.json's headers go on every other answer; a handler may still replace one.
      for (const [k, v] of aturan.header(asli)) res.setHeader(k, v);

      if (asli === "/api/sehat") {
        const badan: Record<string, unknown> = {
          ok: true,
          host: hostname(),
          sha: opsi.sha ?? process.env.IRIS_BUILD_SHA ?? null,
          jalanDetik: Math.round((Date.now() - mulai) / 1000),
          latar: jumlahLatar(),
        };
        if (url.searchParams.get("db") === "1" && opsi.periksaDb) {
          try {
            await Promise.race([
              opsi.periksaDb(),
              new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 3000)),
            ]);
            badan.db = true;
          } catch {
            badan.db = false;
            badan.ok = false;
          }
        }
        return tak(res, badan.ok ? 200 : 503, badan);
      }

      const path = aturan.tulisUlang(asli);
      if (path === "/api" || path.startsWith("/api/")) {
        try {
          await jalankan(req, res, url, path);
        } catch (err) {
          console.error("[server] request failed:", err);
          tak(res, 500, { ok: false, kode: "galat_server" });
        }
        return;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        res.statusCode = 405;
        res.end();
        return;
      }
      const f = cariBerkas(opsi.dist, path);
      if (f) return sajikan(req, res, f, path);
      if (halamanTiada) return sajikan(req, res, halamanTiada, path, 404);
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not found");
    })().catch((err) => {
      console.error("[server] unhandled:", err);
      if (!res.headersSent) tak(res, 500, { ok: false, kode: "galat_server" });
      else res.destroy();
    });
  });
  // cloudflared keeps connections open; stay longer than its idle time.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 120_000;
  return { server, rute };
}
