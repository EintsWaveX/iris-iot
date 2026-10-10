/**
 * Konsol Pi relay (Phase 9 Stage 9).
 *
 *   GET  /web/:kanal?tiket=...   the browser (WebSocket)
 *   GET  /pi/:kanal?tiket=...    the Pi's bridge (WebSocket, it dials out)
 *   POST /tutup/:kanal           the IRIS API closes a room (cut off, reject)
 *
 * Tickets are signed by the IRIS API (src/lib/konsol.ts in apps/web) with
 * the shared KONSOL_RELAY_SECRET: 60 seconds, one end, one room, one nonce.
 * Each room (a Durable Object per kanal) takes one Pi and any number of
 * people (2026-10-05: the owner and those who joined), refuses a nonce it
 * has seen, and closes everything at the console's hard end or after 10
 * minutes without a frame from anyone. It stores nothing else: no frames,
 * no transcript (the Pi keeps the terminal record).
 *
 * One person controls at a time: the first in, then whoever the controller
 * gives it to ("beri"); the others ask ("minta"). When the controller
 * leaves, it goes to the owner, else whoever came first. The terminal takes
 * keys and its size from the controller only; a screen gets every viewer's
 * RFB, and the bridge gives only the controller a password that isn't view
 * only.
 *
 * Between the relay and the Pi, frames carry the viewer: binary frames
 * start with a 2-byte viewer id (0 from the Pi = every viewer), text from
 * the Pi is "\0ke:<id>:<text>" and text from a viewer "\0web:<id>:<text>".
 * The relay's own notes to the Pi start with "\0relay:" (web-masuk:<id>,
 * web-keluar:<id>, kendali:<id>, tutup:<why>). A viewer gets the Pi's bytes
 * as they are, plus "\0relay:ruang:{json}" (who is in, who controls, who
 * asked, whether the Pi is there) and "\0relay:ditolak"; it sends
 * "\0relay:minta", "batal", "beri:<id>" and "tolak:<id>".
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
 *
 * Session streams (Phase 12) carry data, so they have rooms of their own:
 *
 *   GET  /aliran/<ruang>?tiket=...   a page in a running session (WebSocket)
 *   POST /aliran/<ruang>/kirim       the IRIS API, signed: {"m": [...]}
 *
 * <ruang> is "sesi-<id>" or "pi" (the Server pages). The ticket names the
 * room, the role and the Praktikan's group; the room passes each message
 * only to the sockets allowed to see it (src/lib/aliran.ts in apps/web).
 */
import { cekTiket, DIAM_MENIT } from "../../web/src/lib/konsol.ts";
import {
  ALIRAN_RUANG_RE,
  ALIRAN_TIKET_DETIK,
  bolehTerima,
  cekTiketAliran,
  saringKiriman,
  saringNaik,
  type PesanAliran,
  type TiketAliran,
} from "../../web/src/lib/aliran.ts";

export interface Env {
  RUANG: DurableObjectNamespace;
  SIARAN: DurableObjectNamespace;
  ALIRAN: DurableObjectNamespace;
  KONSOL_RELAY_SECRET: string;
  /** "1" in .dev.vars only: count requests for the load test */
  HITUNG?: string;
}

const TOPIK_RE = /^[a-z]{2,16}$/;
const SIARAN_MAKS = 1024;
/** The API's batch for a session room */
const ALIRAN_KIRIM_MAKS = 64 * 1024;

const KANAL_RE = /^[A-Za-z0-9_-]{16,64}$/;
const KONTROL = "\u0000relay:";
/** Frames from the browser held while the Pi hasn't joined yet. */
const ANTRE_MAKS = 64 * 1024;
/**
 * Data centers near the lab. Indonesian providers send some connections
 * through Europe instead (2026-10-05: Paris, Marseille, Milan, 190 ms each
 * way), so a side that came in anywhere else is turned back with "jauh"
 * and opens a new connection, which usually lands near.
 */
const DEKAT = new Set([
  "SIN",
  "CGK",
  "KUL",
  "JHB",
  "BKK",
  "HKG",
  "MNL",
  "SGN",
  "HAN",
]);
/** The Pi may use its ticket this many times, to move off a far route. */
const PI_SAMBUNG_MAKS = 5;

