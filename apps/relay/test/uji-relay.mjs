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
  // wrangler dev fills in request.cf from where this machine reaches
  // Cloudflare, so on a CI runner abroad every room would be turned back as
  // "jauh" (far from the lab). The suite tests rooms, not the runner's
  // location: room sockets come in as a side's last try does.
  if (/^\/(web|pc)\//.test(path)) path += `${path.includes("?") ? "&" : "?"}jauh=boleh`;
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
    // A socket that neither opens nor closes would hang the whole suite.
    setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        resolve({ refused: true, code: "timeout" });
      }
    }, 10_000);
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
  // Its own process group off Windows, so the group can be stopped at once.
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
dev.stdout.on("data", (d) => (log += d));
dev.stderr.on("data", (d) => (log += d));

function hentiDev() {
  // The whole tree (npx, wrangler, workerd), before exiting: on Windows the
  // tree goes first, since killing the shell alone orphans wrangler.
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(dev.pid), "/t", "/f"]);
  else {
    try {
      process.kill(-dev.pid, "SIGTERM");
    } catch {
      dev.kill();
    }
  }
}

// The whole suite takes seconds; if it stalls, fail with wrangler's log
// instead of holding a CI runner until GitHub's six-hour limit.
setTimeout(() => {
  console.log(`GAGAL the suite stalled after ${lulus} checks. wrangler said:\n${log.slice(-4000)}`);
  hentiDev();
  process.exit(1);
}, 180_000).unref();

