/**
 * The live-update hub, in this process (real-time upgrade, Phase 2): every open page keeps one socket here,
 * and after a write the API calls `publish(topics)`; each socket hears the topic names at once and the page
 * fetches again what it shows. It does what the Cloudflare relay's `/siaran` room did (apps/relay), without
 * the extra hop (PC, home uplink, Worker, back) and without its 1.5 s give-up: a publish is a function call.
 *
 * A message is `{"t":["sesi","nilai"],"n":4711}`. `t` is all the pages read (as before); `n` numbers the
 * message. The last RING messages are kept, so a page that lost its socket for a moment can reconnect with
 * `?sejak=<n>&e=<epoch>` and be told only what it missed instead of fetching everything. The first frame of
 * every socket is `{"n":<latest>,"e":<epoch>,"w":1}`, plus `t` (what was missed) or `semua:true` (too much
 * to replay, or a restart: fetch everything).
 *
 * Pages only listen: the one thing they send is the text "ping", answered "pong". Sockets that go quiet are
 * dropped, a socket that cannot keep up is dropped, and a socket that talks too much is dropped.
 */
import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { tolakUpgrade } from "../upgrade.js";

/** The relay's rule for a topic name; the same list is shared with the pages (src/lib/siaran-topik.ts). */
export const TOPIK_RE = /^[a-z]{2,16}$/;
export const TOPIK_MAKS_PER_SIARAN = 32;
export const RING = 256;
/** Past this many unsent bytes a socket is too slow to keep. */
export const ANTRE_MAKS_BYTE = 256 * 1024;
const PESAN_MAKS_PER_JENDELA = 20;
const JENDELA_MS = 10_000;

export interface OpsiHubSiaran {
  /** Sockets at once (default 5000). */
  soketMaks?: number;
  /** Protocol-level ping every this many ms; a socket silent for a whole round is dropped (default 25 s). */
  jedaPingMs?: number;
  /** Browsers always send Origin; a request without one is a tool. Default: allowed. */
  izinTanpaOrigin?: boolean;
  now?: () => number;
}

interface Meta {
  hidup: boolean;
  pesan: number;
  jendela: number;
}

export interface HubSiaran {
  /** Hand over an accepted upgrade at /siaran. */
  naik(req: IncomingMessage, socket: Duplex, head: Buffer): void;
  /** Announces topics to every socket; returns how many it reached. Invalid names are dropped. */
  publish(topik: readonly string[]): number;
  jumlah(): number;
  statistik(): { soket: number; nomor: number; epoch: string; terkirim: number; dibuang: number };
  /** Closes every socket with 1001 and stops the timers. */
  tutup(): void;
}

export function buatHubSiaran(opsi: OpsiHubSiaran = {}): HubSiaran {
  const now = opsi.now ?? Date.now;
  const soketMaks = opsi.soketMaks ?? 5000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256, perMessageDeflate: false });
  const soket = new Map<WebSocket, Meta>();
  const epoch = randomBytes(4).toString("hex");
  let nomor = 0;
  let terkirim = 0;
  let dibuang = 0;
  const cincin: Array<{ n: number; t: string[] }> = [];

  const buang = (ws: WebSocket, kode?: number, alasan?: string) => {
    dibuang++;
    soket.delete(ws);
    try {
      if (kode) ws.close(kode, alasan);
      else ws.terminate();
    } catch {
      ws.terminate();
    }
  };

  /** What a page missed since message `sejak`, or null when that cannot be told (restart, or older than the ring). */
  function terlewat(sejak: number, e: string | null): string[] | null {
    if (e !== epoch || !Number.isInteger(sejak) || sejak < 0 || sejak > nomor) return null;
    if (sejak === nomor) return [];
    const tertua = cincin[0]?.n ?? nomor + 1;
    if (sejak < tertua - 1) return null;
    const hasil = new Set<string>();
    for (const m of cincin) if (m.n > sejak) for (const t of m.t) hasil.add(t);
    return [...hasil];
  }

  function sambut(ws: WebSocket, sejakMentah: string | null, e: string | null) {
    const ada = sejakMentah !== null && sejakMentah !== "";
    const miss = ada ? terlewat(Number(sejakMentah), e) : null;
    const salam: Record<string, unknown> = { n: nomor, e: epoch, w: 1 };
    // A first connection has nothing to catch up on; a reconnection gets what it missed, or "everything".
    if (ada) {
      if (miss === null) salam.semua = true;
      else if (miss.length) salam.t = miss;
    }
    ws.send(JSON.stringify(salam));
  }

  const ping = setInterval(() => {
    for (const [ws, m] of soket) {
      if (!m.hidup) {
        buang(ws);
        continue;
      }
      m.hidup = false;
      try {
        ws.ping();
      } catch {
        buang(ws);
      }
    }
  }, opsi.jedaPingMs ?? 25_000);
  ping.unref();

  return {
    naik(req, socket, head) {
      const origin = req.headers.origin;
      if (origin) {
        let host = "";
        try {
          host = new URL(origin).host;
        } catch {
          /* falls through to the refusal */
        }
        if (host !== req.headers.host) return tolakUpgrade(socket, 403, "Forbidden");
      } else if (opsi.izinTanpaOrigin === false) {
        return tolakUpgrade(socket, 403, "Forbidden");
      }
      if (soket.size >= soketMaks) return tolakUpgrade(socket, 503, "Service Unavailable");
      const url = new URL(req.url ?? "/", "http://iris.local");
      const sejak = url.searchParams.get("sejak");
      const e = url.searchParams.get("e");

      wss.handleUpgrade(req, socket, head, (ws) => {
        const m: Meta = { hidup: true, pesan: 0, jendela: now() };
        soket.set(ws, m);
        ws.on("pong", () => (m.hidup = true));
        ws.on("message", (data, biner) => {
          m.hidup = true;
          const t = now();
          if (t - m.jendela > JENDELA_MS) {
            m.jendela = t;
            m.pesan = 0;
          }
          if (++m.pesan > PESAN_MAKS_PER_JENDELA) return buang(ws, 1008, "too many messages");
          if (!biner && data.toString() === "ping") {
            try {
              ws.send("pong");
            } catch {
              buang(ws);
            }
          }
        });
        ws.on("close", () => soket.delete(ws));
        ws.on("error", () => buang(ws));
        try {
          sambut(ws, sejak, e);
        } catch {
          buang(ws);
        }
      });
    },

    publish(topik) {
      const t = [...new Set(topik)].filter((x) => TOPIK_RE.test(x)).slice(0, TOPIK_MAKS_PER_SIARAN);
      if (!t.length) return 0;
      nomor++;
      cincin.push({ n: nomor, t });
      if (cincin.length > RING) cincin.shift();
      const pesan = JSON.stringify({ t, n: nomor });
      let sampai = 0;
      for (const [ws] of soket) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        if (ws.bufferedAmount > ANTRE_MAKS_BYTE) {
          buang(ws, 1013, "too slow");
          continue;
        }
        try {
          ws.send(pesan);
          sampai++;
        } catch {
          buang(ws);
        }
      }
      terkirim += sampai;
      return sampai;
    },

    jumlah: () => soket.size,
    statistik: () => ({ soket: soket.size, nomor, epoch, terkirim, dibuang }),

    tutup() {
      clearInterval(ping);
      for (const [ws] of soket) {
        try {
          ws.close(1001, "server restarting");
        } catch {
          ws.terminate();
        }
      }
      soket.clear();
      wss.close();
    },
  };
}
