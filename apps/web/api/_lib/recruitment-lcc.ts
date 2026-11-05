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
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, noStore } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import {
  praktikan,
  recAccount,
  recCandidate,
  recCProblem,
  recCSubmission,
  recExamRoom,
  recExamSeat,
  server,
} from "../../src/lib/schema.js";
import {
  DrawShort,
  drawBonusProblems,
  drawProblems,
  drawSeed,
} from "../../src/lib/recruitment/draw.js";
import { livecodeResult } from "../../src/lib/recruitment/c-problem.js";
import { capsOf, dealtCount, problemWorth } from "../../src/lib/recruitment/exam-config.js";
import { bonusQuota, bonusWorth, type BonusQuote } from "../../src/lib/recruitment/bonus.js";
import { normalize, seatLeft } from "../../src/lib/recruitment/room.js";
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
import { antreUjian, bacaConfig } from "./recruitment-room.js";
import {
  faseLc,
  muatGaram,
  muatKonteksSeat,
  nomorKursi,
  ruangDinilai,
  tolakLc,
  type KonteksLc,
} from "./recruitment-lc-common.js";
import { kirimKode, sapuJudgeMati, sapuKlaim } from "./recruitment-lc-judge.js";

const KINDS = new Set(["run", "submit"]);

export async function handleLcc(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const aksi = String(req.query.aksi ?? "");
  if (aksi === "lcc-room") return bacaRuang(req, res, s);
  if (aksi === "lcc-judge") return bacaJudge(res, s);
  if (aksi === "lcc-flush") return tutupAntrean(req, res, s);
  const c = await muatKonteksSeat(req, res, s);
  if (!c) return;
  noStore(res);
  const fase = faseLc(c.room.state, c.now);
  if (fase === "belum") return void tolakLc(res, "belum_dibuka");
  if (fase === "selesai") return void tolakLc(res, "ruang_selesai");
  if (fase === "usai") return void tolakLc(res, "ruang_selesai");
  if (aksi === "lcc") return bacaLcc(c, fase, res);
  if (aksi === "lcc-send") return kirim(c, fase, req, res);
  if (aksi === "lcc-bonus") return mintaBonus(c, fase, res, jsonBody(req).dry === true);
  if (aksi === "lcc-done") return selesai(c, fase, res);
  tolak(res, "aksi_tidak_dikenal", 404);
}

/* ------------------------------------------------------------------- deal */

type Dealt = { at: number; room: number; problems: number[]; bonus?: number[]; bonusAt?: number };

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

/** A judge heartbeat older than this means the lab PC is gone. */
const JUDGE_BATAS_DETIK = 120;

export async function judgeSiap(db: Db, now = Date.now()): Promise<boolean> {
  const [r] = await db
    .select({ id: server.id })
    .from(server)
    .where(
      and(
        sql`${server.infoSistem} -> 'judge' = 'true'::jsonb`,
        gt(server.kondisiPada, new Date(now - JUDGE_BATAS_DETIK * 1000)),
      ),
    )
    .limit(1);
  return !!r;
}

/**
 * `GET lcc-judge`: whether the lab PC's judge answers, with no room needed, for the Oprec panel's
 * header (5 Nov 2026). `ageSec` is how long ago the newest judge heartbeat came, null when none ever did.
 */
async function bacaJudge(res: ApiResponse, s: SessionPayload) {
  noStore(res);
  if (s.role !== "asisten") return void tolak(res, "tanpa_hak", 403);
  const db = getDb();
  const [r] = await db
    .select({ at: server.kondisiPada })
    .from(server)
    .where(sql`${server.infoSistem} -> 'judge' = 'true'::jsonb`)
    .orderBy(desc(server.kondisiPada))
    .limit(1);
  const now = Date.now();
  const ageSec = r?.at ? Math.max(0, Math.round((now - r.at.getTime()) / 1000)) : null;
  res
    .status(200)
    .json({ ok: true, judgeReady: ageSec !== null && ageSec < JUDGE_BATAS_DETIK, ageSec });
}

