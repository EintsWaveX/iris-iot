/**
 * Konsol Pi relay (Phase 9 Stage 9).
 *
 *   GET  /web/:kanal?tiket=...   the browser (WebSocket)
 *   GET  /pi/:kanal?tiket=...    the Pi's bridge (WebSocket, it dials out)
 *   POST /tutup/:kanal           the IRIS API closes a room (cut off, reject)
 *
 * Tickets are signed by the IRIS API (src/lib/konsol.ts in apps/web) with
 * the shared KONSOL_RELAY_SECRET: 60 seconds, one end, one room, one nonce.
 * Each room (a Durable Object per kanal) takes one browser and one Pi,
 * passes their frames through untouched, refuses a nonce it has seen, and
 * closes both at the console's hard end or after 10 minutes without a frame
 * from the browser. It stores nothing else: no frames, no transcript (the
 * Pi keeps the terminal record).
 *
 * The Pi side alone gets small control frames, text starting with "\0relay:"
 * (web-masuk, web-keluar, tutup:<why>), so the bridge knows when to open and
 * close its local connection. The browser only ever sees the Pi's bytes.
 *
 * Live updates (Phase 9, after the deploy) share this Worker:
 *
 *   GET  /siaran          every open IRIS page (WebSocket, anyone)
 *   POST /siaran/kirim    the IRIS API, signed: {"t": ["jadwal", ...]}
 *
 * One Durable Object holds every page's socket (hibernating, so an idle
 * page costs nothing) and passes each signed message to all of them. A
 * message only names what changed, never the data, so a page that hears
 * one asks the API again with its own sign-in.
 */
import { cekTiket, DIAM_MENIT } from "../../web/src/lib/konsol.ts";

export interface Env {
  RUANG: DurableObjectNamespace;
  SIARAN: DurableObjectNamespace;
  KONSOL_RELAY_SECRET: string;
}

const TOPIK_RE = /^[a-z]{2,16}$/;
const SIARAN_MAKS = 1024;

const KANAL_RE = /^[A-Za-z0-9_-]{16,64}$/;
const KONTROL = "\u0000relay:";
/** Frames from the browser held while the Pi hasn't joined yet. */
const ANTRE_MAKS = 64 * 1024;

type Bingkai = string | ArrayBuffer;

/** workerd can hand a binary frame over as a Blob, and send() would turn a
 *  Blob into the text "[object Blob]", so binary is read into bytes first. */
async function bingkai(d: unknown): Promise<Bingkai> {
  if (typeof d === "string" || d instanceof ArrayBuffer) return d;
  if (ArrayBuffer.isView(d))
    return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer;
  return (d as Blob).arrayBuffer();
}

function teks(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function samaPersis(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const [, ujung, kanal] = url.pathname.split("/");
    if (!ujung) return teks(200, "IRIS Konsol relay");
    if (ujung === "siaran") return siaran(req, env, kanal);
    if (!kanal || !KANAL_RE.test(kanal)) return teks(404, "tidak ditemukan");
    if (!env.KONSOL_RELAY_SECRET || env.KONSOL_RELAY_SECRET.length < 32)
      return teks(503, "relay belum diatur");
    const ruang = env.RUANG.get(env.RUANG.idFromName(kanal));

    if (ujung === "tutup" && req.method === "POST") {
      const ts = Number(req.headers.get("x-konsol-ts"));
      const tanda = req.headers.get("x-konsol-tanda") ?? "";
      if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60) return teks(403, "kedaluwarsa");
      const ok = samaPersis(tanda, await hmacHex(env.KONSOL_RELAY_SECRET, `tutup|${kanal}|${ts}`));
      if (!ok) return teks(403, "tanda salah");
      return ruang.fetch("https://ruang/tutup", { method: "POST" });
    }

    if ((ujung === "web" || ujung === "pi") && req.headers.get("Upgrade") === "websocket") {
      const cek = await cekTiket(url.searchParams.get("tiket") ?? "", env.KONSOL_RELAY_SECRET, ujung);
      if (!cek.ok) return teks(403, `tiket ${cek.kode}`);
      if (cek.tiket.k !== kanal) return teks(403, "tiket ruang lain");
      const h = new Headers(req.headers);
      h.set("x-peran", ujung);
      h.set("x-nonce", cek.tiket.n);
      h.set("x-akhir", String(cek.tiket.end));
      return ruang.fetch(new Request("https://ruang/sambung", { headers: h }));
    }
    return teks(404, "tidak ditemukan");
  },
};

/** /siaran (a page listening) and /siaran/kirim (the API telling them). */
async function siaran(req: Request, env: Env, sub: string | undefined): Promise<Response> {
  const pusat = env.SIARAN.get(env.SIARAN.idFromName("semua"));
  if (!sub && req.headers.get("Upgrade") === "websocket") return pusat.fetch(req);
  if (sub !== "kirim" || req.method !== "POST") return teks(404, "tidak ditemukan");
  if (!env.KONSOL_RELAY_SECRET || env.KONSOL_RELAY_SECRET.length < 32)
    return teks(503, "relay belum diatur");
  const body = await req.text();
  if (body.length > SIARAN_MAKS) return teks(413, "terlalu besar");
  const ts = Number(req.headers.get("x-siaran-ts"));
  const tanda = req.headers.get("x-siaran-tanda") ?? "";
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60) return teks(403, "kedaluwarsa");
  if (!samaPersis(tanda, await hmacHex(env.KONSOL_RELAY_SECRET, `siaran|${body}|${ts}`)))
    return teks(403, "tanda salah");
  let t: unknown;
  try {
    t = (JSON.parse(body) as { t?: unknown }).t;
  } catch {
    return teks(400, "format");
  }
  if (!Array.isArray(t) || !t.length || !t.every((x) => typeof x === "string" && TOPIK_RE.test(x)))
    return teks(400, "format");
  return pusat.fetch("https://siaran/kirim", { method: "POST", body: JSON.stringify({ t }) });
}