type Bingkai = string | ArrayBuffer;

/** workerd can hand a binary frame over as a Blob, and send() would turn a
 *  Blob into the text "[object Blob]", so binary is read into bytes first. */
async function bingkai(d: unknown): Promise<Bingkai> {
  if (typeof d === "string" || d instanceof ArrayBuffer) return d;
  if (ArrayBuffer.isView(d))
    return d.buffer.slice(
      d.byteOffset,
      d.byteOffset + d.byteLength,
    ) as ArrayBuffer;
  return (d as Blob).arrayBuffer();
}

function teks(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)),
  );
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
    const [, ujung, kanal, sub] = url.pathname.split("/");
    hitung(env, "pekerja");
    if (!ujung) return teks(200, "IRIS Konsol relay");
    if (ujung === "siaran") return siaran(req, env, kanal);
    if (ujung === "aliran") return aliran(req, env, kanal, sub);
    if (ujung === "hitung" && env.HITUNG === "1") return bacaHitung(env, url);
    if (!kanal || !KANAL_RE.test(kanal)) return teks(404, "tidak ditemukan");
    if (!env.KONSOL_RELAY_SECRET || env.KONSOL_RELAY_SECRET.length < 32)
      return teks(503, "relay belum diatur");
    // Every frame crosses the room twice (page to Pi and back), so it has to
    // live near both, which are in Indonesia. Without the hint Cloudflare
    // sometimes made a room far away (2026-10-05: 185 ms from the page
    // instead of 35). The hint only counts when the room is first made.
    const ruang = env.RUANG.get(env.RUANG.idFromName(kanal), {
      locationHint: "apac",
    });

    if (ujung === "tutup" && req.method === "POST") {
      const ts = Number(req.headers.get("x-konsol-ts"));
      const tanda = req.headers.get("x-konsol-tanda") ?? "";
      if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60)
        return teks(403, "kedaluwarsa");
      const ok = samaPersis(
        tanda,
        await hmacHex(env.KONSOL_RELAY_SECRET, `tutup|${kanal}|${ts}`),
      );
      if (!ok) return teks(403, "tanda salah");
      return ruang.fetch("https://ruang/tutup", { method: "POST" });
    }

    if (
      (ujung === "web" || ujung === "pi") &&
      req.headers.get("Upgrade") === "websocket"
    ) {
      const cek = await cekTiket(
        url.searchParams.get("tiket") ?? "",
        env.KONSOL_RELAY_SECRET,
        ujung,
      );
      if (!cek.ok) return teks(403, `tiket ${cek.kode}`);
      if (cek.tiket.k !== kanal) return teks(403, "tiket ruang lain");
      // A far way in is turned back here, before the room is touched: the
      // room is made where the first connection reaches it, so only a near
      // one may make it. The ticket stays unused. "jauh=boleh" (a side's
      // last try) comes in anyway.
      const pintu = String((req as { cf?: { colo?: string } }).cf?.colo ?? "");
      if (
        pintu &&
        !DEKAT.has(pintu) &&
        url.searchParams.get("jauh") !== "boleh"
      )
        return tolakJauh(req, pintu);
      const h = new Headers(req.headers);
      h.set("x-peran", ujung);
      h.set("x-nonce", cek.tiket.n);
      h.set("x-akhir", String(cek.tiket.end));
      h.set("x-target", cek.tiket.t);
      h.set("x-nim", cek.tiket.u);
      h.set("x-nama", encodeURIComponent(cek.tiket.nm ?? cek.tiket.u));
      h.set("x-pemilik", cek.tiket.pk ? "1" : "0");
      // The data center this connection came in through (lag checks).
      h.set("x-pintu", pintu);
      return ruang.fetch(new Request("https://ruang/sambung", { headers: h }));
    }
    return teks(404, "tidak ditemukan");
  },
};

/** Opens the socket only to say "jauh" (came in far from the lab) and close. */
function tolakJauh(req: Request, pintu: string): Response {
  const pair = new WebSocketPair();
  const [klien, sisi] = [pair[0], pair[1]];
  sisi.accept();
  sisi.send(`${KONTROL}jauh:${pintu}`);
  sisi.close(4009, "jauh");
  // noVNC asks for a subprotocol; without the echo the page never opens.
  const proto = req.headers
    .get("Sec-WebSocket-Protocol")
    ?.split(",")[0]
    ?.trim();
  return new Response(null, {
    status: 101,
    webSocket: klien,
    headers: proto ? { "Sec-WebSocket-Protocol": proto } : undefined,
  });
}

