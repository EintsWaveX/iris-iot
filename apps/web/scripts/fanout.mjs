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
 *   # rooms mode: the same, inside one session room or exam room (this script signs the tickets)
 *   KONSOL_RELAY_SECRET=... node scripts/fanout.mjs --url wss://irisiotlab.com  *     --room aliran/sesi-999001 --secret-env KONSOL_RELAY_SECRET --sockets 1000 --rounds 20 --allow-live
 *   (--room ujian/rec-999001 for an exam room: socket 0 is a seat sending progress, the rest are
 *   Panitia consoles; at most 200 rounds, one every 1.6 s.) Use a room number no real session has.
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
if (opt("--room") && new URL(url).pathname.length > 1) {
  console.error("with --room, --url is the base only (wss://host), the room's path is added");
  process.exit(2);
}
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
let ruang;
const kamar = opt("--room");
if (kamar) {
  const m = /^(aliran|ujian)\/((?:sesi-[1-9]\d{0,8})|(?:rec-[1-9]\d{0,8}))$/.exec(kamar);
  if (!m || (m[1] === "ujian") !== m[2].startsWith("rec-")) {
    console.error("--room is aliran/sesi-<n> or ujian/rec-<n>");
    process.exit(2);
  }
  const nama = opt("--secret-env", "KONSOL_RELAY_SECRET");
  const rahasia = process.env[nama];
  if (!rahasia || rahasia.length < 32) {
    console.error(`the secret env var ${nama} is not set (or shorter than 32 characters)`);
    process.exit(2);
  }
  ruang = { jenis: m[1], nama: m[2], rahasia };
}
const mode = opt("--emit");
if (mode && ruang) {
  console.error("--room and --emit are two ways to announce; pick one");
  process.exit(2);
}
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
  ruang,
});
const keluar = { cap: new Date().toISOString(), nama: opt("--name", null), ...hasil };
console.log(JSON.stringify(keluar, null, 2));
const out = opt("--out");
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(keluar, null, 2) + "\n");
}
process.exit(hasil.hilang > 0 || hasil.gagalSambung > 0 ? 1 : 0);
