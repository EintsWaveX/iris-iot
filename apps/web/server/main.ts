/**
 * Starts the IRIS server: `npm run server` (see deploy/DEPLOY.md).
 *
 *   PORT              default 8787
 *   HOST              default 127.0.0.1 (leave it; the tunnel is the way in)
 *   IRIS_DIST         the built site, default apps/web/dist
 *   IRIS_BUILD_SHA    the commit this build is (the deploy script sets it)
 *   IRIS_PERCAYA_CF   "1" behind a Cloudflare Tunnel, so the client IP is cf-connecting-ip
 *   DATABASE_URL and the rest of the API's own env, as on Vercel.
 *
 * SIGTERM (systemd stop or restart) stops taking connections, lets requests
 * and background jobs finish for up to 60 seconds, then exits.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { bacaBerkas, cekBerkas } from "../api/_lib/berkas.js";
import { tungguLatar } from "../api/_lib/tunggu.js";
import { cacheSesiBerjalan } from "../src/lib/sesi.js";
import { getDb, statusKolam } from "../src/lib/db.js";
import { buatApp } from "./app.js";
import { pantauJeda } from "./jeda.js";
import { pasangPenyiar } from "../api/_lib/penyiar.js";
import { buatHubSiaran } from "./hub/siaran.js";
import { pasangKuis } from "./kuis.js";
import { daftarkanSoket } from "./metrik.js";
import { buatPengarah } from "./upgrade.js";
import { konteksKuisDb } from "./kuis-db.js";

const akar = fileURLToPath(new URL("..", import.meta.url));
const dist = process.env.IRIS_DIST ?? join(akar, "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error(`[server] ${dist} has no index.html: run \`npm run build\` first.`);
  process.exit(1);
}
const config = JSON.parse(readFileSync(join(akar, "vercel.json"), "utf8"));

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
});

// One dispatcher for every WebSocket upgrade; each socket feature registers its own path.
const pengarah = buatPengarah(server);

// The Module 4 quiz game's socket (games.irisiotlab.com, /kuis/ws).
const kuis = pasangKuis(server, konteksKuisDb(), { pengarah });

// The live-update hub: every open page listens here (/siaran) and the API announces topics to it directly.
const hub = buatHubSiaran({
  soketMaks:
    Number(process.env.IRIS_SIARAN_SOKET_MAKS) > 0
      ? Number(process.env.IRIS_SIARAN_SOKET_MAKS)
      : 5000,
});
pengarah.daftar((jalur) => jalur === "/siaran", hub.naik);
pasangPenyiar(hub.publish);
daftarkanSoket("siaran", hub.jumlah);

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
server.listen(port, host, () => {
  console.warn(`[server] IRIS on http://${host}:${port} (${rute.length} API routes, dist ${dist})`);
});

pantauJeda({
  lapor: (ms) =>
    console.warn(
      `[server] the process was stalled for ${ms} ms, db pool ${JSON.stringify(statusKolam())}`,
    ),
});

process.on("unhandledRejection", (err) => console.error("[server] unhandled rejection:", err));

let berhenti = false;
async function henti(sinyal: string): Promise<void> {
  if (berhenti) return;
  berhenti = true;
  console.warn(`[server] ${sinyal}: draining`);
  server.close();
  server.closeIdleConnections();
  // Pages reconnect by themselves (and ask only for what they missed).
  pasangPenyiar(null);
  hub.tutup();
  // The quiz rooms save once more, so a restart pauses a game instead of ending it.
  await kuis.tutup().catch((err) => console.error("[server] the quiz rooms were not saved:", err));
  const kosong = await tungguLatar(60_000);
  if (!kosong) console.error("[server] background jobs still running after 60 s, exiting anyway");
  process.exit(0);
}
process.on("SIGTERM", () => void henti("SIGTERM"));
process.on("SIGINT", () => void henti("SIGINT"));
