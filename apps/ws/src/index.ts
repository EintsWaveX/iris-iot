/**
 * Module 2 gateway.
 *
 *   GET /grupN   an ESP32 (WebSocket, N is 1 to 5, no key)
 *   GET /pc      the lab server's bridge (WebSocket, it dials out, Bearer key)
 *   GET /        plain text, whether the server is connected
 *   GET /mqtt    a Pico W (WebSocket, MQTT bytes in binary frames, no key)
 *   GET /pc-mqtt the lab server's MQTT bridge (WebSocket, Bearer key)
 *
 * One Durable Object holds every socket. Between it and the bridge each
 * ESP32 is a numbered connection, in JSON text frames:
 *
 *   to the bridge    {"t":"open","c":1,"p":"/grup1"}  {"t":"message","c":1,"d":"..."}  {"t":"close","c":1}
 *   from the bridge  {"t":"message","c":1,"d":"..."}  {"t":"close","c":1}  {"t":"ping"}
 *
 * The bridge replays each connection into the real Module 2 server on the
 * lab PC, so the server, its log and its timestamps are the ones the
 * practicum already uses. Nothing is stored here.
 *
 * Module 3 (broker.irisiotlab.com) works the same way with its own object,
 * but MQTT is binary, so a connection's bytes ride in binary frames that
 * start with a 4-byte connection id; "open" and "close" stay JSON text.
 * The bridge pipes each connection into Mosquitto on the lab PC.
 *
 * Open Recruitment's Live Coding (rec.ts) rides the same two hosts under
 * /rec/...: boards, the seat pages and the Finish call go to one RecRoom
 * object per exam room, and a board's MQTT goes through the Broker object
 * below (tagged "rec", so the bridge sends it to the exam's own broker).
 */

import { RecRoom, recRoute, type RecEnv } from "./rec.ts";
import {
  MqttReader,
  encodeConnect,
  encodePingreq,
  encodePublish,
  encodeSubscribe,
} from "../../web/src/lib/recruitment/mqtt-lite.ts";

export { RecRoom };

export interface Env extends RecEnv {
  BRIDGE: DurableObjectNamespace;
  BROKER: DurableObjectNamespace;
  PC_KEY: string;
}

const GROUP_RE = /^\/grup[1-5]$/;
/** A reading is a short JSON line; anything bigger is not Module 2 */
const MESSAGE_MAX = 2048;
const CLIENTS_MAX = 40;

const CLOSE_TRY_AGAIN = 1013;
const CLOSE_RESTART = 1012;
const CLOSE_TOO_BIG = 1009;
/** An MQTT packet from a Pico is a few dozen bytes; this is generous */
const MQTT_CHUNK_MAX = 4096;

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/** Compares two strings in time that depends only on their length */
function sameKey(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/rec/")) return recRoute(request, env, url);
    const stub = env.BRIDGE.get(env.BRIDGE.idFromName("main"));
    const upgrade =
      request.headers.get("Upgrade")?.toLowerCase() === "websocket";

    if (url.pathname === "/")
      return stub.fetch(new Request("https://bridge/status"));

    if (url.pathname === "/mqtt" || url.pathname === "/pc-mqtt") {
      const broker = env.BROKER.get(env.BROKER.idFromName("main"));
      if (url.pathname === "/pc-mqtt") {
        const sent =
          /^Bearer (.+)$/.exec(
            request.headers.get("Authorization") ?? "",
          )?.[1] ?? "";
        if (!env.PC_KEY || !sameKey(sent, env.PC_KEY)) return text(401, "no");
      }
      if (!upgrade)
        return url.pathname === "/mqtt"
          ? broker.fetch(new Request("https://broker/status"))
          : text(426, "WebSocket only");
      return broker.fetch(
        new Request(`https://broker${url.pathname}`, request),
      );
    }

    if (url.pathname === "/pc") {
      const sent =
        /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1] ??
        "";
      if (!env.PC_KEY || !sameKey(sent, env.PC_KEY)) return text(401, "no");
      if (!upgrade) return text(426, "WebSocket only");
      return stub.fetch(new Request("https://bridge/pc", request));
    }

    if (GROUP_RE.test(url.pathname)) {
      if (!upgrade) return text(426, "WebSocket only");
      return stub.fetch(new Request(`https://bridge${url.pathname}`, request));
    }

    return text(404, "not found");
  },
};

