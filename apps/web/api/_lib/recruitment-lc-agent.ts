/**
 * The PC agent's side of Live Coding (EXAM-ENGINE 9.4, 9.6): compile jobs and
 * the exam's Mosquitto account jobs, handed out on the heartbeat and answered
 * on the next one (or at once). Everything here is idempotent: a result that
 * arrives twice, or for a job that was handed back to the queue, changes
 * nothing the second time.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  recCompileJob,
  recExamRoom,
  recMqttJob,
  server,
  type RecCompileJobRow,
} from "../../src/lib/schema.js";
import type { CompileJob, CompileResult, LcRun } from "../../src/lib/recruitment/lc-types.js";
import { JOB_KODE, RUNS_MAX } from "../../src/lib/recruitment/lc-types.js";
import { kunciLcBin } from "../../src/lib/recruitment/lc-r2.js";
import { queueChips, typicalMs, type QueueJob } from "../../src/lib/recruitment/lc-queue.js";
import { ruangUjian, type PesanUjian } from "../../src/lib/recruitment/room-relay.js";
import { sekarangDetik, tandaiTp, TP_PUT_DETIK, relayHttps } from "../../src/lib/tp-r2.js";
import type { PesanAliran } from "../../src/lib/aliran.js";
import { buildHeader } from "../../src/lib/recruitment/lc-header.js";
import { DEFAULT_TEMPLATES } from "../../src/lib/recruitment/lc-defaults.js";
import { terbitkan } from "./aliran.js";
import { konsolEnv } from "./konsol.js";
import { bungkus, buka } from "./rahasia.js";
import { kepala } from "./tp-simpan.js";
import type { Db } from "./recruitment-data.js";
import { nomorKursi } from "./recruitment-lc-common.js";

/** A job claimed and unanswered this long goes back once, then fails agen_diam (9.4) */
export const KLAIM_BASI_MS = 180_000;
const LABEL_JOB = "rec-mqtt-job";
/** The protocol of the agent build that can compile (AGENT_PROTOCOL 9) */
export const PROTOKOL_KOMPILASI = 9;

type Eligible = { protokol: number; kompilasi: boolean; mqtt: boolean };

export async function bacaAgen(db: Db, serverId: number): Promise<Eligible> {
  const [r] = await db
    .select({ info: server.infoSistem })
    .from(server)
    .where(eq(server.id, serverId))
    .limit(1);
  const info = (r?.info ?? {}) as Record<string, unknown>;
  const protokol = typeof info.protokol === "number" ? info.protokol : 0;
  return {
    protokol,
    kompilasi: protokol >= PROTOKOL_KOMPILASI && !!info.kompilasi,
    mqtt: protokol >= PROTOKOL_KOMPILASI && !!info.mqttUjian,
  };
}

/* ------------------------------------------------------------------- queue */

const jobAntre = (
  r: Pick<RecCompileJobRow, "id" | "seatId" | "board" | "status" | "requestedAt">,
): QueueJob => ({
  id: r.id,
  seatId: r.seatId,
  board: r.board === 2 ? 2 : 1,
  status: r.status,
  requestedAt: r.requestedAt.getTime(),
});

/** Every waiting or running job of a room. */
export async function antreanRuang(db: Db, roomId: number): Promise<QueueJob[]> {
  const rows = await db
    .select({
      id: recCompileJob.id,
      seatId: recCompileJob.seatId,
      board: recCompileJob.board,
      status: recCompileJob.status,
      requestedAt: recCompileJob.requestedAt,
    })
    .from(recCompileJob)
    .where(
      and(eq(recCompileJob.roomId, roomId), inArray(recCompileJob.status, ["antre", "diambil"])),
    );
  return rows.map(jobAntre);
}