/** /siaran (a page listening) and /siaran/kirim (the API telling them). */
async function siaran(
  req: Request,
  env: Env,
  sub: string | undefined,
): Promise<Response> {
  const pusat = env.SIARAN.get(env.SIARAN.idFromName("semua"));
  if (!sub && req.headers.get("Upgrade") === "websocket")
    return pusat.fetch(req);
  if (sub !== "kirim" || req.method !== "POST")
    return teks(404, "tidak ditemukan");
  if (!env.KONSOL_RELAY_SECRET || env.KONSOL_RELAY_SECRET.length < 32)
    return teks(503, "relay belum diatur");
  const body = await req.text();
  if (body.length > SIARAN_MAKS) return teks(413, "terlalu besar");
  const ts = Number(req.headers.get("x-siaran-ts"));
  const tanda = req.headers.get("x-siaran-tanda") ?? "";
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60)
    return teks(403, "kedaluwarsa");
  if (
    !samaPersis(
      tanda,
      await hmacHex(env.KONSOL_RELAY_SECRET, `siaran|${body}|${ts}`),
    )
  )
    return teks(403, "tanda salah");
  let t: unknown;
  try {
    t = (JSON.parse(body) as { t?: unknown }).t;
  } catch {
    return teks(400, "format");
  }
  if (
    !Array.isArray(t) ||
    !t.length ||
    !t.every((x) => typeof x === "string" && TOPIK_RE.test(x))
  )
    return teks(400, "format");
  return pusat.fetch("https://siaran/kirim", {
    method: "POST",
    body: JSON.stringify({ t }),
  });
}

/** Every open page's socket. Hibernation keeps idle sockets free; "ping"
 *  is answered without waking the object. */
