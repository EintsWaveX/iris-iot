/**
 * Opens every SeeLabs seal in the database DATABASE_URL points at, with this
 * process's own DATA_KUNCI, and prints how many open. Read-only (one SELECT);
 * prints counts, never a value. Exit 0 when all open, 1 when some do not,
 * 2 when DATA_KUNCI is missing or not a 32-byte key.
 *
 * On the PC, with the service's own environment:
 *   sudo systemd-run --pty --wait -p User=iris-web -p EnvironmentFile=/etc/iris-web/env \
 *     -p WorkingDirectory=/opt/iris-web/apps/web /opt/node24/bin/node --import tsx scripts/check-seals.ts
 */
import { periksaSegel } from "../api/_lib/segel-periksa.js";
import { dataKunciSiap } from "../api/_lib/rahasia.js";
import { getDb } from "../src/lib/db.js";
import { seelabsAkses } from "../src/lib/schema.js";

const keluar = (s: string) => process.stdout.write(`${s}\n`);

if (!dataKunciSiap()) {
  keluar("DATA_KUNCI is not set to a 32-byte hex or base64 key in this environment.");
  process.exit(2);
}
const rows = await getDb()
  .select({ nim: seelabsAkses.nim, segel: seelabsAkses.segel })
  .from(seelabsAkses);
const h = periksaSegel(rows);
keluar(
  `${h.terbuka} of ${h.total} seals open with this DATA_KUNCI (g1 ${h.g1}, g2 ${h.g2}, closed ${h.tertutup})`,
);
process.exit(h.tertutup === 0 && h.total > 0 ? 0 : 1);
