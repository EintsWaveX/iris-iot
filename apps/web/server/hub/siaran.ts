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
 *
 * With several workers (Phase 3) each worker has its own hub, but the numbering is the supervisor's: `urutan`
 * sends the topics there, and the numbered message comes back to every worker's `terapkan`, in one order and
 * under one epoch, so a page may reconnect to any worker, or after a deploy, and still be told only what it missed.
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
/** A broadcast reaches the sockets in this many slices, a little apart (see `sebar`). */
export const IRISAN = 8;
export const SEBAR_MAKS_MS = 600;
export const SEBAR_AMBANG = 50;

export interface OpsiHubSiaran {
  /** Sockets at once (default 5000). */
  soketMaks?: number;
  /** Protocol-level ping every this many ms; a socket silent for a whole round is dropped (default 25 s). */
  jedaPingMs?: number;
  /** Browsers always send Origin; a request without one is a tool. Default: allowed. */
  izinTanpaOrigin?: boolean;
  now?: () => number;
  /**
   * Load smoothing: a broadcast to many sockets makes every page fetch again at the same instant. Past
   * `sebarAmbang` sockets here, the sends are spread over `IRISAN` slices, up to `sebarMaksMs` apart in all
   * (the delay grows with the sockets beyond the threshold: 1,000 sockets spread over 600 ms, 150 over 100 ms).
   * Defaults 600 ms and 50. `sebarMaksMs: 0` sends to everyone at once (tests).
   */
  sebarMaksMs?: number;
  sebarAmbang?: number;
  /**
   * Several workers: where to send topics to be numbered. When set, `publish` only sends them there and the
   * message reaches this worker's sockets through `terapkan`, like everyone's. Unset: this hub numbers them.
   */
  urutan?: (topik: string[]) => void;
}

interface Meta {
  hidup: boolean;
  pesan: number;
  jendela: number;
  /** Which slice of a broadcast this socket is in (fixed for its life, so its messages keep their order). */
  irisan: number;
  /** Messages waiting for this socket's slice, oldest first. */
  antre: string[];
}

export interface HubSiaran {
  /** Hand over an accepted upgrade at /siaran. */
  naik(req: IncomingMessage, socket: Duplex, head: Buffer): void;
  /** Announces topics to every socket; returns how many it targets (past the load-smoothing threshold the
   *  later slices are sent a few hundred ms after). Invalid names are dropped. */
  publish(topik: readonly string[]): number;
  /** A numbered message from the supervisor (several workers): applies it in order and tells every socket. */
  terapkan(n: number, epoch: string, topik: readonly string[]): number;
  /** The supervisor's numbering so far, for a worker that just started. */
  sinkron(n: number, epoch: string, cincin: ReadonlyArray<{ n: number; t: string[] }>): void;
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
  let epoch = randomBytes(4).toString("hex");
  let nomor = 0;
  let terkirim = 0;
  let dibuang = 0;
  const cincin: Array<{ n: number; t: string[] }> = [];
  const sebarMaksMs = opsi.sebarMaksMs ?? SEBAR_MAKS_MS;
  const sebarAmbang = opsi.sebarAmbang ?? SEBAR_AMBANG;
  let irisanBerikut = 0;
  /** One pending timer per slice (slice 0 goes at once). */
  const pewaktu: Array<ReturnType<typeof setTimeout> | null> = Array.from(
    { length: IRISAN },
    () => null,
  );

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

  /** Numbers `t` as message `n`, remembers it, and tells every socket. */
  function sebar(n: number, t: string[]): number {
    nomor = n;
    cincin.push({ n, t });
    if (cincin.length > RING) cincin.shift();
    const pesan = JSON.stringify({ t, n });
    // The spread grows with the sockets on this worker and stops at the cap; under the threshold, no delay.
    const jarak = Math.min(sebarMaksMs, Math.max(0, soket.size - sebarAmbang));
    let sasaran = 0;
    for (const [ws, m] of soket) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      sasaran++;
      m.antre.push(pesan);
    }
    for (let k = 0; k < IRISAN; k++) {
      const tunda = jarak > 0 ? Math.floor((k * jarak) / (IRISAN - 1)) : 0;
      if (tunda <= 0) {
        // A slice due now also takes whatever an earlier broadcast left waiting, in order.
        const t0 = pewaktu[k];
        if (t0) clearTimeout(t0);
        pewaktu[k] = null;
        kosongkan(k);
      } else if (!pewaktu[k]) {
        // A slice already waiting keeps its time; the new message rides with it, so nothing overtakes.
        const w = setTimeout(() => {
          pewaktu[k] = null;
          kosongkan(k);
        }, tunda);
        w.unref();
        pewaktu[k] = w;
      }
    }
    return sasaran;
  }

  /** Sends what is waiting to every socket in slice `k`. */
  function kosongkan(k: number) {
    for (const [ws, m] of soket) {
      if (m.irisan !== k || !m.antre.length) continue;
      const antre = m.antre;
      m.antre = [];
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (ws.bufferedAmount > ANTRE_MAKS_BYTE) {
        buang(ws, 1013, "too slow");
        continue;
      }
      try {
        for (const p of antre) {
          ws.send(p);
          terkirim++;
        }
      } catch {
        buang(ws);
      }
    }
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
        const m: Meta = {
          hidup: true,
          pesan: 0,
          jendela: now(),
          irisan: irisanBerikut++ % IRISAN,
          antre: [],
        };
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
      if (opsi.urutan) {
        opsi.urutan(t);
        return 0;
      }
      return sebar(nomor + 1, t);
    },

    terapkan(n, e, topik) {
      if (e !== epoch) {
        // The supervisor's numbering replaces whatever this hub made up before it knew it.
        epoch = e;
        cincin.length = 0;
        nomor = n - 1;
      }
      const t = [...new Set(topik)].filter((x) => TOPIK_RE.test(x)).slice(0, TOPIK_MAKS_PER_SIARAN);
      if (!t.length || n <= nomor) return 0;
      return sebar(n, t);
    },

    sinkron(n, e, lama) {
      epoch = e;
      nomor = n;
      cincin.length = 0;
      for (const m of lama.slice(-RING)) cincin.push({ n: m.n, t: [...m.t] });
    },

    jumlah: () => soket.size,
    statistik: () => ({ soket: soket.size, nomor, epoch, terkirim, dibuang }),

    tutup() {
      clearInterval(ping);
      for (let k = 0; k < IRISAN; k++) {
        const w = pewaktu[k];
        if (w) clearTimeout(w);
        pewaktu[k] = null;
      }
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