/** Every open page's socket. Hibernation keeps idle sockets free; "ping"
 *  is answered without waking the object. */
export class Siaran {
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(req: Request): Promise<Response> {
    if (new URL(req.url).pathname === "/kirim") {
      const pesan = await req.text();
      let n = 0;
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(pesan);
          n++;
        } catch {
          /* closing */
        }
      }
      return teks(200, String(n));
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage() {
    /* pages only listen */
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, "tutup");
    } catch {
      /* already closed */
    }
  }
}

export class Ruang {
  private web: WebSocket | null = null;
  private pi: WebSocket | null = null;
  private antre: Bingkai[] = [];
  /** One chain per direction keeps frames in order while Blobs are read. */
  private kePi: Promise<void> = Promise.resolve();
  private kePeramban: Promise<void> = Promise.resolve();
  private antreBytes = 0;
  private terakhirWeb = Date.now();
  private akhir = 0;
  private tutup = false;

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/tutup") {
      await this.selesai("diputus");
      return teks(200, "ditutup");
    }
    // The flag is also stored: a room evicted from memory stays closed.
    if (this.tutup || (await this.ctx.storage.get("tutup"))) return teks(410, "ruang sudah ditutup");
    const peran = req.headers.get("x-peran");
    const nonce = req.headers.get("x-nonce") ?? "";
    if (peran !== "web" && peran !== "pi") return teks(400, "peran");
    // A nonce works once, ever (kept until the room is cleaned up).
    if (await this.ctx.storage.get(`n:${nonce}`)) return teks(403, "tiket sudah dipakai");
    await this.ctx.storage.put(`n:${nonce}`, Date.now());
    this.akhir = Math.max(this.akhir, Number(req.headers.get("x-akhir")) * 1000 || 0);

    const pair = new WebSocketPair();
    const [klien, sisi] = [pair[0], pair[1]];
    sisi.accept();
    // noVNC asks for the "binary" subprotocol; echo the first one offered.
    const proto = req.headers.get("Sec-WebSocket-Protocol")?.split(",")[0]?.trim();

    if (peran === "pi") {
      this.pi?.close(4000, "diganti");
      this.pi = sisi;
      sisi.addEventListener("message", (e) => {
        this.kePeramban = this.kePeramban.then(async () => {
          const f = await bingkai(e.data);
          if (this.pi === sisi) this.web?.send(f);
        });
      });
      sisi.addEventListener("close", () => this.lepas("pi", sisi));
      sisi.addEventListener("error", () => this.lepas("pi", sisi));
      if (this.web) {
        sisi.send(`${KONTROL}web-masuk`);
        for (const f of this.antre) sisi.send(f);
        this.antre = [];
        this.antreBytes = 0;
      }
    } else {
      this.web?.close(4000, "diganti");
      this.web = sisi;
      this.terakhirWeb = Date.now();
      sisi.addEventListener("message", (e) => {
        this.terakhirWeb = Date.now();
        this.kePi = this.kePi.then(async () => {
          const f = await bingkai(e.data);
          if (this.web !== sisi) return;
          if (this.pi) this.pi.send(f);
          else {
            const n = typeof f === "string" ? f.length : f.byteLength;
            if (this.antreBytes + n <= ANTRE_MAKS) {
              this.antre.push(f);
              this.antreBytes += n;
            }
          }
        });
      });
      sisi.addEventListener("close", () => this.lepas("web", sisi));
      sisi.addEventListener("error", () => this.lepas("web", sisi));
      this.pi?.send(`${KONTROL}web-masuk`);
    }
    await this.ctx.storage.setAlarm(Date.now() + 30_000);
    return new Response(null, {
      status: 101,
      webSocket: klien,
      headers: proto ? { "Sec-WebSocket-Protocol": proto } : undefined,
    });
  }

  private lepas(peran: "web" | "pi", ws: WebSocket) {
    if (peran === "web" && this.web === ws) {
      this.web = null;
      // A closed tab counts from when it left: the Pi isn't kept open alone.
      this.terakhirWeb = Date.now();
      this.antre = [];
      this.antreBytes = 0;
      this.pi?.send(`${KONTROL}web-keluar`);
    }
    if (peran === "pi" && this.pi === ws) {
      this.pi = null;
      // Without the Pi there is nothing to show: the page asks again.
      this.web?.close(4001, "pi-keluar");
    }
  }

  private async selesai(alasan: string) {
    this.tutup = true;
    try {
      this.pi?.send(`${KONTROL}tutup:${alasan}`);
    } catch {
      /* already gone */
    }
    this.pi?.close(4003, alasan);
    this.web?.close(4003, alasan);
    this.pi = null;
    this.web = null;
    // Keep the nonces an hour past the end, then forget the room.
    await this.ctx.storage.put("tutup", Date.now());
    await this.ctx.storage.setAlarm(Date.now() + 3600_000);
  }

  async alarm() {
    const now = Date.now();
    if (await this.ctx.storage.get("tutup")) {
      await this.ctx.storage.deleteAll();
      return;
    }
    if (this.akhir && now > this.akhir) return this.selesai("batas");
    // Idle: no frame from the browser, or no browser at all, for 10 minutes.
    if (this.pi && now - this.terakhirWeb > DIAM_MENIT * 60_000) return this.selesai("diam");
    if (!this.web && !this.pi) {
      // Nobody connected: keep the nonces until the ticket window is long past.
      await this.ctx.storage.setAlarm(now + 600_000);
      return;
    }
    await this.ctx.storage.setAlarm(now + 30_000);
  }
}
