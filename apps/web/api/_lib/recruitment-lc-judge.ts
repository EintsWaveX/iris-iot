/**
 * The PC agent's judge (B7.3, 30 Oct 2026): Run Sample, Submit and the Akademik's
 * reference check for Live Coding in C. Jobs are handed out on the heartbeat and
 * answered on the next one (or at once), exactly like the compile queue, and
 * everything here is idempotent: an answer that arrives twice, or for a job that
 * was handed back, changes nothing the second time.
 *
 * What the agent holds and what it does not: it gets the code, the limits and the
 * test INPUTS. It never sees an expected output. It reports how each test ended
 * and what the program printed, and this module decides accepted or wrong with the
 * same compare the unit tests pin (c-problem.ts). A broken or lying agent can only
 * lower a score, never raise one.
 */
import { and, eq, gt, lt, sql } from "drizzle-orm";
import {
  recCProblem,
  recCSubmission,
  recExamRoom,
  recSlot,
  server,
  type RecCSubmissionRow,
} from "../../src/lib/schema.js";
import { dalamJendelaTesTulis } from "../../src/lib/server-lib.js";
import {
  CODE_MAX_BYTES,
  outcomeOf,
  passedOf,
  type AgentAnswer,
  type CSample,
  type CTest,
} from "../../src/lib/recruitment/c-problem.js";
import { ruangUjian } from "../../src/lib/recruitment/room-relay.js";
import type { PesanAliran } from "../../src/lib/aliran.js";
import { kirimRelay, terbitkan } from "./aliran.js";
import type { Db } from "./recruitment-data.js";
/** A job claimed and unanswered this long goes back once, then fails agen_diam (9.4) */
export const KLAIM_BASI_MS = 180_000;

/** The protocol of the agent build that can judge (it reports `judge: true`) */
export const PROTOKOL_JUDGE = 10;

/** What the agent is handed for one job. */
export interface JudgeJob {
  id: number;
  code: string;
  timeMs: number;
  memKb: number;
  /** One stdin per test, in order */
  inputs: string[];
}

export async function agenBisaJudge(db: Db, serverId: number): Promise<boolean> {
  const [r] = await db
    .select({ info: server.infoSistem })
    .from(server)
    .where(eq(server.id, serverId))
    .limit(1);
  const info = (r?.info ?? {}) as Record<string, unknown>;
  return (
    typeof info.protokol === "number" && info.protokol >= PROTOKOL_JUDGE && info.judge === true
  );
}

/**
 * Is a Tes Tulis room open (check-in, a part running or the Live Coding draw)? Then the lab PC beats
 * every few seconds even before anything is queued, so the first Run or Submit is claimed at once
 * instead of waiting out the idle beat, quiet hours included (2026-11-07: a test past midnight left
 * a Submit "in the queue" for minutes).
 */
export async function ujianBuka(db: Db): Promise<boolean> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recExamRoom)
    .where(sql`${recExamRoom.state}->>'stage' in ('prep', 'parts', 'spin')`);
  return (r?.n ?? 0) > 0;
}

/**
 * Is a Tes Tulis slot's window on right now? The window is the slot's own start and end with a margin
 * either side (server-lib.ts), found by itself from the slot times, so a day whose sessions are all
 * another test (Wawancara, Tubes, ...) never counts. Only the lab PC's judge needs the quick beat.
 */
export async function tesTulisJalan(db: Db, now = Date.now()): Promise<boolean> {
  // One day either way is a cheap pre-filter; the margins themselves are checked in dalamJendelaTesTulis.
  const hari = 24 * 3600_000;
  const slots = await db
    .select({ startsAt: recSlot.startsAt, endsAt: recSlot.endsAt })
    .from(recSlot)
    .where(
      and(
        eq(recSlot.stage, "tes_tulis"),
        gt(recSlot.endsAt, new Date(now - hari)),
        lt(recSlot.startsAt, new Date(now + hari)),
      ),
    );
  return dalamJendelaTesTulis(slots, now);
}

/**
 * The most tests at once the exam settings allow the judge: the `workers` of the edition whose job has
 * waited longest. Null when that job belongs to no room (a reference check) or nothing waits, then the
 * lab PC's own number rules. It can only lower what the lab PC offers, never raise it.
 */
export async function kapJudgeConfig(db: Db): Promise<number | null> {
  const hasil = await db.execute(sql`
    SELECT (ec.config -> 'livecode' ->> 'workers')::int AS w
    FROM rec_c_submission s
    JOIN rec_exam_room r ON r.id = s.room_id
    JOIN rec_exam_config ec ON ec.edition_id = r.edition_id
    WHERE s.status = 'antre'
    ORDER BY s.requested_at, s.id
    LIMIT 1
  `);
  // The driver hands back either { rows } or the bare array (the real one and the test fake differ)
  const raw = hasil as unknown as { rows?: { w: number | null }[] } | { w: number | null }[];
  const w = (Array.isArray(raw) ? raw : (raw.rows ?? []))[0]?.w;
  return typeof w === "number" && Number.isInteger(w) && w >= 1 ? w : null;
}

