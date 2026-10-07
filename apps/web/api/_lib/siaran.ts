/**
 * Live updates, the API side: after a write succeeds, tell every open page
 * which kinds of data changed, through the relay's /siaran room (apps/relay).
 * Pages that show that data fetch it again (src/lib/siaran.ts), so a change
 * on one device shows on the others without a refresh.
 *
 * A message carries topic names only, never data: a page that hears one
 * asks the API again with its own sign-in. The topics, and which write sends
 * which, live in src/lib/siaran-topik.ts, shared with the pages.
 *
 * The answer also names its topics in an `x-siaran` header, so the tab that
 * made the write refreshes its other panels at once, relay or not
 * (2026-10-07).
 *
 * Pi heartbeats (api/agent) send only when something a page shows changed.
 */
import { createHmac } from "node:crypto";
import type { ApiHandler, ApiRequest, ApiResponse } from "./http.js";
import { konsolEnv } from "./konsol.js";
import { denganGalat } from "./galat.js";
import { topikUntuk, type Topik } from "../../src/lib/siaran-topik.js";

/** Sends the topics to the relay; quietly does nothing when the relay is
 *  not set up or doesn't answer within 1.5 s (pages also refetch when they
 *  come back into view, so a lost message only delays an update). */
export async function siarkan(topik: readonly Topik[]): Promise<void> {
  const env = konsolEnv();
  if (!env || !topik.length) return;
  const body = JSON.stringify({ t: [...new Set(topik)] });
  const ts = Math.floor(Date.now() / 1000);
  const tanda = createHmac("sha256", env.secret).update(`siaran|${body}|${ts}`).digest("hex");
  try {
    await fetch(`${env.relay.replace(/^ws/, "http")}/siaran/kirim`, {
      method: "POST",
      headers: { "x-siaran-ts": String(ts), "x-siaran-tanda": tanda },
      body,
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* the pages catch up on their next refetch */
  }
}

/**
 * Wraps a route: once a non-GET request has answered with a success (a 2xx
 * whose JSON isn't `ok: false`), the route's topics go out. The answer has
 * already been sent by then, so the caller never waits on the relay.
 */
export function denganSiaran(rute: string, handler: ApiHandler): ApiHandler {
  // Errors it logs or throws are reported too (_lib/galat.ts).
  return denganGalat(rute, async (req: ApiRequest, res: ApiResponse) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return handler(req, res);
    }
    const aksi = req.query?.aksi;
    const topik = topikUntuk(rute, aksi) ?? [];
    // An answer that isn't JSON counts by its status alone.
    let berhasil: boolean | null = null;
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      const gagal = !!body && typeof body === "object" && (body as { ok?: unknown }).ok === false;
      berhasil = !gagal && res.statusCode < 300;
      if (berhasil && topik.length && !res.headersSent) res.setHeader("x-siaran", topik.join(","));
      json(body);
    };
    await handler(req, res);
    if (!(berhasil ?? res.statusCode < 300)) return;
    if (topikUntuk(rute, aksi) === null) {
      // A write missing from siaran-topik.ts: reported, so it gets listed.
      console.error(`[siaran] ${rute}:${String(aksi ?? "")} has no topics`);
      return;
    }
    await siarkan(topik);
  });
}