/**
 * What the Judge card says about the judge: the lab PC's name, its compiler and sandbox when it reports them,
 * the workers the exam config asks for, the typical time of a judged run (the last 60) and the program limits.
 */
async function infoJudge(
  db: Db,
  edisiId: number,
  workers: number,
): Promise<Omit<LccRoom["info"], "canWorkers">> {
  const [[pc], waktu, batas] = await Promise.all([
    db
      .select({ nama: server.nama, info: server.infoSistem })
      .from(server)
      .where(sql`${server.infoSistem} -> 'judge' = 'true'::jsonb`)
      .orderBy(desc(server.kondisiPada))
      .limit(1),
    db.execute(
      sql`select coalesce(avg(extract(epoch from (finished_at - claimed_at)) * 1000), 0)::int as ms, count(*)::int as n
          from (select finished_at, claimed_at from rec_c_submission
                where status = 'selesai' and finished_at is not null and claimed_at is not null
                order by id desc limit 60) x`,
    ),
    db
      .select({ limits: recCProblem.limits })
      .from(recCProblem)
      .where(and(eq(recCProblem.editionId, edisiId), eq(recCProblem.status, "ready"))),
  ]);
  const rows = (
    Array.isArray(waktu) ? waktu : ((waktu as { rows?: unknown[] } | undefined)?.rows ?? [])
  ) as { ms: number; n: number }[];
  const w = rows[0];
  const sys = (pc?.info ?? {}) as Record<string, unknown>;
  const teks = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const lim = batas.map((b) => b.limits as { timeMs?: number; memKb?: number });
  return {
    host: pc?.nama ?? null,
    gcc: teks(sys.gcc),
    sandbox: teks(sys.sandbox),
    workers,
    avgMs: w && w.n > 0 ? w.ms : null,
    timeMs: lim.length ? Math.max(...lim.map((x) => x.timeMs ?? 1000)) : null,
    memKb: lim.length ? Math.max(...lim.map((x) => x.memKb ?? 65536)) : null,
  };
}

/** The bonus problems the seat took, if it did */
const bonusKursi = (c: KonteksLc): number[] =>
  (c.seat.draw as { livecode?: Dealt }).livecode?.bonus ?? [];

/** Ready, judged-sound problems: what a hand or a bonus round is dealt from */
async function soalSiap(c: KonteksLc) {
  return c.db
    .select({ id: recCProblem.id, tier: recCProblem.tier })
    .from(recCProblem)
    .where(
      and(
        eq(recCProblem.editionId, c.edisiId),
        eq(recCProblem.status, "ready"),
        eq(recCProblem.checkOk, true),
      ),
    );
}

async function bacaLcc(c: KonteksLc, fase: "spin" | "kerja", res: ApiResponse) {
  const base = await tanganKursi(c);
  if (!base) return void tolak(res, "soal_kurang", 503);
  const ids = [...base, ...bonusKursi(c)];
  const baseSet = new Set(base);
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
        ...(baseSet.has(id) ? {} : { bonus: true }),
        points: baseSet.has(id)
          ? problemWorth(c.config, p.tier, p.body.points)
          : bonusWorth(problemWorth(c.config, p.tier, p.body.points)),
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
    bonus: await infoBonus(c, ids),
    done: c.seat.done.livecode != null,
  };
  res.status(200).json({ ok: true, ...body });
}

async function infoBonus(c: KonteksLc, have: number[]): Promise<LccSelf["bonus"]> {
  const minLeftMs = c.config.livecode.bonusMin * 60_000;
  const taken = bonusKursi(c).length > 0;
  if (minLeftMs <= 0 || taken) return { count: 0, taken, minLeftMs };
  const own = new Set(have);
  const pool = await soalSiap(c);
  return { count: pool.filter((p) => !own.has(p.id)).length, taken, minLeftMs };
}

/* ------------------------------------------------------------ bonus round */

