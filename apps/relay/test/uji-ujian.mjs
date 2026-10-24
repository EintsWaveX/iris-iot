// The exam's relay rooms (EXAM-ENGINE 6): starts `wrangler dev` (local
// workerd, no Cloudflare login needed) and walks one room through an evening.
// Tickets are signed here with node:crypto, independently of
// src/lib/tanda.ts, so the format is checked from both sides.
//
//   node test/uji-ujian.mjs      (reads KONSOL_RELAY_SECRET from .dev.vars;
//                                 UJI_PORT picks another port than 8788)
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.UJI_PORT ?? 8788);
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}`;
const secret = /KONSOL_RELAY_SECRET=(.+)/
  .exec(readFileSync(".dev.vars", "utf8"))?.[1]
  ?.trim();
if (!secret) throw new Error("KONSOL_RELAY_SECRET missing in .dev.vars");

let lulus = 0;
let gagal = 0;
function cek(nama, ok, info = "") {
  if (ok) lulus++;
  else gagal++;
  console.log(
    `${ok ? "ok  " : "GAGAL"} ${nama}${ok || !info ? "" : `: ${info}`}`,
  );
}

const b64 = (b) => Buffer.from(b).toString("base64url");
const id = () => b64(randomBytes(24));
const now = () => Math.floor(Date.now() / 1000);
const hmac = (data) => createHmac("sha256", secret).update(data).digest("hex");

const RUANG = "rec-41";
function tiket(o = {}) {
  const t = {
    v: 1,
    p: "ujian",
    r: RUANG,
    peran: "kursi",
    s: 3,
    u: "1101200003",
    exp: now() + 60,
    n: id(),
    ...o,
  };
  const body = b64(JSON.stringify(t));
  return `${body}.${b64(createHmac("sha256", secret).update(body).digest())}`;
}

/** Opens a socket; resolves {ws, msgs, closed} once open, or {refused}. */
function buka(path) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS}${path}`);
    const msgs = [];
    const s = { ws, msgs, closed: null };
    ws.onmessage = (e) => msgs.push(e.data);
    ws.onclose = (e) => {
      s.closed = e.code;
      resolve({ refused: true, code: e.code });
    };
    ws.onopen = () => resolve(s);
    setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        resolve({ refused: true, code: "timeout" });
      }
    }, 10_000);
  });
}
const masuk = (o = {}, ruang = RUANG) =>
  buka(
    `/ujian/${ruang}?tiket=${encodeURIComponent(tiket({ r: ruang, ...o }))}`,
  );
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
const pesan = (s) =>
  s.msgs
    .map(teks)
    .filter((x) => x !== "pong")
    .map((x) => JSON.parse(x))
    .filter((x) => x.m)
    .flatMap((x) => x.m);
const jenis = (s, j) => pesan(s).filter((x) => x.j === j);

const kirim = (ruang, m, o = {}) => {
  const body = JSON.stringify({ m });
  const ts = o.ts ?? now();
  const tanda = o.tanda ?? hmac(`ujian|kirim|${ruang}|${body}|${ts}`);
  return fetch(`${BASE}/ujian/${ruang}/kirim`, {
    method: "POST",
    headers: { "x-ujian-ts": String(ts), "x-ujian-tanda": tanda },
    body,
  });
};
const tutup = (ruang, o = {}) => {
  const ts = o.ts ?? now();
  const tanda = o.tanda ?? hmac(`ujian|tutup|${ruang}||${ts}`);
  return fetch(`${BASE}/ujian/${ruang}/tutup`, {
    method: "POST",
    headers: { "x-ujian-ts": String(ts), "x-ujian-tanda": tanda },
    body: "",
  });
};

const dev = spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "--port",
    String(PORT),
    "--ip",
    "127.0.0.1",
    "--var",
    "UJI_SUNYI_MS:4000",
  ],
  {
    shell: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "";
dev.stdout.on("data", (d) => (log += d));
dev.stderr.on("data", (d) => (log += d));

function hentiDev() {
  if (process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(dev.pid), "/t", "/f"]);
  else {
    try {
      process.kill(-dev.pid, "SIGTERM");
    } catch {
      dev.kill();
    }
  }
}