interface Client {
  id: number;
  path: string;
}

export class Bridge implements DurableObject {
  constructor(private ctx: DurableObjectState) {}

  private bridge(): WebSocket | undefined {
    return this.ctx.getWebSockets("pc")[0];
  }

  private client(id: number): WebSocket | undefined {
    return this.ctx.getWebSockets(`c${id}`)[0];
  }

  private tell(message: object): void {
    try {
      this.bridge()?.send(JSON.stringify(message));
    } catch {
      // A bridge that just dropped is cleaned up by its own close event
    }
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path === "/status") {
      const boards =
        this.ctx.getWebSockets().length - this.ctx.getWebSockets("pc").length;
      return text(
        200,
        `iris ws gateway\nserver: ${this.bridge() ? "connected" : "offline"}\nboards: ${boards}\n`,
      );
    }

    const pair = new WebSocketPair();
    const [peer, socket] = [pair[0], pair[1]];

    if (path === "/pc") {
      // A newer bridge replaces the old one, so a restart never waits for a stale socket to time out.
      // The boards on the old one are unknown to the new one and try again.
      for (const old of this.ctx.getWebSockets("pc"))
        old.close(CLOSE_RESTART, "replaced");
      this.dropBoards();
      this.ctx.acceptWebSocket(socket, ["pc"]);
      return new Response(null, { status: 101, webSocket: peer });
    }

    if (!this.bridge()) return text(503, "server offline");
    if (this.ctx.getWebSockets().length > CLIENTS_MAX) return text(503, "busy");

    const next: number = (await this.ctx.storage.get<number>("next")) ?? 1;
    await this.ctx.storage.put("next", next + 1);
    const client: Client = { id: next, path };

    this.ctx.acceptWebSocket(socket, [`c${client.id}`]);
    socket.serializeAttachment(client);
    this.tell({ t: "open", c: client.id, p: client.path });
    return new Response(null, { status: 101, webSocket: peer });
  }

  webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): void {
    const client = socket.deserializeAttachment() as Client | null;

    // An ESP32: pass its text frame on, drop anything else
    if (client) {
      if (typeof data !== "string") return;
      if (data.length > MESSAGE_MAX) {
        socket.close(CLOSE_TOO_BIG, "too big");
        return;
      }
      this.tell({ t: "message", c: client.id, d: data });
      return;
    }

    // The bridge
    if (typeof data !== "string") return;
    let frame: { t?: string; c?: number; d?: string };
    try {
      frame = JSON.parse(data);
    } catch {
      return;
    }

    if (frame.t === "ping") {
      socket.send(JSON.stringify({ t: "pong" }));
      return;
    }
    if (typeof frame.c !== "number") return;
    const target = this.client(frame.c);
    if (!target) return;

    if (frame.t === "message" && typeof frame.d === "string")
      target.send(frame.d);
    if (frame.t === "close") target.close(1000, "server closed");
  }

  webSocketClose(socket: WebSocket, code: number): void {
    this.gone(socket, code);
  }

  webSocketError(socket: WebSocket): void {
    this.gone(socket, 1006);
  }

  private gone(socket: WebSocket, code: number): void {
    const client = socket.deserializeAttachment() as Client | null;
    try {
      socket.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      // Already closed
    }

    if (client) {
      this.tell({ t: "close", c: client.id });
      return;
    }

    // The bridge went: every board is told to try again once it is back,
    // unless a newer bridge is already in its place
    if (this.ctx.getWebSockets("pc").some((other) => other !== socket)) return;
    this.dropBoards();
  }

  private dropBoards(): void {
    const bridges = new Set(this.ctx.getWebSockets("pc"));
    for (const other of this.ctx.getWebSockets()) {
      if (!bridges.has(other)) other.close(CLOSE_TRY_AGAIN, "server offline");
    }
  }
}

