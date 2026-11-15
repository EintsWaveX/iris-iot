/**
 * The supervisor's body: starts the workers with Node's `cluster`, wires them to the bus, keeps the status
 * file deploy.sh reads. server/supervisor.ts adds the signals; a test driver can call this and drive the roll
 * itself (a laptop cannot send SIGHUP).
 */
import cluster from "node:cluster";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kolamPerPekerja, sidikPengawas } from "./konfig.js";
import { buatPengawas, type Pengawas, type ProsesPekerja } from "./pengawas.js";
import type { DariPekerja, DariUtama } from "./protokol.js";
import { buatUtama, type Utama } from "./utama.js";

export interface OpsiJalankan {
  /** apps/web */
  akar: string;
  /** The worker's entry file (server/main.ts). */
  berkasUtama: string;
  jumlah: number;
  env?: NodeJS.ProcessEnv;
  /** Where supervisor.json goes for deploy.sh; skipped when the folder is not there. */
  dirRun?: string;
  log?: (teks: string) => void;
}

export interface Berjalan {
  pengawas: Pengawas;
  utama: Utama;
  sidik: string;
  tulisStatus(): void;
  /** Drains every worker and stops. */
  berhenti(): Promise<void>;
}

/** The commit deploy.sh wrote after the unit started (its EnvironmentFile is only read at start). */
function bacaSha(akar: string, env: NodeJS.ProcessEnv): string | undefined {
  try {
    const t = readFileSync(join(akar, ".build-sha"), "utf8");
    return /^IRIS_BUILD_SHA=(\S+)/m.exec(t)?.[1];
  } catch {
    return env.IRIS_BUILD_SHA;
  }
}

export function jalankanSupervisor(opsi: OpsiJalankan): Berjalan {
  const env = opsi.env ?? process.env;
  const log = opsi.log ?? ((t: string) => console.warn(`[supervisor] ${t}`));
  const rahasia = randomBytes(24).toString("hex");
  const sidik = sidikPengawas(opsi.akar);
  const mulai = Date.now();
  const utama = buatUtama();

  // Round-robin is Node's default everywhere but Windows, where handles are shared instead.
  if (process.platform !== "win32") cluster.schedulingPolicy = cluster.SCHED_RR;
  cluster.setupPrimary({ exec: opsi.berkasUtama });

  const pengawas = buatPengawas({
    jumlah: opsi.jumlah,
    utama,
    log,
    fork: (gen): ProsesPekerja => {
      const lingkungan: Record<string, string> = {
        IRIS_KLASTER: "1",
        IRIS_KLASTER_GEN: String(gen),
        IRIS_KLASTER_RAHASIA: rahasia,
      };
      const sha = bacaSha(opsi.akar, env);
      if (sha) lingkungan.IRIS_BUILD_SHA = sha;
      const kolam = kolamPerPekerja(env, opsi.jumlah);
      if (kolam) lingkungan.IRIS_DB_POOL = kolam;
      const w = cluster.fork(lingkungan);
      return {
        id: w.id,
        pid: w.process.pid,
        kirim: (m: DariUtama) => {
          if (w.isConnected()) w.send(m);
        },
        bunuh: (s) => w.process.kill(s),
        padaPesan: (cb) =>
          w.on("message", (m: unknown) => {
            if (m && typeof m === "object" && typeof (m as { i?: unknown }).i === "string")
              cb(m as DariPekerja);
          }),
        padaKeluar: (cb) => w.on("exit", (kode, sinyal) => cb(kode, sinyal)),
      };
    },
  });

  const dirRun = opsi.dirRun ?? "";
  function tulisStatus(): void {
    if (!dirRun || !existsSync(dirRun)) return;
    const s = pengawas.status();
    try {
      const tmp = join(dirRun, "supervisor.json.tmp");
      writeFileSync(
        tmp,
        JSON.stringify({
          pid: process.pid,
          sidik,
          mulai: new Date(mulai).toISOString(),
          gen: s.gen,
          menggulir: s.menggulir,
          pekerja: s.pekerja,
        }),
      );
      renameSync(tmp, join(dirRun, "supervisor.json"));
    } catch {
      /* the deploy falls back to a plain restart */
    }
  }

  pengawas.mulai();
  tulisStatus();
  const denyut = setInterval(tulisStatus, 2000);
  denyut.unref();
  log(`up: ${opsi.jumlah} worker(s), pid ${process.pid}, print ${sidik}`);

  return {
    pengawas,
    utama,
    sidik,
    tulisStatus,
    async berhenti() {
      clearInterval(denyut);
      await pengawas.berhenti();
      utama.hentikan();
    },
  };
}
