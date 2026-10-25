/**
 * Scores, voids and Finalkan (S3, prompt 13, EXAM-ENGINE 4 and 10.3). Every
 * number is computed on read from the raw answers, the current keys and the
 * current voids (src/lib/recruitment/score-table.ts); Finalkan freezes them
 * into a rec_score_freeze row and the reads follow the freeze until an
 * unfreeze. A candidate never reaches any of this: the router asks for an
 * Asisten session and this file asks for a seat on the committee.
 *
 * GET  scores           ?roomId=  { final, rows, rooms, can, blockers }  the Panitia
 * GET  score-stats      per question N, M, p, w and the most picked wrong answer  (bank)
 * POST question-void    { id, note }  takes a question out of every denominator  (bank)
 * POST question-unvoid  { id, note }  (bank)
 * POST score-finalize   { note? }  freezes the scores  (bank)
 * POST score-unfreeze   { note }  brings provisional reads back  (bank)
 *
 * Void, key fixes and the like are refused while frozen (`nilai_final`).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, noStore } from "./http.js";
import {
  asisten,
  recAccount,
  recAnswer,
  recCandidate,
  recExamRoom,
  recExamSeat,
  recLivecode,
  recQuestion,
  recQuestionLog,
  recRubricScore,
  recScoreFreeze,
  praktikan,
  type RecScoreFreezeRow,
} from "../../src/lib/schema.js";
import type { Question, RubricSheet, Value } from "../../src/lib/recruitment/exam-types.js";
import { assemble, type QuestionIn, type SeatIn } from "../../src/lib/recruitment/score-table.js";
import type {
  FinalBlocker,
  FreezeInfo,
  FreezeResponse,
  ScoresResponse,
  StatsResponse,
  VoidResponse,
} from "../../src/lib/recruitment/score-api.js";
import { tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { muatPelaku, wajibHak, anggotaPanitia } from "./recruitment-rights.js";
import { namaKandidat } from "./recruitment-akun.js";
import { muatRubrik } from "./recruitment-lc-pool.js";

const STATUS: Record<string, number> = {
  tanpa_hak: 403,
  tidak_ada: 404,
  data_salah: 400,
  perlu_catatan: 400,
  nilai_final: 409,
  sudah_final: 409,
  belum_final: 409,
  sudah_batal: 409,
  tidak_batal: 409,
  ruang_terbuka: 409,
  ruang_belum_selesai: 409,
  nilai_lc_kurang: 409,
  tanpa_kursi: 409,
};
const galat = (res: ApiResponse, kode: string, extra: Record<string, unknown> = {}) =>
  tolak(res, kode, STATUS[kode] ?? 400, extra);

const NOTE_MAX = 500;
const intOf = (v: unknown): number | null => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/* ---------------------------------------------------------------- loading */

/** The edition's live freeze, or null while scores are provisional. */
export async function muatBeku(db: Db, edisiId: number): Promise<RecScoreFreezeRow | null> {
  const [r] = await db
    .select()
    .from(recScoreFreeze)
    .where(and(eq(recScoreFreeze.editionId, edisiId), isNull(recScoreFreeze.supersededAt)))
    .limit(1);
  return r ?? null;
}

/** True while Finalkan holds; key fixes and voids ask this before they write. */
export const nilaiBeku = async (db: Db, edisiId: number): Promise<boolean> =>
  (await muatBeku(db, edisiId)) !== null;