/** The id the gateway's own monitor connection uses on the bridge (client ids count up from 1) */
const MON_ID = 0xfffffff0;
const MON_USER = "iris-rec-pantau";
/** A room of 35 seats with two boards each is 70 MQTT clients, so the exam gets its own ceiling */
const REC_CLIENTS_MAX = 160;
const MON_PING_MS = 30_000;
/** The bridge dials Mosquitto after the open frame and drops bytes that come before it is through */
const MON_DIAL_MS = 400;
const MON_WAIT_MS = 5_000;

interface ClientNote {
  id: number;
  rec?: { r: number; s: number };
}
interface BridgeNote {
  /** open: asked the bridge to dial (CONNECT follows shortly); wait: CONNECT sent; ready: subscribed */
  mon?: "open" | "wait" | "ready";
  at?: number;
}

/**
 * Module 3: one Pico W connection is one numbered MQTT connection to the bridge.
 * Open Recruitment's boards come in on /rec-s (their token already checked by
 * the Worker) and are marked "l":"rec" so the bridge sends them to the exam's
 * own broker. While any of them is connected, one more connection of the
 * object's own, the monitor `iris-rec-pantau`, listens to rec/# and hands each
 * message to the seat's RecRoom; the page's downlink is published through it.
 */
export class Broker implements DurableObject {
  private reader = new MqttReader(16384);

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  private bridge(): WebSocket | undefined {
    return this.ctx.getWebSockets("pc")[0];
  }

  private tell(message: object): void {
    try {
      this.bridge()?.send(JSON.stringify(message));
    } catch {
      // A bridge that just dropped is cleaned up by its own close event
    }
  }

  /** The id, then the bytes */
  private packet(id: number, data: ArrayBuffer | Uint8Array): ArrayBuffer {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const out = new Uint8Array(4 + bytes.byteLength);
    new DataView(out.buffer).setUint32(0, id);
    out.set(bytes, 4);
    return out.buffer;
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path === "/status") {
      const clients =
        this.ctx.getWebSockets().length - this.ctx.getWebSockets("pc").length;
      return text(
        200,
        `iris mqtt gateway\nserver: ${this.bridge() ? "connected" : "offline"}\nclients: ${clients}\n`,
      );
    }

    if (path === "/rec-down") return this.recDown(request);
    if (path === "/rec-mon")
      return text(200, this.monitor().mon === "ready" ? "ready" : "off");

    const pair = new WebSocketPair();
    const [peer, socket] = [pair[0], pair[1]];

    if (path === "/pc-mqtt") {
      for (const old of this.ctx.getWebSockets("pc"))
        old.close(CLOSE_RESTART, "replaced");
      this.dropClients();
      this.ctx.acceptWebSocket(socket, ["pc"]);
      return new Response(null, { status: 101, webSocket: peer });
    }

    const rec =
      path === "/rec-s"
        ? {
            r: Number(request.headers.get("x-rec-r")),
            s: Number(request.headers.get("x-rec-s")),
          }
        : null;
    if (
      rec &&
      !(Number.isInteger(rec.r) && Number.isInteger(rec.s) && rec.s > 0)
    )
      return text(400, "bad");

    if (!this.bridge()) return text(503, "server offline");
    if (rec) {
      if (this.ctx.getWebSockets("rec").length >= REC_CLIENTS_MAX)
        return text(503, "busy");
    } else {
      const others =
        this.ctx.getWebSockets().length - this.ctx.getWebSockets("rec").length;
      if (others > CLIENTS_MAX) return text(503, "busy");
    }

    const next: number = (await this.ctx.storage.get<number>("next")) ?? 1;
    await this.ctx.storage.put("next", (next + 1) >>> 0 || 1);

    this.ctx.acceptWebSocket(socket, rec ? [`c${next}`, "rec"] : [`c${next}`]);
    socket.serializeAttachment({
      id: next,
      ...(rec ? { rec } : {}),
    } satisfies ClientNote);
    if (rec) {
      await this.ctx.storage.put(`room:${rec.s}`, rec.r);
      this.tell({ t: "open", c: next, l: "rec" });
      await this.ensureMonitor();
    } else this.tell({ t: "open", c: next });

