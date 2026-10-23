/**
 * Appends the recruitment seed (src/lib/recruitment/seed.ts) to migration
 * 0048 once, right after drizzle-kit generates it:
 *
 *   npx tsx scripts/rec-seed-migration.ts
 *
 * The seed test (src/lib/__tests__/recruitment-seed.test.ts) fails if the
 * migration and the seed drift apart, so run this again after editing it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedSql } from "../src/lib/recruitment/seed";

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/0048_recruitment.sql");
const sql = readFileSync(file, "utf8");
const MARK =
  "--> statement-breakpoint\n-- Seed: the 2026 edition and its calendar (PRD 3). No committee members.\n";
const i = sql.indexOf(MARK);
const base = i === -1 ? sql.trimEnd() : sql.slice(0, i).trimEnd();
writeFileSync(file, `${base}\n${MARK}${seedSql()}\n`);
console.log(`${file}: seed ${i === -1 ? "added" : "replaced"}`);
