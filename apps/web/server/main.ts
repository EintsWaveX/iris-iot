/**
 * Starts IRIS: `npm run server` (see deploy/DEPLOY.md). In production this file is a WORKER: server/supervisor.ts
 * starts several of them, and `node --import tsx server/main.ts` on its own is one process doing everything
 * (a laptop, the tests' rig, IRIS_PEKERJA=0).
 *
 *   PORT              default 8787
 *   HOST              default 127.0.0.1 (leave it; the tunnel is the way in)
 *   IRIS_DIST         the built site, default apps/web/dist
 *   IRIS_BUILD_SHA    the commit this build is (the deploy script sets it)
 *   IRIS_PERCAYA_CF   "1" behind a Cloudflare Tunnel, so the client IP is cf-connecting-ip
 *   DATABASE_URL and the rest of the API's own env, as on Vercel.
 *
 * A worker answers requests and holds sockets. What must exist once (the lab clock, the quiz game, the QR
 * sheet watch) runs on the LEADER, which the supervisor picks; the other workers pass what concerns it along.
 * Live-update messages, room messages, who is in a room, and tickets used once go through the supervisor
 * (server/klaster), so any worker may take any visitor.
 *
 * SIGTERM (systemd stop) or the supervisor's "henti" stops taking connections, lets requests and background
 * jobs finish for up to 60 seconds, then exits.
 */
import cluster from "node:cluster";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { bacaBerkas, cekBerkas } from "../api/_lib/berkas.js";
import { pasangBersama, terimaBersama } from "../api/_lib/bersama.js";
import { jumlahLatar, tungguLatar } from "../api/_lib/tunggu.js";
import { batalkanCacheLokal, pasangSebarBatal } from "../src/lib/cache-tunggal.js";
import { cacheSesiBerjalan } from "../src/lib/sesi.js";
import { getDb, statusKolam } from "../src/lib/db.js";
import { buatApp } from "./app.js";
import { pantauJeda } from "./jeda.js";
import { pasangPenyiar, pasangPenyiarRuang } from "../api/_lib/penyiar.js";
import { jamLabBilaPerlu } from "../api/_lib/jam-lab.js";
import { pantauScan } from "../api/_lib/recruitment-attendance.js";
import { buatHubRuang } from "./hub/ruang.js";
import { buatHubSiaran } from "./hub/siaran.js";
import { mulaiJamLab } from "./jam.js";
import { JALUR_WS, pasangKuis, type PasangKuis } from "./kuis.js";
import { hostKuis } from "./kuis-host.js";
import { buatBusPekerja } from "./klaster/pekerja.js";
import type { DariUtama, StatPekerja } from "./klaster/protokol.js";
import { dariSaudara, teruskanUpgrade } from "./klaster/teruskan.js";
import { daftarkanSoket, jedaLoop, jumlahSoket, mentah, ulang } from "./metrik.js";
import { buatPengarah, tolakUpgrade, type Penangan, type Pengarah } from "./upgrade.js";
import { konteksKuisDb } from "./kuis-db.js";

const akar = fileURLToPath(new URL("..", import.meta.url));
const dist = process.env.IRIS_DIST ?? join(akar, "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error(`[server] ${dist} has no index.html: run \`npm run build\` first.`);
  process.exit(1);
}
const config = JSON.parse(readFileSync(join(akar, "vercel.json"), "utf8"));

// Several workers (server/supervisor.ts) or one plain process.
const klaster =
  cluster.isWorker && process.env.IRIS_KLASTER === "1" && typeof process.send === "function";
const bus = klaster
  ? buatBusPekerja({
      kirim: (m) => {
        try {
          process.send?.(m);
        } catch {
          /* the supervisor is gone: "disconnect" drains this worker */
        }
      },
    })
  : null;
if (bus) {
  process.on("message", (m: unknown) => {
    if (m && typeof m === "object" && typeof (m as { i?: unknown }).i === "string")
      bus.terima(m as DariUtama);
  });
}
const rahasiaDalam = process.env.IRIS_KLASTER_RAHASIA ?? "";
const mulaiWaktu = Date.now();
let idSaya = 0;
let genSaya = Number(process.env.IRIS_KLASTER_GEN ?? 1);

// The running session is asked for by nearly every request: one query a second at most, dropped after any write.
cacheSesiBerjalan.atur(Number(process.env.IRIS_SESI_CACHE_MS ?? 1000));

const { server, rute } = await buatApp({
  akar,
  dist,
  config,
  sha: process.env.IRIS_BUILD_SHA,
  periksaDb: async () => {
    await getDb().execute(sql`select 1`);
  },
  bacaBerkas,
  cekBerkas,
  siarkan: (t) => hub.publish(t),
  kumpulkan: bus ? (apa) => bus.tanyaSemua(apa) : undefined,
});

