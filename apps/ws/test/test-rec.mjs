// Open Recruitment, Live Coding: the exam gateway (src/rec.ts and the Broker's rec side) through
// `wrangler dev`, the real Module 3 bridge (pc/modul3/modul3_bridge.py) and a stand-in for the
// exam's own Mosquitto (accounts and the per-seat ACL of EXAM-ENGINE 9.6, started here on a port).
//
//   node test/test-rec.mjs        (from apps/ws; reads PC_KEY from .dev.vars; needs python with
//                                  websockets>=13 and the IRIS ASO checkout, or IRIS_ASO)
//
// Ports: REC_TEST_PORT (default 8795) for the Worker, 18840 for the stand-in broker.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const PORT = Number(process.env.REC_TEST_PORT ?? 8795);
const BROKER_PORT = 18840;
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}`;
const ASO = process.env.IRIS_ASO ?? join(homedir(), "Downloads", "IRIS ASO");
const SECRET = "rec-test-secret-0123456789abcdef0123456789";
const PANTAU = "pantau-test-password-xyz";
const ORIGIN = "http://localhost:4321";
const ROOM = 1000 + Math.floor(Math.random() * 90000); // a fresh room each run: the local Durable Object state persists
const SEAT = 7;
const OTHER = 9;
const PC_KEY = /PC_KEY=(.+)/
  .exec(readFileSync(".dev.vars", "utf8"))?.[1]
  ?.trim();
if (!PC_KEY) throw new Error("PC_KEY missing in .dev.vars");

let passed = 0;
let failed = 0;
function check(name, ok, info = "") {
  if (ok) passed++;
  else failed++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${name}${ok || !info ? "" : `: ${info}`}`,
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await fn()) return true;
    } catch {
      // Not yet
    }
    await sleep(100);
  }
  return false;
}

/* ------------------------------------------------------------ tokens */
const b64u = (b) => Buffer.from(b).toString("base64url");
const sign = (obj, secret = SECRET) => {
  const body = b64u(JSON.stringify(obj));
  return `${body}.${crypto.createHmac("sha256", secret).update(body).digest("base64url")}`;
};
const now = () => Math.floor(Date.now() / 1000);
const claim = (s, extra = {}) =>
  sign({ v: 1, p: "lc", r: ROOM, s, exp: now() + 3600, ...extra });
const ticket = (role, extra = {}) =>
  sign({
    v: 1,
    p: "lcweb",
    role,
    r: ROOM,
    jti: crypto.randomUUID(),
    exp: now() + 60,
    ...extra,
  });

/* ------------------------------------------- the stand-in exam broker */
function topicMatches(filter, topic) {
  const f = filter.split("/");
  const t = topic.split("/");
  for (let i = 0; i < f.length; i++) {
    if (f[i] === "#") return true;
    if (i >= t.length) return false;
    if (f[i] !== "+" && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}
const USERS = {
  "iris-rec-pantau": PANTAU,
  [`rec${ROOM}s${SEAT}`]: "PwSeven",
  [`rec${ROOM}s${OTHER}`]: "PwNine",
};
function allowed(user, topic, write) {
  if (user === "iris-rec-pantau")
    return write
      ? topicMatches("rec/+/down/#", topic)
      : topicMatches("rec/#", topic) || topic === "rec/#";
  const m = /^rec\d+s(\d+)$/.exec(user);
  return (
    !!m && (topic === `rec/s${m[1]}/#` || topicMatches(`rec/s${m[1]}/#`, topic))
  );
}
const subs = new Set(); // { sock, user, filter }
const brokerSeen = [];
function remaining(n) {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return Buffer.from(out);
}
const pkt = (first, body) =>
  Buffer.concat([Buffer.from([first]), remaining(body.length), body]);
const str = (s) => {
  const b = Buffer.from(s);
  return Buffer.concat([Buffer.from([b.length >> 8, b.length & 255]), b]);
};
const DEBUG = process.env.REC_DEBUG === "1";
const broker = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  let user = null;
  if (DEBUG) console.log("  [broker] connection");
  sock.on("close", () => {
    for (const s of [...subs]) if (s.sock === sock) subs.delete(s);
  });
  sock.on("error", () => {});
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      let len = 0,
        mult = 1,
        i = 1;
      for (;;) {
        if (i >= buf.length) return;
        const b = buf[i++];
        len += (b & 127) * mult;
        mult *= 128;
        if (!(b & 128)) break;
      }
      if (buf.length < i + len) return;
      const first = buf[0];
      const body = buf.subarray(i, i + len);
      buf = buf.subarray(i + len);
      const type = first >> 4;
      if (DEBUG)
        console.log("  [broker] packet type", type, "len", len, "user", user);
      if (type === 1) {
        let at = 2 + 4 + 1 + 1 + 2; // name, level, flags, keepalive
        const rd = () => {
          const n = (body[at] << 8) | body[at + 1];
          const v = body.subarray(at + 2, at + 2 + n).toString();
          at += 2 + n;
          return v;
        };
        rd(); // client id
        const u = rd();
        const p = rd();
        if (USERS[u] === p) {
          user = u;
          sock.write(Buffer.from([0x20, 2, 0, 0]));
        } else {
          sock.write(Buffer.from([0x20, 2, 0, 5]));
          sock.end();
        }
      } else if (type === 8 && user) {
        const id = body.subarray(0, 2);
        const n = (body[2] << 8) | body[3];
        const filter = body.subarray(4, 4 + n).toString();
        const ok = allowed(user, filter, false);
        if (ok) subs.add({ sock, user, filter });
        sock.write(
          Buffer.concat([
            Buffer.from([0x90, 3]),
            id,
            Buffer.from([ok ? 0 : 0x80]),
          ]),
        );
      } else if (type === 3 && user) {
        const n = (body[0] << 8) | body[1];
        const topic = body.subarray(2, 2 + n).toString();
        const payload = body.subarray(2 + n);
        brokerSeen.push({ user, topic, payload: payload.toString() });
        if (!allowed(user, topic, true)) continue;
        const out = pkt(0x30, Buffer.concat([str(topic), payload]));
        for (const s of subs)
          if (topicMatches(s.filter, topic) || s.filter === "rec/#")
            s.sock.write(out);
      } else if (type === 12) sock.write(Buffer.from([0xd0, 0]));
      else if (type === 14) sock.end();
    }
  });
});

