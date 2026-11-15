/**
 * Starts IRIS as several workers: `npm run server` (see deploy/DEPLOY.md). The supervisor is thin on purpose
 * (it loads none of the site), so it stays running while a deploy replaces every worker under it.
 *
 *   IRIS_PEKERJA       how many workers (default: half the cores, at least 2, at most 4; 0 = one plain process,
 *                      the way the server ran before workers)
 *   IRIS_DB_TOTAL      database connections all workers share when IRIS_DB_POOL is not set (default 40)
 *   IRIS_RUN_DIR       where it writes supervisor.json for deploy.sh (default /run/iris-web; skipped when it is
 *                      not there)
 *   PORT, HOST, ...    as for server/main.ts; the workers inherit them
 *
 * Signals:
 *   SIGHUP             rolling restart: new workers start on the code now on disk, the old ones drain (deploy.sh)
 *   SIGTERM / SIGINT   drain every worker, then exit
 */
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { jalankanSupervisor } from "./klaster/jalankan.js";
import { jumlahPekerja } from "./klaster/konfig.js";

const akar = fileURLToPath(new URL("..", import.meta.url));
const jumlah = jumlahPekerja(process.env, availableParallelism());

if (jumlah === 0) {
  // One plain process, as before workers existed.
  await import("./main.js");
} else {
  const s = jalankanSupervisor({
    akar,
    berkasUtama: fileURLToPath(new URL("./main.ts", import.meta.url)),
    jumlah,
    dirRun: process.env.IRIS_RUN_DIR ?? "/run/iris-web",
  });
  const log = (t: string) => console.warn(`[supervisor] ${t}`);

  let berhenti = false;
  const henti = async (sinyal: string) => {
    if (berhenti) return;
    berhenti = true;
    log(`${sinyal}: draining ${jumlah} worker(s)`);
    await s.berhenti();
    process.exit(0);
  };
  process.on("SIGTERM", () => void henti("SIGTERM"));
  process.on("SIGINT", () => void henti("SIGINT"));
  process.on("SIGHUP", () => {
    if (berhenti) return;
    log("SIGHUP: rolling restart");
    void s.pengawas.gulir().then((ok) => {
      s.tulisStatus();
      if (!ok) log("rolling restart did not finish");
    });
  });
  process.on("unhandledRejection", (err) =>
    console.error("[supervisor] unhandled rejection:", err),
  );
}
