/**
 * Open Recruitment, Live Coding: the exam's gateway (EXAM-ENGINE 9.6, 9.7).
 * One RecRoom Durable Object per exam room holds everything the evening
 * touches:
 *
 *   /rec/w/<token>/<n>        a board's WebSocket (text frames, both ways)
 *   /rec/h/<token>/<n>[/..]   a board's HTTP request, answered {ok,t,echo,cmd}
 *   /rec/web?tiket=           the seat's page (may send) or a grader's (view only)
 *   /rec/admin/<room>/tutup   Finish: hands back every seat's traffic, then refuses all
 *   /rec/s/<token>            a board's MQTT over WebSocket, through the Broker object
 *
 * The Worker checks every token and ticket (`recRoute`) and passes only what
 * it verified to the object in `x-rec-*` headers; nobody else can reach an
 * object. The object keeps the traffic lines in its SQLite storage during the
 * evening (5,000 per seat, 20 a second, 1,024 characters each) and gives them
 * back at Finish, when the API writes them to R2.
 */
import {
  readLcClaim,
  readLcWeb,
  type LcClaim,
  type LcWeb,
} from "../../web/src/lib/recruitment/lc-gateway.ts";

export interface RecEnv {
  RECROOM: DurableObjectNamespace;
  BROKER: DurableObjectNamespace;
  REC_GATEWAY_SECRET?: string;
  REC_PANTAU_PASS?: string;
  /** Comma separated origins allowed on /rec/web; defaults to the IRIS site */
  REC_ORIGINS?: string;
}

/** One traffic line (EXAM-ENGINE 9.7) */
export interface TrafficLine {
  t: number;
  s: number;
  b?: number;
  via: "ws" | "http" | "mqtt" | "ble";
  dir: "up" | "down" | "sys";
  k: string;
  n: number;
  d: string;
  b64?: true;
}

export const LINES_PER_SEAT = 5000;
export const LINES_PER_SECOND = 20;
export const TEXT_MAX = 1024;
const WS_FRAME_MAX = 2048;
const HTTP_BODY_MAX = 4096;
const CMD_QUEUE_MAX = 20;
const PAGE_SOCKETS_PER_SEAT = 3;
const GRADER_SOCKETS_MAX = 40;
const CLOSE_RESTART = 1012;
const CLOSE_TOO_BIG = 1009;
const CLOSE_GONE = 1001;
const NAME_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const DEFAULT_ORIGINS = [
  "https://irisiotlab.com",
  "https://www.irisiotlab.com",
];

const textOut = (status: number, body: string): Response =>
  new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
const jsonOut = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

/** Compares two strings in time that depends only on their length */
export function sameKey(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export const roomName = (roomId: number): string => `rec-${roomId}`;

/** Bytes as text when they are clean UTF-8 without control characters, else base64 */
export function lineText(bytes: Uint8Array): { d: string; b64?: true } {
  try {
    const s = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: false,
    }).decode(bytes);
    // eslint-disable-next-line no-control-regex
    if (!/[\u0000-\u0008\u000e-\u001f\u007f]/.test(s))
      return { d: s.slice(0, TEXT_MAX) };
  } catch {
    // Not text
  }
  let bin = "";
  const cut = bytes.slice(0, 768);
  for (const x of cut) bin += String.fromCharCode(x);
  return { d: btoa(bin), b64: true };
}

/* ------------------------------------------------------------------ routing */

const BOARD_RE = /^[12]$/;