export class Siaran {
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(req: Request): Promise<Response> {
    hitung(this.env, "do_siaran");
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

/** One person in a room. */
interface Web {
  id: number;
  ws: WebSocket;
  nim: string;
  nama: string;
  /** The person who asked for the console. */
  pemilik: boolean;
  masuk: number;
  /** The data center this viewer came in through. */
  pintu: string;
}

/** 2-byte viewer id in front of a frame to or from the Pi. */
function tandai(id: number, f: Bingkai): ArrayBuffer {
  const isi =
    typeof f === "string" ? new TextEncoder().encode(f) : new Uint8Array(f);
  const out = new Uint8Array(isi.byteLength + 2);
  out[0] = (id >> 8) & 0xff;
  out[1] = id & 0xff;
  out.set(isi, 2);
  return out.buffer;
}

export class Ruang {
  private webs = new Map<number, Web>();
  private pi: WebSocket | null = null;
  private nextId = 1;
  /** Who controls the console (the only one whose input reaches it). */
  private pengendali: number | null = null;
  /** Who asked for control, oldest first. */
  private minta: number[] = [];
  private target = "terminal";
  private antre: ArrayBuffer[] = [];
  private antreBytes = 0;
  /** One chain per direction keeps frames in order while Blobs are read. */
  private kePi: Promise<void> = Promise.resolve();
  private kePeramban: Promise<void> = Promise.resolve();
  private terakhirWeb = Date.now();
  private akhir = 0;
  private tutup = false;
  /** The Cloudflare data center this room runs in (for lag checks). */
  private colo = "";
  private piPintu = "";

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  private get terminal() {
    return this.target === "terminal";
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/tutup") {
      await this.selesai("diputus");
      return teks(200, "ditutup");
    }
    // The flag is also stored: a room evicted from memory stays closed.
    if (this.tutup || (await this.ctx.storage.get("tutup")))
      return teks(410, "ruang sudah ditutup");
    const peran = req.headers.get("x-peran");
    const nonce = req.headers.get("x-nonce") ?? "";
    if (peran !== "web" && peran !== "pi") return teks(400, "peran");
    // A page's nonce works once, ever (kept until the room is cleaned up).
    // The Pi's works a few times inside its minute, to move off a far route.
    const dipakai = Number(await this.ctx.storage.get(`n:${nonce}`)) || 0;
    if (dipakai && (peran !== "pi" || dipakai >= PI_SAMBUNG_MAKS))
      return teks(403, "tiket sudah dipakai");
    await this.ctx.storage.put(`n:${nonce}`, dipakai + 1);
    this.akhir = Math.max(
      this.akhir,
      Number(req.headers.get("x-akhir")) * 1000 || 0,
    );
    this.target = req.headers.get("x-target") || this.target;

    const pair = new WebSocketPair();
    const [klien, sisi] = [pair[0], pair[1]];
    sisi.accept();
    // noVNC asks for the "binary" subprotocol; echo the first one offered.
    const proto = req.headers
      .get("Sec-WebSocket-Protocol")
      ?.split(",")[0]
      ?.trim();

    const pintu = req.headers.get("x-pintu") ?? "";
    if (peran === "pi") {
      this.piPintu = pintu;
      this.pasangPi(sisi);
    } else
      this.pasangWeb(sisi, {
        nim: req.headers.get("x-nim") ?? "",
        nama: decodeURIComponent(req.headers.get("x-nama") ?? ""),
        pemilik: req.headers.get("x-pemilik") === "1",
        pintu,
      });
    await this.ctx.storage.setAlarm(Date.now() + 30_000);
    if (!this.colo) this.ctx.waitUntil(this.cariColo());
    return new Response(null, {
      status: 101,
      webSocket: klien,
      headers: proto ? { "Sec-WebSocket-Protocol": proto } : undefined,
    });
  }

  /* --------------------------------------------------------- the Pi */

  private pasangPi(sisi: WebSocket) {
    this.pi?.close(4000, "diganti");
    this.pi = sisi;
    sisi.addEventListener("message", (e) => {
      this.kePeramban = this.kePeramban.then(async () => {
        if (this.pi !== sisi) return;
        const f = await bingkai(e.data);
        if (typeof f === "string") {
          // "\0ke:<id>:<text>": a note for one viewer, or 0 for all.
          const m = /^\u0000ke:(\d+):([\s\S]*)$/.exec(f);
          if (!m) return;
          this.keWeb(Number(m[1]), m[2]);
          return;
        }
        if (f.byteLength < 2) return;
        const b = new Uint8Array(f);
        this.keWeb((b[0] << 8) | b[1], f.slice(2));
      });
    });
    sisi.addEventListener("close", () => this.lepasPi(sisi));
    sisi.addEventListener("error", () => this.lepasPi(sisi));
    // Who controls first, so the bridge hands each viewer the right
    // password the first time.
    sisi.send(`${KONTROL}kendali:${this.pengendali ?? 0}`);
    for (const w of this.webs.values())
      sisi.send(`${KONTROL}web-masuk:${w.id}`);
    for (const f of this.antre) sisi.send(f);
    this.antre = [];
    this.antreBytes = 0;
    this.kabari();
  }

  private lepasPi(ws: WebSocket) {
    if (this.pi !== ws) return;
    this.pi = null;
    // Without the Pi there is nothing to show: every page asks again.
    for (const w of [...this.webs.values()]) w.ws.close(4001, "pi-keluar");
  }

  private keWeb(id: number, f: Bingkai) {
    if (id === 0) {
      for (const w of this.webs.values()) w.ws.send(f);
      return;
    }
    this.webs.get(id)?.ws.send(f);
  }

  /** To the Pi, or held until it joins. */
  private kePiKirim(f: string | ArrayBuffer) {
    if (this.pi) {
      this.pi.send(f);
      return;
    }
    if (typeof f === "string") return;
    if (this.antreBytes + f.byteLength <= ANTRE_MAKS) {
      this.antre.push(f);
      this.antreBytes += f.byteLength;
    }
  }

  /* ------------------------------------------------------ the people */

  private pasangWeb(
    sisi: WebSocket,
    o: { nim: string; nama: string; pemilik: boolean; pintu: string },
  ) {
    // The same person again (a reload, a second tab): the new socket takes
    // over their place, control included.
    const lama = [...this.webs.values()].find((w) => w.nim && w.nim === o.nim);
    const id = this.nextId++;
    const w: Web = { id, ws: sisi, ...o, masuk: Date.now() };
    if (lama) {
      this.webs.delete(lama.id);
      if (this.pengendali === lama.id) this.pengendali = id;
      this.minta = this.minta.map((x) => (x === lama.id ? id : x));
      this.pi?.send(`${KONTROL}web-keluar:${lama.id}`);
      lama.ws.close(4000, "diganti");
    }
    this.webs.set(id, w);
    this.terakhirWeb = Date.now();
    if (this.pengendali === null) this.pengendali = id;
    sisi.addEventListener("message", (e) => {
      this.terakhirWeb = Date.now();
      this.kePi = this.kePi.then(async () => {
        if (this.webs.get(id) !== w) return;
        const f = await bingkai(e.data);
        if (typeof f === "string") {
          if (f.startsWith(KONTROL))
            return this.perintah(w, f.slice(KONTROL.length));
          // Text (the terminal's size, still here) only from whoever controls.
          if (this.pengendali === id) this.kePiKirim(`\u0000web:${id}:${f}`);
          return;
        }
        // The terminal takes keys from whoever controls only. A screen gets
        // every viewer's RFB (each has its own connection on the Pi, and
        // only the controller's has the password that isn't view only).
        if (this.terminal && this.pengendali !== id) return;
        this.kePiKirim(tandai(id, f));
      });
    });
    sisi.addEventListener("close", () => this.lepasWeb(w));
    sisi.addEventListener("error", () => this.lepasWeb(w));
    this.pi?.send(`${KONTROL}kendali:${this.pengendali ?? 0}`);
    this.pi?.send(`${KONTROL}web-masuk:${id}`);
    this.kabari();
  }

  private lepasWeb(w: Web) {
    if (this.webs.get(w.id) !== w) return;
    this.webs.delete(w.id);
    this.minta = this.minta.filter((x) => x !== w.id);
    // A closed tab counts from when it left: the Pi isn't kept open alone.
    this.terakhirWeb = Date.now();
    this.pi?.send(`${KONTROL}web-keluar:${w.id}`);
    if (this.pengendali === w.id) {
      // Control goes to the owner when they are here, else whoever came
      // first.
      const sisa = [...this.webs.values()].sort((a, b) => a.masuk - b.masuk);
      this.pengendali = (sisa.find((x) => x.pemilik) ?? sisa[0])?.id ?? null;
      this.minta = this.minta.filter((x) => x !== this.pengendali);
      this.pi?.send(`${KONTROL}kendali:${this.pengendali ?? 0}`);
    }
    if (!this.webs.size) {
      this.antre = [];
      this.antreBytes = 0;
    }
    this.kabari();
  }

  /** A viewer's own notes: minta, batal, beri:<id>, tolak:<id>. */
  private perintah(w: Web, cmd: string) {
    const [aksi, arg] = cmd.split(":");
    const ke = Number(arg);
    if (aksi === "minta") {
      if (this.pengendali !== w.id && !this.minta.includes(w.id))
        this.minta.push(w.id);
    } else if (aksi === "batal") {
      this.minta = this.minta.filter((x) => x !== w.id);
    } else if (
      aksi === "beri" &&
      this.pengendali === w.id &&
      this.webs.has(ke)
    ) {
      this.pengendali = ke;
      this.minta = this.minta.filter((x) => x !== ke);
      this.pi?.send(`${KONTROL}kendali:${ke}`);
    } else if (aksi === "tolak" && this.pengendali === w.id) {
      this.minta = this.minta.filter((x) => x !== ke);
      this.webs.get(ke)?.ws.send(`${KONTROL}ditolak`);
    } else return;
    this.kabari();
  }

  /** Where this room landed, from Cloudflare's own trace page. */
  private async cariColo() {
    try {
      const r = await fetch("https://cloudflare.com/cdn-cgi/trace");
      this.colo = /^colo=(\w+)$/m.exec(await r.text())?.[1] ?? "?";
    } catch {
      this.colo = "?";
    }
    this.kabari();
  }

  /** Every viewer hears who is in, who controls and who asked. */
  private kabari() {
    const orang = [...this.webs.values()]
      .sort((a, b) => a.masuk - b.masuk)
      .map((w) => ({ id: w.id, nim: w.nim, nama: w.nama, pemilik: w.pemilik }));
    for (const w of this.webs.values()) {
      try {
        w.ws.send(
          `${KONTROL}ruang:${JSON.stringify({
            aku: w.id,
            pengendali: this.pengendali,
            minta: this.minta,
            orang,
            pi: this.pi !== null,
            ...(this.colo ? { colo: this.colo } : {}),
            pintu: { aku: w.pintu, pi: this.piPintu },
          })}`,
        );
      } catch {
        /* closing */
      }
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
    for (const w of this.webs.values()) w.ws.close(4003, alasan);
    this.pi = null;
    this.webs.clear();
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
    // Idle: no frame from any viewer, or nobody at all, for 10 minutes.
    if (this.pi && now - this.terakhirWeb > DIAM_MENIT * 60_000)
      return this.selesai("diam");
    if (!this.webs.size && !this.pi) {
      // Nobody connected: keep the nonces until the ticket window is long past.
      await this.ctx.storage.setAlarm(now + 600_000);
      return;
    }
    await this.ctx.storage.setAlarm(now + 30_000);
  }
}

/* ------------------------------------------------------ session streams */

/** A request count while `HITUNG=1` (.dev.vars only): the load test reads
 *  it at /hitung to weigh a day against the free plan. */
const HITUNG: Record<string, number> = {};
function hitung(env: Env, k: string, n = 1) {
  if (env.HITUNG === "1") HITUNG[k] = (HITUNG[k] ?? 0) + n;
}

/** /aliran/<ruang> (a page's socket) and /aliran/<ruang>/kirim (the API) */
async function aliran(
  req: Request,
  env: Env,
  ruang: string | undefined,
  sub: string | undefined,
): Promise<Response> {
  if (!ruang || !ALIRAN_RUANG_RE.test(ruang))
    return teks(404, "tidak ditemukan");
  if (!env.KONSOL_RELAY_SECRET || env.KONSOL_RELAY_SECRET.length < 32)
    return teks(503, "relay belum diatur");
  // Everyone in a session room is in Indonesia, like the Konsol rooms.
  const kamar = env.ALIRAN.get(env.ALIRAN.idFromName(ruang), {
    locationHint: "apac",
  });

  if (sub === "kirim" && req.method === "POST") {
    const body = await req.text();
    if (body.length > ALIRAN_KIRIM_MAKS) return teks(413, "terlalu besar");
    const ts = Number(req.headers.get("x-aliran-ts"));
    const tanda = req.headers.get("x-aliran-tanda") ?? "";
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60)
      return teks(403, "kedaluwarsa");
    const sah = samaPersis(
      tanda,
      await hmacHex(env.KONSOL_RELAY_SECRET, `aliran|${ruang}|${body}|${ts}`),
    );
    if (!sah) return teks(403, "tanda salah");
    let m: PesanAliran[] | null = null;
    try {
      m = saringKiriman(JSON.parse(body));
    } catch {
      /* not JSON */
    }
    if (!m) return teks(400, "format");
    hitung(env, "do_kirim");
    return kamar.fetch("https://aliran/kirim", {
      method: "POST",
      body: JSON.stringify(m),
    });
  }

  if (sub || req.headers.get("Upgrade") !== "websocket")
    return teks(404, "tidak ditemukan");
  const cek = await cekTiketAliran(
    new URL(req.url).searchParams.get("tiket") ?? "",
    env.KONSOL_RELAY_SECRET,
    ruang,
  );
  if (!cek.ok) return teks(403, `tiket ${cek.kode}`);
  const h = new Headers(req.headers);
  h.set("x-tiket", JSON.stringify(cek.tiket));
  hitung(env, "do_sambung");
  return kamar.fetch(new Request("https://aliran/sambung", { headers: h }));
}

/** What a socket in a session room carries through hibernation */
interface Lampiran {
  peran: TiketAliran["peran"];
  g: number | null;
  u: string;
  /** The group this page is looking at (Live, the inspector) */
  lihat: number | null;
  /** Others looking at this socket's own group, and how many of them are
   *  Asisten, as last told ("n,a") */
  penonton: string;
}

/**
 * One running session's streams (or the Server pages' `pi` room). Sockets
 * hibernate, so a quiet room costs nothing; "ping" is answered without
 * waking it. Each message reaches only the sockets allowed to see it
 * (bolehTerima, src/lib/aliran.ts). Nothing is stored but the nonces of
 * tickets already used, until they expire.
 */
export class Aliran {
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (path === "/kirim") {
      const m = JSON.parse(await req.text()) as PesanAliran[];
      return teks(200, String(this.sebar(m, null)));
    }
    let t: TiketAliran;
    try {
      t = JSON.parse(req.headers.get("x-tiket") ?? "") as TiketAliran;
    } catch {
      return teks(400, "tiket");
    }
    // A ticket's nonce works once, kept until the ticket is long expired.
    const kunci = `n:${t.n}`;
    if (await this.ctx.storage.get(kunci))
      return teks(403, "tiket sudah dipakai");
    await this.ctx.storage.put(kunci, t.exp);
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(
        Date.now() + 2 * ALIRAN_TIKET_DETIK * 1000,
      );

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    const att: Lampiran = {
      peran: t.peran,
      g: t.g,
      u: t.u,
      lihat: null,
      penonton: "",
    };
    pair[1].serializeAttachment(att);
    this.kabariPenonton();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    hitung(this.env, "ws_masuk");
    if (typeof data !== "string") return;
    const att = ws.deserializeAttachment() as Lampiran;
    if (data.startsWith('{"j":"lihat"')) {
      let g: unknown = null;
      try {
        g = (JSON.parse(data) as { g?: unknown }).g ?? null;
      } catch {
        return;
      }
      att.lihat =
        Number.isInteger(g) && (g as number) >= 1 && (g as number) <= 99
          ? (g as number)
          : null;
      ws.serializeAttachment(att);
      this.kabariPenonton();
      return;
    }
    const m = saringNaik(data, att);
    if (m) this.sebar([m], ws);
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, "tutup");
    } catch {
      /* already closed */
    }
    this.kabariPenonton(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.kabariPenonton(ws);
  }

  /** Each socket gets the messages it may see, in one frame. */
  private sebar(m: PesanAliran[], dari: WebSocket | null): number {
    let n = 0;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === dari) continue;
      const att = ws.deserializeAttachment() as Lampiran | null;
      if (!att) continue;
      const boleh = m.filter((x) => bolehTerima(att, x));
      if (!boleh.length) continue;
      try {
        ws.send(JSON.stringify({ m: boleh }));
        n++;
      } catch {
        /* closing */
      }
    }
    return n;
  }

  /** Tells each group's sockets how many others look at their group, so a
   *  laptop sends its board lines only while someone watches. */
  private kabariPenonton(pergi: WebSocket | null = null) {
    const semua = this.ctx.getWebSockets().filter((ws) => ws !== pergi);
    const atts = semua.map(
      (ws) => ws.deserializeAttachment() as Lampiran | null,
    );
    semua.forEach((ws, i) => {
      const att = atts[i];
      if (!att || att.g === null) return;
      const lain = atts.filter((o, k) => k !== i && o?.lihat === att.g);
      const n = lain.length;
      const a = lain.filter((o) => o?.peran === "asisten").length;
      if (`${n},${a}` === att.penonton) return;
      att.penonton = `${n},${a}`;
      ws.serializeAttachment(att);
      try {
        ws.send(JSON.stringify({ penonton: n, asisten: a }));
      } catch {
        /* closing */
      }
    });
  }

  /** Forgets nonces whose tickets have run out. */
  async alarm() {
    hitung(this.env, "alarm");
    const kini = Date.now() / 1000;
    const semua = await this.ctx.storage.list<number>({ prefix: "n:" });
    const basi = [...semua]
      .filter(([, exp]) => exp < kini - 60)
      .map(([k]) => k);
    if (basi.length) await this.ctx.storage.delete(basi);
    if (semua.size > basi.length)
      await this.ctx.storage.setAlarm(
        Date.now() + 2 * ALIRAN_TIKET_DETIK * 1000,
      );
  }
}

/** The counts so far (HITUNG=1 only); ?nol=1 starts them over */
async function bacaHitung(env: Env, url: URL): Promise<Response> {
  if (url.searchParams.get("nol") === "1")
    for (const k of Object.keys(HITUNG)) delete HITUNG[k];
  return new Response(JSON.stringify(HITUNG), {
    headers: { "content-type": "application/json" },
  });
}