/** Is anything waiting or running? The heartbeat shortens while it is. */
export async function judgeSiaga(db: Db): Promise<boolean> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recCSubmission)
    .where(sql`${recCSubmission.status} in ('antre', 'diambil')`);
  return (r?.n ?? 0) > 0;
}

const testsOf = (kind: RecCSubmissionRow["kind"], p: { samples: CSample[]; tests: CTest[] }) =>
  kind === "run" ? p.samples : p.tests;

/** A job still waiting this long after its room finished goes down with `judge_mati` (the lab PC never came back). */
export const JUDGE_TUNGGU_USAI_MS = 15 * 60_000;

/**
 * Takes back a claimed job that sat too long (once) and fails it the second time. Runs on every
 * heartbeat, and also from the score reads and the Judge card, since a dead PC sends no heartbeat.
 */
export async function sapuKlaim(db: Db, now = Date.now()): Promise<void> {
  const basi = new Date(now - KLAIM_BASI_MS).toISOString();
  await db.execute(sql`
    UPDATE rec_c_submission SET status = 'antre', claimed_at = NULL, server_id = NULL, retried = true
    WHERE status = 'diambil' AND retried = false AND claimed_at < ${basi}::timestamptz
  `);
  await db.execute(sql`
    UPDATE rec_c_submission SET status = 'gagal', kode = 'agen_diam', finished_at = now()
    WHERE status = 'diambil' AND retried = true AND claimed_at < ${basi}::timestamptz
  `);
}

/**
 * Fails the jobs of finished rooms that are still waiting for a judge that is not there, so the
 * scores stop waiting for them and Finalkan is not held up for ever. `paksa` skips the grace time
 * (the Panitia pressing Tutup Antrean); `roomId` limits it to one room. Returns how many it failed.
 */
export async function sapuJudgeMati(
  db: Db,
  opt: { now?: number; roomId?: number; paksa?: boolean } = {},
): Promise<number> {
  const now = opt.now ?? Date.now();
  const batas = opt.paksa ? now : now - JUDGE_TUNGGU_USAI_MS;
  const hasil = await db.execute(sql`
    UPDATE rec_c_submission s SET status = 'gagal', kode = 'judge_mati', finished_at = now()
    FROM rec_exam_seat k JOIN rec_exam_room r ON r.id = k.room_id
    WHERE s.seat_id = k.id AND s.status IN ('antre', 'diambil')
      AND r.state ->> 'stage' = 'finished'
      AND (r.state ->> 'finishedAt')::bigint <= ${batas}
      ${opt.roomId ? sql`AND r.id = ${opt.roomId}` : sql``}
    RETURNING s.id
  `);
  const rows = (hasil as { rows?: unknown[] } | unknown[] | undefined) ?? [];
  const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
  return list.length;
}

/** Takes back what sat too long (once), fails what sat too long twice, then claims up to `free` waiting jobs. */
export async function ambilJudge(db: Db, serverId: number, free: number): Promise<JudgeJob[]> {
  if (!(await agenBisaJudge(db, serverId))) return [];
  await sapuKlaim(db);
  const n = Math.max(0, Math.min(Math.floor(free), 8));
  if (n === 0) return [];
  // MATERIALIZED: a plain IN (subselect with LIMIT) may be run again per row and claim more than n
  const claimed = await db.execute(sql`
    WITH pilih AS MATERIALIZED (
      SELECT id FROM rec_c_submission WHERE status = 'antre'
      ORDER BY requested_at, id FOR UPDATE SKIP LOCKED LIMIT ${n}
    )
    UPDATE rec_c_submission SET status = 'diambil', claimed_at = now(), server_id = ${serverId}
    WHERE id IN (SELECT id FROM pilih)
    RETURNING id, kind, problem_id, code
  `);
  const rows =
    (claimed as unknown as { rows?: Record<string, unknown>[] }).rows ??
    (claimed as unknown as Record<string, unknown>[]);
  const out: JudgeJob[] = [];
  for (const r of rows) {
    const id = Number(r.id);
    const [p] = await db
      .select({
        limits: recCProblem.limits,
        samples: recCProblem.samples,
        tests: recCProblem.tests,
      })
      .from(recCProblem)
      .where(eq(recCProblem.id, Number(r.problem_id)))
      .limit(1);
    if (!p) {
      await db
        .update(recCSubmission)
        .set({ status: "gagal", kode: "soal_hilang", finishedAt: new Date() })
        .where(eq(recCSubmission.id, id));
      continue;
    }
    out.push({
      id,
      code: String(r.code),
      timeMs: p.limits.timeMs,
      memKb: p.limits.memKb,
      inputs: testsOf(r.kind as RecCSubmissionRow["kind"], p).map((t) => t.input),
    });
  }
  return out;
}