/** The Worker's side: checks the token or ticket, then hands the request to the room's object. */
export async function recRoute(
  request: Request,
  env: RecEnv,
  url: URL,
): Promise<Response> {
  const secret = env.REC_GATEWAY_SECRET?.trim() ?? "";
  if (secret.length < 32) return textOut(503, "exam gateway not set up");
  const upgrade = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
  const now = Math.floor(Date.now() / 1000);
  const parts = url.pathname.split("/").filter(Boolean); // ["rec", kind, ...]
  const kind = parts[1];
  const room = (id: number) =>
    env.RECROOM.get(env.RECROOM.idFromName(roomName(id)));
  const into = (req: Request, path: string, extra: Record<string, string>) => {
    const out = new Request(`https://room${path}`, req);
    for (const k of [...out.headers.keys()])
      if (k.startsWith("x-rec-")) out.headers.delete(k);
    for (const [k, v] of Object.entries(extra)) out.headers.set(k, v);
    return out;
  };

  if (kind === "admin") {
    // /rec/admin/<roomId>/tutup
    const sent =
      /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1] ??
      "";
    if (!sameKey(sent, secret)) return textOut(401, "no");
    const id = Number(parts[2]);
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      parts[3] !== "tutup" ||
      request.method !== "POST"
    )
      return textOut(404, "not found");
    return room(id).fetch(
      new Request("https://room/tutup", { method: "POST" }),
    );
  }

  if (kind === "web") {
    if (!upgrade) return textOut(426, "WebSocket only");
    const origin = request.headers.get("Origin") ?? "";
    const allowed = (
      env.REC_ORIGINS?.trim() ? env.REC_ORIGINS.split(",") : DEFAULT_ORIGINS
    ).map((o) => o.trim());
    if (!allowed.includes(origin)) return textOut(403, "origin");
    const ticket = await readLcWeb(
      url.searchParams.get("tiket") ?? "",
      secret,
      now,
    );
    if (!ticket) return textOut(401, "ticket");
    return room(ticket.r).fetch(
      into(request, "/web", {
        "x-rec-role": ticket.role,
        "x-rec-s": String(ticket.s ?? 0),
        "x-rec-nim": ticket.nim ?? "",
        "x-rec-jti": ticket.jti,
        "x-rec-exp": String(ticket.exp),
      }),
    );
  }

  if (kind === "w" || kind === "h" || kind === "s") {
    const token = parts[2] ?? "";
    const claim = await readLcClaim(token, secret, now);
    if (!claim) return textOut(401, "token");
    const stub = room(claim.r);
    const seat = String(claim.s);
    if (kind === "s") {
      if (!upgrade) return textOut(426, "WebSocket only");
      const gone = await stub.fetch(into(request, "/cek", {}));
      if (gone.status !== 200) return textOut(gone.status, "room closed");
      const broker = env.BROKER.get(env.BROKER.idFromName("main"));
      return broker.fetch(
        into(request, "/rec-s", {
          "x-rec-r": String(claim.r),
          "x-rec-s": seat,
        }),
      );
    }
    const board = parts[3] ?? "";
    if (!BOARD_RE.test(board)) return textOut(404, "not found");
    if (kind === "w") {
      if (!upgrade) return textOut(426, "WebSocket only");
      return stub.fetch(
        into(request, "/board-ws", { "x-rec-s": seat, "x-rec-b": board }),
      );
    }
    const rest = parts.slice(4).join("/");
    return stub.fetch(
      into(request, "/http", {
        "x-rec-s": seat,
        "x-rec-b": board,
        "x-rec-rest": rest,
      }),
    );
  }
  return textOut(404, "not found");
}

/* -------------------------------------------------------------- the room */

type Attach =
  | { role: "seat"; s: number }
  | { role: "grader"; nim: string }
  | { role: "board"; s: number; b: number };

export class RecRoom implements DurableObject {
  /** A token bucket per seat: 20 lines a second, a burst of at most 20 */
  private bucket = new Map<number, { tokens: number; at: number }>();
  private lastHttp = new Map<string, number>();

