/**
 * Appends the three Pilih Jadwal events (src/lib/recruitment/seed.ts,
 * pickSeedSql) to migration 0049 once, right after drizzle-kit generates it:
 *
 *   npx tsx scripts/rec-seed-migration-0049.ts
 *
 * The test src/lib/__tests__/recruitment-seed-pick.test.ts fails if the
 * migration and the seed drift apart, so run this again after editing it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pickSeedSql } from "../src/lib/recruitment/seed";

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/0049_recruitment_s2.sql");
const sql = readFileSync(file, "utf8");
const MARK =
  "--> statement-breakpoint\n-- Seed: the three Pilih Jadwal windows (PRD 3), skipped where they exist.\n";
const i = sql.indexOf(MARK);
const base = i === -1 ? sql.trimEnd() : sql.slice(0, i).trimEnd();
writeFileSync(file, `${base}\n${MARK}${pickSeedSql().split("\n").join("\n")}\n`);
console.log(`${file}: seed ${i === -1 ? "added" : "replaced"}`);