/** Everything a computation reads, as the pure table wants it. */
async function muatMasukan(db: Db, edisiId: number) {
  const seatRows = await db
    .select({
      id: recExamSeat.id,
      candidateId: recExamSeat.candidateId,
      roomId: recExamSeat.roomId,
      draw: recExamSeat.draw,
    })
    .from(recExamSeat)
    .where(and(eq(recExamSeat.editionId, edisiId), eq(recExamSeat.rehearsal, false)));
  const seatIds = seatRows.map((r) => r.id);

  const jawaban = seatIds.length
    ? await db
        .select({ seatId: recAnswer.seatId, q: recAnswer.questionId, value: recAnswer.value })
        .from(recAnswer)
        .where(inArray(recAnswer.seatId, seatIds))
    : [];
  const nilaiPerKursi = new Map<number, Map<number, Value>>();
  for (const a of jawaban) {
    const m = nilaiPerKursi.get(a.seatId) ?? new Map<number, Value>();
    m.set(a.q, a.value);
    nilaiPerKursi.set(a.seatId, m);
  }

  const soal = await db.select().from(recQuestion).where(eq(recQuestion.editionId, edisiId));
  const bank: QuestionIn[] = soal.map((r) => ({
    id: r.id,
    title: r.title,
    lang: r.lang,
    voided: r.voidedAt !== null,
    question: {
      id: r.id,
      part: r.part,
      lang: r.lang,
      format: r.format,
      version: r.version,
      body: r.body,
      answer: r.answer,
    } as Question,
  }));

  const kandidat = seatRows.length
    ? await db
        .select({ id: recCandidate.id, nim: recCandidate.nim, nama: namaKandidat })
        .from(recCandidate)
        .leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))
        .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
        .where(eq(recCandidate.editionId, edisiId))
    : [];
  const peta = new Map(kandidat.map((k) => [k.id, k]));

  const kursi: SeatIn[] = seatRows.map((r) => ({
    seatId: r.id,
    candidateId: r.candidateId,
    roomId: r.roomId,
    nim: peta.get(r.candidateId)?.nim ?? "",
    nama: peta.get(r.candidateId)?.nama ?? "",
    draw: r.draw,
    values: nilaiPerKursi.get(r.id) ?? new Map(),
  }));

  const lc = seatIds.length
    ? await db
        .select({ seatId: recLivecode.seatId, topic: recLivecode.topicId })
        .from(recLivecode)
        .where(eq(recLivecode.editionId, edisiId))
    : [];
  const topic = new Set(lc.filter((r) => r.topic !== null).map((r) => r.seatId));
  const rubric = topic.size ? await muatRubrik(db, edisiId) : null;
  const sheets = new Map<number, RubricSheet[]>();
  if (rubric) {
    const rows = await db
      .select({
        subjectId: recRubricScore.subjectId,
        grader: recRubricScore.graderNim,
        values: recRubricScore.values,
        at: recRubricScore.at,
      })
      .from(recRubricScore)
      .where(
        and(eq(recRubricScore.rubricId, rubric.id), inArray(recRubricScore.subjectId, seatIds)),
      );
    for (const r of rows) {
      const l = sheets.get(r.subjectId) ?? [];
      l.push({ grader: r.grader, at: r.at.getTime(), values: r.values });
      sheets.set(r.subjectId, l);
    }
  }
  return { kursi, bank, live: { rubric, topic, sheets } };
}

/** The scores right now, from the answers and the keys as they stand. */
export async function hitungSekarang(db: Db, edisiId: number) {
  const m = await muatMasukan(db, edisiId);
  return { ...assemble(m.kursi, m.bank, m.live), kursi: m.kursi };
}

const infoBeku = async (db: Db, f: RecScoreFreezeRow): Promise<FreezeInfo> => {
  const [a] = await db
    .select({ nama: asisten.nama })
    .from(asisten)
    .where(eq(asisten.nim, f.by))
    .limit(1);
  return { id: f.id, at: f.at.toISOString(), by: f.by, byName: a?.nama ?? null, note: f.note };
};

/**
 * The totals the Cutting board shows for Tes Tulis, by candidate id: the
 * frozen ones after Finalkan, the provisional ones before. The test total is
 * null while a seat's Live Coding is still waiting for sheets, so a
 * threshold is never drawn over half a score.
 */
export async function muatNilaiCutting(db: Db, edisiId: number) {
  const beku = await muatBeku(db, edisiId);
  const rows = beku ? beku.scores : (await hitungSekarang(db, edisiId)).rows;
  const out = new Map<
    number,
    { parts: [number, number, number, number | null]; total: number | null }
  >();
  for (const r of rows) {
    const tunggu = r.liveFlag === "belum" || r.liveFlag === "rubrik";
    out.set(r.candidateId, {
      parts: [r.parts.logika.score, r.parts.fitb.score, r.debugging, r.livecode],
      total: tunggu ? null : r.total,
    });
  }
  return { final: beku !== null, byCandidate: out };
}

/* ---------------------------------------------------------------- blockers */

