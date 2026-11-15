#!/usr/bin/env node
// Drill for the supervisor and its workers (real-time upgrade, phase 3), on this machine, with no database:
// starts the REAL supervisor with 3 REAL workers on a spare port and checks that
//   - sockets spread over the workers and every one hears one numbered stream (replay works across workers),
//   - exam and session rooms behave as one (presence, a ticket works once, who hears what, a close after Finish),
//   - a rolling restart under constant requests fails none, hands the leader over and keeps the epoch,
//   - a killed worker (the leader too) is replaced and one leader remains.
//
//   cd apps/web && NODE_CLUSTER_SCHED_POLICY=rr node --import tsx scripts/uji-klaster.mjs
//
// (`NODE_CLUSTER_SCHED_POLICY=rr` only matters on Windows, which does not spread connections by itself; Linux does.)
// It uses a throwaway site folder and random secrets, listens on 127.0.0.1:18787 only, and touches nothing else.
import { randomBytes } from "node:crypto";
import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { WebSocket } from "ws";

const akar = process.cwd();
const dist = mkdtempSync(join(tmpdir(), "iris-dist-"));
writeFileSync(join(dist, "index.html"), "<!doctype html><title>drill</title>");
const token = randomBytes(16).toString("hex");
const rahasia = randomBytes(24).toString("hex");
const PORT = Number(process.env.UJI_PORT ?? 18787);
Object.assign(process.env, {
  PORT: String(PORT),
  HOST: "127.0.0.1",
  IRIS_DIST: dist,
  IRIS_METRIK_TOKEN: token,
  KONSOL_RELAY_SECRET: rahasia,
  IRIS_JAM_LAB: "0",
  IRIS_PANTAU_QR: "0",
  NODE_ENV: "development",
});

const muat = (p) => import(pathToFileURL(join(akar, p)).href);
const { jalankanSupervisor } = await muat("server/klaster/jalankan.ts");
const { tandaTiketUjian } = await muat("src/lib/recruitment/room-relay.ts");
const { tandaTiketAliran } = await muat("src/lib/aliran.ts");

let gagalSemua = 0;
const ok = (b, t) => {
  console.log(`${b ? "PASS" : "FAIL"}  ${t}`);
  if (!b) gagalSemua++;
};
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const acak = () => randomBytes(12).toString("hex");
const exp = () => Math.floor(Date.now() / 1000) + 60;

function ambil(path, opsi = {}) {
  return new Promise((selesai, tolak) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: PORT,
        path,
        method: opsi.method ?? "GET",
        headers: opsi.headers,
        agent: false,
      },
      (res) => {
        const b = [];
        res.on("data", (d) => b.push(d));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(Buffer.concat(b).toString());
          } catch {
            /* not JSON */
          }
          selesai({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("error", tolak);
    req.setTimeout(5000, () => req.destroy(new Error("timeout")));
    req.end(opsi.body);
  });
}
const siarkan = (t) =>
  ambil("/api/sehat?siarkan=1", {
    method: "POST",
    headers: { "x-metrik": token, "content-type": "application/json" },
    body: JSON.stringify({ t }),
  });

function statusKuis() {
  return new Promise((selesai) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/kuis/ws`, {
      headers: { Origin: "http://games.localhost", Host: "games.localhost" },
    });
    ws.on("unexpected-response", (_q, res) => selesai(res.statusCode ?? 0));
    ws.on("open", () => {
      ws.close();
      selesai(101);
    });
    ws.on("error", () => selesai(-1));
  });
}

const s = jalankanSupervisor({
  akar,
  berkasUtama: join(akar, "server/main.ts"),
  jumlah: 3,
  log: (t) => console.log(`   [supervisor] ${t}`),
});

async function tungguPekerja(n, gen) {
  for (let i = 0; i < 200; i++) {
    try {
      const r = await ambil("/api/sehat?klaster=1");
      const p = r.json?.pekerja ?? [];
      if (p.length === n && (gen === undefined || p.every((x) => x.gen === gen))) return p;
    } catch {
      /* not up yet */
    }
    await tidur(300);
  }
  return null;
}

function bukaSiaran(query = "") {
  return new Promise((selesai, tolak) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/siaran${query}`, {
      headers: { Origin: `http://127.0.0.1:${PORT}` },
    });
    const so = { ws, frames: [], closed: null };
    ws.on("message", (d) => {
      const t = d.toString();
      if (t !== "pong") so.frames.push(JSON.parse(t));
    });
    ws.on("close", (c) => (so.closed = c));
    ws.on("open", () => selesai(so));
    ws.on("error", tolak);
  });
}
function bukaRuang(jalur, tiket) {
  return new Promise((selesai) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}${jalur}?tiket=${encodeURIComponent(tiket)}`, {
      headers: { Origin: `http://127.0.0.1:${PORT}` },
    });
    const so = { ws, frames: [], closed: null, status: undefined };
    ws.on("message", (d) => {
      const t = d.toString();
      if (t !== "pong") so.frames.push(JSON.parse(t));
    });
    ws.on("close", (c) => (so.closed = c));
    ws.on("open", () => selesai(so));
    ws.on("unexpected-response", (_q, res) => {
      so.status = res.statusCode;
      selesai(so);
    });
    ws.on("error", () => {});
  });
}
const tiketUjian = (peran, sid, u, room = "rec-9") =>
  tandaTiketUjian({ v: 1, p: "ujian", r: room, peran, s: sid, u, exp: exp(), n: acak() }, rahasia);