// One dispatcher for every WebSocket upgrade; each socket feature registers its own path.
const pengarah = buatPengarah(server);

// The live-update hub: every open page listens here (/siaran) and the API announces topics to it directly.
// With several workers the supervisor numbers the topics and every worker applies them in that order.
const hub = buatHubSiaran({
  soketMaks:
    Number(process.env.IRIS_SIARAN_SOKET_MAKS) > 0
      ? Number(process.env.IRIS_SIARAN_SOKET_MAKS)
      : 5000,
  urutan: bus ? (t) => bus.siarkan(t) : undefined,
});
pengarah.daftar((jalur) => jalur === "/siaran", hub.naik);
pasangPenyiar(hub.publish);
daftarkanSoket("siaran", hub.jumlah);

// The session and exam rooms (/aliran/*, /ujian/*): what the Cloudflare relay's rooms did, in this process.
const ruang = buatHubRuang({
  rahasia: () => process.env.KONSOL_RELAY_SECRET?.trim() || null,
  soketMaks:
    Number(process.env.IRIS_RUANG_SOKET_MAKS) > 0
      ? Number(process.env.IRIS_RUANG_SOKET_MAKS)
      : 5000,
  sebar: bus
    ? {
        kirim: (r, m) => bus.kirimRuang(r, m),
        tutup: (r) => bus.tutupRuang(r),
        hadir: (r, id, info) => bus.hadir(r, id, info),
        pakaiNonce: (n, exp) =>
          bus.sekali(`ruang:${n}`, Math.max(1000, exp * 1000 - Date.now()) + 60_000),
      }
    : undefined,
});
pengarah.daftar((jalur) => /^\/(aliran|ujian)\/[^/]+$/.test(jalur), ruang.naik);
pasangPenyiarRuang({ kirim: ruang.kirim, tutup: ruang.tutup });
daftarkanSoket("ruang", ruang.jumlah);

// ---------- the leader's duties ----------
// The quiz game (its state is in memory), the lab clock and the QR sheet watch exist once. A lone process
// does them all; with workers the supervisor says "pimpin" to one of them and "lepas" when it moves.

let kuis: PasangKuis | null = null;
let kuisNaik: Penangan | null = null;
let hentiJam: () => void = () => {};

function mulaiPimpinan(): void {
  if (kuis) return;
  pantauScan.aktif = process.env.IRIS_PANTAU_QR !== "0";
  // The quiz hands its socket handler over instead of listening; the entries below decide who may use it.
  const penangkap: Pengarah = {
    daftar: (_cocok, tangani) => {
      kuisNaik = tangani;
    },
  };
  kuis = pasangKuis(server, konteksKuisDb(), { pengarah: penangkap });
  // The lab clock: sessions start and end on time with no page open. IRIS_JAM_LAB=0 leaves it to the Worker's cron.
  hentiJam =
    process.env.IRIS_JAM_LAB === "0"
      ? () => {}
      : mulaiJamLab({ jalankan: () => jamLabBilaPerlu(getDb()) });
  if (bus) console.warn(`[server] worker ${idSaya} leads`);
}

async function hentiPimpinan(): Promise<void> {
  pantauScan.aktif = false;
  pantauScan.hentikan();
  hentiJam();
  hentiJam = () => {};
  const k = kuis;
  kuis = null;
  kuisNaik = null;
  // The quiz rooms save once more, so a restart or a hand-over pauses a game instead of ending it.
  await k?.tutup().catch((err) => console.error("[server] the quiz rooms were not saved:", err));
}

// The Module 4 quiz game's socket (games.irisiotlab.com, /kuis/ws): played on the leader, passed there from
// the other workers.
pengarah.daftar(
  (jalur, host) => jalur === JALUR_WS && hostKuis(host),
  (req, socket, head) => {
    if (kuisNaik) return kuisNaik(req, socket, head);
    const p = bus?.pemimpin();
    if (!bus || !p || p.id === idSaya) return tolakUpgrade(socket, 503, "Service Unavailable");
    teruskanUpgrade(p.port, rahasiaDalam, req, socket, head);
  },
);

/** This worker's own door on 127.0.0.1: siblings pass the leader's sockets in through it. */
let dalam: http.Server | null = null;
let portDalam = 0;
if (bus) {
  dalam = http.createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  dalam.on("upgrade", (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    if (!dariSaudara(req, rahasiaDalam) || !kuisNaik) {
      return tolakUpgrade(
        socket,
        kuisNaik ? 403 : 503,
        kuisNaik ? "Forbidden" : "Service Unavailable",
      );
    }
    Promise.resolve(kuisNaik(req, socket, head)).catch((err) => {
      console.error("[kuis] upgrade failed:", err);
      tolakUpgrade(socket, 500, "Internal Server Error");
    });
  });
  // `exclusive`: a worker's own door, not one the supervisor shares between all workers (as it does for port 0).
  await new Promise<void>((selesai) =>
    dalam!.listen({ port: 0, host: "127.0.0.1", exclusive: true }, selesai),
  );
  portDalam = (dalam.address() as AddressInfo).port;
}