/** The median of the room's last 20 good compiles per board type (null before three). */
export async function waktuBiasa(
  db: Db,
  roomId: number,
): Promise<Record<"esp32" | "esp32s3", number | null>> {
  const out = { esp32: null, esp32s3: null } as Record<"esp32" | "esp32s3", number | null>;
  for (const [chip, fqbn] of [
    ["esp32", "esp32:esp32:esp32"],
    ["esp32s3", "esp32:esp32:esp32s3"],
  ] as const) {
    const rows = await db
      .select({ ms: recCompileJob.ms })
      .from(recCompileJob)
      .where(
        and(
          eq(recCompileJob.roomId, roomId),
          eq(recCompileJob.fqbn, fqbn),
          eq(recCompileJob.ok, true),
          sql`${recCompileJob.seatId} is not null`,
        ),
      )
      .orderBy(sql`${recCompileJob.finishedAt} desc`)
      .limit(20);
    out[chip] = typicalMs(rows.map((r) => r.ms ?? 0));
  }
  return out;
}

/** The queue for everyone's eyes: seat numbers only. */
export async function siarkanAntrean(db: Db, roomId: number): Promise<void> {
  const [room] = await db.select().from(recExamRoom).where(eq(recExamRoom.id, roomId)).limit(1);
  if (!room) return;
  const queue = await antreanRuang(db, roomId);
  const numbers = await nomorKursi(db, room);
  const m: PesanUjian = {
    j: "antrean",
    d: { chips: queueChips(queue, numbers, -1), typical: await waktuBiasa(db, roomId) },
  };
  await terbitkan(ruangUjian(roomId), [m as unknown as PesanAliran]);
}

/* ------------------------------------------------------------------ warm-up */

/** One warm-up job per chip the room will build for, so the first real compile of the evening is already warm (9.4). */
export async function hangatkan(db: Db, roomId: number, libsTopik: string[][]): Promise<number> {
  const [ada] = await db
    .select({ id: recCompileJob.id })
    .from(recCompileJob)
    .where(and(eq(recCompileJob.roomId, roomId), sql`${recCompileJob.seatId} is null`))
    .limit(1);
  if (ada) return 0;
  const sets = [[] as string[]];
  for (const l of libsTopik) {
    const k = [...l].sort();
    if (k.length && !sets.some((s) => s.join("|") === k.join("|"))) sets.push(k);
  }
  const header = buildHeader({
    ssid: "warm",
    pass: "warmwarm",
    seatId: 0,
    board: 1,
    token: "warm",
    mqtt: null,
  });
  const rows = (["esp32:esp32:esp32", "esp32:esp32:esp32s3"] as const).flatMap((fqbn) =>
    sets.slice(0, 2).map((libs) => ({
      seatId: null,
      roomId,
      board: 1,
      sketch: DEFAULT_TEMPLATES.mqtt,
      header,
      fqbn,
      libs,
    })),
  );
  await db.insert(recCompileJob).values(rows);
  return rows.length;
}

/* ---------------------------------------------------------------- delivery */

/** Hands the agent the jobs it has room for, after taking back the ones it let sit too long. */
export async function ambilKompilasi(
  db: Db,
  serverId: number,
  edisiId: number,
  free: number,
): Promise<CompileJob[]> {
  const agen = await bacaAgen(db, serverId);
  if (!agen.kompilasi) return [];
  const basi = new Date(Date.now() - KLAIM_BASI_MS);
  await db
    .update(recCompileJob)
    .set({ status: "antre", claimedAt: null, serverId: null, retried: true })
    .where(
      and(
        eq(recCompileJob.status, "diambil"),
        eq(recCompileJob.retried, false),
        sql`${recCompileJob.claimedAt} < ${basi}`,
      ),
    );
  await db
    .update(recCompileJob)
    .set({ status: "gagal", ok: false, kode: "agen_diam", finishedAt: new Date() })
    .where(
      and(
        eq(recCompileJob.status, "diambil"),
        eq(recCompileJob.retried, true),
        sql`${recCompileJob.claimedAt} < ${basi}`,
      ),
    );
  const n = Math.max(0, Math.min(free, 8));
  if (n === 0) return [];
  const claimed = await db.execute(sql`
    UPDATE rec_compile_job SET status = 'diambil', claimed_at = now(), server_id = ${serverId}
    WHERE id IN (
      SELECT id FROM rec_compile_job WHERE status = 'antre'
      ORDER BY requested_at, id FOR UPDATE SKIP LOCKED LIMIT ${n}
    )
    RETURNING id, seat_id, room_id, sketch, header, fqbn, libs
  `);
  const rows =
    (claimed as unknown as { rows?: Record<string, unknown>[] }).rows ??
    (claimed as unknown as Record<string, unknown>[]);
  const out: CompileJob[] = [];
  const env = konsolEnv();
  if (!env) return [];
  for (const r of rows) {
    const id = Number(r.id);
    const seat = r.seat_id === null ? "warm" : Number(r.seat_id);
    const key = kunciLcBin(edisiId, seat, id);
    const t = await tandaiTp(
      { j: "tp-put", k: key, n: 0, s: "", h: 0, e: sekarangDetik() + TP_PUT_DETIK },
      env.secret,
    );
    out.push({
      id,
      sketch: String(r.sketch),
      fqbn: String(r.fqbn),
      header: String(r.header ?? ""),
      libs: (r.libs as string[]) ?? [],
      timeoutS: 120,
      put: { url: `${relayHttps(env.relay)}/tp/unggah`, tiket: t },
    });
    await db.update(recCompileJob).set({ binKey: key }).where(eq(recCompileJob.id, id));
  }
  const rooms = new Set(rows.map((r) => Number(r.room_id)));
  for (const roomId of rooms) await siarkanAntrean(db, roomId);
  return out;
}

