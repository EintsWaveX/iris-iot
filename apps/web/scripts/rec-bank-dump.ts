/** Writes the parsed default bank as JSON for rec-bank-verify.py: npx tsx scripts/rec-bank-dump.ts out.json */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBank } from "../src/lib/recruitment/bank-io.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "rec-bank");
const md =
  readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n").trim())
    .join("\n\n") + "\n";
const items = parseBank(md).flatMap((i) => (i.draft ? [i.draft] : []));
writeFileSync(process.argv[2], JSON.stringify(items, null, 1));
console.log(`${items.length} questions`);
