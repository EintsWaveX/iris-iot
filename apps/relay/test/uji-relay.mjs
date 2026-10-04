// Konsol relay check: starts `wrangler dev` (local workerd, no Cloudflare
// login needed) and walks one room through its whole life. Tickets are
// signed here with node:crypto, independently of src/lib/konsol.ts, so the
// format is checked from both sides.
//
//   npm test            (reads KONSOL_RELAY_SECRET from .dev.vars)
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}`;
const secret = /KONSOL_RELAY_SECRET=(.+)/.exec(readFileSync(".dev.vars", "utf8"))?.[1]?.trim();
if (!secret) throw new Error("KONSOL_RELAY_SECRET missing in .dev.vars");

let lulus = 0;
let gagal = 0;
function cek(nama, ok, info = "") {
  if (ok) lulus++;
  else gagal++;
  console.log(`${ok ? "ok  " : "GAGAL"} ${nama}${ok || !info ? "" : `: ${info}`}`);
}

const b64 = (b) => Buffer.from(b).toString("base64url");
const id = () => b64(randomBytes(24));
const now = () => Math.floor(Date.now() / 1000);
function tiket(o) {
  const t = { v: 1, s: 1, u: "", t: "terminal", exp: now() + 60, end: now() + 3600, n: id(), ...o };
  const body = b64(JSON.stringify(t));
  return `${body}.${b64(createHmac("sha256", secret).update(body).digest())}`;
}

/** Opens a socket; resolves {ws, msgs, closed} once open, or {refused}. */
function buka(path) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS}${path}`);
    ws.binaryType = "arraybuffer";
    const msgs = [];
    const s = { ws, msgs, closed: null };
    ws.onmessage = (e) => msgs.push(e.data);
    ws.onclose = (e) => {
      s.closed = e.code;
      resolve({ refused: true, code: e.code });
    };
    ws.onopen = () => resolve(s);
  });
}
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
async function sampai(fn, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await tunggu(50);
  }
  return false;
}
const teks = (d) => (typeof d === "string" ? d : Buffer.from(d).toString());

const dev = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1"], {
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
dev.stdout.on("data", (d) => (log += d));
dev.stderr.on("data", (d) => (log += d));

try {
  const siap = await sampai(() => /Ready on/.test(log), 60_000);
  if (!siap) throw new Error(`wrangler dev did not start:\n${log}`);

  const r0 = await fetch(BASE);
  cek("root answers", r0.ok && (await r0.text()).includes("relay"));

  const k = id();
  const bad = await buka(`/web/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k }) + "x")}`);
  cek("a bad signature is refused", bad.refused === true);
  const peran = await buka(`/pi/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k }))}`);
  cek("a browser ticket can't join as the Pi", peran.refused === true);
  const lain = await buka(`/web/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k: id() }))}`);
  cek("a ticket for another room is refused", lain.refused === true);
  const lewat = await buka(
    `/web/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k, exp: now() - 5 }))}`,
  );
  cek("an expired ticket is refused", lewat.refused === true);

  // The browser first: its frames wait for the Pi.
  const webT = tiket({ p: "web", k });
  const web = await buka(`/web/${k}?tiket=${encodeURIComponent(webT)}`);
  cek("the browser joins", !web.refused);
  web.ws.send(new Uint8Array([108, 115, 13]));
  const pi = await buka(`/pi/${k}?tiket=${encodeURIComponent(tiket({ p: "pi", k }))}`);
  cek("the Pi joins", !pi.refused);
  await sampai(() => pi.msgs.length >= 2);
  cek("the Pi hears the browser is in", teks(pi.msgs[0] ?? "") === "\u0000relay:web-masuk");
  cek(
    "frames sent before the Pi joined arrive",
    teks(pi.msgs[1] ?? "") === "ls\r",
    JSON.stringify(pi.msgs.map(teks)),
  );
  pi.ws.send(new Uint8Array([0x68, 0x69]));
  await sampai(() => web.msgs.length >= 1);
  cek("the Pi's bytes reach the browser", teks(web.msgs[0] ?? "") === "hi");
  cek(
    "the browser never sees relay control frames",
    !web.msgs.some((m) => teks(m).startsWith("\u0000relay:")),
  );

  const lagi = await buka(`/web/${k}?tiket=${encodeURIComponent(webT)}`);
  cek("a ticket works once", lagi.refused === true);

  // A reload: a fresh ticket replaces the browser socket.
  const web2 = await buka(`/web/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k }))}`);
  cek("a fresh ticket rejoins", !web2.refused);
  await sampai(() => web.closed !== null);
  cek("the old browser socket is replaced", web.closed === 4000, String(web.closed));

  const ts = now();
  const salah = await fetch(`${BASE}/tutup/${k}`, {
    method: "POST",
    headers: { "x-konsol-ts": String(ts), "x-konsol-tanda": "00" },
  });
  cek("closing needs the API's signature", salah.status === 403);
  const tanda = createHmac("sha256", secret).update(`tutup|${k}|${ts}`).digest("hex");
  const tutup = await fetch(`${BASE}/tutup/${k}`, {
    method: "POST",
    headers: { "x-konsol-ts": String(ts), "x-konsol-tanda": tanda },
  });
  cek("the API closes the room", tutup.ok);
  await sampai(() => web2.closed !== null && pi.closed !== null);
  cek("both ends are closed with 4003", web2.closed === 4003 && pi.closed === 4003);
  cek(
    "the Pi is told why",
    pi.msgs.some((m) => teks(m) === "\u0000relay:tutup:diputus"),
  );
  const sesudah = await buka(`/web/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k }))}`);
  cek("a closed room stays closed", sesudah.refused === true);

  // Past the console's hard end, a ticket is refused.
  const k2 = id();
  const habis = await buka(
    `/web/${k2}?tiket=${encodeURIComponent(tiket({ p: "web", k: k2, end: now() - 1 }))}`,
  );
  cek("a ticket past the console's end is refused", habis.refused === true);
} finally {
  if (process.env.DEBUG_RELAY) {
    const q = await fetch(`${BASE}/cdn-cgi/local/explorer/api/local/observability/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT level, substr(message,1,300) FROM logs WHERE message NOT LIKE '%tiket=%' OR level != 'info' LIMIT 80" }),
    }).catch(() => null);
    console.log(q ? await q.text() : "no log api");
  }
  // The whole tree (npx, wrangler, workerd), before exiting: on Windows the
  // tree goes first, since killing the shell alone orphans wrangler.
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(dev.pid), "/t", "/f"]);
  else dev.kill();
}
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