/** Time the seat has left in Live Coding, ms (0 when the part is not running for it). */
function sisaMs(c: KonteksLc): number {
  const state = normalize(c.room.state, c.now);
  const run = state.runs.livecode;
  return run && state.cur === "livecode" && run.state === "running"
    ? seatLeft(run, c.seat.id, c.now)
    : 0;
}

/**
 * How many bonus problems this seat gets (bonus.ts): its time left in problem-lengths, plus the
 * dealt problems whose best finished Submit passed every test, minus those with a finished
 * Submit that did not. A problem never submitted is neither.
 */
async function kuotaBonus(c: KonteksLc, base: number[], rest: number): Promise<BonusQuote> {
  const subs = base.length
    ? await c.db
        .select({
          problemId: recCSubmission.problemId,
          passed: recCSubmission.passed,
          total: recCSubmission.total,
        })
        .from(recCSubmission)
        .where(
          and(
            eq(recCSubmission.seatId, c.seat.id),
            inArray(recCSubmission.problemId, base),
            eq(recCSubmission.kind, "submit"),
            eq(recCSubmission.status, "selesai"),
          ),
        )
    : [];
  const best = new Map<number, { passed: number; total: number }>();
  for (const s of subs) {
    if (!s.total) continue;
    const cur = best.get(s.problemId);
    const p = s.passed ?? 0;
    if (!cur || p / s.total > cur.passed / cur.total)
      best.set(s.problemId, { passed: p, total: s.total });
  }
  let correct = 0;
  let wrong = 0;
  for (const b of best.values()) {
    if (b.passed === b.total) correct++;
    else wrong++;
  }
  return bonusQuota({
    leftMs: sisaMs(c),
    perQuestionMs: (c.config.livecode.minutes * 60_000) / Math.max(1, dealtCount(c.config)),
    correct,
    wrong,
    rest,
  });
}

/** The bonus round of Live Coding: every other ready problem, once, with time left (4 Nov 2026). */
async function mintaBonus(c: KonteksLc, fase: "spin" | "kerja", res: ApiResponse, dry = false) {
  if (fase !== "kerja") return void tolakLc(res, "belum_dibuka");
  if (c.seat.done.livecode != null) return void tolak(res, "sudah_kumpul", 409);
  const base = await tanganKursi(c);
  if (!base) return void tolak(res, "soal_kurang", 503);
  const had = bonusKursi(c);
  if (had.length) return void res.status(200).json({ ok: true, count: had.length });
  const min = c.config.livecode.bonusMin * 60_000;
  if (min <= 0) return void tolak(res, "bonus_mati", 409);
  if (sisaMs(c) < min) return void tolak(res, "bonus_telat", 409);
  const all = drawBonusProblems(
    await drawSeed(await muatGaram(c.db, c.edisiId), c.seat.id, "livecode"),
    await soalSiap(c),
    new Set(base),
  );
  if (!all.length) return void tolak(res, "soal_kurang", 409);
  const quote = await kuotaBonus(c, base, all.length);
  if (dry) return void res.status(200).json({ ok: true, quote });
  if (quote.quota < 1) return void tolak(res, "bonus_kosong", 409, { quote });
  const ids = all.slice(0, quote.quota);
  // Only the first writer wins: two tabs asking at once end with one bonus list
  await c.db
    .update(recExamSeat)
    .set({
      draw: sql`jsonb_set(jsonb_set(${recExamSeat.draw}, '{livecode,bonus}', ${JSON.stringify(ids)}::jsonb, true), '{livecode,bonusAt}', ${String(c.now)}::jsonb, true)`,
    })
    .where(
      and(
        eq(recExamSeat.id, c.seat.id),
        sql`not jsonb_exists(${recExamSeat.draw} -> 'livecode', 'bonus')`,
      ),
    );
  if (!c.seat.rehearsal)
    await c.db
      .update(recCProblem)
      .set({ shownAt: new Date() })
      .where(and(inArray(recCProblem.id, ids), isNull(recCProblem.shownAt)));
  res.status(200).json({ ok: true, count: ids.length, quote });
}

