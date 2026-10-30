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
import { and, eq, sql } from "drizzle-orm";
import {
  recCProblem,
  recCSubmission,
  server,
  type RecCSubmissionRow,
} from "../../src/lib/schema.js";
import {
  CODE_MAX_BYTES,
  outcomeOf,
  passedOf,
  type AgentAnswer,
  type CSample,
  type CTest,
} from "../../src/lib/recruitment/c-problem.js";
import type { Db } from "./recruitment-data.js";
import { KLAIM_BASI_MS } from "./recruitment-lc-agent.js";

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

/** Takes back what sat too long (once), fails what sat too long twice, then claims up to `free` waiting jobs. */
export async function ambilJudge(db: Db, serverId: number, free: number): Promise<JudgeJob[]> {
  if (!(await agenBisaJudge(db, serverId))) return [];
  const basi = new Date(Date.now() - KLAIM_BASI_MS);
  await db
    .update(recCSubmission)
    .set({ status: "antre", claimedAt: null, serverId: null, retried: true })
    .where(
      and(
        eq(recCSubmission.status, "diambil"),
        eq(recCSubmission.retried, false),
        sql`${recCSubmission.claimedAt} < ${basi}`,
      ),
    );
  await db
    .update(recCSubmission)
    .set({ status: "gagal", kode: "agen_diam", finishedAt: new Date() })
    .where(
      and(
        eq(recCSubmission.status, "diambil"),
        eq(recCSubmission.retried, true),
        sql`${recCSubmission.claimedAt} < ${basi}`,
      ),
    );
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
