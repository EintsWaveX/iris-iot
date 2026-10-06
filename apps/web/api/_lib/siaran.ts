/**
 * Live updates, the API side: after a write succeeds, tell every open page
 * which kinds of data changed, through the relay's /siaran room (apps/relay).
 * Pages that show that data fetch it again (src/lib/siaran.ts), so a change
 * on one device shows on the others without a refresh.
 *
 * A message carries topic names only, never data: a page that hears one
 * asks the API again with its own sign-in. Topics:
 *
 *   akses brief jadwal roster tim sesi nilai laporan bayar umpan
 *   presentasi server jurnal online (an Asisten came online) kode tot
 *
 * Pi heartbeats (api/agent) send nothing: the Server pages poll them.
 */
import { createHmac } from "node:crypto";
import type { ApiHandler, ApiRequest, ApiResponse } from "./http.js";
import { konsolEnv } from "./konsol.js";
import { denganGalat } from "./galat.js";

/** Writes, as "route:aksi" (or just "route"), and what they change. A
 *  write not listed here announces its route's name. */
const TOPIK: Record<string, string[]> = {
  "session:akses": ["akses"],
  "session:final": ["akses"],
  "session:brief": ["brief"],
  "session:schedule": ["jadwal"],
  "session:jendela": ["jadwal"],
  "session:penugasan": ["jadwal", "tim"],
  "session:tim": ["tim", "jadwal"],
  "session:roster": ["roster"],
  "session:rosterslot": ["roster"],
  "session:praktikan": ["roster"],
  "session:susulan": ["roster", "sesi", "jadwal"],
  "session:tot": ["tot", "roster", "sesi"],
  "session:hadir": ["sesi", "roster"],
  "session:group": ["sesi", "roster"],
  // Pegang Kelompok, Ganti Asisten: who holds a group decides who scores it
  // and what the projector and the group's Praktikan see (2026-10-07: it fell
  // through to "session", a topic no page listens to).
  "session:assignment": ["sesi", "nilai"],
  "session:rekap": ["laporan"],
  "session:nilai": ["nilai"],
  "session:catatan": ["nilai"],
  "session:end": ["sesi", "jadwal", "laporan"],
  "session:cancel": ["sesi", "jadwal"],
  "session:lanjutkan": ["sesi"],
  "session:durasi": ["sesi"],
  "session:help": ["sesi"],
  "session:kit": ["sesi", "laporan"],
  "session:siarkan": ["sesi"],
  "session:perburuan": ["sesi"],
  "session:tangkapan": ["sesi"],
  "session:cermin": ["sesi"],
  "session:seelabs": ["sesi", "bayar"],
  "session:kejadian": ["laporan"],
  "session:dokumen": ["laporan"],
  "session:feedback": ["umpan", "laporan"],
  "session:bayar": ["bayar"],
  session: ["sesi", "jadwal"],
  "auth:student": ["sesi"],
  "auth:assistant": [],
  "auth:logout": [],
  "auth:set-password": [],
  "auth:change-password": [],
  "auth:galat": [],
  "modul:draft": ["jurnal"],
  "modul:kunci": ["jurnal"],
  "modul:cek": [],
  "modul:unduh": [],
  "modul:kode-simpan": ["kode"],
  "modul:kode-buang": ["kode"],
  "modul:kode-pulihkan": ["kode"],
  "modul:kode-terbit": ["kode", "jurnal"],
  "presentasi:token": [],
  "presentasi:lampiran-token": [],
};

function topikUntuk(rute: string, aksi: unknown): string[] {
  const kunci = typeof aksi === "string" && aksi ? `${rute}:${aksi}` : rute;
  return TOPIK[kunci] ?? [rute === "action" ? "server" : rute];
}

/** Sends the topics to the relay; quietly does nothing when the relay is
 *  not set up or doesn't answer within 1.5 s (pages also refetch when they
 *  come back into view, so a lost message only delays an update). */
export async function siarkan(topik: string[]): Promise<void> {
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
    let gagal = false;
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      gagal = !!body && typeof body === "object" && (body as { ok?: unknown }).ok === false;
      json(body);
    };
    await handler(req, res);
    if (!gagal && res.statusCode < 300) await siarkan(topikUntuk(rute, req.query.aksi));
  });
}
