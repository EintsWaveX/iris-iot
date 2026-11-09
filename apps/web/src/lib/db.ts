/**
 * The one database connection. Every API route imports `db`/`getDb` from here
 * rather than constructing its own client — same reasoning as the Button
 * component: one place owns the contract, everything else calls it.
 *
 * Two drivers, chosen by where DATABASE_URL points (`pakaiNeon`):
 *
 *  - Neon (a *.neon.tech host): the WebSocket Pool driver
 *    (drizzle-orm/neon-serverless), not the lighter HTTP driver
 *    (drizzle-orm/neon-http), for one specific reason: the HTTP driver's own
 *    type definitions say plainly that it "does not support transactions".
 *    The roster-replace operation in api/session/roster deletes a session's
 *    groups and members and re-inserts them from a fresh paste; a failure
 *    partway through that without a transaction would leave a session with
 *    half a roster, silently. That risk is worth the slightly heavier Pool
 *    connection.
 *  - Any other host (the Postgres on the PC Server, 127.0.0.1): plain
 *    node-postgres over TCP (drizzle-orm/node-postgres). Neon's WebSocket
 *    proxy only exists on Neon, so this is the only driver that can talk to
 *    a Postgres of our own. Both are pg Pools underneath, so every query,
 *    transaction and error code reads the same.
 *
 * IRIS_DB_DRIVER=neon|pg forces one (a Neon URL behind a plain TCP route, say).
 *
 * DATABASE_URL is read lazily inside getDb() rather than at module load,
 * so importing this file never throws in a context where the env var
 * genuinely isn't set yet (a fresh checkout before `vercel env pull`, a
 * unit test that stubs the whole module). The throw happens at the first
 * real query, with a message that says exactly what to do.
 */
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import ws from "ws";
import * as schema from "./schema.js";

// Node's own global WebSocket (available from Node 22+, which is this
// project's floor per package.json's engines field) would otherwise be
// preferred automatically, but setting this explicitly is the pattern
// Neon's own docs recommend for serverless Node deployments regardless of
// runtime version, so a future downgrade of the Node target doesn't
// silently break this connection.
neonConfig.webSocketConstructor = ws;

/** True when this URL must be reached through Neon's WebSocket driver. */
export function pakaiNeon(
  url: string,
  paksa: string | undefined = process.env.IRIS_DB_DRIVER,
): boolean {
  if (paksa === "neon") return true;
  if (paksa === "pg") return false;
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

/** The shape every caller sees. node-postgres answers the same calls, so one type serves both. */
export type Db = NeonDatabase<typeof schema>;

let cachedDb: Db | null = null;
let kolam: pg.Pool | null = null;

/** A positive whole number from an env value, or the default. */
export function angka(nilai: string | undefined, bawaan: number): number {
  const n = Number(nilai);
  return Number.isInteger(n) && n > 0 ? n : bawaan;
}

/** How full the local pool is (null on Neon): total connections, idle ones, requests waiting in line. */
export function statusKolam(): { total: number; menganggur: number; antre: number } | null {
  return kolam
    ? { total: kolam.totalCount, menganggur: kolam.idleCount, antre: kolam.waitingCount }
    : null;
}

export function getDb(): Db {
  if (cachedDb) return cachedDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Run `vercel env pull .env.local` after " +
        "provisioning the Neon database (Phase 1, step 5), or set it by " +
        "hand in web/.env.local for local development.",
    );
  }

  if (pakaiNeon(url)) {
    cachedDb = drizzleNeon(new NeonPool({ connectionString: url }), { schema });
  } else {
    // On Vercel every request had a pool of its own; here one process serves them all, so the pool is the
    // site's whole database capacity. Postgres allows 100 connections and nothing else uses more than a few.
    const pool = new pg.Pool({
      connectionString: url,
      max: angka(process.env.IRIS_DB_POOL, 30),
      idleTimeoutMillis: 30_000,
      // A burst waits in line instead of failing: a busy second must not become an error report.
      connectionTimeoutMillis: angka(process.env.IRIS_DB_TUNGGU_MS, 15_000),
    });
    // An idle client the server dropped (a restart of Postgres) must not crash the process.
    pool.on("error", (err) => console.error("[db] idle client error:", err.message));
    kolam = pool;
    cachedDb = drizzlePg(pool, { schema }) as unknown as Db;
  }
  return cachedDb;
}
