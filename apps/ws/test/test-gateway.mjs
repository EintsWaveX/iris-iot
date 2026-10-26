// Module 2 gateway check: starts `wrangler dev` (local workerd), the real
// Module 2 answer-key server and the lab bridge, then walks a board through
// the whole path. Needs python with websockets>=13 on PATH and the IRIS ASO
// checkout next to this repo (or IRIS_ASO set).
//
//   npm test            (reads PC_KEY from .dev.vars)
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = 8790;
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}`;
const ASO = process.env.IRIS_ASO ?? join(homedir(), "Downloads", "IRIS ASO");
const key = /PC_KEY=(.+)/.exec(readFileSync(".dev.vars", "utf8"))?.[1]?.trim();
if (!key) throw new Error("PC_KEY missing in .dev.vars");

let passed = 0;
let failed = 0;
function check(name, ok, info = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !info ? "" : `: ${info}`}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "ignore", ...options });
  children.push(child);
  return child;
}

async function until(fn, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await fn()) return true;
    } catch {
      // Not up yet
    }
    await sleep(250);
  }
  return false;
}

/** Opens a socket and collects what it hears; `closed` resolves with the close code */
function board(path) {
  const socket = new WebSocket(`${WS}${path}`);
  const heard = [];
  const result = { socket, heard };
  result.opened = new Promise((resolve) => {
    socket.onopen = () => resolve(true);
    socket.onerror = () => resolve(false);
  });
  result.closed = new Promise((resolve) => {
    socket.onclose = (event) => resolve(event.code);
  });
  socket.onmessage = (event) => heard.push(String(event.data));
  return result;
}

const status = async () => (await fetch(`${BASE}/`)).text();

try {
  start(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--port", String(PORT), "--ip", "127.0.0.1"]);
  check("worker starts", await until(async () => (await fetch(`${BASE}/`)).ok));

  check("status says the server is offline", (await status()).includes("server: offline"));
  check("a board is refused while the server is offline", !(await board("/grup1").opened));
  check("an unknown path is 404", (await fetch(`${BASE}/grup9`)).status === 404);
  check("a plain GET on a group path is 426", (await fetch(`${BASE}/grup1`)).status === 426);
  check("the bridge route refuses a wrong key", (await fetch(`${BASE}/pc`, { headers: { Authorization: "Bearer nope" } })).status === 401);
  check("the bridge route refuses no key", (await fetch(`${BASE}/pc`)).status === 401);

  start("python", [join(ASO, "kunci_jawaban", "id", "modul2_websocket_server.py")]);
  await sleep(1000);
  const dir = join(ASO, "pc", "modul2");
  const keyFile = join(process.cwd(), ".wrangler", "test-key");
  (await import("node:fs")).mkdirSync(join(process.cwd(), ".wrangler"), { recursive: true });
  (await import("node:fs")).writeFileSync(keyFile, key);
  const bridge = start("python", [join(dir, "modul2_bridge.py")], {
    env: { ...process.env, IRIS_WS_GATEWAY: `${WS}/pc`, IRIS_WS_KEY: keyFile, PYTHONUNBUFFERED: "1" },
  });
  check("the bridge connects", await until(async () => (await status()).includes("server: connected")));

  const one = board("/grup1");
  check("a board connects", await one.opened);
  one.socket.send(JSON.stringify({ seq: 7, temp: 28.4, hum: 61.2 }));
  check("the board gets the server's reply", await until(() => one.heard.length > 0, 5000));
  const reply = JSON.parse(one.heard[0] ?? "{}");
  check("the reply carries seq and the server time", reply.seq === 7 && /^\d\d:\d\d:\d\d:\d{3}$/.test(reply.at ?? ""), one.heard[0]);

  const two = board("/grup3");
  await two.opened;
  two.socket.send(JSON.stringify({ seq: 1, temp: 20, hum: 50 }));
  one.socket.send(JSON.stringify({ seq: 8, temp: 28.5, hum: 61 }));
  await until(() => two.heard.length > 0 && one.heard.length > 1, 5000);
  check("two boards stay apart", JSON.parse(two.heard[0] ?? "{}").seq === 1 && JSON.parse(one.heard[1] ?? "{}").seq === 8);
  check("status counts the boards", (await status()).includes("boards: 2"));

  // The server refuses a path it does not know; the gateway only lets grup1 to grup5 through anyway
  two.socket.close();
  check("a board that leaves is cleaned up", await until(async () => (await status()).includes("boards: 1")));

  const big = board("/grup2");
  await big.opened;
  big.socket.send("x".repeat(5000));
  check("an oversized frame closes that board", (await Promise.race([big.closed, sleep(3000).then(() => "none")])) === 1009);

  bridge.kill();
  check("boards are told to retry when the bridge goes", (await Promise.race([one.closed, sleep(5000).then(() => "none")])) === 1013);
  check("status says offline again", await until(async () => (await status()).includes("server: offline")));
} catch (error) {
  failed++;
  console.log(`FAIL test crashed: ${error}`);
} finally {
  for (const child of children) {
    try {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else child.kill();
    } catch {
      // Already gone
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
