/**
 * Live Coding in C, the seat's side (B7.4, 30 Oct 2026): `GET lcc` returns the
 * hand the seat was dealt and what it has sent, `POST lcc-send` queues a Run
 * Sample or a Submit for the judge (recruitment-lc-judge.ts). Time and room
 * state are the same as for the written parts: the hand is dealt when the room
 * enters the spin and kept on the seat, so editing the pool mid-exam never
 * changes what a seat already holds.
 *
 * Nothing here returns a hidden test, an expected output or the reference
 * solution: a problem leaves as its public part plus the NUMBER of hidden tests.
 */
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { SessionPayload } from "../../src/lib/auth.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, noStore } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import {
  praktikan,
  recAccount,
  recCandidate,
  recCProblem,
  recCSubmission,
  recExamSeat,
  server,
} from "../../src/lib/schema.js";
import { DrawShort, drawProblems, drawSeed } from "../../src/lib/recruitment/draw.js";
import { livecodeResult } from "../../src/lib/recruitment/c-problem.js";
import { capsOf } from "../../src/lib/recruitment/exam-config.js";
import {
  stateOf,
  type LccProblem,
  type LccRoom,
  type LccRoomSeat,
  type LccSelf,
  type LccSendReply,
  type SubRow,
} from "../../src/lib/recruitment/lcc-api.js";
import { tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { muatPelaku } from "./recruitment-rights.js";
import { namaKandidat } from "./recruitment-akun.js";
import { ruangDinilai } from "./recruitment-lc-grade.js";
import { bacaConfig } from "./recruitment-room.js";
import {
  faseLc,
  muatGaram,
  muatKonteksSeat,
  nomorKursi,
  tolakLc,
  type KonteksLc,
} from "./recruitment-lc-common.js";
import { kirimKode } from "./recruitment-lc-judge.js";

const KINDS = new Set(["run", "submit"]);

export async function handleLcc(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const aksi = String(req.query.aksi ?? "");
  if (aksi === "lcc-room") return bacaRuang(req, res, s);
  const c = await muatKonteksSeat(req, res, s);
  if (!c) return;
  noStore(res);
  const fase = faseLc(c.room.state, c.now);
  if (fase === "belum") return void tolakLc(res, "belum_dibuka");
  if (fase === "selesai") return void tolakLc(res, "ruang_selesai");
  if (fase === "usai") return void tolakLc(res, "ruang_selesai");
  if (aksi === "lcc") return bacaLcc(c, fase, res);
  if (aksi === "lcc-send") return kirim(c, fase, req, res);
  tolak(res, "aksi_tidak_dikenal", 404);
}

/* ------------------------------------------------------------------- deal */

type Dealt = { at: number; room: number; problems: number[] };

/** The seat's hand, dealt on first read and kept; null when the pool is too small to deal one. */
async function tanganKursi(c: KonteksLc): Promise<number[] | null> {
  const have = (c.seat.draw as { livecode?: Dealt }).livecode;
  if (have?.problems?.length) return have.problems;
  const pool = await c.db
    .select({ id: recCProblem.id, tier: recCProblem.tier })
    .from(recCProblem)
    .where(
      and(
        eq(recCProblem.editionId, c.edisiId),
        eq(recCProblem.status, "ready"),
        eq(recCProblem.checkOk, true),
      ),
    );
  let ids: number[];
  try {
    ids = drawProblems(
      await drawSeed(await muatGaram(c.db, c.edisiId), c.seat.id, "livecode"),
      c.config.livecode.draw,
      pool,
    );
  } catch (e) {
    if (e instanceof DrawShort) return null;
    throw e;
  }
  const dealt: Dealt = { at: Date.now(), room: c.room.id, problems: ids };
  // Only the first writer wins: two tabs reading at once must not deal two hands.
  await c.db
    .update(recExamSeat)
    .set({
      draw: sql`jsonb_set(${recExamSeat.draw}, '{livecode}', ${JSON.stringify(dealt)}::jsonb)`,
    })
    .where(and(eq(recExamSeat.id, c.seat.id), sql`${recExamSeat.draw} -> 'livecode' is null`));
  // A real seat holding a problem locks its tests, like a question's structure (rehearsals do not)
  if (!c.seat.rehearsal)
    await c.db
      .update(recCProblem)
      .set({ shownAt: new Date() })
      .where(and(inArray(recCProblem.id, ids), isNull(recCProblem.shownAt)));
  const [fresh] = await c.db
    .select({ draw: recExamSeat.draw })
    .from(recExamSeat)
    .where(eq(recExamSeat.id, c.seat.id))
    .limit(1);
  return (fresh?.draw as { livecode?: Dealt } | undefined)?.livecode?.problems ?? ids;
}

/* ------------------------------------------------------------------- read */

async function judgeSiap(db: Db, now = Date.now()): Promise<boolean> {
  const [r] = await db
    .select({ id: server.id })
    .from(server)
    .where(
      and(
        sql`${server.infoSistem} -> 'judge' = 'true'::jsonb`,
        gt(server.kondisiPada, new Date(now - 120_000)),
      ),
    )
    .limit(1);
  return !!r;
}

async function bacaLcc(c: KonteksLc, fase: "spin" | "kerja", res: ApiResponse) {
  const ids = await tanganKursi(c);
  if (!ids) return void tolak(res, "soal_kurang", 503);
  const rows = await c.db.select().from(recCProblem).where(inArray(recCProblem.id, ids));
  const by = new Map(rows.map((r) => [r.id, r]));
  const hand: LccProblem[] = ids.flatMap((id) => {
    const p = by.get(id);
    if (!p) return [];
    const { statement, input, output, en, starter } = p.body;
    return [
      {
        id,
        title: p.title,
        tier: p.tier,
        points: c.config.livecode.points[p.tier],
        text: { statement, input, output },
        ...(en ? { en } : {}),
        samples: p.samples,
        starter,
        tests: p.tests.length,
        limits: p.limits,
      },
    ];
  });
  const subs = await c.db
    .select()
    .from(recCSubmission)
    .where(and(eq(recCSubmission.seatId, c.seat.id), inArray(recCSubmission.problemId, ids)))
    .orderBy(desc(recCSubmission.id));
  // Place in the room's queue: how many waiting jobs were asked for before this one (by time, then id)
  const waiting = await c.db
    .select({ id: recCSubmission.id })
    .from(recCSubmission)
    .where(sql`${recCSubmission.status} in ('antre', 'diambil')`)
    .orderBy(recCSubmission.requestedAt, recCSubmission.id);
  const place = new Map(waiting.map((w, i) => [w.id, i + 1]));
  const { state, total } = stateOf(
    hand.map((h) => ({ id: h.id, points: h.points })),
    subs as SubRow[],
    (id) => place.get(id) ?? null,
  );
  const body: LccSelf = {
    fase,
    hand,
    state,
    total,
    cap: capsOf(c.config).livecode,
    minutes: c.config.livecode.minutes,
    judgeReady: await judgeSiap(c.db, c.now),
  };
  res.status(200).json({ ok: true, ...body });
}

/* ------------------------------------------------------------------- send */

async function kirim(c: KonteksLc, fase: "spin" | "kerja", req: ApiRequest, res: ApiResponse) {
  if (fase !== "kerja") return void tolakLc(res, "belum_dibuka");
  const b = jsonBody(req);
  const problemId = Number(b.problemId);
  const kind = String(b.kind);
  const code = typeof b.code === "string" ? b.code : null;
  if (!Number.isInteger(problemId))
    return void tolak(res, "data_salah", 400, { field: "problemId" });
  if (!KINDS.has(kind)) return void tolak(res, "data_salah", 400, { field: "kind" });
  if (code === null) return void tolak(res, "data_salah", 400, { field: "code" });
  const ids = await tanganKursi(c);
  if (!ids?.includes(problemId)) return void tolak(res, "soal_bukan_milikmu", 403);
  const r = await kirimKode(c.db, {
    kind: kind as "run" | "submit",
    seatId: c.seat.id,
    roomId: c.room.id,
    problemId,
    code,
    runLimit: c.config.livecode.runLimit,
  });
  if (!r.ok) {
    const status = r.kode === "batas_run" ? 429 : r.kode === "kode_terlalu_besar" ? 413 : 400;
    return void tolak(res, r.kode, status);
  }
  const reply: LccSendReply = { id: r.id, replaced: r.replaced };
  res.status(200).json({ ok: true, ...reply });
}

/* -------------------------------------------------------- the staff's room view */

async function bacaRuang(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  noStore(res);
  if (s.role !== "asisten") return void tolak(res, "tanpa_hak", 403);
  const p = await muatPelaku(db, edisi.id, s.nim);
  const room = await ruangDinilai(db, edisi.id, Number(req.query.id), p, s.nim);
  if (!room) return void tolak(res, "tanpa_hak", 403);
  const config = await bacaConfig(db, edisi.id);
  const seats = await db.select().from(recExamSeat).where(eq(recExamSeat.roomId, room.id));
  const ids = seats.map((x) => x.id);
  const [nomor, kand, problems, subs, queue] = await Promise.all([
    nomorKursi(db, room),
    ids.length
      ? db
          .select({ id: recCandidate.id, nama: namaKandidat })
          .from(recCandidate)
          .leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))
          .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
          .where(
            inArray(
              recCandidate.id,
              seats.map((x) => x.candidateId),
            ),
          )
      : [],
    db
      .select({ id: recCProblem.id, title: recCProblem.title, tier: recCProblem.tier })
      .from(recCProblem)
      .where(eq(recCProblem.editionId, edisi.id)),
    ids.length ? db.select().from(recCSubmission).where(inArray(recCSubmission.seatId, ids)) : [],
    db
      .select({ status: recCSubmission.status, n: sql<number>`count(*)::int` })
      .from(recCSubmission)
      .where(sql`${recCSubmission.status} in ('antre', 'diambil')`)
      .groupBy(recCSubmission.status),
  ]);
  const nama = new Map(kand.map((k) => [k.id, k.nama ?? ""]));
  const info = new Map(problems.map((x) => [x.id, x]));
  const out: LccRoomSeat[] = seats.map((seat) => {
    const dealt = (seat.draw as { livecode?: { problems?: number[] } }).livecode?.problems ?? [];
    const mine = subs.filter((x) => x.seatId === seat.id);
    const hand = dealt.flatMap((id) => {
      const pr = info.get(id);
      return pr
        ? [{ problemId: id, points: config.livecode.points[pr.tier], title: pr.title }]
        : [];
    });
    const live = livecodeResult(
      hand.map((h) => ({
        problemId: h.problemId,
        points: h.points,
        runs: mine
          .filter(
            (x) =>
              x.problemId === h.problemId &&
              x.kind === "submit" &&
              x.status === "selesai" &&
              x.total,
          )
          .map((x) => ({
            passed: x.passed ?? 0,
            total: x.total ?? 0,
            at: x.requestedAt.getTime(),
          })),
      })),
    );
    return {
      seatId: seat.id,
      no: nomor.get(seat.candidateId) ?? null,
      nama: nama.get(seat.candidateId) ?? "",
      dealt: dealt.length > 0,
      problems: live.problems.map((pr, i) => ({
        problemId: pr.problemId,
        title: hand[i].title,
        points: pr.points,
        got: pr.got,
        passed: pr.best?.passed ?? null,
        total: pr.best?.total ?? null,
      })),
      got: live.total,
      waiting: mine.filter((x) => x.status === "antre" || x.status === "diambil").length,
      lastAt: mine.length ? Math.max(...mine.map((x) => x.requestedAt.getTime())) : null,
    };
  });
  const body: LccRoom = {
    judgeReady: await judgeSiap(db),
    queue: {
      waiting: queue.find((q) => q.status === "antre")?.n ?? 0,
      running: queue.find((q) => q.status === "diambil")?.n ?? 0,
    },
    cap: capsOf(config).livecode,
    seats: out.sort((a, b) => (a.no ?? 1e9) - (b.no ?? 1e9) || a.seatId - b.seatId),
  };
  res.status(200).json({ ok: true, ...body });
}
