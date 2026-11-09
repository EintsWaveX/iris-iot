/**
 * Checks that the Servers page history worked out in Postgres (api/_lib/server-riwayat.ts) answers exactly what
 * the old code did (fetch every row, then downsample/detectReboots/detectGaps/hitungKetersediaan/
 * bangunTimelineLayanan in Node). Builds random heartbeat histories in a scratch table, runs both, compares.
 *
 *   createdb riwayat_test
 *   DATABASE_URL=<connection URL of that database> TZ=Asia/Jakarta node --import tsx scripts/riwayat-banding.ts
 *
 * It creates and drops its own `denyut` table, so point it at a scratch database only.
 */
import { deepStrictEqual } from "node:assert";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { ringkasRiwayat } from "../api/_lib/server-riwayat.js";
import {
  RIWAYAT_MAX_POINTS,
  bangunTimelineLayanan,
  detectGaps,
  detectReboots,
  downsample,
  hitungKetersediaan,
} from "../src/lib/server-lib.js";
import type { Db } from "../src/lib/db.js";

const url = process.env.DATABASE_URL;
if (!url || !/(riwayat_test|scratch)/.test(url)) {
  console.error(
    "Set DATABASE_URL to a scratch database whose name contains riwayat_test or scratch.",
  );
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: url, max: 4 });
const db = drizzle(pool) as unknown as Db;

function acak(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KUNCI = ["ws", "mqtt", "lora", "kelompok-1"];
const STATUS = ["running", "stopped", "unknown"];

async function isi(serverId: number, n: number, seed: number, akhir: number) {
  const r = acak(seed);
  const baris: unknown[][] = [];
  let t = akhir - n * 12_000 - 60_000;
  let uptime = Math.floor(r() * 100_000);
  const status: Record<string, string> = Object.fromEntries(KUNCI.map((k) => [k, "running"]));
  for (let i = 0; i < n; i++) {
    const p = r();
    const dt =
      p < 0.85
        ? 8_000 + r() * 4_000
        : p < 0.95
          ? 15_000 + r() * 45_000
          : p < 0.99
            ? 200_000 + r() * 400_000
            : 800_000 + r() * 4_000_000;
    t += dt;
    uptime = r() < 0.01 ? Math.floor(r() * 50) : uptime + Math.round(dt / 1000);
    for (const k of KUNCI) if (r() < 0.03) status[k] = STATUS[Math.floor(r() * STATUS.length)];
    let layanan: string | null;
    const q = r();
    if (q < 0.03) layanan = null;
    else if (q < 0.05) layanan = "{}";
    else
      layanan = JSON.stringify(
        Object.fromEntries(KUNCI.filter(() => r() < 0.92).map((k) => [k, status[k]])),
      );
    baris.push([
      serverId,
      new Date(Math.round(t)).toISOString(),
      r() < 0.04 ? null : Math.floor(r() * 100),
      Math.floor(r() * 100),
      Math.floor(r() * 100),
      Math.floor(30 + r() * 40),
      Math.floor(r() * 1_000_000),
      r() < 0.03 ? null : uptime,
      layanan,
    ]);
  }
  for (let i = 0; i < baris.length; i += 500) {
    const lot = baris.slice(i, i + 500);
    const nilai = lot.map(
      (_, j) =>
        `($${j * 9 + 1},$${j * 9 + 2},$${j * 9 + 3},$${j * 9 + 4},$${j * 9 + 5},$${j * 9 + 6},$${j * 9 + 7},$${j * 9 + 8},$${j * 9 + 9}::jsonb)`,
    );
    await pool.query(
      `insert into denyut (server_id, pada, cpu, memori, disk, suhu, jaringan, uptime_sec, layanan) values ${nilai.join(",")}`,
      lot.flat(),
    );
  }
  return t;
}

/** The old handler's maths, copied from before the change. */
async function lama(serverId: number, mulai: Date, akhir: Date) {
  const { rows } = await pool.query(
    `select pada, cpu, memori, disk, suhu, jaringan, uptime_sec as "uptimeSec", layanan
     from denyut where server_id = $1 and pada >= $2 order by pada asc, id asc`,
    [serverId, mulai],
  );
  const withIso = rows.map((x) => ({ ...x, pada: (x.pada as Date).toISOString() }));
  return {
    seri: downsample(withIso, RIWAYAT_MAX_POINTS),
    reboot: detectReboots(withIso),
    gap: detectGaps(withIso),
    ketersediaan: hitungKetersediaan(withIso, mulai, akhir),
    timelineLayanan: bangunTimelineLayanan(withIso),
  };
}

await pool.query("drop table if exists denyut");
await pool.query(`create table denyut (
  id serial primary key, server_id int not null, pada timestamptz not null default now(),
  cpu int, memori int, disk int, suhu int, jaringan int, uptime_sec int,
  jam_selaras boolean not null default false, mode_jaringan text, layanan jsonb)`);
await pool.query("create index on denyut (server_id, pada)");

let kasus = 0;
const isinya = { seri: 0, gap: 0, reboot: 0, linimasa: 0, terpotong: 0 };
const ukuran = [0, 1, 2, 7, 299, 300, 301, 302, 599, 600, 601, 1000, 2500, 9999];
let id = 0;
for (const n of ukuran) {
  for (let ulang = 0; ulang < 6; ulang++) {
    id++;
    const sekarang = Date.now();
    const akhirData = await isi(id, n, id * 7919 + ulang, sekarang - ulang * 3_000_000);
    const r = acak(id * 31 + 5);
    const mulaiMs =
      n === 0 ? sekarang - 3_600_000 : akhirData - n * 12_000 - 60_000 + r() * n * 6_000;
    const mulai = new Date(mulaiMs);
    const akhir = new Date(akhirData + r() * 5_000_000);
    const a = await lama(id, mulai, akhir);
    const b = await ringkasRiwayat(db, id, mulai, akhir);
    try {
      deepStrictEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)));
    } catch (e) {
      console.error(`DIFFERENT for n=${n} repeat=${ulang} (server ${id})`);
      console.error(String((e as Error).message).slice(0, 1800));
      process.exit(1);
    }
    kasus++;
    isinya.seri += a.seri.length;
    isinya.gap += a.gap.length;
    isinya.reboot += a.reboot.length;
    isinya.linimasa += a.timelineLayanan.length;
    if (a.seri.length === RIWAYAT_MAX_POINTS) isinya.terpotong++;
  }
}
console.log(`ok: ${kasus} histories, old and new answers identical`);
console.log(
  `what they covered: ${JSON.stringify(isinya)} (chart points, gaps, reboots, timeline entries, histories cut to ${RIWAYAT_MAX_POINTS})`,
);
await pool.query("drop table denyut");
await pool.end();