const kodeOk = (k: unknown): k is (typeof JOB_KODE)[number] =>
  typeof k === "string" && (JOB_KODE as readonly string[]).includes(k);

/** The agent's results. Returns the ids it applied. */
export async function terimaHasilKompilasi(
  db: Db,
  serverId: number,
  hasil: unknown,
): Promise<number[]> {
  if (!Array.isArray(hasil)) return [];
  const done: number[] = [];
  for (const raw of hasil.slice(0, 50) as Partial<CompileResult>[]) {
    const id = Number(raw?.id);
    if (!Number.isInteger(id)) continue;
    const [job] = await db
      .select()
      .from(recCompileJob)
      .where(and(eq(recCompileJob.id, id), eq(recCompileJob.serverId, serverId)))
      .limit(1);
    if (!job) continue;
    done.push(id);
    if (job.status !== "diambil") continue; // a repeat, or taken back and given to another
    let ok = raw.ok === true;
    let kode: string | null = ok ? null : kodeOk(raw.kode) ? raw.kode : "agen_galat";
    const ms = Number.isFinite(raw.ms) ? Math.max(0, Math.round(Number(raw.ms))) : 0;
    const log = typeof raw.log === "string" ? raw.log.slice(0, 32 * 1024) : "";
    let size: number | null = null;
    let sha: string | null = null;
    if (ok) {
      const bin = raw.bin;
      const head = job.binKey ? await kepala(job.binKey).catch(() => null) : null;
      if (
        !bin ||
        !head?.ada ||
        head.ukuran !== bin.size ||
        head.sha256 !== bin.sha256 ||
        !Number.isInteger(bin.size)
      ) {
        ok = false;
        kode = "agen_galat";
      } else {
        size = bin.size;
        sha = bin.sha256;
      }
    }
    await db
      .update(recCompileJob)
      .set({
        status: ok ? "selesai" : "gagal",
        ok,
        kode,
        log,
        ms,
        binSize: size,
        sha256: sha,
        finishedAt: new Date(),
      })
      .where(and(eq(recCompileJob.id, id), eq(recCompileJob.status, "diambil")));
    if (job.seatId !== null) {
      const run: LcRun = {
        at: Date.now(),
        kind: "compile",
        board: job.board === 2 ? 2 : 1,
        ok,
        ms,
        job: id,
        ...(kode ? { kode } : {}),
      };
      await tambahRun(db, job.seatId, run);
      await terbitkan(ruangUjian(job.roomId), [
        {
          j: "kompilasi",
          s: job.seatId,
          d: { job: id, ok, kode, board: run.board },
        } as unknown as PesanAliran,
      ]);
    }
    await siarkanAntrean(db, job.roomId);
  }
  return done;
}