const isAnswer = (a: unknown): a is AgentAnswer =>
  typeof a === "object" && a !== null && Number.isInteger((a as { id?: unknown }).id);

/** The agent's answers. Returns the ids it knows about (applied or repeats). */
export async function terimaHasilJudge(
  db: Db,
  serverId: number,
  hasil: unknown,
): Promise<number[]> {
  if (!Array.isArray(hasil)) return [];
  const done: number[] = [];
  for (const raw of hasil.slice(0, 50)) {
    if (!isAnswer(raw)) continue;
    const [job] = await db
      .select()
      .from(recCSubmission)
      .where(and(eq(recCSubmission.id, raw.id), eq(recCSubmission.serverId, serverId)))
      .limit(1);
    if (!job) continue;
    done.push(job.id);
    if (job.status !== "diambil") continue; // a repeat, or taken back and given to another
    const [p] = await db
      .select()
      .from(recCProblem)
      .where(eq(recCProblem.id, job.problemId))
      .limit(1);
    if (!p) continue;
    const expected = testsOf(job.kind, p).map((t) => t.output);
    const outcome = outcomeOf(expected, raw);
    const passed = passedOf(outcome.verdicts);
    const won = await db
      .update(recCSubmission)
      .set({
        status: "selesai",
        outcome,
        passed,
        total: expected.length,
        finishedAt: new Date(),
      })
      .where(and(eq(recCSubmission.id, job.id), eq(recCSubmission.status, "diambil")))
      .returning({ id: recCSubmission.id });
    if (won.length && job.seatId !== null && job.roomId !== null) {
      // Tell the seat its verdicts are in; a lost message only means it reads them on its next poll
      await terbitkan(ruangUjian(job.roomId), [
        { j: "judge", s: job.seatId, d: { job: job.id } } as unknown as PesanAliran,
      ]).catch(() => undefined);
      // The room's judge tabs list the verdicts too; they do not ride the seat socket.
      await kirimRelay(["recjudge"]).catch(() => undefined);
    }
    if (job.kind === "check" && won.length) {
      await db
        .update(recCProblem)
        .set({ checkedAt: new Date(), checkOk: outcome.compile.ok && passed === expected.length })
        .where(eq(recCProblem.id, job.problemId));
    }
  }
  return done;
}

/* ----------------------------------------------------------------- sending */

export type KirimGalat = "kode_kosong" | "kode_terlalu_besar" | "soal_tidak_ada" | "batas_run";

export interface KirimIn {
  kind: RecCSubmissionRow["kind"];
  seatId: number | null;
  roomId: number | null;
  problemId: number;
  code: string;
  /** 0 means no limit (the default): the most Run Sample or Submit rows one seat may send per problem */
  runLimit: number;
}

/**
 * Queues a Run Sample, a Submit or a reference check. While a seat's earlier
 * job of the same kind for the same problem is still waiting, the new code
 * replaces it, so a seat never has two waiting and cannot crowd the queue.
 */
export async function kirimKode(
  db: Db,
  i: KirimIn,
): Promise<{ ok: true; id: number; replaced: boolean } | { ok: false; kode: KirimGalat }> {
  if (!i.code.trim()) return { ok: false, kode: "kode_kosong" };
  if (Buffer.byteLength(i.code, "utf8") > CODE_MAX_BYTES)
    return { ok: false, kode: "kode_terlalu_besar" };
  const [p] = await db
    .select({ id: recCProblem.id })
    .from(recCProblem)
    .where(eq(recCProblem.id, i.problemId))
    .limit(1);
  if (!p) return { ok: false, kode: "soal_tidak_ada" };
  const same = and(
    i.seatId === null ? sql`${recCSubmission.seatId} is null` : eq(recCSubmission.seatId, i.seatId),
    eq(recCSubmission.problemId, i.problemId),
    eq(recCSubmission.kind, i.kind),
  );
  const waiting = await db
    .update(recCSubmission)
    .set({ code: i.code })
    .where(and(same, eq(recCSubmission.status, "antre")))
    .returning({ id: recCSubmission.id });
  if (waiting.length) return { ok: true, id: waiting[0].id, replaced: true };
  if (i.runLimit > 0 && i.seatId !== null) {
    const [c] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(recCSubmission)
      .where(same);
    if ((c?.n ?? 0) >= i.runLimit) return { ok: false, kode: "batas_run" };
  }
  const [row] = await db
    .insert(recCSubmission)
    .values({
      kind: i.kind,
      seatId: i.seatId,
      roomId: i.roomId,
      problemId: i.problemId,
      code: i.code,
    })
    .returning({ id: recCSubmission.id });
  return { ok: true, id: row.id, replaced: false };
}
