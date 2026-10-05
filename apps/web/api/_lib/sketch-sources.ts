/**
 * Server-side copies of the same sketch sources src/lib's sketches.ts glob
 * exposes to Astro pages. That module leans on Vite's `?raw` import, which
 * only exists inside Astro's own Vite-based build -- this top-level api/
 * directory is built as plain Vercel Node functions instead, so a literal
 * `fs.readFileSync(path.join(<this file's own dir>, "..."))` per file is
 * used here instead: node-file-trace (Vercel's function bundler) can only
 * discover non-code assets a function needs when the path is a statically
 * visible literal like this, not a runtime-built string.
 *
 * Read on first use, not at load: the session functions reach this through
 * kode-aktif.ts too, and a missing file must not take a whole function down.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));

function read(relative: string): string {
  return readFileSync(path.join(here, relative), "utf-8");
}

let SOURCES: Record<string, string> | null = null;

const muat = (): Record<string, string> => ({
  "id/modul1_ble_central.ino": read("../../src/content/sketches/id/modul1_ble_central.ino"),
  "id/modul1_ble_peripheral.ino": read("../../src/content/sketches/id/modul1_ble_peripheral.ino"),
  "id/modul2_websocket_server.py": read("../../src/content/sketches/id/modul2_websocket_server.py"),
  "id/modul2_websocket_esp32.ino": read("../../src/content/sketches/id/modul2_websocket_esp32.ino"),
  "id/modul3_mqtt_publish.py": read("../../src/content/sketches/id/modul3_mqtt_publish.py"),
  "id/modul3_mqtt_subscribe.py": read("../../src/content/sketches/id/modul3_mqtt_subscribe.py"),
  "id/modul4_hunter.ino": read("../../src/content/sketches/id/modul4_hunter.ino"),
  "id/modul4_beacon.ino": read("../../src/content/sketches/id/modul4_beacon.ino"),
  "en/modul1_ble_central.ino": read("../../src/content/sketches/en/modul1_ble_central.ino"),
  "en/modul1_ble_peripheral.ino": read("../../src/content/sketches/en/modul1_ble_peripheral.ino"),
  "en/modul2_websocket_server.py": read("../../src/content/sketches/en/modul2_websocket_server.py"),
  "en/modul2_websocket_esp32.ino": read("../../src/content/sketches/en/modul2_websocket_esp32.ino"),
  "en/modul3_mqtt_publish.py": read("../../src/content/sketches/en/modul3_mqtt_publish.py"),
  "en/modul3_mqtt_subscribe.py": read("../../src/content/sketches/en/modul3_mqtt_subscribe.py"),
  "en/modul4_hunter.ino": read("../../src/content/sketches/en/modul4_hunter.ino"),
  "en/modul4_beacon.ino": read("../../src/content/sketches/en/modul4_beacon.ino"),
});

export function getSketchSourceForApi(bahasa: string, filename: string): string | undefined {
  SOURCES ??= muat();
  return SOURCES[`${bahasa}/${filename}`];
}