// ---------- joining the supervisor ----------

if (bus) {
  Object.assign(bus.penangan, {
    siar: (n: number, e: string, t: string[]) => void hub.terapkan(n, e, t),
    kirim: (r: string, m: unknown[]) => ruang.terimaKirim(r, m),
    tutup: (r: string) => void ruang.terimaTutup(r),
    hadir: ruang.terimaHadir,
    pergi: ruang.terimaPergi,
    batal: batalkanCacheLokal,
    taruh: terimaBersama,
    pimpin: mulaiPimpinan,
    lepas: hentiPimpinan,
    pantau: (kunci: string, isi: unknown) =>
      pantauScan.diminta(kunci, isi as Parameters<typeof pantauScan.diminta>[1]),
    henti: () => void henti("supervisor"),
    tanya: (apa: "stat" | "metrik" | "ulang") => {
      if (apa === "metrik") return mentah();
      if (apa === "ulang") {
        ulang();
        return true;
      }
      const s: StatPekerja = {
        id: idSaya,
        gen: genSaya,
        pemimpin: kuis !== null,
        pid: process.pid,
        rssMb: Math.round(process.memoryUsage().rss / 1048576),
        jalanDetik: Math.round((Date.now() - mulaiWaktu) / 1000),
        soket: jumlahSoket(),
        kolam: statusKolam(),
        jedaLoopMs: jedaLoop(),
        latar: jumlahLatar(),
        sha: process.env.IRIS_BUILD_SHA ?? null,
      };
      return s;
    },
  });
  pasangBersama({
    sekali: (kunci, ttl) => bus.sekali(kunci, ttl),
    taruh: (kunci, nilai, ttl) => bus.taruh(kunci, nilai, ttl),
  });
  pasangSebarBatal(() => bus.batal());
  // Only the leader reads a QR wall's sheet; the others tell it a page is asking.
  pantauScan.teruskan = (kunci, isi) => bus.pantau(kunci, isi);
  pantauScan.aktif = false;

  const sk = await bus.halo();
  if (!sk) {
    console.error("[server] the supervisor did not answer; exiting");
    process.exit(1);
  }
  idSaya = sk.id;
  genSaya = sk.gen;
  hub.sinkron(sk.n, sk.e, sk.cincin);
  ruang.sinkronHadir(sk.hadir);
  for (const [k, v, sampai] of sk.kv) terimaBersama(k, v, sampai);
  process.on("disconnect", () => void henti("disconnect"));
} else {
  mulaiPimpinan();
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
server.listen(port, host, () => {
  console.warn(
    `[server] IRIS on http://${host}:${port} (${rute.length} API routes, dist ${dist}${bus ? `, worker ${idSaya} gen ${genSaya}` : ""})`,
  );
  bus?.siap(portDalam);
});

pantauJeda({
  lapor: (ms) =>
    console.warn(
      `[server] the process was stalled for ${ms} ms, db pool ${JSON.stringify(statusKolam())}`,
    ),
});

process.on("unhandledRejection", (err) => console.error("[server] unhandled rejection:", err));

let berhenti = false;
// An answer sent while this worker drains tells the client not to reuse its connection, so the tunnel's pooled
// connections move to workers that stay (and a request never races the close of an idle one).
server.prependListener("request", (_req, res) => {
  if (berhenti) res.setHeader("Connection", "close");
});
async function henti(sinyal: string): Promise<void> {
  if (berhenti) return;
  berhenti = true;
  console.warn(`[server] ${sinyal}: draining`);
  // No new connections; the ones open finish their request (idle ones are closed every moment).
  const tertutup = new Promise<void>((selesai) => server.close(() => selesai()));
  const sapu = setInterval(() => server.closeIdleConnections(), 250);
  sapu.unref();
  dalam?.close();
  // Pages reconnect by themselves (and ask only for what they missed). With workers a write still being
  // answered here keeps announcing through the supervisor until this process leaves.
  if (!bus) {
    pasangPenyiar(null);
    pasangPenyiarRuang(null);
  }
  hub.tutup();
  ruang.tutupSemua();
  await hentiPimpinan();
  await Promise.race([tertutup, new Promise<void>((s) => setTimeout(s, 30_000).unref())]);
  clearInterval(sapu);
  const kosong = await tungguLatar(60_000);
  if (!kosong) console.error("[server] background jobs still running after 60 s, exiting anyway");
  process.exit(0);
}
process.on("SIGTERM", () => void henti("SIGTERM"));
process.on("SIGINT", () => void henti("SIGINT"));