try {
  const siap = await sampai(() => /Ready on/.test(log), 60_000);
  if (!siap) throw new Error(`wrangler dev did not start:\n${log}`);

  const r0 = await fetch(BASE);
  cek("root answers", r0.ok && (await r0.text()).includes("relay"));

  const k = id();
  const bad = await buka(`/web/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k }) + "x")}`);
  cek("a bad signature is refused", bad.refused === true);
  const peran = await buka(`/pc/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k }))}`);
  cek("a browser ticket can't join as the PC", peran.refused === true);
  const lain = await buka(`/web/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k: id() }))}`);
  cek("a ticket for another room is refused", lain.refused === true);
  const lewat = await buka(
    `/web/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k, exp: now() - 5 }))}`,
  );
  cek("an expired ticket is refused", lewat.refused === true);

  // The owner first: their keys wait for the PC, tagged with their id.
  const kontrol = (m) => teks(m).startsWith("\u0000relay:");
  const ruangDari = (s) => {
    const r = s.msgs.map(teks).filter((m) => m.startsWith("\u0000relay:ruang:"));
    return r.length ? JSON.parse(r[r.length - 1].slice("\u0000relay:ruang:".length)) : null;
  };
  const data = (s) => s.msgs.filter((m) => !kontrol(m)).map(teks);
  const webT = tiket({ p: "web", k, u: "A", nm: "Ani (ANI)", pk: true });
  const web = await buka(`/web/${k}?tiket=${encodeURIComponent(webT)}`);
  cek("the owner joins", !web.refused);
  await sampai(() => ruangDari(web));
  const r1 = ruangDari(web);
  cek(
    "the first one in controls",
    r1 && r1.pengendali === r1.aku && r1.orang[0]?.nama === "Ani (ANI)" && r1.pc === false,
    JSON.stringify(r1),
  );
  web.ws.send(new Uint8Array([108, 115, 13]));
  await tunggu(100);
  const pc = await buka(`/pc/${k}?tiket=${encodeURIComponent(tiket({ p: "pc", k }))}`);
  cek("the PC joins", !pc.refused);
  await sampai(() => pc.msgs.length >= 3);
  const a = r1.aku;
  cek(
    "the PC hears who is in and who controls",
    teks(pc.msgs[0]) === `\u0000relay:kendali:${a}` && teks(pc.msgs[1]) === `\u0000relay:web-masuk:${a}`,
    JSON.stringify(pc.msgs.slice(0, 2).map(teks)),
  );
  const b2 = new Uint8Array(pc.msgs[2] instanceof ArrayBuffer ? pc.msgs[2] : []);
  cek(
    "keys sent before the PC joined arrive, tagged with the sender",
    b2.length === 5 && ((b2[0] << 8) | b2[1]) === a && Buffer.from(b2.slice(2)).toString() === "ls\r",
  );
  pc.ws.send(new Uint8Array([0, 0, 0x68, 0x69]));
  await sampai(() => data(web).length >= 1);
  cek("output for everyone reaches the owner, untagged", data(web)[0] === "hi");
  await sampai(() => ruangDari(web)?.pc === true);
  cek("the owner hears the PC is in", ruangDari(web)?.pc === true);

  const lagi = await buka(`/web/${k}?tiket=${encodeURIComponent(webT)}`);
  cek("a ticket works once", lagi.refused === true);

  // The PC's ticket works a few times (to move off a far route), then no more.
  const kUlang = id();
  const pcT2 = tiket({ p: "pc", k: kUlang });
  const kali = [];
  for (let i = 0; i < 6; i++) {
    const s = await buka(`/pc/${kUlang}?tiket=${encodeURIComponent(pcT2)}`);
    kali.push(s.refused === true);
    if (!s.refused) s.ws.close();
  }
  cek(
    "the PC's ticket works five times, then is refused",
    kali.slice(0, 5).every((x) => !x) && kali[5] === true,
    JSON.stringify(kali),
  );

  // A second person joins: they watch, their keys don't reach the terminal.
  const b = await buka(
    `/web/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k, u: "B", nm: "Budi (BUD)" }))}`,
  );
  cek("a second person joins", !b.refused);
  await sampai(() => ruangDari(b));
  const rb = ruangDari(b);
  const bid = rb.aku;
  cek("they see who controls", rb.pengendali === a && rb.orang.length === 2, JSON.stringify(rb));
  await sampai(() => pc.msgs.some((m) => teks(m) === `\u0000relay:web-masuk:${bid}`));
  cek("the PC hears them come in", pc.msgs.some((m) => teks(m) === `\u0000relay:web-masuk:${bid}`));
  const sebelum = pc.msgs.length;
  b.ws.send(new Uint8Array([0x72, 0x6d]));
  b.ws.send('{"t":"r","c":80,"r":24}');
  await tunggu(300);
  cek("a watcher's keys and size don't reach the terminal", pc.msgs.length === sebelum);
  pc.ws.send(new Uint8Array([0, 0, 0x6f, 0x6b]));
  await sampai(() => data(b).includes("ok"));
  cek("output for everyone reaches the watcher", data(b).includes("ok"));

  // Asking for control, and getting it.
  b.ws.send("\u0000relay:minta");
  await sampai(() => ruangDari(web)?.minta?.includes(bid));
  cek("the controller sees the request", ruangDari(web)?.minta?.includes(bid));
  b.ws.send(`\u0000relay:beri:${bid}`);
  await tunggu(200);
  cek("only the controller can hand it over", ruangDari(b)?.pengendali === a);
  web.ws.send(`\u0000relay:beri:${bid}`);
  await sampai(() => ruangDari(b)?.pengendali === bid);
  cek("control moves when the controller gives it", ruangDari(web)?.pengendali === bid);
  await sampai(() => pc.msgs.some((m) => teks(m) === `\u0000relay:kendali:${bid}`));
  cek("the PC hears who controls now", pc.msgs.some((m) => teks(m) === `\u0000relay:kendali:${bid}`));
  b.ws.send(new Uint8Array([0x70, 0x77, 0x64]));
  b.ws.send('{"t":"r","c":100,"r":30}');
  await sampai(() =>
    pc.msgs.some((m) => teks(m) === `\u0000web:${bid}:{"t":"r","c":100,"r":30}`),
  );
  const kb = pc.msgs.find(
    (m) => m instanceof ArrayBuffer && ((new Uint8Array(m)[0] << 8) | new Uint8Array(m)[1]) === bid,
  );
  cek(
    "the new controller's keys and size reach the PC",
    kb && Buffer.from(new Uint8Array(kb).slice(2)).toString() === "pwd",
  );
  web.ws.send("\u0000relay:minta");
  await sampai(() => ruangDari(b)?.minta?.includes(a));
  b.ws.send(`\u0000relay:tolak:${a}`);
  await sampai(() => web.msgs.some((m) => teks(m) === "\u0000relay:ditolak"));
  cek(
    "a declined request is cleared and the asker told",
    web.msgs.some((m) => teks(m) === "\u0000relay:ditolak") && !ruangDari(web)?.minta?.length,
  );

  // A note for one person only.
  pc.ws.send(`\u0000ke:${bid}:{"t":"siap"}`);
  await sampai(() => data(b).includes('{"t":"siap"}'));
  cek(
    "a note for one person reaches them alone",
    data(b).includes('{"t":"siap"}') && !data(web).includes('{"t":"siap"}'),
  );

  // The controller leaves: control goes back to the owner.
  b.ws.close();
  await sampai(() => ruangDari(web)?.pengendali === a && ruangDari(web)?.orang.length === 1);
  cek("when the controller leaves, the owner controls again", ruangDari(web)?.pengendali === a);
  await sampai(() => pc.msgs.some((m) => teks(m) === `\u0000relay:web-keluar:${bid}`));
  cek("the PC hears them leave", pc.msgs.some((m) => teks(m) === `\u0000relay:web-keluar:${bid}`));

  // A reload: a fresh ticket for the same person takes over their place.
  const web2 = await buka(
    `/web/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k, u: "A", nm: "Ani (ANI)", pk: true }))}`,
  );
  cek("a fresh ticket rejoins", !web2.refused);
  await sampai(() => web.closed !== null);
  cek("the old socket is replaced", web.closed === 4000, String(web.closed));
  await sampai(() => ruangDari(web2));
  cek("and keeps control", ruangDari(web2)?.pengendali === ruangDari(web2)?.aku);

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
  await sampai(() => web2.closed !== null && pc.closed !== null);
  cek("both ends are closed with 4003", web2.closed === 4003 && pc.closed === 4003);
  cek(
    "the PC is told why",
    pc.msgs.some((m) => teks(m) === "\u0000relay:tutup:diputus"),
  );
  const sesudah = await buka(`/web/${k}?tiket=${encodeURIComponent(tiket({ p: "web", k }))}`);
  cek("a closed room stays closed", sesudah.refused === true);

  // Past the console's hard end, a ticket is refused.
  const k2 = id();
  const habis = await buka(
    `/web/${k2}?tiket=${encodeURIComponent(tiket({ p: "web", k: k2, end: now() - 1 }))}`,
  );
  cek("a ticket past the console's end is refused", habis.refused === true);

  // Live updates: every page hears a signed message; nothing else gets in.
  const kirim = (body, o = {}) => {
    const ts = o.ts ?? now();
    const tanda = o.tanda ?? createHmac("sha256", secret).update(`siaran|${body}|${ts}`).digest("hex");
    return fetch(`${BASE}/siaran/kirim`, {
      method: "POST",
      headers: { "x-siaran-ts": String(ts), "x-siaran-tanda": tanda },
      body,
    });
  };
  const p1 = await buka("/siaran");
  const p2 = await buka("/siaran");
  cek("pages connect to /siaran without a ticket", !p1.refused && !p2.refused);
  let r = await kirim(JSON.stringify({ t: ["jadwal", "tim"] }));
  await sampai(() => p1.msgs.length >= 1 && p2.msgs.length >= 1);
  cek(
    "a signed message reaches every page, topics only",
    r.ok && teks(p1.msgs[0]) === '{"t":["jadwal","tim"]}' && teks(p2.msgs[0]) === teks(p1.msgs[0]),
    `${r.status} ${p1.msgs.map(teks)}`,
  );
  r = await kirim(JSON.stringify({ t: ["jadwal"] }), { tanda: "0".repeat(64) });
  cek("a wrong signature is refused", r.status === 403);
  r = await kirim(JSON.stringify({ t: ["jadwal"] }), { ts: now() - 120 });
  cek("an old message is refused", r.status === 403);
  r = await kirim(JSON.stringify({ t: ["<b>x</b>"] }));
  cek("a topic that isn't a plain word is refused", r.status === 400);
  p1.ws.send("ping");
  await sampai(() => p1.msgs.length >= 2);
  cek("ping gets pong", teks(p1.msgs[1]) === "pong", p1.msgs.map(teks).join(","));
  await tunggu(200);
  cek("nothing else arrived", p2.msgs.length === 1, p2.msgs.map(teks).join(","));
  p1.ws.close();
  p2.ws.close();

  // Session streams: a ticket per room, role and group; each message only
  // reaches those allowed to see it (Phase 12).
  const tiketAliran = (o) => {
    const t = { v: 1, p: "aliran", r: "sesi-7", peran: "praktikan", g: 2, u: "x", exp: now() + 60, n: id(), ...o };
    const body = b64(JSON.stringify(t));
    return `${body}.${b64(createHmac("sha256", secret).update(body).digest())}`;
  };
  const masuk = (ruang, o) => buka(`/aliran/${ruang}?tiket=${encodeURIComponent(tiketAliran({ r: ruang, ...o }))}`);
  const kirimAliran = (ruang, m, o = {}) => {
    const body = JSON.stringify({ m });
    const ts = o.ts ?? now();
    const tanda = o.tanda ?? createHmac("sha256", secret).update(`aliran|${ruang}|${body}|${ts}`).digest("hex");
    return fetch(`${BASE}/aliran/${ruang}/kirim`, {
      method: "POST",
      headers: { "x-aliran-ts": String(ts), "x-aliran-tanda": tanda },
      body,
    });
  };
  const pesan = (s) =>
    s.msgs
      .map(teks)
      .filter((x) => x !== "pong")
      .map((x) => JSON.parse(x))
      .filter((x) => x.m)
      .flatMap((x) => x.m);

  const asisten = await masuk("sesi-7", { peran: "asisten", g: null });
  const g2 = await masuk("sesi-7", { g: 2 });
  const g2b = await masuk("sesi-7", { g: 2 });
  const g3 = await masuk("sesi-7", { g: 3 });
  cek("a room takes Asisten and Praktikan with their tickets", ![asisten, g2, g2b, g3].some((s) => s.refused));

  const salahRuang = await masuk("sesi-8", { r: "sesi-7" });
  cek("a ticket for another room is refused", salahRuang.refused === true);
  const basi = await masuk("sesi-7", { exp: now() - 1 });
  cek("an expired ticket is refused", basi.refused === true);
  const ulangT = tiketAliran({});
  const pertama = await buka(`/aliran/sesi-7?tiket=${encodeURIComponent(ulangT)}`);
  const kedua = await buka(`/aliran/sesi-7?tiket=${encodeURIComponent(ulangT)}`);
  cek("a ticket works once", !pertama.refused && kedua.refused === true);
  if (!pertama.refused) pertama.ws.close();
  const pcPraktikan = await masuk("pc", { peran: "praktikan", g: 2 });
  cek("the pc room refuses a Praktikan", pcPraktikan.refused === true);
  // The signature's first character changes: its last one carries only 4
  // bits, so A to D there decode alike and a forgery passed 1 run in 16.
  const asli = tiketAliran({});
  const di = asli.lastIndexOf(".") + 1;
  const ditempa = asli.slice(0, di) + (asli[di] === "A" ? "B" : "A") + asli.slice(di + 1);
  const palsu = await buka(`/aliran/sesi-7?tiket=${encodeURIComponent(ditempa)}`);
  cek("a forged ticket is refused", palsu.refused === true);

  r = await kirimAliran("sesi-7", [
    { j: "jawaban", g: 3, d: { soal: "m1-a-1", benar: true } },
    { j: "tel", g: 3, d: [{ seq: 1, tx: "10:00:00:000", rx: "10:00:00:050" }] },
    { j: "petunjuk", g: 2, d: {} },
  ]);
  await sampai(() => pesan(asisten).length >= 3 && pesan(g2).length >= 2 && pesan(g3).length >= 2);
  await tunggu(200);
  const jenis = (s) => pesan(s).map((x) => `${x.j}${x.g}`).sort().join(",");
  cek("the API's batch is signed and answered", r.ok, String(r.status));
  cek("an Asisten sees every group", jenis(asisten) === "jawaban3,petunjuk2,tel3", jenis(asisten));
  cek(
    "a Praktikan never gets another group's blank results or hints",
    jenis(g2) === "petunjuk2,tel3" && jenis(g3) === "jawaban3,tel3",
    `${jenis(g2)} | ${jenis(g3)}`,
  );
  r = await kirimAliran("sesi-7", [{ j: "tel", g: 1, d: [] }], { tanda: "0".repeat(64) });
  cek("a wrong signature is refused (room)", r.status === 403);
  r = await kirimAliran("sesi-7", [{ j: "rahasia", g: 1, d: {} }]);
  cek("an unknown kind is refused", r.status === 400);

  // Watching: group 2's laptops hear how many others look at their group.
  asisten.ws.send(JSON.stringify({ j: "lihat", g: 2 }));
  const penonton = (s) =>
    s.msgs.map(teks).filter((x) => x.includes('"penonton"')).map((x) => JSON.parse(x).penonton);
  await sampai(() => penonton(g2).at(-1) === 1);
  cek("a group's laptop hears that someone watches it", penonton(g2).at(-1) === 1, penonton(g2).join(","));
  const asistenLihat = g2.msgs.map(teks).filter((x) => x.includes('"asisten"')).map((x) => JSON.parse(x).asisten);
  cek("and that the watcher is an Asisten", asistenLihat.at(-1) === 1, asistenLihat.join(","));

  // A laptop sends its lines up; its group comes from the ticket.
  const n2b = pesan(g2b).length;
  const n3 = pesan(g3).length;
  const nA = pesan(asisten).length;
  g2.ws.send(
    JSON.stringify({ j: "serial", g: 3, d: [{ sumber: "b0", teks: "hello", t: 1000 }] }),
  );
  await sampai(() => pesan(asisten).length > nA && pesan(g2b).length > n2b);
  await tunggu(200);
  const naik = pesan(asisten).at(-1);
  cek(
    "a laptop's lines go to the Asisten and its groupmates, stamped with its own group",
    naik?.j === "serial" && naik.g === 2 && pesan(g2b).at(-1)?.g === 2,
    JSON.stringify(naik),
  );
  cek("other groups never get a group's serial lines", pesan(g3).length === n3);
  cek("the sender doesn't get its own lines back", !pesan(g2).some((x) => x.j === "serial"));
  const nA2 = pesan(asisten).length;
  g2.ws.send(JSON.stringify({ j: "serial", d: [{ sumber: "b0", teks: "x".repeat(20_000), t: 1 }] }));
  asisten.ws.send(JSON.stringify({ j: "serial", d: [{ sumber: "b0", teks: "from asisten", t: 1 }] }));
  g2.ws.send(JSON.stringify({ j: "jawaban", d: [{ soal: "m1-a-1", benar: true }] }));
  await tunggu(400);
  cek(
    "oversize, groupless and API-only kinds from a page are dropped",
    pesan(asisten).length === nA2 && pesan(g3).length === n3,
    `${pesan(asisten).length - nA2}`,
  );

  // One request for a write's topics and room messages (POST /kirim).
  const kirimGabung = (obj, o = {}) => {
    const body = JSON.stringify(obj);
    const ts = o.ts ?? now();
    const tanda = o.tanda ?? createHmac("sha256", secret).update(`kirim|${body}|${ts}`).digest("hex");
    return fetch(`${BASE}/kirim`, { method: "POST", headers: { "x-kirim-ts": String(ts), "x-kirim-tanda": tanda }, body });
  };
  const halaman = await buka("/siaran");
  const nAsisten = pesan(asisten).length;
  r = await kirimGabung({ t: ["jawaban"], r: { "sesi-7": [{ j: "jawaban", g: 3, d: { soal: "m1-a-2", benar: false } }], "sesi-9": [{ j: "petunjuk", g: 1, d: {} }] } });
  const dengar = r.ok ? await r.json() : {};
  await sampai(() => halaman.msgs.length >= 1 && pesan(asisten).length > nAsisten);
  cek(
    "one signed request carries the topics and the room messages",
    r.ok && teks(halaman.msgs[0]) === '{"t":["jawaban"]}' && pesan(asisten).at(-1)?.soal === undefined && pesan(asisten).at(-1)?.j === "jawaban",
    `${r.status} ${halaman.msgs.map(teks)}`,
  );
  cek("it answers how many sockets each room reached", dengar["sesi-7"] >= 1 && dengar["sesi-9"] === 0, JSON.stringify(dengar));
  r = await kirimGabung({ t: ["jawaban"] }, { tanda: "0".repeat(64) });
  cek("a wrong signature is refused (combined)", r.status === 403);
  r = await kirimGabung({ r: { "konsol-1": [{ j: "tel", g: 1, d: [] }] } });
  cek("a room name that isn't a session or pc is refused", r.status === 400);
  r = await kirimGabung({ r: { "sesi-7": [{ j: "kunci", g: 1, d: {} }] } });
  cek("an unknown kind is refused (combined)", r.status === 400);
  halaman.ws.close();
  for (const s of [asisten, g2, g2b, g3]) s.ws.close();

  // The LMS pass-through is gone (2026-10-21).
  r = await fetch(`${BASE}/lms`, { method: "POST", body: "x" });
  cek("the old /lms route answers 404", r.status === 404);
} finally {
  if (process.env.DEBUG_RELAY) {
    const q = await fetch(`${BASE}/cdn-cgi/local/explorer/api/local/observability/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT level, substr(message,1,300) FROM logs WHERE message NOT LIKE '%tiket=%' OR level != 'info' LIMIT 80" }),
    }).catch(() => null);
    console.log(q ? await q.text() : "no log api");
  }
  hentiDev();
}
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
