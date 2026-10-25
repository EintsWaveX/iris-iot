/**
 * Compile, flash and the finished image (EXAM-ENGINE 9.4, 9.5), plus the room's
 * Finish for Live Coding (the broker accounts go, the traffic log is kept).
 *
 * POST lc-compile  { board, code, rev }                 queue a job for the PC agent
 * POST lc-flash    { job, ok, ms, chip, kode? }         what the browser's flash did
 * GET  lc-bin?job=                                      302 to a 10 minute link to the image
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { SessionPayload } from "../../src/lib/auth.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, noStore } from "./http.js";
import {
  recCompileJob,
  recExamRoom,
  recLcTopic,
  recLivecode,
  type RecCompileJobRow,
} from "../../src/lib/schema.js";
import { answerOpen } from "../../src/lib/recruitment/room.js";
import { checkHeader, checkSketch } from "../../src/lib/recruitment/lc-sketch.js";
import { CODE_MAX, FQBN, type LcBoard, type LcRun } from "../../src/lib/recruitment/lc-types.js";
import { kunciLcTraffic } from "../../src/lib/recruitment/lc-r2.js";
import { positionOf } from "../../src/lib/recruitment/lc-queue.js";
import type { CompileReply } from "../../src/lib/recruitment/lc-api.js";
import { tolak, type Db } from "./recruitment-data.js";
import {
  faseLc,
  gatewaySecret,
  headerPapan,
  muatKonteksSeat,
  rencanaRuang,
  tolakLc,
  type KonteksLc,
} from "./recruitment-lc-common.js";
import { antreanRuang, siarkanAntrean, tambahRun, antriMqtt } from "./recruitment-lc-agent.js";
import { simpan, urlBaca } from "./tp-simpan.js";

const kodeFlash = /^[a-z_]{1,30}$/;

/** The room is in Live Coding with this seat's time still running (or in its grace). */
function editorTerbuka(c: KonteksLc): string | null {
  const fase = faseLc(c.room.state, c.now);
  if (fase === "belum" || fase === "spin") return "belum_dibuka";
  if (fase === "selesai") return "ruang_selesai";
  return answerOpen(c.room.state, c.seat.id, "livecode", c.now) ? null : "waktu_habis";
}

export async function aksiKompilasi(
  req: ApiRequest,
  res: ApiResponse,
  s: SessionPayload,
  aksi: string,
) {
  const c = await muatKonteksSeat(req, res, s);
  if (!c) return;
  noStore(res);
  if (aksi === "lc-compile") return kompilasi(c, req, res);
  if (aksi === "lc-flash") return flash(c, req, res);
  if (aksi === "lc-bin") return citra(c, req, res);
  tolak(res, "aksi_tidak_dikenal", 404);
}

async function kompilasi(c: KonteksLc, req: ApiRequest, res: ApiResponse) {
  const b = jsonBody(req);
  const tutup = editorTerbuka(c);
  if (tutup) return void tolakLc(res, tutup);
  const lc = c.lc;
  if (!lc?.protocol || !lc.topicId) return void tolakLc(res, "belum_diundi");
  const n = Number(b.board);
  const papan = lc.boards.find((x) => x.n === n);
  if (!papan) return void tolak(res, "data_salah", 400, { field: "board" });
  const code = typeof b.code === "string" ? b.code : null;
  if (code === null) return void tolak(res, "data_salah", 400, { field: "code" });
  if (code.length > CODE_MAX * 2) return void tolak(res, "terlalu_besar", 400);
  const cek = checkSketch(code);
  if (!cek.ok) return void tolak(res, cek.kode, 400, { rinci: cek.detail });
  if (lc.protocol !== "ble" && !gatewaySecret())
    return void tolak(res, "gateway_belum_diatur", 503);
  if (!Number.isInteger(b.rev) || b.rev !== papan.rev)
    return void tolak(res, "versi_lama", 409, { rev: papan.rev });

  const rencana = await rencanaRuang(c.db, c.room);
  const header = await headerPapan(
    { room: c.room, slot: c.slot, lc, seat: c.seat },
    rencana,
    papan.n,
  );
  const aman = checkHeader(header);
  if (!aman.ok) return void tolak(res, aman.kode, 500);
  const [topik] = await c.db
    .select()
    .from(recLcTopic)
    .where(eq(recLcTopic.id, lc.topicId))
    .limit(1);
  const libs = topik?.libs ?? [];

  const hasil = await c.db.transaction(async (tx) => {
    // The seat row is the lock: two presses at once cannot make two jobs
    const [baris] = await tx
      .select()
      .from(recLivecode)
      .where(eq(recLivecode.seatId, c.seat.id))
      .for("update");
    const boards = baris.boards.map((x): LcBoard =>
      x.n === papan.n && x.code !== code ? { ...x, code, rev: x.rev + 1 } : x,
    );
    const now = boards.find((x) => x.n === papan.n)!;
    await tx
      .update(recLivecode)
      .set({ boards, updatedAt: new Date() })
      .where(eq(recLivecode.seatId, c.seat.id));
    const [ada] = await tx
      .select()
      .from(recCompileJob)
      .where(
        and(
          eq(recCompileJob.seatId, c.seat.id),
          eq(recCompileJob.board, papan.n),
          sql`${recCompileJob.status} in ('antre','diambil')`,
        ),
      )
      .for("update");
    if (ada?.status === "diambil") return { kode: "sedang_jalan" as const };
    if (ada) {
      // Still waiting: the sketch is replaced and the place in line is kept
      await tx
        .update(recCompileJob)
        .set({ sketch: code, header, fqbn: FQBN[papan.chip], libs })
        .where(eq(recCompileJob.id, ada.id));
      return { job: ada.id, rev: now.rev };
    }
    const [baru] = await tx
      .insert(recCompileJob)
      .values({
        seatId: c.seat.id,
        roomId: c.room.id,
        board: papan.n,
        sketch: code,
        header,
        fqbn: FQBN[papan.chip],
        libs,
      })
      .returning();
    return { job: baru.id, rev: now.rev };
  });
  if (hasil.kode) return void tolak(res, hasil.kode, 409);
  const antre = await antreanRuang(c.db, c.room.id);
  const reply: CompileReply = {
    ok: true,
    job: hasil.job!,
    position: positionOf(antre, hasil.job!) ?? 1,
    rev: hasil.rev!,
  };
  res.status(200).json(reply);
  void siarkanAntrean(c.db, c.room.id).catch(() => undefined);
}

