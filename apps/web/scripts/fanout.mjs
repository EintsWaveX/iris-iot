#!/usr/bin/env node
/**
 * Real-time fan-out load test. Examples:
 *
 *   # only connect 1000 listeners and hold them 30 s (no secret needed)
 *   node scripts/fanout.mjs --url ws://127.0.0.1:8787/siaran --sockets 1000 --hold 30
 *
 *   # announce 20 topics and time every socket hearing each (the Worker relay: HMAC secret from the env)
 *   KONSOL_RELAY_SECRET=... node scripts/fanout.mjs --url wss://konsol.irisiotlab.com/siaran \
 *     --emit hmac --emit-url https://konsol.irisiotlab.com/siaran/kirim --secret-env KONSOL_RELAY_SECRET \
 *     --sockets 300 --rounds 20 --out perf/fanout-worker-300.json --allow-live
 *
 * The secret comes only from the environment, never from an argument or a file. Against a live host
 * (irisiotlab.com, workers.dev) it needs --allow-live, and it refuses during class hours
 * (06:00-21:00 WIB, Mon-Sat) unless --force.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { jalankanFanout } from "./fanout-lib.mjs";

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const url = opt("--url");
if (!url) {
  console.error(
    "usage: node scripts/fanout.mjs --url ws(s)://host/siaran [--sockets N] [--rounds M] [--emit hmac|bearer ...]",
  );
  process.exit(2);
}
const host = new URL(url).hostname;
const live = /irisiotlab\.com$|workers\.dev$/.test(host);
if (live && !flag("--allow-live")) {
  console.error(`${host} is live: add --allow-live if you mean it.`);
  process.exit(2);
}
if (live && !flag("--force")) {
  const wib = new Date(Date.now() + 7 * 3600_000);
  const h = wib.getUTCHours() + wib.getUTCMinutes() / 60;
  if (wib.getUTCDay() !== 0 && h >= 6 && h < 21) {
    console.error(
      "Class hours (06:00-21:00 WIB, Mon-Sat): refusing to load a live host. --force to override.",
    );
    process.exit(2);
  }
}

let emit;
const mode = opt("--emit");
if (mode) {
  const nama = opt("--secret-env", "FANOUT_SECRET");
  const rahasia = process.env[nama];
  if (!rahasia) {
    console.error(`the secret env var ${nama} is not set`);
    process.exit(2);
  }
  emit = { mode, url: opt("--emit-url"), rahasia };
  if (!emit.url) {
    console.error("--emit needs --emit-url");
    process.exit(2);
  }
}

const hasil = await jalankanFanout({
  url,
  soket: Number(opt("--sockets", "100")),
  putaran: Number(opt("--rounds", "10")),
  jeda: Number(opt("--gap", "500")),
  tahan: Number(opt("--hold", "10")),
  rampa: Number(opt("--ramp", "100")),
  origin: opt("--origin"),
  emit,
});
const keluar = { cap: new Date().toISOString(), nama: opt("--name", null), ...hasil };
console.log(JSON.stringify(keluar, null, 2));
const out = opt("--out");
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(keluar, null, 2) + "\n");
}
process.exit(hasil.hilang > 0 || hasil.gagalSambung > 0 ? 1 : 0);