  constructor(
    private ctx: DurableObjectState,
    private env: RecEnv,
  ) {
    const sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      sql.exec(
        "CREATE TABLE IF NOT EXISTS line (id INTEGER PRIMARY KEY AUTOINCREMENT, s INTEGER NOT NULL, j TEXT NOT NULL)",
      );
      sql.exec("CREATE INDEX IF NOT EXISTS line_s ON line (s, id)");
      sql.exec(
        "CREATE TABLE IF NOT EXISTS stat (s INTEGER PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, dropped INTEGER NOT NULL DEFAULT 0)",
      );
      sql.exec(
        "CREATE TABLE IF NOT EXISTS jti (id TEXT PRIMARY KEY, exp INTEGER NOT NULL)",
      );
      sql.exec(
        "CREATE TABLE IF NOT EXISTS cmd (id INTEGER PRIMARY KEY AUTOINCREMENT, s INTEGER NOT NULL, b INTEGER NOT NULL, d TEXT NOT NULL)",
      );
      sql.exec(
        "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
      );
    });
  }

  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }

  private closed(): boolean {
    return (
      this.sql.exec("SELECT v FROM meta WHERE k = 'closed'").toArray().length >
      0
    );
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const h = request.headers;
    const s = Number(h.get("x-rec-s") ?? 0);
    const b = Number(h.get("x-rec-b") ?? 0);

    if (path === "/tutup") return this.close();
    if (path === "/cek")
      return this.closed() ? textOut(410, "closed") : textOut(200, "ok");
    if (this.closed()) return textOut(410, "room closed");
    if (path === "/mqtt-in") return this.mqttIn(request);

    if (path === "/http")
      return this.http(request, s, b, h.get("x-rec-rest") ?? "");
    if (path === "/board-ws") return this.boardSocket(s, b);
    if (path === "/web") return this.pageSocket(h);
    return textOut(404, "not found");
  }

  /* ---------------------------------------------------------- the lines */

  /** Stores and fans out one line; false when the caps dropped it. */
  private record(line: TrafficLine, force = false): boolean {
    const over = !this.take(line.s, line.t) && !force;
    this.sql.exec(
      "INSERT INTO stat (s) VALUES (?) ON CONFLICT(s) DO NOTHING",
      line.s,
    );
    const st = this.sql
      .exec("SELECT n FROM stat WHERE s = ?", line.s)
      .one() as { n: number };
    if (over || (!force && st.n >= LINES_PER_SEAT)) {
      this.sql.exec(
        "UPDATE stat SET dropped = dropped + 1 WHERE s = ?",
        line.s,
      );
      return false;
    }
    this.sql.exec(
      "INSERT INTO line (s, j) VALUES (?, ?)",
      line.s,
      JSON.stringify(line),
    );
    this.sql.exec("UPDATE stat SET n = n + 1 WHERE s = ?", line.s);
    this.fan(line.s, { j: "line", l: line });
    return true;
  }

  /** Spends one token of the seat's bucket; false when it is empty. */
  private take(seat: number, now: number): boolean {
    const b = this.bucket.get(seat) ?? { tokens: LINES_PER_SECOND, at: now };
    b.tokens = Math.min(
      LINES_PER_SECOND,
      b.tokens + ((now - b.at) / 1000) * LINES_PER_SECOND,
    );
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.bucket.set(seat, b);
    return ok;
  }

  private fan(seat: number, msg: object): void {
    const text = JSON.stringify(msg);
    const seen = new Set<WebSocket>();
    for (const tag of [`view:s${seat}`, "view:all"])
      for (const ws of this.ctx.getWebSockets(tag)) {
        if (seen.has(ws)) continue;
        seen.add(ws);
        try {
          ws.send(text);
        } catch {
          // Its close event cleans it up
        }
      }
  }

  private history(seat: number, n: number): TrafficLine[] {
    const rows = this.sql
      .exec("SELECT j FROM line WHERE s = ? ORDER BY id DESC LIMIT ?", seat, n)
      .toArray() as { j: string }[];
    return rows.reverse().map((r) => JSON.parse(r.j) as TrafficLine);
  }

  private line(
    s: number,
    via: TrafficLine["via"],
    dir: TrafficLine["dir"],
    k: string,
    bytes: Uint8Array | string,
    b?: number,
  ): boolean {
    const raw =
      typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
    const body = lineText(raw);
    return this.record({
      t: Date.now(),
      s,
      ...(b ? { b } : {}),
      via,
      dir,
      k: k.slice(0, 200),
      n: raw.length,
      ...body,
    });
  }

  private sys(
    s: number,
    via: TrafficLine["via"],
    k: string,
    d = "",
    b?: number,
  ): void {
    this.record(
      {
        t: Date.now(),
        s,
        ...(b ? { b } : {}),
        via,
        dir: "sys",
        k,
        n: 0,
        d: d.slice(0, 200),
      },
      true,
    );
  }

  /* ---------------------------------------------------------- the boards */

  private boardSocket(s: number, b: number): Response {
    const pair = new WebSocketPair();
    const [peer, socket] = [pair[0], pair[1]];
    for (const old of this.ctx.getWebSockets(`w:${s}:${b}`))
      old.close(CLOSE_RESTART, "replaced");
    this.ctx.acceptWebSocket(socket, [`w:${s}:${b}`]);
    socket.serializeAttachment({ role: "board", s, b } satisfies Attach);
    this.sys(s, "ws", "connect", "board", b);
    this.fan(s, { j: "board", s, b, via: "ws", on: true });
    return new Response(null, { status: 101, webSocket: peer });
  }

  private async http(
    request: Request,
    s: number,
    b: number,
    rest: string,
  ): Promise<Response> {
    if (!["GET", "POST", "PUT"].includes(request.method))
      return textOut(405, "method");
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > HTTP_BODY_MAX) return textOut(413, "too big");
    const buf = new Uint8Array(await request.arrayBuffer());
    if (buf.length > HTTP_BODY_MAX) return textOut(413, "too big");
    const key = `${s}:${b}`;
    const before = this.lastHttp.get(key) ?? 0;
    const now = Date.now();
    this.lastHttp.set(key, now);
    if (now - before > 30_000) {
      this.sys(s, "http", "connect", "board", b);
      this.fan(s, { j: "board", s, b, via: "http", on: true });
    }
    const label = `${request.method} /rec/h/…/${b}${rest ? "/" + rest : ""}`;
    this.line(s, "http", "up", label, buf, b);
    let echo: unknown = null;
    if (buf.length) {
      const text = new TextDecoder().decode(buf);
      try {
        echo = JSON.parse(text);
      } catch {
        echo = text;
      }
    }
    const next = this.sql
      .exec(
        "SELECT id, d FROM cmd WHERE s = ? AND b = ? ORDER BY id LIMIT 1",
        s,
        b,
      )
      .toArray() as { id: number; d: string }[];
    let cmd: string | null = null;
    if (next[0]) {
      cmd = next[0].d;
      this.sql.exec("DELETE FROM cmd WHERE id = ?", next[0].id);
      this.line(s, "http", "down", "cmd", cmd, b);
    }
    return jsonOut(200, { ok: true, t: now, echo, cmd });
  }

  /* ----------------------------------------------------------- the pages */

  /** Whether the MQTT monitor (iris-rec-pantau) is listening, so a quiet MQTT log can be told from a broken one. */
  private async monitorReady(): Promise<boolean> {
    try {
      const broker = this.env.BROKER.get(this.env.BROKER.idFromName("main"));
      const r = await broker.fetch(new Request("https://broker/rec-mon"));
      return (await r.text()) === "ready";
    } catch {
      return false;
    }
  }

  private async pageSocket(h: Headers): Promise<Response> {
    const role = h.get("x-rec-role");
    const s = Number(h.get("x-rec-s") ?? 0);
    const nim = h.get("x-rec-nim") ?? "";
    const jti = h.get("x-rec-jti") ?? "";
    const exp = Number(h.get("x-rec-exp") ?? 0);
    if ((role !== "seat" && role !== "grader") || !jti)
      return textOut(401, "ticket");
    if (role === "seat" && !(s > 0)) return textOut(401, "ticket");
    // Single use: a ticket id seen once is never taken again
    const nowSec = Math.floor(Date.now() / 1000);
    this.sql.exec("DELETE FROM jti WHERE exp < ?", nowSec);
    const seen = this.sql.exec("SELECT 1 FROM jti WHERE id = ?", jti).toArray();
    if (seen.length) return textOut(401, "used");
    this.sql.exec("INSERT INTO jti (id, exp) VALUES (?, ?)", jti, exp);

    const tag = role === "seat" ? `seat:${s}` : "grader";
    const mine = this.ctx.getWebSockets(tag);
    if (role === "seat" && mine.length >= PAGE_SOCKETS_PER_SEAT)
      mine[0].close(CLOSE_RESTART, "replaced");
    if (role === "grader" && mine.length >= GRADER_SOCKETS_MAX)
      return textOut(503, "busy");

    const pair = new WebSocketPair();
    const [peer, socket] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(
      socket,
      role === "seat" ? [tag, `view:s${s}`] : [tag, "view:all"],
    );
    socket.serializeAttachment(
      (role === "seat" ? { role, s } : { role, nim }) satisfies Attach,
    );
    socket.send(
      JSON.stringify({
        j: "hello",
        role,
        now: Date.now(),
        boards: this.boardsOnline(role === "seat" ? s : null),
        mqtt: await this.monitorReady(),
        ...(role === "seat" ? { lines: this.history(s, 300) } : {}),
      }),
    );
    return new Response(null, { status: 101, webSocket: peer });
  }

  /** Boards with a live socket (and, for HTTP, a request in the last 30 s). */
  private boardsOnline(
    seat: number | null,
  ): { s: number; b: number; via: string }[] {
    const out: { s: number; b: number; via: string }[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attach | null;
      if (a?.role === "board" && (seat === null || a.s === seat))
        out.push({ s: a.s, b: a.b, via: "ws" });
    }
    const now = Date.now();
    for (const [key, at] of this.lastHttp) {
      const [s, b] = key.split(":").map(Number);
      if (now - at < 30_000 && (seat === null || s === seat))
        out.push({ s, b, via: "http" });
    }
    return out;
  }

  private async fromPage(
    socket: WebSocket,
    a: Attach,
    text: string,
  ): Promise<void> {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    const reply = (o: object) => {
      try {
        socket.send(JSON.stringify(o));
      } catch {
        // Gone
      }
    };
    if (m.t === "ping") return reply({ j: "pong", now: Date.now() });
    if (m.t === "mon")
      return reply({ j: "mon", on: await this.monitorReady() });
    if (m.t === "history") {
      const seat = a.role === "seat" ? a.s : Number(m.s);
      if (!Number.isInteger(seat) || seat <= 0) return;
      const n = Math.min(Math.max(Number(m.n) || 300, 1), 500);
      return reply({ j: "lines", s: seat, l: this.history(seat, n) });
    }
    if (a.role !== "seat") return; // graders only watch
    const b = Number(m.b);
    if (b !== 1 && b !== 2) return reply({ j: "nak", why: "papan" });
    const k = typeof m.k === "string" ? m.k : "";
    const d = typeof m.d === "string" ? m.d : "";
    if (m.t === "ble") {
      const dir = m.dir === "down" ? "down" : "up";
      const bytes = m.b64 === true ? b64Bytes(d) : new TextEncoder().encode(d);
      this.line(a.s, "ble", dir, k.slice(0, 80), bytes, b);
      return;
    }
    if (m.t !== "send") return;
    const bucket = this.bucket.get(a.s);
    if (bucket && bucket.tokens < 1)
      return reply({ j: "nak", b, via: m.via, why: "pelan" });
    if (m.via === "ws") {
      if (d.length > WS_FRAME_MAX)
        return reply({ j: "nak", b, via: "ws", why: "besar" });
      const board = this.ctx.getWebSockets(`w:${a.s}:${b}`)[0];
      if (!board) return reply({ j: "nak", b, via: "ws", why: "luring" });
      try {
        board.send(d);
      } catch {
        return reply({ j: "nak", b, via: "ws", why: "luring" });
      }
      this.line(a.s, "ws", "down", "frame", d, b);
      return;
    }
    if (m.via === "http") {
      if (d.length > HTTP_BODY_MAX)
        return reply({ j: "nak", b, via: "http", why: "besar" });
      const queued = this.sql
        .exec("SELECT COUNT(*) AS n FROM cmd WHERE s = ? AND b = ?", a.s, b)
        .one() as { n: number };
      if (queued.n >= CMD_QUEUE_MAX)
        return reply({ j: "nak", b, via: "http", why: "penuh" });
      this.sql.exec("INSERT INTO cmd (s, b, d) VALUES (?, ?, ?)", a.s, b, d);
      return reply({ j: "ack", b, via: "http", queued: queued.n + 1 });
    }
    if (m.via === "mqtt") {
      if (!NAME_RE.test(k))
        return reply({ j: "nak", b, via: "mqtt", why: "nama" });
      if (d.length > WS_FRAME_MAX)
        return reply({ j: "nak", b, via: "mqtt", why: "besar" });
      const broker = this.env.BROKER.get(this.env.BROKER.idFromName("main"));
      const r = await broker.fetch(
        new Request("https://broker/rec-down", {
          method: "POST",
          body: JSON.stringify({ s: a.s, name: k, d }),
        }),
      );
      // The line itself comes back from the monitor connection, as the broker delivered it
      if (r.status !== 204)
        return reply({ j: "nak", b, via: "mqtt", why: "broker" });
    }
  }

  /** The Broker object forwards what its monitor connection heard on rec/#. */
  private async mqttIn(request: Request): Promise<Response> {
    let m: { s?: number; topic?: string; payload?: string };
    try {
      m = (await request.json()) as typeof m;
    } catch {
      return textOut(400, "bad");
    }
    const s = Number(m.s);
    const topic = String(m.topic ?? "");
    if (!Number.isInteger(s) || !topic.startsWith(`rec/s${s}/`))
      return textOut(400, "bad");
    const dir = topic.startsWith(`rec/s${s}/up/`)
      ? "up"
      : topic.startsWith(`rec/s${s}/down/`)
        ? "down"
        : "sys";
    const bytes = b64Bytes(String(m.payload ?? ""));
    if (dir === "sys") this.sys(s, "mqtt", topic, "");
    else this.line(s, "mqtt", dir, topic, bytes);
    return new Response(null, { status: 204 });
  }

  /* -------------------------------------------------------- socket events */

  async webSocketMessage(
    socket: WebSocket,
    data: string | ArrayBuffer,
  ): Promise<void> {
    const a = socket.deserializeAttachment() as Attach | null;
    if (!a) return;
    if (a.role === "board") {
      if (typeof data !== "string") return;
      if (data.length > WS_FRAME_MAX) {
        socket.close(CLOSE_TOO_BIG, "too big");
        return;
      }
      this.line(a.s, "ws", "up", "frame", data, a.b);
      return;
    }
    if (typeof data !== "string" || data.length > 8192) return;
    await this.fromPage(socket, a, data);
  }

  webSocketClose(socket: WebSocket, code: number): void {
    this.gone(socket, code);
  }

  webSocketError(socket: WebSocket): void {
    this.gone(socket, 1006);
  }

  private gone(socket: WebSocket, code: number): void {
    const a = socket.deserializeAttachment() as Attach | null;
    try {
      socket.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      // Already closed
    }
    if (a?.role === "board" && !this.closed()) {
      // A replaced socket has a newer one with the same tag; only the last one leaving is a drop
      if (this.ctx.getWebSockets(`w:${a.s}:${a.b}`).some((o) => o !== socket))
        return;
      this.sys(a.s, "ws", "disconnect", "board", a.b);
      this.fan(a.s, { j: "board", s: a.s, b: a.b, via: "ws", on: false });
    }
  }

  /* ---------------------------------------------------------------- Finish */

  private close(): Response {
    const first = !this.closed();
    if (first) {
      const dropped = this.sql
        .exec("SELECT s, dropped FROM stat WHERE dropped > 0")
        .toArray() as {
        s: number;
        dropped: number;
      }[];
      this.sql.exec(
        "INSERT INTO meta (k, v) VALUES ('closed', ?)",
        String(Date.now()),
      );
      for (const r of dropped)
        this.sql.exec(
          "INSERT INTO line (s, j) VALUES (?, ?)",
          r.s,
          JSON.stringify({
            t: Date.now(),
            s: r.s,
            via: "ws",
            dir: "sys",
            k: "dropped",
            n: r.dropped,
            d: `${r.dropped} lines dropped by the caps`,
          } satisfies TrafficLine),
        );
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.close(CLOSE_GONE, "room closed");
        } catch {
          // Already closed
        }
      }
      this.sql.exec("DELETE FROM cmd");
    }
    const seats: Record<string, string> = {};
    const rows = this.sql
      .exec("SELECT s, j FROM line ORDER BY id")
      .toArray() as {
      s: number;
      j: string;
    }[];
    for (const r of rows) seats[r.s] = (seats[r.s] ?? "") + r.j + "\n";
    return jsonOut(200, { ok: true, seats });
  }
}

function b64Bytes(d: string): Uint8Array {
  try {
    const bin = atob(d);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

export type { LcClaim, LcWeb };
