/**
 * The wiring schematics bundled with the site (Modules 1 to 3), read for
 * GET /api/presentasi/skema-bawaan. They sat in public/ until 2026-10-15,
 * where anyone could open them; schematics are for signed-in users only
 * (a Praktikan after doing the module), so they live outside public/ and
 * vercel.json ships the folder with the presentasi function.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));

/** The PNG's bytes, or null for a module without one (Module 4). */
export function bacaSkemaBawaan(modul: number): Buffer | null {
  if (![1, 2, 3].includes(modul)) return null;
  try {
    return readFileSync(path.join(here, "../../bundled/schematics", `Module ${modul}.png`));
  } catch {
    return null;
  }
}