/** Selesai: the seat is done with Live Coding. What it submitted counts; nothing more is taken from it. */
async function selesai(c: KonteksLc, fase: "spin" | "kerja", res: ApiResponse) {
  if (fase !== "kerja") return void tolakLc(res, "belum_dibuka");
  const at = c.seat.done.livecode ?? c.now;
  if (c.seat.done.livecode == null)
    await c.db
      .update(recExamSeat)
      .set({
        done: sql`jsonb_set(${recExamSeat.done}, '{livecode}', ${String(at)}::jsonb, true)`,
        lastSeenAt: new Date(c.now),
      })
      .where(eq(recExamSeat.id, c.seat.id));
  antreUjian(res, c.seat.roomId, [
    {
      j: "kursi",
      s: c.seat.id,
      d: { seq: c.room.state.seq, done: { ...c.seat.done, livecode: at } },
    },
  ]);
  res.status(200).json({ ok: true, done: at });
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
  if (!ids?.concat(bonusKursi(c)).includes(problemId))
    return void tolak(res, "soal_bukan_milikmu", 403);
  if (c.seat.done.livecode != null) return void tolak(res, "sudah_kumpul", 409);
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

/**
 * `POST lcc-flush { id }`: Tutup Antrean. For a finished room whose Live Coding jobs the lab PC never
 * answered: they go down with `judge_mati` now instead of after the grace time, so Finalkan can go on.
 * The same people may press it as may press Finalkan (the bank right).
 */
async function tutupAntrean(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  noStore(res);
  if (s.role !== "asisten") return void tolak(res, "tanpa_hak", 403);
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!p || !(p.penuh || p.hak.bank)) return void tolak(res, "tanpa_hak", 403, { hak: "bank" });
  const id = Number(jsonBody(req).id);
  if (!Number.isInteger(id) || id <= 0) return void tolak(res, "data_salah", 400, { field: "id" });
  const [room] = await db
    .select({ id: recExamRoom.id, state: recExamRoom.state })
    .from(recExamRoom)
    .where(and(eq(recExamRoom.id, id), eq(recExamRoom.editionId, edisi.id)))
    .limit(1);
  if (!room) return void tolak(res, "tidak_ditemukan", 404);
  if (room.state.stage !== "finished") return void tolak(res, "tahap_salah", 409);
  const count = await sapuJudgeMati(db, { roomId: room.id, paksa: true });
  await writeAudit(s.nim, "rec_antrean_tutup", { id: room.id, count });
  res.status(200).json({ ok: true, count });
}

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
  await sapuKlaim(db);
  await sapuJudgeMati(db);
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
      .select({
        id: recCProblem.id,
        title: recCProblem.title,
        tier: recCProblem.tier,
        body: recCProblem.body,
      })
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
    const lcDraw = (seat.draw as { livecode?: { problems?: number[]; bonus?: number[] } }).livecode;
    const bonusIds = new Set(lcDraw?.bonus ?? []);
    const dealt = [...(lcDraw?.problems ?? []), ...(lcDraw?.bonus ?? [])];
    const mine = subs.filter((x) => x.seatId === seat.id);
    const hand = dealt.flatMap((id) => {
      const pr = info.get(id);
      return pr
        ? [
            {
              problemId: id,
              points: bonusIds.has(id)
                ? bonusWorth(problemWorth(config, pr.tier, pr.body.points))
                : problemWorth(config, pr.tier, pr.body.points),
              title: pr.title,
            },
          ]
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
  const infoJ = await infoJudge(db, edisi.id, config.livecode.workers);
  const body: LccRoom = {
    judgeReady: await judgeSiap(db),
    info: { ...infoJ, canWorkers: p?.hak.bank === true },
    queue: {
      waiting: queue.find((q) => q.status === "antre")?.n ?? 0,
      running: queue.find((q) => q.status === "diambil")?.n ?? 0,
    },
    cap: capsOf(config).livecode,
    seats: out.sort((a, b) => (a.no ?? 1e9) - (b.no ?? 1e9) || a.seatId - b.seatId),
  };
  res.status(200).json({ ok: true, ...body });
}