/** Appends a compile or flash event to the seat's newest 50. */
export async function tambahRun(db: Db, seatId: number, run: LcRun): Promise<void> {
  await db.execute(sql`
    UPDATE rec_livecode
    SET runs = (
      SELECT coalesce(jsonb_agg(e ORDER BY ord), '[]'::jsonb) FROM (
        SELECT e, ord FROM jsonb_array_elements(runs || ${JSON.stringify([run])}::jsonb) WITH ORDINALITY AS t(e, ord)
        ORDER BY ord DESC LIMIT ${RUNS_MAX}
      ) x
    ),
    updated_at = now()
    WHERE seat_id = ${seatId}
  `);
}

/** Is there a job a new protocol agent could take? Used by the heartbeat's pace. */
export async function kompilasiSiaga(db: Db): Promise<boolean> {
  const [r] = await db
    .execute(
      sql`
    SELECT (
      EXISTS (SELECT 1 FROM rec_compile_job WHERE status IN ('antre', 'diambil'))
      OR EXISTS (SELECT 1 FROM rec_mqtt_job WHERE status IN ('antre', 'diambil'))
      OR EXISTS (
        SELECT 1 FROM rec_exam_room
        WHERE state ->> 'stage' = 'spin'
           OR (state ->> 'cur' = 'livecode' AND state ->> 'stage' <> 'finished')
      )
    ) AS siaga
  `,
    )
    .then((x) => ((x as unknown as { rows?: unknown[] }).rows ?? x) as { siaga: boolean }[]);
  return !!r?.siaga;
}

/* -------------------------------------------------------------- MQTT jobs */

export interface MqttKerja {
  id: number;
  op: "set" | "clear";
  ruang?: number;
  akun?: { u: string; p: string }[];
}

/** Queues an account job. The passwords are sealed until the agent takes the job. */
export async function antriMqtt(
  db: Db,
  roomId: number,
  op: "set" | "clear",
  akun: { u: string; p: string }[] = [],
): Promise<void> {
  await db.insert(recMqttJob).values({
    roomId,
    op,
    akun: akun.map((a) => ({ u: a.u, p: bungkus(a.p, a.u, LABEL_JOB) })),
  });
}

export async function ambilMqtt(db: Db, serverId: number): Promise<MqttKerja[]> {
  const agen = await bacaAgen(db, serverId);
  if (!agen.mqtt) return [];
  const basi = new Date(Date.now() - KLAIM_BASI_MS);
  await db
    .update(recMqttJob)
    .set({ status: "antre", claimedAt: null })
    .where(and(eq(recMqttJob.status, "diambil"), sql`${recMqttJob.claimedAt} < ${basi}`));
  const got = await db.execute(sql`
    UPDATE rec_mqtt_job SET status = 'diambil', claimed_at = now()
    WHERE id IN (SELECT id FROM rec_mqtt_job WHERE status = 'antre' ORDER BY requested_at, id FOR UPDATE SKIP LOCKED LIMIT 5)
    RETURNING id, room_id, op, akun
  `);
  const rows =
    (got as unknown as { rows?: Record<string, unknown>[] }).rows ??
    (got as unknown as Record<string, unknown>[]);
  return rows.map((r) => {
    const akun = ((r.akun as { u: string; p: string }[]) ?? [])
      .map((a) => ({ u: a.u, p: buka(a.p, a.u, LABEL_JOB) ?? "" }))
      .filter((a) => a.p);
    return r.op === "clear"
      ? { id: Number(r.id), op: "clear" as const, ruang: Number(r.room_id) }
      : { id: Number(r.id), op: "set" as const, akun };
  });
}

export async function terimaHasilMqtt(db: Db, hasil: unknown): Promise<number[]> {
  if (!Array.isArray(hasil)) return [];
  const done: number[] = [];
  for (const raw of hasil.slice(0, 20) as { id?: unknown; ok?: unknown; kode?: unknown }[]) {
    const id = Number(raw?.id);
    if (!Number.isInteger(id)) continue;
    done.push(id);
    await db
      .update(recMqttJob)
      .set({
        status: raw.ok === true ? "selesai" : "gagal",
        ok: raw.ok === true,
        kode:
          raw.ok === true
            ? null
            : typeof raw.kode === "string"
              ? raw.kode.slice(0, 40)
              : "agen_galat",
        akun: [],
        finishedAt: new Date(),
      })
      .where(and(eq(recMqttJob.id, id), eq(recMqttJob.status, "diambil")));
  }
  return done;
}
