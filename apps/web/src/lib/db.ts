/**
 * The one database connection. Every API route imports `db`/`getDb` from here
 * rather than constructing its own client — same reasoning as the Button
 * component: one place owns the contract, everything else calls it.
 *
 * Plain node-postgres over TCP (drizzle-orm/node-postgres) to the Postgres on
 * the PC Server. One process serves the whole site, so the pool below is the
 * site's whole database capacity.
 *
 * DATABASE_URL is read lazily inside getDb() rather than at module load,
 * so importing this file never throws in a context where the env var
 * genuinely isn't set yet (a fresh checkout, a unit test that stubs the whole
 * module). The throw happens at the first real query, with a message that
 * says exactly what to do.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { catatQuery } from "./lingkup-query.js";
import * as schema from "./schema.js";

/** The shape every caller sees. */
export type Db = NodePgDatabase<typeof schema>;

let cachedDb: Db | null = null;
let kolam: pg.Pool | null = null;

/** A positive whole number from an env value, or the default. */
export function angka(nilai: string | undefined, bawaan: number): number {
  const n = Number(nilai);
  return Number.isInteger(n) && n > 0 ? n : bawaan;
}

/** How full the local pool is (null until the first query): total connections, idle ones, requests waiting in line. */
export function statusKolam(): { total: number; menganggur: number; antre: number } | null {
  return kolam
    ? { total: kolam.totalCount, menganggur: kolam.idleCount, antre: kolam.waitingCount }
    : null;
}

/**
 * Times every promise-style query on `sasaran` (the pool, or a client of it) for the request metrics.
 * A call with a callback or a stream object is passed through untouched.
 */
function ukurQuery(sasaran: { query: (...a: never[]) => unknown }): void {
  const asli = sasaran.query.bind(sasaran) as (...a: unknown[]) => unknown;
  (sasaran as { query: unknown }).query = (...args: unknown[]) => {
    if (args.some((a) => typeof a === "function")) return asli(...args);
    const t0 = performance.now();
    const hasil = asli(...args);
    if (hasil && typeof (hasil as Promise<unknown>).then === "function") {
      return (hasil as Promise<unknown>).finally(() => catatQuery(performance.now() - t0));
    }
    return hasil;
  };
}

export function getDb(): Db {
  if (cachedDb) return cachedDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. On the PC Server it comes from /etc/iris-web/env; " +
        "for local development set it by hand in apps/web/.env.local.",
    );
  }

  const pool = new pg.Pool({
    connectionString: url,
    max: angka(process.env.IRIS_DB_POOL, 30),
    idleTimeoutMillis: 30_000,
    // A burst waits in line instead of failing: a busy second must not become an error report.
    connectionTimeoutMillis: angka(process.env.IRIS_DB_TUNGGU_MS, 15_000),
  });
  ukurQuery(pool as never);
  pool.on("connect", (client) => ukurQuery(client as never));
  // An idle client the server dropped (a restart of Postgres) must not crash the process.
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  kolam = pool;
  cachedDb = drizzle(pool, { schema });
  return cachedDb;
}