const tiketAliran = (peran, g, u, room = "sesi-5") =>
  tandaTiketAliran({ v: 1, p: "aliran", r: room, peran, g, u, exp: exp(), n: acak() }, rahasia);
const pesanRuang = (so) => so.frames.flatMap((f) => f.m ?? []);

try {
  const p0 = await tungguPekerja(3);
  ok(!!p0, "3 workers answer /api/sehat?klaster=1");
  ok(!!p0 && p0.filter((x) => x.pemimpin).length === 1, "exactly one leader");

  // ---- the live stream ----
  const soket = [];
  for (let i = 0; i < 40; i++) soket.push(await bukaSiaran());
  await tidur(300);
  const per = (await ambil("/api/sehat?klaster=1")).json.pekerja.map((x) => x.soket.siaran);
  console.log("   sockets per worker:", per.join(","));
  ok(per.reduce((a, b) => a + b, 0) === 40, "the 40 sockets are counted over the workers");
  ok(per.filter((x) => x > 0).length >= 2, "they are spread over at least 2 workers");
  const salam = soket[0].frames[0];
  ok(
    soket.every((x) => x.frames[0]?.e === salam.e),
    "every worker greets with the same epoch",
  );
  ok((await siarkan(["sesi"])).status === 200, "a publish is accepted");
  await tidur(300);
  const dengar = soket.map((x) => x.frames.find((f) => f.t));
  ok(
    dengar.every((f) => f?.t?.[0] === "sesi"),
    "all 40 sockets heard it",
  );
  ok(new Set(dengar.map((f) => f.n)).size === 1, "under the same number");
  const n1 = dengar[0].n;
  const pergi = soket.pop();
  pergi.ws.close();
  await tidur(100);
  await siarkan(["jadwal"]);
  await siarkan(["nilai"]);
  const kembali = await bukaSiaran(`?sejak=${n1}&e=${salam.e}`);
  await tidur(200);
  const g = kembali.frames[0];
  ok(
    !g.semua && g.t?.length === 2 && g.t.includes("jadwal") && g.t.includes("nilai"),
    `a returning page is replayed what it missed ${JSON.stringify(g.t)}`,
  );
  soket.push(kembali);

  // ---- the quiz socket: whichever worker the connection reaches, it ends up at the leader ----
  const kuis = await Promise.all(Array.from({ length: 12 }, () => statusKuis()));
  ok(
    kuis.every((k) => k === 401 || k === 403),
    `12 quiz sockets all reach the quiz on the leader (no cookie: ${[...new Set(kuis)].join(",")})`,
  );

  // ---- the rooms ----
  const panitia = await bukaRuang("/ujian/rec-9", await tiketUjian("panitia", null, "P1"));
  const kursi = [];
  for (let i = 1; i <= 6; i++)
    kursi.push(await bukaRuang("/ujian/rec-9", await tiketUjian("kursi", i, `K${i}`)));
  await tidur(1600);
  const hadir = pesanRuang(panitia)
    .filter((m) => m.j === "hadir")
    .at(-1);
  ok(
    JSON.stringify(hadir?.d?.kursi) === "[1,2,3,4,5,6]",
    `Panitia sees all 6 seats across workers ${JSON.stringify(hadir?.d?.kursi)}`,
  );
  const perRuang = (await ambil("/api/sehat?klaster=1")).json.pekerja.map((x) => x.soket.ruang);
  console.log("   room sockets per worker:", perRuang.join(","));
  ok(perRuang.filter((x) => x > 0).length >= 2, "the room's sockets are on several workers");
  const tp = await tiketUjian("kursi", 7, "K7");
  const a = await bukaRuang("/ujian/rec-9", tp);
  const lagi = await Promise.all([
    bukaRuang("/ujian/rec-9", tp),
    bukaRuang("/ujian/rec-9", tp),
    bukaRuang("/ujian/rec-9", tp),
  ]);
  ok(
    a.status === undefined && lagi.every((x) => x.status === 403),
    "a ticket works once on the whole site",
  );
  a.ws.close();
  for (const k of kursi) k.frames.length = 0;
  panitia.frames.length = 0;
  kursi[2].ws.send(
    JSON.stringify({ j: "kemajuan", d: { part: "livecode", answered: 2, total: 5 } }),
  );
  await tidur(500);
  ok(
    pesanRuang(panitia).find((m) => m.j === "kemajuan")?.s === 3,
    "a seat's progress reaches the Panitia",
  );
  ok(
    kursi.every((k) => !pesanRuang(k).some((m) => m.j === "kemajuan")),
    "and no other seat",
  );
  kursi[5].ws.close();
  await tidur(1600);
  ok(
    JSON.stringify(
      pesanRuang(panitia)
        .filter((m) => m.j === "hadir")
        .at(-1)?.d?.kursi,
    ) === "[1,2,3,4,5]",
    "a seat that left disappears from presence",
  );
  const prak = await bukaRuang("/aliran/sesi-5", await tiketAliran("praktikan", 1, "M1"));
  const asisten = await bukaRuang("/aliran/sesi-5", await tiketAliran("asisten", null, "A1"));
  await tidur(300);
  asisten.ws.send(JSON.stringify({ j: "lihat", g: 1 }));
  await tidur(500);
  ok(
    prak.frames.some((f) => f.penonton === 1 && f.asisten === 1),
    "a Praktikan is told an Asisten (on another worker) looks at the group",
  );
  asisten.ws.close();
  await tidur(400);
  ok(
    prak.frames.some((f) => f.penonton === 0),
    "and told when they stop",
  );

  // ---- a rolling restart under load ----
  let gagal = 0;
  let sukses = 0;
  let jalan = true;
  const beban = (async () => {
    while (jalan) {
      try {
        const r = await ambil("/api/sehat");
        if (r.status === 200) sukses++;
        else gagal++;
      } catch {
        gagal++;
      }
      await tidur(15);
    }
  })();
  const t0 = Date.now();
  const hasil = await s.pengawas.gulir();
  const lama = Date.now() - t0;
  await tidur(500);
  jalan = false;
  await beban;
  console.log(`   the roll took ${lama} ms; requests ok=${sukses} failed=${gagal}`);
  ok(hasil === true, "the rolling restart finished");
  ok(gagal === 0 && sukses > 20, "no request failed during it");
  const p2 = await tungguPekerja(3, 2);
  ok(!!p2, "all 3 workers run generation 2");
  ok(!!p2 && p2.filter((x) => x.pemimpin).length === 1, "one leader, on the new code");
  await tidur(300);
  ok(
    soket.every((x) => x.closed === 1001),
    "sockets of replaced workers were closed with 1001 (pages reconnect)",
  );
  const sesudah = await bukaSiaran(`?sejak=${soket[0].frames.at(-1).n}&e=${salam.e}`);
  await tidur(200);
  ok(
    sesudah.frames[0].e === salam.e && !sesudah.frames[0].semua,
    "after the roll the epoch is unchanged, so a page replays instead of refetching all",
  );
  ok(
    panitia.closed === 1001 && kursi.slice(0, 5).every((k) => k.closed === 1001),
    "room sockets were closed with 1001 too",
  );

  // ---- killed workers, the leader included ----
  const pemimpin = p2.find((x) => x.pemimpin);
  process.kill(pemimpin.pid, "SIGKILL");
  const p3 = await tungguPekerja(3);
  ok(!!p3 && !p3.some((x) => x.pid === pemimpin.pid), "a killed leader is replaced");
  ok(!!p3 && p3.filter((x) => x.pemimpin).length === 1, "and exactly one leader remains");
  const m = await ambil("/api/sehat?metrik=1", { headers: { "x-metrik": token } });
  ok(
    m.status === 200 && m.json.pekerja >= 2 && Array.isArray(m.json.rute),
    `route numbers add up over ${m.json?.pekerja} workers`,
  );
} finally {
  await s.berhenti();
}
console.log(gagalSemua ? `\n${gagalSemua} check(s) FAILED` : "\nall checks passed");
process.exit(gagalSemua ? 1 : 0);