async function halangan(
  db: Db,
  edisiId: number,
  hitung: Awaited<ReturnType<typeof hitungSekarang>>,
): Promise<FinalBlocker[]> {
  const out: FinalBlocker[] = [];
  if (hitung.kursi.length === 0) return [{ kode: "tanpa_kursi" }];
  const ruang = await db
    .select({ id: recExamRoom.id, state: recExamRoom.state })
    .from(recExamRoom)
    .where(and(eq(recExamRoom.editionId, edisiId), eq(recExamRoom.rehearsal, false)));
  const adaKursi = new Set(hitung.kursi.map((k) => k.roomId));
  const terbuka = ruang.filter((r) => ["prep", "parts", "spin"].includes(r.state.stage)).length;
  if (terbuka) out.push({ kode: "ruang_terbuka", rooms: terbuka });
  const belum = ruang.filter(
    (r) => adaKursi.has(r.id) && !["prep", "parts", "spin", "finished"].includes(r.state.stage),
  ).length;
  if (belum) out.push({ kode: "ruang_belum_selesai", rooms: belum });
  const lc = hitung.rows.filter((r) => r.liveFlag === "belum" || r.liveFlag === "rubrik").length;
  if (lc) out.push({ kode: "nilai_lc_kurang", seats: lc });
  return out;
}

/* ---------------------------------------------------------------- entry */

export async function handleScore(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const aksi = String(req.query.aksi ?? "");
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = s.role === "asisten" ? await muatPelaku(db, edisi.id, s.nim) : null;
  // Panitia only: a seat on the committee, or every right. Never a candidate.
  if (!anggotaPanitia(p)) return galat(res, "tanpa_hak");
  noStore(res);
  if (aksi === "scores") return bacaNilai(req, res, db, edisi.id, p!.hak.bank || p!.penuh);
  if (!wajibHak(res, p, "bank")) return;
  const k: Konteks = { req, res, db, edisiId: edisi.id, nim: s.nim };
  switch (aksi) {
    case "score-stats":
      return bacaStatistik(k);
    case "question-void":
      return batalkan(k, true);
    case "question-unvoid":
      return batalkan(k, false);
    case "score-finalize":
      return finalkan(k);
    case "score-unfreeze":
      return bukaBeku(k);
  }
  return galat(res, "aksi_tak_dikenal");
}

interface Konteks {
  req: ApiRequest;
  res: ApiResponse;
  db: Db;
  edisiId: number;
  nim: string;
}

/* ---------------------------------------------------------------- reads */

async function bacaNilai(
  req: ApiRequest,
  res: ApiResponse,
  db: Db,
  edisiId: number,
  bank: boolean,
) {
  const roomQ = req.query.roomId;
  const roomId = roomQ === undefined ? null : intOf(roomQ);
  if (roomQ !== undefined && roomId === null) return galat(res, "data_salah");
  const beku = await muatBeku(db, edisiId);
  const hitung = beku ? null : await hitungSekarang(db, edisiId);
  const semua = beku ? beku.scores : hitung!.rows;
  const rooms = await db
    .select({ id: recExamRoom.id, title: recExamRoom.title })
    .from(recExamRoom)
    .where(and(eq(recExamRoom.editionId, edisiId), eq(recExamRoom.rehearsal, false)));
  const adaKursi = new Set(semua.map((r) => r.roomId));
  const body: ScoresResponse = {
    ok: true,
    final: beku ? await infoBeku(db, beku) : null,
    rows: roomId ? semua.filter((r) => r.roomId === roomId) : semua,
    rooms: rooms
      .filter((r) => adaKursi.has(r.id))
      .map((r) => ({ id: r.id, title: r.title }))
      .sort((a, b) => a.id - b.id),
    can: { bank },
    // Only the people who can press Finalkan are told what stops them.
    blockers: bank && hitung ? await halangan(db, edisiId, hitung) : [],
    now: new Date().toISOString(),
  };
  res.status(200).json(body);
}

async function bacaStatistik(k: Konteks) {
  const beku = await muatBeku(k.db, k.edisiId);
  const hitung = beku ? null : await hitungSekarang(k.db, k.edisiId);
  const rows = beku ? beku.scores : hitung!.rows;
  const started = { logika: 0, fitb: 0, kodingan: 0, mikro: 0 };
  for (const r of rows)
    for (const part of Object.keys(started) as (keyof typeof started)[])
      if (r.parts[part].flag !== "absent") started[part]++;
  const body: StatsResponse = {
    ok: true,
    final: beku ? await infoBeku(k.db, beku) : null,
    stats: beku ? beku.stats : hitung!.stats,
    started,
  };
  k.res.status(200).json(body);
}