    const headers = new Headers();
    // esp-mqtt and every browser MQTT client ask for the "mqtt" subprotocol and
    // drop the socket unless it is echoed (a Pico's wrapper never asks)
    if (
      /(^|,\s*)mqtt(\s*,|$)/.test(
        request.headers.get("Sec-WebSocket-Protocol") ?? "",
      )
    )
      headers.set("Sec-WebSocket-Protocol", "mqtt");
    return new Response(null, { status: 101, webSocket: peer, headers });
  }

  /** A client's note carries its id; the bridge's carries the monitor's state instead */
  private note(socket: WebSocket): ClientNote | null {
    const n = socket.deserializeAttachment() as Partial<ClientNote> | null;
    return n && typeof n.id === "number" ? (n as ClientNote) : null;
  }

  async webSocketMessage(
    socket: WebSocket,
    data: string | ArrayBuffer,
  ): Promise<void> {
    const client = this.note(socket);

    // A Pico or an exam board: its MQTT bytes go to the bridge, anything else is dropped
    if (client) {
      if (typeof data === "string") return;
      if (data.byteLength > MQTT_CHUNK_MAX) {
        socket.close(CLOSE_TOO_BIG, "too big");
        return;
      }
      try {
        this.bridge()?.send(this.packet(client.id, data));
      } catch {
        // The bridge went; its close event tells the Pico to try again
      }
      return;
    }

    // The bridge: binary is a connection's bytes, text is a note
    if (typeof data !== "string") {
      if (data.byteLength < 5) return;
      const id = new DataView(data).getUint32(0);
      if (id === MON_ID) return this.fromMonitor(new Uint8Array(data, 4));
      this.ctx.getWebSockets(`c${id}`)[0]?.send(data.slice(4));
      return;
    }
    let frame: { t?: string; c?: number };
    try {
      frame = JSON.parse(data);
    } catch {
      return;
    }
    if (frame.t === "ping") {
      socket.send(JSON.stringify({ t: "pong" }));
      return;
    }
    if (frame.t === "close" && typeof frame.c === "number") {
      if (frame.c === MON_ID) {
        this.setMonitor(undefined);
        if (this.ctx.getWebSockets("rec").length)
          await this.ctx.storage.setAlarm(Date.now() + 5000);
        return;
      }
      this.ctx.getWebSockets(`c${frame.c}`)[0]?.close(1000, "server closed");
    }
  }

  webSocketClose(socket: WebSocket, code: number): void {
    this.gone(socket, code);
  }

  webSocketError(socket: WebSocket): void {
    this.gone(socket, 1006);
  }

  private gone(socket: WebSocket, code: number): void {
    const client = this.note(socket);
    try {
      socket.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      // Already closed
    }

    if (client) {
      this.tell({ t: "close", c: client.id });
      if (
        client.rec &&
        !this.ctx.getWebSockets("rec").some((o) => o !== socket)
      )
        this.stopMonitor();
      return;
    }
    if (this.ctx.getWebSockets("pc").some((other) => other !== socket)) return;
    this.dropClients();
  }

  private dropClients(): void {
    const bridges = new Set(this.ctx.getWebSockets("pc"));
    for (const other of this.ctx.getWebSockets()) {
      if (!bridges.has(other)) other.close(CLOSE_TRY_AGAIN, "server offline");
    }
  }

  /* ------------------------------------------------ the exam's monitor */

  private monitor(): BridgeNote {
    return (this.bridge()?.deserializeAttachment() ?? {}) as BridgeNote;
  }

  private setMonitor(note: BridgeNote | undefined): void {
    try {
      this.bridge()?.serializeAttachment(note ?? {});
    } catch {
      // The bridge went
    }
  }

  /** Opens the monitor connection on the bridge unless it is open or opening. */
  private async ensureMonitor(): Promise<boolean> {
    const pass = this.env.REC_PANTAU_PASS?.trim();
    if (!pass || !this.bridge()) return false;
    const note = this.monitor();
    if (note.mon === "ready") return true;
    if (note.mon && Date.now() - (note.at ?? 0) < MON_WAIT_MS + MON_DIAL_MS)
      return true;
    if (note.mon) this.tell({ t: "close", c: MON_ID });
    this.reader = new MqttReader(16384);
    this.setMonitor({ mon: "open", at: Date.now() });
    this.tell({ t: "open", c: MON_ID, l: "rec" });
    await this.ctx.storage.setAlarm(Date.now() + MON_DIAL_MS);
    return true;
  }

  /** The CONNECT, once the bridge has had time to dial the broker. */
  private connectMonitor(): void {
    const pass = this.env.REC_PANTAU_PASS?.trim();
    if (!pass) return;
    try {
      this.bridge()?.send(
        this.packet(
          MON_ID,
          encodeConnect({
            clientId: `${MON_USER}-${crypto.randomUUID().slice(0, 8)}`,
            user: MON_USER,
            pass,
            keepAlive: 90,
          }),
        ),
      );
      this.setMonitor({ mon: "wait", at: Date.now() });
    } catch {
      this.setMonitor(undefined);
    }
  }

  private stopMonitor(): void {
    if (this.monitor().mon) this.tell({ t: "close", c: MON_ID });
    this.setMonitor(undefined);
  }

  /** Keeps the monitor alive while exam boards are connected, and reopens it when it fell. */
  async alarm(): Promise<void> {
    if (!this.bridge() || !this.ctx.getWebSockets("rec").length)
      return this.stopMonitor();
    const note = this.monitor();
    if (note.mon === "open") {
      this.connectMonitor();
      return this.ctx.storage.setAlarm(Date.now() + MON_WAIT_MS);
    }
    if (note.mon === "ready") {
      try {
        this.bridge()?.send(this.packet(MON_ID, encodePingreq()));
      } catch {
        // Its close event follows
      }
    } else {
      // No CONNACK came (or none was asked for): start the monitor over
      if (note.mon) this.tell({ t: "close", c: MON_ID });
      this.setMonitor(undefined);
      await this.ensureMonitor();
      return;
    }
    await this.ctx.storage.setAlarm(Date.now() + MON_PING_MS);
  }

  /** What the broker said to the monitor: the handshake, then every rec/# message. */
  private async fromMonitor(bytes: Uint8Array): Promise<void> {
    for (const p of this.reader.feed(bytes)) {
      if (p.type === "connack") {
        if (p.code === 0) {
          this.setMonitor({ mon: "ready", at: Date.now() });
          this.bridge()?.send(this.packet(MON_ID, encodeSubscribe(1, "rec/#")));
          await this.ctx.storage.setAlarm(Date.now() + MON_PING_MS);
        } else {
          // Refused: the account is not provisioned yet, or the password differs. Try again later.
          this.stopMonitor();
          await this.ctx.storage.setAlarm(Date.now() + MON_PING_MS);
        }
      } else if (p.type === "publish") {
        const seat = /^rec\/s(\d+)\//.exec(p.topic)?.[1];
        if (!seat) continue;
        const room = await this.ctx.storage.get<number>(`room:${seat}`);
        if (!room) continue;
        const stub = this.env.RECROOM.get(
          this.env.RECROOM.idFromName(`rec-${room}`),
        );
        let bin = "";
        for (const x of p.payload.slice(0, 2048)) bin += String.fromCharCode(x);
        await stub
          .fetch(
            new Request("https://room/mqtt-in", {
              method: "POST",
              body: JSON.stringify({
                s: Number(seat),
                topic: p.topic,
                payload: btoa(bin),
              }),
            }),
          )
          .catch(() => undefined);
      }
    }
  }

  /** The page's downlink: publishes rec/s<id>/down/<name> through the monitor. */
  private async recDown(request: Request): Promise<Response> {
    let m: { s?: number; name?: string; d?: string };
    try {
      m = (await request.json()) as typeof m;
    } catch {
      return text(400, "bad");
    }
    if (this.monitor().mon !== "ready") return text(503, "monitor");
    const s = Number(m.s);
    if (
      !Number.isInteger(s) ||
      s <= 0 ||
      !/^[A-Za-z0-9_-]{1,40}$/.test(String(m.name))
    )
      return text(400, "bad");
    const body = new TextEncoder().encode(String(m.d ?? "").slice(0, 2048));
    try {
      this.bridge()?.send(
        this.packet(MON_ID, encodePublish(`rec/s${s}/down/${m.name}`, body)),
      );
    } catch {
      return text(503, "monitor");
    }
    return new Response(null, { status: 204 });
  }
}