const legacySeen = [];
const legacy = net.createServer((sock) => {
  sock.on("error", () => {});
  sock.on("data", (d) => {
    if (d[0] >> 4 === 1) {
      legacySeen.push(d);
      sock.write(Buffer.from([0x20, 2, 0, 0]));
    }
  });
});

/* ---------------------------------------------------------- sockets */
function open(url, { origin, protocols } = {}) {
  const headers = origin ? { Origin: origin } : {};
  const socket = new WebSocket(url, protocols, { headers });
  const r = { socket, msgs: [], raw: [], bin: [], protocol: null };
  r.opened = new Promise((resolve) => {
    socket.on("open", () => {
      r.protocol = socket.protocol;
      resolve(true);
    });
    socket.on("unexpected-response", (_q, res) => resolve(res.statusCode));
    socket.on("error", () => resolve(false));
  });
  r.closed = new Promise((resolve) =>
    socket.on("close", (code) => resolve(code)),
  );
  socket.on("message", (data, isBinary) => {
    if (isBinary) return r.bin.push(Buffer.from(data));
    r.raw.push(String(data));
    try {
      r.msgs.push(JSON.parse(String(data)));
    } catch {
      // Not JSON (a board's plain frame)
    }
  });
  r.send = (o) => socket.send(typeof o === "string" ? o : JSON.stringify(o));
  r.lines = () => r.msgs.filter((m) => m.j === "line").map((m) => m.l);
  return r;
}
const httpBoard = (s, b, rest = "", body, method = "POST", t = claim(s)) =>
  fetch(`${BASE}/rec/h/${t}/${b}${rest ? "/" + rest : ""}`, { method, body });

/* -------------------------------------------------------------- run */
const children = [];
function start(command, args, options = {}) {
  const c = spawn(command, args, {
    stdio: DEBUG ? "inherit" : "ignore",
    ...options,
  });
  children.push(c);
  return c;
}