async function flash(c: KonteksLc, req: ApiRequest, res: ApiResponse) {
  const b = jsonBody(req);
  const id = Number(b.job);
  if (!Number.isInteger(id)) return void tolak(res, "data_salah", 400, { field: "job" });
  const [job] = await c.db
    .select()
    .from(recCompileJob)
    .where(and(eq(recCompileJob.id, id), eq(recCompileJob.seatId, c.seat.id)))
    .limit(1);
  if (!job) return void tolak(res, "tidak_ditemukan", 404);
  if (c.room.state.stage === "finished") return void tolakLc(res, "ruang_selesai");
  if (typeof b.ok !== "boolean") return void tolak(res, "data_salah", 400, { field: "ok" });
  const ms = Number(b.ms);
  const kode = typeof b.kode === "string" && kodeFlash.test(b.kode) ? b.kode : undefined;
  const chip = typeof b.chip === "string" && b.chip.length <= 20 ? b.chip : undefined;
  const run: LcRun = {
    at: Date.now(),
    kind: "flash",
    board: job.board === 2 ? 2 : 1,
    ok: b.ok,
    ms: Number.isFinite(ms) ? Math.max(0, Math.min(10 * 60_000, Math.round(ms))) : 0,
    job: id,
    ...(kode ? { kode } : {}),
    ...(chip ? { chip } : {}),
  };
  await tambahRun(c.db, c.seat.id, run);
  res.status(200).json({ ok: true });
}

async function citra(c: KonteksLc, req: ApiRequest, res: ApiResponse) {
  const id = Number(req.query.job);
  if (!Number.isInteger(id)) return void tolak(res, "data_salah", 400, { field: "job" });
  const [job] = await c.db
    .select()
    .from(recCompileJob)
    .where(and(eq(recCompileJob.id, id), eq(recCompileJob.seatId, c.seat.id)))
    .limit(1);
  if (!job || !job.ok || !job.binKey) return void tolak(res, "tidak_ditemukan", 404);
  const url = await urlBaca({
    kunci: job.binKey,
    nama: `s${c.seat.id}-papan${job.board}.bin`,
    mime: "application/octet-stream",
    unduh: true,
  });
  res.setHeader("location", url);
  res.status(302).end();
}

/* ------------------------------------------------------------------ finish */

/** The last job of a seat's board that compiled, or null. */
export async function jobTerakhir(
  db: Db,
  seatId: number,
  board: number,
): Promise<RecCompileJobRow | null> {
  const [j = null] = await db
    .select()
    .from(recCompileJob)
    .where(
      and(
        eq(recCompileJob.seatId, seatId),
        eq(recCompileJob.board, board),
        eq(recCompileJob.ok, true),
      ),
    )
    .orderBy(desc(recCompileJob.id))
    .limit(1);
  return j;
}

/**
 * Finish of the room (the `lc-close` effect): the exam's broker accounts are
 * deleted, the gateway room is closed, and each seat's traffic goes to R2.
 * Best effort: the room finishes whatever the gateway does.
 */
export async function tutupLc(db: Db, roomId: number): Promise<void> {
  const [room] = await db.select().from(recExamRoom).where(eq(recExamRoom.id, roomId)).limit(1);
  if (!room) return;
  try {
    await antriMqtt(db, roomId, "clear");
  } catch (e) {
    console.error("[lc] clearing broker accounts:", e);
  }
  const secret = gatewaySecret();
  if (!secret) return;
  const base = (process.env.REC_GATEWAY_URL?.trim() || "https://ws.irisiotlab.com").replace(
    /\/+$/,
    "",
  );
  try {
    const r = await fetch(`${base}/rec/admin/${roomId}/tutup`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`gateway answered ${r.status}`);
    const { seats } = (await r.json()) as { seats?: Record<string, string> };
    for (const [seatId, jsonl] of Object.entries(seats ?? {})) {
      const id = Number(seatId);
      if (!Number.isInteger(id) || id <= 0 || !jsonl) continue;
      const key = kunciLcTraffic(room.editionId, id);
      await simpan(key, new TextEncoder().encode(jsonl), "text/plain");
      await db.update(recLivecode).set({ trafficKey: key }).where(eq(recLivecode.seatId, id));
    }
  } catch (e) {
    console.error("[lc] keeping the traffic log:", e);
  }
}