setTimeout(() => {
  console.log(
    `GAGAL the suite stalled after ${lulus} checks. wrangler said:\n${log.slice(-4000)}`,
  );
  hentiDev();
  process.exit(1);
}, 180_000).unref();

try {
  const siap = await sampai(() => /Ready on/.test(log), 60_000);
  if (!siap) throw new Error(`wrangler dev did not start:\n${log}`);

  // ---- Tickets ----
  const asli = tiket();
  const di = asli.lastIndexOf(".") + 1;
  const ditempa =
    asli.slice(0, di) + (asli[di] === "A" ? "B" : "A") + asli.slice(di + 1);
  cek(
    "a forged ticket is refused",
    (await buka(`/ujian/${RUANG}?tiket=${encodeURIComponent(ditempa)}`))
      .refused === true,
  );
  cek(
    "a ticket for another room is refused",
    (await masuk({ r: "rec-42" }, RUANG)).refused === true,
  );
  cek(
    "an expired ticket is refused",
    (await masuk({ exp: now() - 1 })).refused === true,
  );
  cek(
    "a seat ticket without a seat is refused",
    (await masuk({ s: null })).refused === true,
  );
  cek(
    "a Panitia ticket with a seat is refused",
    (await masuk({ peran: "panitia", s: 3 })).refused === true,
  );
  cek(
    "a Konsol or session ticket is refused",
    (await masuk({ p: "aliran" })).refused === true,
  );
  const sekali = tiket();
  const pertama = await buka(
    `/ujian/${RUANG}?tiket=${encodeURIComponent(sekali)}`,
  );
  const kedua = await buka(
    `/ujian/${RUANG}?tiket=${encodeURIComponent(sekali)}`,
  );
  cek("a ticket works once", !pertama.refused && kedua.refused === true);
  if (!pertama.refused) pertama.ws.close();
  const strange = await buka(
    `/ujian/rec-0?tiket=${encodeURIComponent(tiket({ r: "rec-0" }))}`,
  );
  cek("a strange room name is refused", strange.refused === true);

  // ---- Fan-out ----
  const panitia = await masuk({ peran: "panitia", s: null, u: "AAA" });
  const k3 = await masuk({ s: 3 });
  const k4 = await masuk({ s: 4, u: "1101200004" });
  cek(
    "a room takes the Panitia and seats with their tickets",
    ![panitia, k3, k4].some((s) => s.refused),
  );

  const r = await kirim(RUANG, [
    { j: "ruang", d: { seq: 1, stage: "prep" } },
    { j: "kursi", s: 3, d: { seq: 1, extraMs: 60000 } },
    { j: "kompilasi", s: 4, d: { status: "antre" } },
    { j: "pelanggaran", s: 3, d: { id: "x" } },
    { j: "catatan", d: { candidateId: 9 } },
    { j: "master", d: { master: "AAA" } },
    { j: "antrean", d: { order: [3, 4] } },
  ]);
  await sampai(
    () =>
      pesan(panitia).filter((x) => x.j !== "hadir").length >= 7 &&
      pesan(k3).length >= 3 &&
      pesan(k4).length >= 3,
  );
  await tunggu(200);
  const urut = (s) =>
    pesan(s)
      .filter((x) => x.j !== "hadir")
      .map((x) => `${x.j}${x.s ?? ""}`)
      .sort()
      .join(",");
  cek(
    "the API's batch is signed and answered",
    r.ok && Number(await r.text()) === 3,
    String(r.status),
  );
  cek(
    "the Panitia hear everything",
    urut(panitia) ===
      "antrean,catatan,kompilasi4,kursi3,master,pelanggaran3,ruang",
    urut(panitia),
  );
  cek(
    "a seat hears the room, the queue and its own",
    urut(k3) === "antrean,kursi3,ruang",
    urut(k3),
  );
  cek(
    "another seat never hears them",
    urut(k4) === "antrean,kompilasi4,ruang",
    urut(k4),
  );

  cek(
    "a wrong signature is refused",
    (await kirim(RUANG, [{ j: "ruang", d: {} }], { tanda: "0".repeat(64) }))
      .status === 403,
  );
  cek(
    "an old timestamp is refused",
    (await kirim(RUANG, [{ j: "ruang", d: {} }], { ts: now() - 600 }))
      .status === 403,
  );
  cek(
    "an unknown kind is refused",
    (await kirim(RUANG, [{ j: "rahasia", d: {} }])).status === 400,
  );
  cek(
    "progress from the API is refused",
    (await kirim(RUANG, [{ j: "kemajuan", s: 3, d: {} }])).status === 400,
  );
  cek(
    "a seat number below 1 is refused",
    (await kirim(RUANG, [{ j: "kursi", s: 0, d: {} }])).status === 400,
  );

  // ---- A seat's progress, up ----
  const nP = pesan(panitia).length;
  const n4 = pesan(k4).length;
  const n3 = pesan(k3).length;
  k3.ws.send(
    JSON.stringify({
      j: "kemajuan",
      s: 99,
      d: { part: "logika", answered: 4, total: 15 },
    }),
  );
  await sampai(() => pesan(panitia).length > nP);
  await tunggu(200);
  const naik = jenis(panitia, "kemajuan").at(-1);
  cek(
    "progress reaches the Panitia stamped with the seat from the ticket",
    naik?.s === 3 && naik.d.answered === 4,
    JSON.stringify(naik),
  );
  cek("other seats never hear it", pesan(k4).length === n4);
  cek("the sender doesn't hear itself", pesan(k3).length === n3);
  k3.ws.send(
    JSON.stringify({
      j: "kemajuan",
      d: { part: "logika", answered: 5, total: 15 },
    }),
  );
  await tunggu(300);
  cek(
    "a second frame within 1.5 s is dropped",
    jenis(panitia, "kemajuan").length === 1,
  );
  await tunggu(1500);
  const nK = jenis(panitia, "kemajuan").length;
  k3.ws.send(
    JSON.stringify({
      j: "kemajuan",
      d: { part: "logika", answered: 99, total: 15 },
    }),
  );
  k3.ws.send(
    JSON.stringify({
      j: "kemajuan",
      d: { part: "logika", answered: 1, total: 15, bonus: "x".repeat(2000) },
    }),
  );
  k3.ws.send(JSON.stringify({ j: "ruang", d: { seq: 99 } }));
  panitia.ws.send(
    JSON.stringify({
      j: "kemajuan",
      d: { part: "logika", answered: 1, total: 2 },
    }),
  );
  await tunggu(400);
  cek(
    "implausible, oversize, down-only and Panitia frames are dropped",
    jenis(panitia, "kemajuan").length === nK && jenis(k4, "ruang").length === 1,
    `${jenis(panitia, "kemajuan").length - nK}`,
  );

  // ---- Who is connected ----
  const hadir = () => jenis(panitia, "hadir").at(-1)?.d;
  await sampai(() => hadir()?.kursi?.length === 2, 3000);
  cek(
    "the Panitia hear who is connected",
    JSON.stringify(hadir()) ===
      JSON.stringify({ kursi: [3, 4], panitia: ["AAA"] }),
    JSON.stringify(hadir()),
  );
  cek("a seat is never told", jenis(k3, "hadir").length === 0);
  k4.ws.close();
  await sampai(() => hadir()?.kursi?.length === 1, 4000);
  cek(
    "a seat that leaves drops out within seconds",
    JSON.stringify(hadir()?.kursi) === "[3]",
    JSON.stringify(hadir()),
  );
  const baru = await masuk({ peran: "panitia", s: null, u: "BBB" });
  await sampai(() => jenis(baru, "hadir").length >= 1, 1500);
  cek(
    "a Panitia who joins gets the list at once",
    jenis(baru, "hadir")[0]?.d.panitia?.join(",") === "AAA,BBB",
    JSON.stringify(jenis(baru, "hadir")[0]),
  );
  baru.ws.close();

  // ---- ping ----
  k3.ws.send("ping");
  cek(
    "ping is answered",
    await sampai(() => k3.msgs.map(teks).includes("pong")),
  );

  // ---- A silent socket ----
  // The room closes a socket that neither pinged nor sent for UJI_SUNYI_MS
  // (4 s here, 75 s in production); one that pings stays. The Panitia's
  // socket and seat 3 ping too, to see who is left in the list.
  const hidup = await masuk({ s: 5, u: "1101200005" });
  const bisu = await masuk({ s: 6, u: "1101200006" });
  const detak = setInterval(() => {
    for (const x of [hidup, panitia, k3])
      if (x.ws.readyState === 1) x.ws.send("ping");
  }, 1000);
  await sampai(
    () => hadir()?.kursi?.includes(6) && hadir()?.kursi?.includes(5),
    3000,
  );
  cek(
    "both seats are listed while they are fresh",
    hadir()?.kursi?.includes(6) === true,
    JSON.stringify(hadir()),
  );
  await sampai(() => hadir()?.kursi?.includes(6) === false, 12_000);
  cek(
    "a silent seat drops out of the list",
    hadir()?.kursi?.includes(6) === false,
    JSON.stringify(hadir()),
  );
  cek(
    "its socket was closed on the room's side",
    bisu.closed === 4001 || bisu.ws.readyState >= 2,
    String(bisu.ws.readyState),
  );
  cek(
    "a seat that pings stays listed and open",
    hadir()?.kursi?.includes(5) === true && hidup.ws.readyState === 1,
  );
  hidup.ws.close();

  // ---- One request for topics and room messages ----
  const gabung = (obj, o = {}) => {
    const body = JSON.stringify(obj);
    const ts = o.ts ?? now();
    const tanda = o.tanda ?? hmac(`kirim|${body}|${ts}`);
    return fetch(`${BASE}/kirim`, {
      method: "POST",
      headers: { "x-kirim-ts": String(ts), "x-kirim-tanda": tanda },
      body,
    });
  };
  const n3b = pesan(k3).length;
  let g = await gabung({
    t: ["recroom"],
    r: {
      [RUANG]: [{ j: "ruang", d: { seq: 2 } }],
      "rec-99": [{ j: "ruang", d: {} }],
    },
  });
  const jawab = await g.json();
  await sampai(() => pesan(k3).length > n3b);
  cek(
    "the combined send reaches an exam room",
    g.ok && pesan(k3).at(-1)?.d?.seq === 2,
    JSON.stringify(jawab),
  );
  cek(
    "and says how many heard it, empty rooms 0",
    jawab[RUANG] === 2 && jawab["rec-99"] === 0,
    JSON.stringify(jawab),
  );
  g = await gabung({ r: { [RUANG]: [{ j: "kemajuan", d: {} }] } });
  cek("the combined send refuses a kind only seats send", g.status === 400);

  // ---- Finish ----
  cek(
    "a wrong signature does not close the room",
    (await tutup(RUANG, { tanda: "0".repeat(64) })).status === 403,
  );
  clearInterval(detak);
  const t = await tutup(RUANG);
  await sampai(() => panitia.closed !== null && k3.closed !== null);
  cek(
    "Finish closes every socket with 4000",
    t.ok && panitia.closed === 4000 && k3.closed === 4000,
    `${panitia.closed} ${k3.closed}`,
  );
} catch (e) {
  gagal++;
  console.log(`GAGAL ${e.stack ?? e}\nwrangler said:\n${log.slice(-2000)}`);
} finally {
  console.log(`\n${lulus} ok, ${gagal} gagal`);
  hentiDev();
  process.exit(gagal ? 1 : 0);
}
