/**
 * The one Neon connection. Every API route imports `db`/`getDb` from here
 * rather than constructing its own client — same reasoning as the Button
 * component: one place owns the contract, everything else calls it.
 *
 * Uses the WebSocket Pool driver (drizzle-orm/neon-serverless), not the
 * lighter HTTP driver (drizzle-orm/neon-http), for one specific reason:
 * the HTTP driver's own type definitions say plainly that it "does not
 * support transactions". The roster-replace operation in api/sesi/roster
 * deletes a session's groups and members and re-inserts them from a fresh
 * paste; a failure partway through that without a transaction would leave
 * a session with half a roster, silently. That risk is worth the slightly
 * heavier Pool connection.
 *
 * DATABASE_URL is read lazily inside getDb() rather than at module load,
 * so importing this file never throws in a context where the env var
 * genuinely isn't set yet (a fresh checkout before `vercel env pull`, a
 * unit test that stubs the whole module). The throw happens at the first
 * real query, with a message that says exactly what to do.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// Node's own global WebSocket (available from Node 22+, which is this
// project's floor per package.json's engines field) would otherwise be
// preferred automatically, but setting this explicitly is the pattern
// Neon's own docs recommend for serverless Node deployments regardless of
// runtime version, so a future downgrade of the Node target doesn't
// silently break this connection.
neonConfig.webSocketConstructor = ws;

let cachedPool: InstanceType<typeof Pool> | null = null;
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (cachedDb) return cachedDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Run `vercel env pull .env.local` after " +
        "provisioning the Neon database (Phase 1, step 5), or set it by " +
        "hand in web/.env.local for local development.",
    );
  }

  cachedPool = new Pool({ connectionString: url });
  cachedDb = drizzle(cachedPool, { schema });
  return cachedDb;
}