try {
  await new Promise((r) => broker.listen(BROKER_PORT, "127.0.0.1", r));
  await new Promise((r) => legacy.listen(18841, "127.0.0.1", r));
  mkdirSync(".wrangler", { recursive: true });
  writeFileSync(".wrangler/test-key", PC_KEY);
  start("node", [
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--port",
    String(PORT),
    "--ip",
    "127.0.0.1",
    "--var",
    `REC_GATEWAY_SECRET:${SECRET}`,
    "--var",
    `REC_PANTAU_PASS:${PANTAU}`,
    "--var",
    `REC_ORIGINS:${ORIGIN}`,
  ]);
  check(
    "worker starts",
    await until(async () => (await fetch(`${BASE}/`)).status === 200, 90000),
  );

  console.log("A. Tokens, tickets, rules");
  check(
    "a board with a bad token: 401",
    (await open(`${WS}/rec/w/${claim(SEAT)}x/1`).opened) === 401,
  );
  check(
    "a token signed with another secret: 401",
    (await open(
      `${WS}/rec/w/${sign({ v: 1, p: "lc", r: ROOM, s: SEAT, exp: now() + 99 }, "other-secret-other-secret-other-secret")}/1`,
    ).opened) === 401,
  );
  check(
    "an expired token: 401",
    (await open(`${WS}/rec/w/${claim(SEAT, { exp: now() - 5 })}/1`).opened) ===
      401,
  );
  check(
    "board number 3: 404",
    (await open(`${WS}/rec/w/${claim(SEAT)}/3`).opened) === 404,
  );
  check(
    "a web ticket is not a board token",
    (await open(`${WS}/rec/w/${ticket("seat", { s: SEAT })}/1`).opened) === 401,
  );
  check(
    "a board token is not a page ticket",
    (await open(`${WS}/rec/web?tiket=${claim(SEAT)}`, { origin: ORIGIN })
      .opened) === 401,
  );
  check(
    "the page socket refuses a foreign Origin",
    (await open(`${WS}/rec/web?tiket=${ticket("seat", { s: SEAT })}`, {
      origin: "https://evil.example",
    }).opened) === 403,
  );
  check(
    "and a missing Origin",
    (await open(`${WS}/rec/web?tiket=${ticket("seat", { s: SEAT })}`)
      .opened) === 403,
  );
  check(
    "an expired ticket: 401",
    (await open(
      `${WS}/rec/web?tiket=${ticket("seat", { s: SEAT, exp: now() - 1 })}`,
      { origin: ORIGIN },
    ).opened) === 401,
  );
  let r = await fetch(`${BASE}/rec/admin/${ROOM}/tutup`, { method: "POST" });
  check("Finish without the secret: 401", r.status === 401);
  r = await fetch(`${BASE}/rec/admin/${ROOM}/tutup`, {
    method: "POST",
    headers: { Authorization: "Bearer nope-nope-nope-nope-nope-nope-nope" },
  });
  check("Finish with a wrong secret: 401", r.status === 401);
  r = await fetch(`${BASE}/rec/zzz`);
  check("an unknown /rec path: 404", r.status === 404);

  console.log("B. The pages");
  const page = open(`${WS}/rec/web?tiket=${ticket("seat", { s: SEAT })}`, {
    origin: ORIGIN,
  });
  check("the seat's page connects", (await page.opened) === true);
  check(
    "and gets hello with no lines yet",
    await until(() =>
      page.msgs.some(
        (m) => m.j === "hello" && m.role === "seat" && m.lines.length === 0,
      ),
    ),
  );
  const used = ticket("seat", { s: SEAT });
  const first = open(`${WS}/rec/web?tiket=${used}`, { origin: ORIGIN });
  await first.opened;
  check("a ticket works once", true);
  check(
    "and a second use is refused",
    (await open(`${WS}/rec/web?tiket=${used}`, { origin: ORIGIN }).opened) ===
      401,
  );
  first.socket.close();
  const other = open(`${WS}/rec/web?tiket=${ticket("seat", { s: OTHER })}`, {
    origin: ORIGIN,
  });
  await other.opened;
  const grader = open(
    `${WS}/rec/web?tiket=${ticket("grader", { nim: "1101200032" })}`,
    { origin: ORIGIN },
  );
  await grader.opened;

  console.log("C. WebSocket board");
  const board = open(`${WS}/rec/w/${claim(SEAT)}/1`);
  check("a board connects", (await board.opened) === true);
  check(
    "the page hears the board come on and a sys line",
    await until(
      () =>
        page.msgs.some(
          (m) => m.j === "board" && m.on && m.b === 1 && m.via === "ws",
        ) && page.lines().some((l) => l.dir === "sys" && l.k === "connect"),
    ),
  );
  board.send("suhu 29.5");
  check(
    "a board frame reaches the seat's page as an up line with the board",
    await until(() =>
      page
        .lines()
        .some(
          (l) =>
            l.via === "ws" &&
            l.dir === "up" &&
            l.d === "suhu 29.5" &&
            l.b === 1,
        ),
    ),
  );
  check(
    "and the grader sees it too",
    await until(() =>
      grader.lines().some((l) => l.d === "suhu 29.5" && l.s === SEAT),
    ),
  );
  check(
    "but another seat's page never does",
    !other.lines().some((l) => l.s === SEAT),
  );
  page.send({ t: "send", via: "ws", b: 1, d: '{"led":"nyala"}' });
  check(
    "the board receives the page's frame",
    await until(() => board.raw.includes('{"led":"nyala"}')),
  );
  check(
    "and the page logs it as a down line",
    await until(() =>
      page
        .lines()
        .some(
          (l) =>
            l.via === "ws" &&
            l.dir === "down" &&
            l.d === '{"led":"nyala"}' &&
            l.b === 1,
        ),
    ),
  );
  page.send({ t: "send", via: "ws", b: 2, d: "x" });
  check(
    "sending to a board that is not connected: nak luring",
    await until(() =>
      page.msgs.some((m) => m.j === "nak" && m.why === "luring" && m.b === 2),
    ),
  );
  grader.send({ t: "send", via: "ws", b: 1, d: "dari penilai" });
  await sleep(300);
  check(
    "a grader cannot send",
    !board.raw.includes("dari penilai") &&
      !page.lines().some((l) => l.d === "dari penilai"),
  );
  page.send({ t: "history", n: 50 });
  check(
    "the page can ask for its history",
    await until(() =>
      page.msgs.some((m) => m.j === "lines" && m.s === SEAT && m.l.length >= 2),
    ),
  );
  other.send({ t: "history", s: SEAT });
  await sleep(300);
  check(
    "another seat cannot read this seat's history (it gets its own)",
    !other.msgs.some((m) => m.j === "lines" && m.s === SEAT),
  );
  grader.send({ t: "history", s: SEAT, n: 50 });
  check(
    "a grader can ask for any seat's history",
    await until(() =>
      grader.msgs.some(
        (m) => m.j === "lines" && m.s === SEAT && m.l.length >= 2,
      ),
    ),
  );

  console.log("D. HTTP board");
  r = await httpBoard(SEAT, 1, "data", JSON.stringify({ tombol: 1, n: 14 }));
  let j = await r.json();
  check(
    "a POST is answered {ok,t,echo,cmd}",
    r.status === 200 &&
      j.ok === true &&
      typeof j.t === "number" &&
      j.echo.n === 14 &&
      j.cmd === null,
    JSON.stringify(j),
  );
  check(
    "the page sees the request as an up line",
    await until(() =>
      page
        .lines()
        .some(
          (l) =>
            l.via === "http" &&
            l.dir === "up" &&
            l.k.startsWith("POST /rec/h/") &&
            l.k.endsWith("/1/data"),
        ),
    ),
  );
  check(
    "the token is not in the log line",
    !page.lines().some((l) => l.k.includes(claim(SEAT).slice(0, 20))),
  );
  page.send({ t: "send", via: "http", b: 1, d: "nyala" });
  check(
    "the page queues a command",
    await until(() =>
      page.msgs.some(
        (m) => m.j === "ack" && m.via === "http" && m.queued === 1,
      ),
    ),
  );
  r = await httpBoard(SEAT, 1, "data", "{}");
  j = await r.json();
  check(
    "the next request carries it as cmd",
    j.cmd === "nyala",
    JSON.stringify(j),
  );
  r = await httpBoard(SEAT, 1, "data", "{}");
  j = await r.json();
  check("and only once", j.cmd === null);
  check(
    "the delivery is logged as a down line",
    page
      .lines()
      .some((l) => l.via === "http" && l.dir === "down" && l.d === "nyala"),
  );
  r = await httpBoard(SEAT, 1, "", "x".repeat(5000));
  check("a body over 4 KB: 413", r.status === 413);
  r = await fetch(`${BASE}/rec/h/${claim(SEAT)}/1`);
  check("a GET works too", r.status === 200 && (await r.json()).ok === true);
  r = await fetch(`${BASE}/rec/h/${claim(SEAT)}/1`, { method: "DELETE" });
  check("a DELETE is refused: 405", r.status === 405);
  r = await httpBoard(SEAT, 1, "", "x", "POST", claim(SEAT) + "x");
  check("a bad token on HTTP: 401", r.status === 401);
  check(
    "another seat's page saw none of it",
    !other.lines().some((l) => l.via === "http"),
  );

  console.log("E. Caps");
  for (let i = 0; i < 60; i++) board.send(`flood ${i}`);
  await sleep(1500);
  const flood = page.lines().filter((l) => l.d?.startsWith("flood"));
  check(
    "a burst of 60 frames is capped by the bucket (about 20 plus the refill)",
    flood.length >= 15 && flood.length < 45,
    String(flood.length),
  );

  console.log("F. MQTT through the real bridge");
  const bridge = start(
    process.env.REC_PY ?? "python",
    [join(ASO, "pc", "modul3", "modul3_bridge.py")],
    {
      env: {
        ...process.env,
        IRIS_MQTT_GATEWAY: `${WS}/pc-mqtt`,
        IRIS_MQTT_PORT: "18841",
        IRIS_REC_PORT: String(BROKER_PORT),
        IRIS_WS_KEY: ".wrangler/test-key",
        PYTHONUNBUFFERED: "1",
      },
    },
  );
  void bridge;
  check(
    "the bridge connects",
    await until(
      async () =>
        (await (await fetch(`${BASE}/mqtt`)).text()).includes(
          "server: connected",
        ),
      20000,
    ),
  );
  const mq = open(`${WS}/rec/s/${claim(SEAT)}`, { protocols: ["mqtt"] });
  check(
    "an MQTT client connects and the subprotocol is echoed",
    (await mq.opened) === true && mq.protocol === "mqtt",
    String(mq.protocol),
  );
  const connect = (user, pass, id) =>
    pkt(
      0x10,
      Buffer.concat([
        Buffer.from([0, 4, 0x4d, 0x51, 0x54, 0x54, 4, 0xc2, 0, 60]),
        str(id),
        str(user),
        str(pass),
      ]),
    );
  mq.send = (b) => mq.socket.send(b);
  check(
    "the page learns the MQTT monitor is up (not silent)",
    await until(() => {
      page.send({ t: "mon" });
      return page.msgs.some((m) => m.j === "mon" && m.on);
    }, 10000),
  );
  mq.send(connect(`rec${ROOM}s${SEAT}`, "PwSeven", `s${SEAT}-b1`));
  check(
    "CONNACK accepted with the seat's account",
    await until(() => mq.bin.some((b) => b[0] >> 4 === 2 && b[3] === 0)),
  );
  mq.send(
    pkt(
      0x82,
      Buffer.concat([
        Buffer.from([0, 1]),
        str(`rec/s${SEAT}/down/#`),
        Buffer.from([0]),
      ]),
    ),
  );
  check(
    "SUBACK for its own topic",
    await until(() => mq.bin.some((b) => b[0] >> 4 === 9 && b[4] === 0)),
  );
  mq.send(
    pkt(
      0x82,
      Buffer.concat([
        Buffer.from([0, 2]),
        str(`rec/s${OTHER}/#`),
        Buffer.from([0]),
      ]),
    ),
  );
  check(
    "the ACL refuses another seat's topic (0x80)",
    await until(() =>
      mq.bin.some(
        (b) => b[0] >> 4 === 9 && b[2] === 0 && b[3] === 2 && b[4] === 0x80,
      ),
    ),
  );
  const wrong = open(`${WS}/rec/s/${claim(SEAT)}`, { protocols: ["mqtt"] });
  await wrong.opened;
  wrong.socket.send(connect(`rec${ROOM}s${SEAT}`, "nope", "x"));
  check(
    "a wrong password gets CONNACK 5",
    await until(() => wrong.bin.some((b) => b[0] >> 4 === 2 && b[3] === 5)),
  );
  mq.send(
    pkt(
      0x30,
      Buffer.concat([str(`rec/s${SEAT}/up/suhu`), Buffer.from("29.5")]),
    ),
  );
  check(
    "the device's publish reaches the page as an mqtt up line (once)",
    await until(
      () =>
        page
          .lines()
          .filter(
            (l) =>
              l.via === "mqtt" &&
              l.dir === "up" &&
              l.k === `rec/s${SEAT}/up/suhu` &&
              l.d === "29.5",
          ).length === 1,
    ),
    JSON.stringify(page.lines().filter((l) => l.via === "mqtt")),
  );
  await sleep(500);
  check(
    "and it is not duplicated",
    page
      .lines()
      .filter((l) => l.via === "mqtt" && l.k === `rec/s${SEAT}/up/suhu`)
      .length === 1,
  );
  check(
    "the grader sees it",
    grader.lines().some((l) => l.via === "mqtt" && l.d === "29.5"),
  );
  check(
    "another seat's page does not",
    !other.lines().some((l) => l.via === "mqtt"),
  );
  page.send({ t: "send", via: "mqtt", b: 1, k: "led", d: "nyala" });
  check(
    "the page's downlink arrives at the device",
    await until(() =>
      mq.bin.some(
        (b) =>
          b[0] >> 4 === 3 &&
          b.toString().includes(`rec/s${SEAT}/down/led`) &&
          b.toString().endsWith("nyala"),
      ),
    ),
  );
  check(
    "and shows as a down line from the broker",
    await until(() =>
      page
        .lines()
        .some(
          (l) =>
            l.via === "mqtt" &&
            l.dir === "down" &&
            l.k === `rec/s${SEAT}/down/led`,
        ),
    ),
  );
  page.send({ t: "send", via: "mqtt", b: 1, k: "bad/name", d: "x" });
  check(
    "a topic name with a slash is refused",
    await until(() =>
      page.msgs.some(
        (m) => m.j === "nak" && m.via === "mqtt" && m.why === "nama",
      ),
    ),
  );
  check(
    "the monitor connected as iris-rec-pantau and nothing else wrote down",
    brokerSeen.every(
      (m) =>
        m.user !== "iris-rec-pantau" ||
        m.topic.startsWith(`rec/s${SEAT}/down/`),
    ),
  );
  mq.send(Buffer.from([0xc0, 0]));
  check(
    "a ping is answered",
    await until(() => mq.bin.some((b) => b[0] === 0xd0)),
  );

  console.log("G. Module 3 still works beside it");
  const pico = open(`${WS}/mqtt`);
  check(
    "a plain Pico connection (no rec) still opens",
    (await pico.opened) === true,
  );
  pico.socket.send(connect("anon", "", "pico-1"));
  check(
    "and its bytes reach the anonymous broker on the legacy port, not the exam's",
    (await until(() => pico.bin.some((b) => b[0] >> 4 === 2 && b[3] === 0))) &&
      legacySeen.length === 1,
  );
  pico.socket.close();
  check(
    "/mqtt status still answers",
    (await (await fetch(`${BASE}/mqtt`)).text()).includes("iris mqtt gateway"),
  );

  console.log("H. Finish");
  const lastSys = page.lines().length;
  r = await fetch(`${BASE}/rec/admin/${ROOM}/tutup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  j = await r.json();
  const lines7 = (j.seats?.[SEAT] ?? "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((x) => JSON.parse(x));
  check(
    "Finish returns each seat's lines as JSON lines",
    r.status === 200 && j.ok && lines7.length >= lastSys,
    `${lines7.length} vs ${lastSys}`,
  );
  check(
    "with the up and down lines of every protocol",
    ["ws", "http", "mqtt"].every((v) =>
      lines7.some((l) => l.via === v && l.dir === "up"),
    ) && lines7.some((l) => l.dir === "down"),
  );
  check(
    "and the dropped count from the caps",
    lines7.some((l) => l.k === "dropped"),
  );
  check(
    "every sock of the room is closed",
    (await page.closed) === 1001 && (await board.closed) === 1001,
  );
  check(
    "a new board is refused",
    (await open(`${WS}/rec/w/${claim(SEAT)}/1`).opened) === 410,
  );
  r = await httpBoard(SEAT, 1, "", "{}");
  check("a new HTTP request is refused", r.status === 410);
  check(
    "a new page is refused",
    (await open(`${WS}/rec/web?tiket=${ticket("seat", { s: SEAT })}`, {
      origin: ORIGIN,
    }).opened) === 410,
  );
  check(
    "a new MQTT client is refused",
    (await open(`${WS}/rec/s/${claim(SEAT)}`, { protocols: ["mqtt"] })
      .opened) === 410,
  );
  r = await fetch(`${BASE}/rec/admin/${ROOM}/tutup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const again = await r.json();
  check(
    "Finish twice gives the same lines (the API may retry)",
    again.seats?.[SEAT]?.split("\n").length ===
      j.seats[SEAT].split("\n").length,
  );
  check(
    "another room is not closed",
    (
      await fetch(`${BASE}/rec/admin/${ROOM + 1}/tutup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}` },
      })
    ).status === 200 &&
      (await open(
        `${WS}/rec/w/${sign({ v: 1, p: "lc", r: ROOM + 2, s: 3, exp: now() + 99 })}/1`,
      ).opened) === true,
  );
} catch (e) {
  check("test crashed", false, String(e?.stack ?? e));
} finally {
  for (const c of children) c.kill();
  broker.close();
  legacy.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