/* --------------------------------------------------------------- writes */

const catatan = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 && t.length <= NOTE_MAX ? t : null;
};

async function batalkan(k: Konteks, batal: boolean) {
  const b = jsonBody(k.req);
  const id = intOf(b.id);
  if (!id) return galat(k.res, "data_salah");
  const note = catatan(b.note);
  if (!note) return galat(k.res, "perlu_catatan");
  if (await nilaiBeku(k.db, k.edisiId)) return galat(k.res, "nilai_final");
  const [r] = await k.db
    .select()
    .from(recQuestion)
    .where(and(eq(recQuestion.id, id), eq(recQuestion.editionId, k.edisiId)))
    .limit(1);
  if (!r) return galat(k.res, "tidak_ada");
  const sudah = r.voidedAt !== null;
  if (batal && sudah) return galat(k.res, "sudah_batal");
  if (!batal && !sudah) return galat(k.res, "tidak_batal");
  const now = new Date();
  await k.db.transaction(async (tx) => {
    await tx
      .update(recQuestion)
      .set(
        batal
          ? { voidedAt: now, voidedBy: k.nim, voidNote: note, updatedAt: now }
          : { voidedAt: null, voidedBy: null, voidNote: null, updatedAt: now },
      )
      .where(eq(recQuestion.id, id));
    await tx.insert(recQuestionLog).values({
      questionId: id,
      who: k.nim,
      kind: batal ? "void" : "unvoid",
      before: { voided: sudah, note: r.voidNote },
      after: { voided: batal },
      note,
    });
  });
  await writeAudit(k.nim, batal ? "rec_soal_batal" : "rec_soal_pulih", {
    id,
    title: r.title,
    note,
  });
  const body: VoidResponse = {
    ok: true,
    question: { id, voided: batal, voidNote: batal ? note : null },
  };
  k.res.status(200).json(body);
}

async function finalkan(k: Konteks) {
  const b = jsonBody(k.req);
  const note = b.note === undefined || b.note === null || b.note === "" ? null : catatan(b.note);
  if (b.note !== undefined && b.note !== null && b.note !== "" && !note)
    return galat(k.res, "data_salah");
  if (await nilaiBeku(k.db, k.edisiId)) return galat(k.res, "sudah_final");
  const hitung = await hitungSekarang(k.db, k.edisiId);
  const hal = await halangan(k.db, k.edisiId, hitung);
  if (hal.length) return galat(k.res, hal[0].kode, { blockers: hal });
  let baris: RecScoreFreezeRow | undefined;
  try {
    [baris] = await k.db
      .insert(recScoreFreeze)
      .values({
        editionId: k.edisiId,
        by: k.nim,
        note,
        scores: hitung.rows,
        stats: hitung.stats,
      })
      .returning();
  } catch (e) {
    // The one-live-freeze index: another Finalkan won the race.
    if (/rec_score_freeze_hidup|unique|duplicate/i.test(String((e as Error)?.message ?? e)))
      return galat(k.res, "sudah_final");
    throw e;
  }
  await writeAudit(k.nim, "rec_nilai_final", {
    edition: k.edisiId,
    seats: hitung.rows.length,
    note,
  });
  const body: FreezeResponse = { ok: true, freeze: await infoBeku(k.db, baris!) };
  k.res.status(200).json(body);
}

async function bukaBeku(k: Konteks) {
  const note = catatan(jsonBody(k.req).note);
  if (!note) return galat(k.res, "perlu_catatan");
  const beku = await muatBeku(k.db, k.edisiId);
  if (!beku) return galat(k.res, "belum_final");
  const [ok] = await k.db
    .update(recScoreFreeze)
    .set({ supersededAt: new Date(), supersededBy: k.nim, unfreezeNote: note })
    .where(and(eq(recScoreFreeze.id, beku.id), isNull(recScoreFreeze.supersededAt)))
    .returning({ id: recScoreFreeze.id });
  if (!ok) return galat(k.res, "belum_final");
  await writeAudit(k.nim, "rec_nilai_buka", { freeze: beku.id, note });
  const body: FreezeResponse = { ok: true, freeze: null };
  k.res.status(200).json(body);
}
