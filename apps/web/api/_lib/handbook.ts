/**
 * The vendored handbook roster (scripts/data_asisten.typ), read once per
 * function instance. The literal path lets node-file-trace see the file;
 * vercel.json also lists it in includeFiles for api/session/[aksi].ts.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseHandbookRoster, type HandbookAsisten } from "../../src/lib/handbook-roster.js";

const here = fileURLToPath(new URL(".", import.meta.url));
let cache: HandbookAsisten[] | null = null;

export function handbookRoster(): HandbookAsisten[] {
  cache ??= parseHandbookRoster(
    readFileSync(path.join(here, "../../scripts/data_asisten.typ"), "utf-8"),
  );
  return cache;
}
