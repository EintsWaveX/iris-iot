/**
 * Module 2 gateway.
 *
 *   GET /grupN   an ESP32 (WebSocket, N is 1 to 5, no key)
 *   GET /pc      the lab server's bridge (WebSocket, it dials out, Bearer key)
 *   GET /        plain text, whether the server is connected
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
 */

export interface Env {
  BRIDGE: DurableObjectNamespace;
  PC_KEY: string;
}

const GROUP_RE = /^\/grup[1-5]$/;
/** A reading is a short JSON line; anything bigger is not Module 2 */
const MESSAGE_MAX = 2048;
const CLIENTS_MAX = 40;

const CLOSE_TRY_AGAIN = 1013;
const CLOSE_RESTART = 1012;
const CLOSE_TOO_BIG = 1009;

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
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
    const stub = env.BRIDGE.get(env.BRIDGE.idFromName("main"));
    const upgrade = request.headers.get("Upgrade")?.toLowerCase() === "websocket";

    if (url.pathname === "/") return stub.fetch(new Request("https://bridge/status"));

    if (url.pathname === "/pc") {
      const sent = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1] ?? "";
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
      const boards = this.ctx.getWebSockets().length - this.ctx.getWebSockets("pc").length;
      return text(200, `iris ws gateway\nserver: ${this.bridge() ? "connected" : "offline"}\nboards: ${boards}\n`);
    }

    const pair = new WebSocketPair();
    const [peer, socket] = [pair[0], pair[1]];

    if (path === "/pc") {
      // A newer bridge replaces the old one, so a restart never waits for a stale socket to time out.
      // The boards on the old one are unknown to the new one and try again.
      for (const old of this.ctx.getWebSockets("pc")) old.close(CLOSE_RESTART, "replaced");
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

    if (frame.t === "message" && typeof frame.d === "string") target.send(frame.d);
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
