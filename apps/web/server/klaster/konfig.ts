/**
 * The supervisor's settings, as plain functions so they can be tested (server/supervisor.ts runs the moment it
 * is imported and cannot be).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The files the supervisor itself is made of: when they change, a deploy restarts the whole service. */
export const BERKAS_PENGAWAS = [
  "server/supervisor.ts",
  "server/klaster/jalankan.ts",
  "server/klaster/konfig.ts",
  "server/klaster/pengawas.ts",
  "server/klaster/utama.ts",
  "server/klaster/protokol.ts",
];

/** How many workers: IRIS_PEKERJA when it is a whole number from 0 to 32 (0 = no workers), else half the cores, 2 to 4. */
export function jumlahPekerja(env: NodeJS.ProcessEnv, inti: number): number {
  const minta = env.IRIS_PEKERJA;
  if (minta !== undefined && minta.trim() !== "") {
    const n = Number(minta);
    if (Number.isInteger(n) && n >= 0 && n <= 32) return n;
    console.error(
      `[supervisor] IRIS_PEKERJA=${minta} is not a whole number from 0 to 32; using the default`,
    );
  }
  return Math.max(2, Math.min(4, Math.floor(inti / 2)));
}

/** A worker's share of the database connections, unless IRIS_DB_POOL names one (that one is per worker). */
export function kolamPerPekerja(env: NodeJS.ProcessEnv, jumlah: number): string | undefined {
  if (env.IRIS_DB_POOL) return undefined;
  const total = Number(env.IRIS_DB_TOTAL) > 0 ? Number(env.IRIS_DB_TOTAL) : 40;
  return String(Math.max(8, Math.floor(total / Math.max(1, jumlah))));
}

/** Fingerprint of the supervisor's own files, so deploy.sh can tell whether a plain rolling restart is enough. */
export function sidikPengawas(akar: string): string {
  const h = createHash("sha1");
  for (const b of BERKAS_PENGAWAS) {
    try {
      h.update(readFileSync(join(akar, b)));
    } catch {
      /* a missing file changes the print, which is the point */
    }
  }
  return h.digest("hex").slice(0, 12);
}
