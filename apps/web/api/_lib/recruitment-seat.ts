/**
 * The candidate's exam runner (S3, prompt 10, EXAM-ENGINE 3, 5.5, 6.2, 7, 10.3).
 * Everything here is a candidate signed in with an oprec account, and every
 * action takes the seat from that session (NIM to candidate to seat), never
 * from the request, so a seat can only ever reach its own draw and answers.
 *
 * GET  test          the room, the seat, tonight's plan and, while a part runs for
 *                    this seat, its questions as toView made them (no key) and its answers
 * GET  test-ticket   a relay ticket for the seat's socket
 * POST test-checkin  { step: fullscreen | connection | name, tab, info? }
 * POST test-answer   { part, q, value, rev, tab }
 * POST test-strike   { id, kinds, at, back?, part? }
 * POST test-submit   { part }   Kumpulkan
 * POST test-hotspot  { ssid, pass } | { clear: true }   the candidate's own phone (9.6a)
 *
 * The room's rules stay in src/lib/recruitment/room.ts (answerOpen, seatLeft,
 * normalize): this file reads rows and asks them, it never restates a timer.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { SessionPayload } from "../../src/lib/auth.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, noStore } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import {
  recAnswer,
  recCandidate,
  recExamConfig,
  recExamRoom,
  recExamSeat,
  recPartRef,
  recQuestion,
  recReference,
  recSlot,
  recSlotAssignment,
  recStrike,
  type RecExamRoomRow,
  type RecExamSeatRow,
} from "../../src/lib/schema.js";
import {
  PART_KEYS,
  PHASE1_PARTS,
  type ExamConfig,
  type PartKey,
  type Phase1Part,
  type Question,
  type RoomState,
  type SeatDraw,
  type Value,
} from "../../src/lib/recruitment/exam-types.js";
import { checkValue, toView } from "../../src/lib/recruitment/formats.js";
import { DrawShort, drawPart, drawSeed } from "../../src/lib/recruitment/draw.js";
import { answerOpen, normalize, seatLeft } from "../../src/lib/recruitment/room.js";
import {
  UJIAN_TIKET_DETIK,
  roomPublic,
  ruangUjian,
  tandaTiketUjian,
} from "../../src/lib/recruitment/room-relay.js";
import { seatHotspotId, validHotspot } from "../../src/lib/recruitment/hotspot.js";
import { STRIKE_KINDS, MAX_STRIKES_PER_PART } from "../../src/lib/recruitment/seat-lockdown.js";
import { pickSeat } from "../../src/lib/recruitment/seat-pick.js";
import type {
  PartView,
  PlanPart,
  QuestionView,
  RefLite,
  RoomInfo,
  SeatSelf,
  TestView,
} from "../../src/lib/recruitment/seat-types.js";
import type { SeatCheckin } from "../../src/lib/recruitment/room-types.js";
import { acakId } from "../../src/lib/tanda.js";
import { konsolEnv } from "./konsol.js";
import { tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { antreUjian, muatConfig, simpanHotspotKursi, sudahMasuk } from "./recruitment-room.js";

/** A second tab's answer within this long of the last one is a `ganda` kejadian (7) */
const GANDA_MS = 60_000;
const TAB_RE = /^[A-Za-z0-9_-]{4,64}$/;
/** The prefix of the ids the API gives its own `ganda` kejadian */
const GANDA_ID = "ganda-";
const STRIKE_ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
/** The strike kinds a page may report; `ganda` is the API's own */
const KINDS_PAGE: readonly string[] = STRIKE_KINDS.filter((k) => k !== "ganda");

const STATUS: Record<string, number> = {
  belum_masuk: 403,
  bukan_peserta: 403,
  ruang_belum_dibuka: 409,
  ruang_selesai: 409,
  langkah_belum: 409,
  waktu_habis: 409,
  sudah_kumpul: 409,
  bagian_ruang_lain: 409,
  soal_tak_dikenal: 404,
  soal_batal: 409,
  bank_kurang: 409,
  nilai_salah: 400,
  data_salah: 400,
};
const tolakKursi = (res: ApiResponse, kode: string, extra: Record<string, unknown> = {}) =>
  tolak(res, kode, STATUS[kode] ?? 409, extra);

interface Konteks {
  req: ApiRequest;
  res: ApiResponse;
  s: SessionPayload;
  db: Db;
  edisiId: number;
  cand: { id: number };
  /** The seat the runner serves, or null before the first check-in */
  seat: RecExamSeatRow | null;
  /** The seat's room, or the room of the candidate's Tes Tulis slot */
  room: RecExamRoomRow | null;
}

/* ---------------------------------------------------------------- entry */

export async function handleSeat(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const aksi = String(req.query.aksi ?? "");
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const [cand] = await db
    .select({ id: recCandidate.id })
    .from(recCandidate)
    .where(and(eq(recCandidate.editionId, edisi.id), eq(recCandidate.nim, s.nim)))
    .limit(1);
  if (!cand) return void tolakKursi(res, "bukan_peserta");
  const { seat, room } = await muatKursiSendiri(db, edisi.id, cand.id);
  const k: Konteks = { req, res, s, db, edisiId: edisi.id, cand, seat, room };
  switch (aksi) {
    case "test":
      return bacaTes(k);
    case "test-ticket":
      return tiket(k);
    case "test-checkin":
      return masuk(k);
    case "test-answer":
      return jawab(k);
    case "test-strike":
      return kejadian(k);
    case "test-submit":
      return kumpulkan(k);
    case "test-hotspot":
      return hotspot(k);
  }
  return void tolak(res, "aksi_tidak_dikenal", 404);
}

/**
 * The candidate's seat and room. Seats come from the candidate's own rows only;
 * a candidate with no seat yet gets the room of their Tes Tulis slot, so the
 * page can show the evening and the first check-in can make the seat.
 */
export async function muatKursiSendiri(
  db: Db,
  edisiId: number,
  candidateId: number,
): Promise<{ seat: RecExamSeatRow | null; room: RecExamRoomRow | null }> {
  const seats = await db
    .select()
    .from(recExamSeat)
    .where(and(eq(recExamSeat.editionId, edisiId), eq(recExamSeat.candidateId, candidateId)));
  const [asg] = await db
    .select({ slotId: recSlotAssignment.slotId })
    .from(recSlotAssignment)
    .where(
      and(eq(recSlotAssignment.candidateId, candidateId), eq(recSlotAssignment.stage, "tes_tulis")),
    )
    .limit(1);
  const ids = [...new Set(seats.map((x) => x.roomId))];
  const rooms: RecExamRoomRow[] = ids.length
    ? await db.select().from(recExamRoom).where(inArray(recExamRoom.id, ids))
    : [];
  if (asg && !rooms.some((r) => r.slotId === asg.slotId)) {
    const [r] = await db
      .select()
      .from(recExamRoom)
      .where(and(eq(recExamRoom.editionId, edisiId), eq(recExamRoom.slotId, asg.slotId)))
      .limit(1);
    if (r) rooms.push(r);
  }
  const seat = pickSeat(seats, (id) => rooms.find((r) => r.id === id)?.state.stage ?? "setup");
  if (seat) return { seat, room: rooms.find((r) => r.id === seat.roomId) ?? null };
  return { seat: null, room: asg ? (rooms.find((r) => r.slotId === asg.slotId) ?? null) : null };
}

/* ------------------------------------------------------------------ read */

const minutesOf = (c: ExamConfig, p: PartKey) =>
  p === "livecode" ? c.livecode.minutes : c.parts[p].minutes;

function planOf(config: ExamConfig): PlanPart[] {
  return config.order.map((key) => ({
    key,
    minutes: minutesOf(config, key),
    count: key === "livecode" ? null : config.parts[key].shown,
  }));
}

function selfOf(seat: RecExamSeatRow, state: RoomState): SeatSelf {
  const cur = state.cur;
  const extra = cur ? (state.runs[cur]?.extra[String(seat.id)] ?? 0) : 0;
  const started: SeatSelf["started"] = {};
  for (const p of PHASE1_PARTS) {
    const d = seat.draw[p];
    if (d) started[p] = d.room;
  }
  return {
    id: seat.id,
    roomId: seat.roomId,
    rehearsal: seat.rehearsal,
    checkin: seat.checkin,
    checkedIn: sudahMasuk(seat.checkin),
    done: seat.done,
    extraMs: extra,
    started,
  };
}

async function infoOf(db: Db, room: RecExamRoomRow): Promise<RoomInfo> {
  let startsAt: string | null = null;
  let endsAt: string | null = null;
  if (room.slotId !== null) {
    const [sl] = await db.select().from(recSlot).where(eq(recSlot.id, room.slotId)).limit(1);
    if (sl) {
      startsAt = sl.startsAt.toISOString();
      endsAt = sl.endsAt.toISOString();
    }
  }
  return { id: room.id, title: room.title, rehearsal: room.rehearsal, startsAt, endsAt };
}

async function bacaTes(k: Konteks) {
  const { res, db, edisiId, seat, room, s } = k;
  noStore(res);
  const now = Date.now();
  const base = { ok: true as const, now, me: { nim: s.nim, nama: s.nama } };
  if (!room) {
    const v: TestView = {
      ...base,
      room: null,
      info: null,
      seat: null,
      plan: [],
      part: null,
      hotspot: null,
      closedElsewhere: [],
    };
    return void res.status(200).json(v);
  }
  const config = await muatConfig(db, edisiId);
  const state = normalize(room.state, now);
  const self = seat ? selfOf(seat, state) : null;
  let part: PartView | null = null;
  let closedElsewhere: Phase1Part[] = [];
  if (seat && self?.checkedIn) {
    closedElsewhere = (Object.entries(self.started) as [Phase1Part, number][])
      .filter(([, r]) => r !== seat.roomId)
      .map(([p]) => p);
    part = await bagianKerja(db, edisiId, seat, room, state, config, now);
  }
  const mine = room.hotspots.find((h) => seat && h.id === seatHotspotId(seat.id));
  const v: TestView = {
    ...base,
    room: roomPublic(state, now),
    info: await infoOf(db, room),
    seat: self,
    plan: planOf(config),
    part,
    hotspot: mine ? { ssid: mine.ssid } : null,
    closedElsewhere,
  };
  res.status(200).json(v);
}

/**
 * The part the seat is working now, with its draw written the first time and
 * only while this seat still has time (EXAM-ENGINE 3.3, W1's ruling), or null:
 * no part running, handed in, time over, or started in another room.
 */
async function bagianKerja(
  db: Db,
  edisiId: number,
  seat: RecExamSeatRow,
  room: RecExamRoomRow,
  state: RoomState,
  config: ExamConfig,
  now: number,
): Promise<PartView | null> {
  const key = state.cur;
  if (state.stage !== "parts" || !key || key === "livecode") return null;
  const run = state.runs[key];
  if (!run || run.state === "ended" || seat.done[key] != null) return null;
  const draw = seat.draw[key];
  if (draw && draw.room !== seat.roomId) return null;
  if (seatLeft(run, seat.id, now) <= 0) return null;
  const entry = draw ?? (await tulisDraw(db, edisiId, seat, room, key, config, now));
  if (!entry) return null;
  const ids = entry.items.map((i) => i.q);
  const rows = ids.length
    ? await db.select().from(recQuestion).where(inArray(recQuestion.id, ids))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items: QuestionView[] = entry.items.map((it) => {
    const r = byId.get(it.q);
    const voided = !r || r.voidedAt !== null;
    return {
      q: it.q,
      lang: it.lang,
      voided,
      view: voided ? null : toView(asQuestion(r), it.perm),
    };
  });
  const ans = await db
    .select({ q: recAnswer.questionId, value: recAnswer.value, rev: recAnswer.rev })
    .from(recAnswer)
    .where(and(eq(recAnswer.seatId, seat.id), eq(recAnswer.part, key)));
  const answers: PartView["answers"] = {};
  for (const a of ans) answers[a.q] = { value: a.value, rev: a.rev };
  return { key, items, answers, refs: await muatRef(db, edisiId, key, rows) };
}

type QuestionRow = typeof recQuestion.$inferSelect;
const asQuestion = (r: QuestionRow): Question =>
  ({
    id: r.id,
    part: r.part,
    lang: r.lang,
    format: r.format,
    version: r.version,
    body: r.body,
    answer: r.answer,
  }) as Question;

/** The part's references and the drawn questions' own (EXAM-ENGINE 8.2) */
async function muatRef(
  db: Db,
  edisiId: number,
  part: Phase1Part,
  qs: QuestionRow[],
): Promise<RefLite[]> {
  const partRows = await db
    .select({ id: recReference.id, title: recReference.title, url: recReference.url })
    .from(recPartRef)
    .innerJoin(recReference, eq(recReference.id, recPartRef.referenceId))
    .where(
      and(
        eq(recPartRef.editionId, edisiId),
        eq(recPartRef.part, part),
        eq(recReference.status, "ok"),
      ),
    )
    .orderBy(asc(recPartRef.sort));
  const out: RefLite[] = partRows.map((r) => ({
    id: r.id,
    title: r.title,
    host: hostOf(r.url),
    forQuestion: null,
  }));
  const own = qs.flatMap((q) => q.refs.map((id) => ({ id, q: q.id })));
  const taken = new Set(out.map((r) => r.id));
  const ids = [...new Set(own.map((o) => o.id))].filter((id) => !taken.has(id));
  if (ids.length) {
    const rows = await db
      .select({ id: recReference.id, title: recReference.title, url: recReference.url })
      .from(recReference)
      .where(
        and(
          eq(recReference.editionId, edisiId),
          inArray(recReference.id, ids),
          eq(recReference.status, "ok"),
        ),
      );
    for (const r of rows)
      out.push({
        id: r.id,
        title: r.title,
        host: hostOf(r.url),
        forQuestion: own.find((o) => o.id === r.id)?.q ?? null,
      });
  }
  return out;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Writes the seat's draw for a part once: the statement only writes while that
 * part's key is absent, so two tabs racing end up with the same row (the draw
 * depends on the salt, the seat and the part only, so both compute the same).
 * The first real draw also locks each question's structure (`shown_at`).
 */
async function tulisDraw(
  db: Db,
  edisiId: number,
  seat: RecExamSeatRow,
  room: RecExamRoomRow,
  part: Phase1Part,
  config: ExamConfig,
  now: number,
): Promise<NonNullable<SeatDraw[Phase1Part]> | null> {
  const [conf] = await db
    .select({ salt: recExamConfig.salt })
    .from(recExamConfig)
    .where(eq(recExamConfig.editionId, edisiId))
    .limit(1);
  if (!conf) return null;
  const pool = await db
    .select()
    .from(recQuestion)
    .where(
      and(
        eq(recQuestion.editionId, edisiId),
        eq(recQuestion.part, part),
        eq(recQuestion.status, "ready"),
        isNull(recQuestion.voidedAt),
      ),
    );
  let items;
  try {
    items = drawPart(
      await drawSeed(conf.salt, seat.id, part),
      config.parts[part],
      pool.map(asQuestion),
    );
  } catch (e) {
    if (e instanceof DrawShort) return null;
    throw e;
  }
  const entry = { at: now, room: seat.roomId, items };
  const [w] = await db
    .update(recExamSeat)
    .set({
      draw: sql`jsonb_set(${recExamSeat.draw}, ARRAY[${part}]::text[], ${JSON.stringify(entry)}::jsonb, true)`,
    })
    .where(and(eq(recExamSeat.id, seat.id), sql`not jsonb_exists(${recExamSeat.draw}, ${part})`))
    .returning({ id: recExamSeat.id });
  if (!w) {
    const [again] = await db
      .select({ draw: recExamSeat.draw })
      .from(recExamSeat)
      .where(eq(recExamSeat.id, seat.id))
      .limit(1);
    return again?.draw[part] ?? null;
  }
  if (!room.rehearsal && items.length)
    await db
      .update(recQuestion)
      .set({ shownAt: new Date(now) })
      .where(
        and(
          inArray(
            recQuestion.id,
            items.map((i) => i.q),
          ),
          isNull(recQuestion.shownAt),
        ),
      );
  return entry;
}

/* ---------------------------------------------------------------- ticket */

async function tiket({ res, s, seat, room }: Konteks) {
  noStore(res);
  if (!seat || !room) return void tolakKursi(res, "belum_masuk");
  const env = konsolEnv();
  if (!env) return void res.status(200).json({ ok: false, kode: "relay_belum_diatur" });
  const ruang = ruangUjian(room.id);
  const t = await tandaTiketUjian(
    {
      v: 1,
      p: "ujian",
      r: ruang,
      peran: "kursi",
      s: seat.id,
      u: s.nim,
      exp: Math.floor(Date.now() / 1000) + UJIAN_TIKET_DETIK,
      n: acakId(),
    },
    env.secret,
  );
  res.status(200).json({ ok: true, url: `${env.relay}/ujian/${ruang}`, tiket: t });
}

/* --------------------------------------------------------------- check-in */

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

async function masuk(k: Konteks) {
  const { req, res, db, edisiId, cand, room } = k;
  const b = jsonBody(req);
  const step = b.step;
  if (step !== "fullscreen" && step !== "connection" && step !== "name")
    return void tolakKursi(res, "data_salah", { field: "step" });
  if (typeof b.tab !== "string" || !TAB_RE.test(b.tab))
    return void tolakKursi(res, "data_salah", { field: "tab" });
  if (!room) return void tolakKursi(res, "ruang_belum_dibuka");
  const now = Date.now();
  const stage = normalize(room.state, now).stage;
  if (stage === "setup") return void tolakKursi(res, "ruang_belum_dibuka");
  if (stage === "finished") return void tolakKursi(res, "ruang_selesai");

  let seat = k.seat;
  if (!seat) {
    // The first step makes the seat, in the room of the candidate's slot.
    await db
      .insert(recExamSeat)
      .values({
        editionId: edisiId,
        roomId: room.id,
        candidateId: cand.id,
        rehearsal: room.rehearsal,
      })
      .onConflictDoNothing();
    [seat = null] = await db
      .select()
      .from(recExamSeat)
      .where(
        and(
          eq(recExamSeat.editionId, edisiId),
          eq(recExamSeat.candidateId, cand.id),
          eq(recExamSeat.rehearsal, room.rehearsal),
        ),
      )
      .limit(1);
    if (!seat) return void tolakKursi(res, "bukan_peserta");
  }
  if (step === "name" && !(seat.checkin.fullscreen && seat.checkin.connection))
    return void tolakKursi(res, "langkah_belum");

  const patch: SeatCheckin =
    step === "fullscreen"
      ? { fullscreen: now }
      : step === "name"
        ? { name: now }
        : {
            connection: {
              at: now,
              rttMs: num((b.info as Record<string, unknown> | undefined)?.rttMs),
              offsetMs: num((b.info as Record<string, unknown> | undefined)?.offsetMs),
              chromium:
                typeof (b.info as Record<string, unknown> | undefined)?.chromium === "boolean"
                  ? ((b.info as Record<string, unknown>).chromium as boolean)
                  : undefined,
            },
          };
  const [upd] = await db
    .update(recExamSeat)
    .set({
      checkin: sql`${recExamSeat.checkin} || ${JSON.stringify(patch)}::jsonb`,
      tab: b.tab,
      tabAt: new Date(now),
      lastSeenAt: new Date(now),
    })
    .where(eq(recExamSeat.id, seat.id))
    .returning();
  const after = upd ?? seat;
  antreUjian(res, after.roomId, [
    { j: "kursi", s: after.id, d: { seq: room.state.seq, checkin: after.checkin } },
  ]);
  res.status(200).json({ ok: true, seat: selfOf(after, normalize(room.state, now)) });
}

/* ---------------------------------------------------------------- answers */

/** The seat's row of a draw, with the question, or the error to answer */
async function soalKursi(
  k: Konteks,
  part: Phase1Part,
  q: number,
): Promise<{ question: Question; voided: boolean } | { kode: string }> {
  const { db, seat, room } = k;
  if (!seat || !room || !sudahMasuk(seat.checkin)) return { kode: "belum_masuk" };
  const draw = seat.draw[part];
  if (!draw || !draw.items.some((i) => i.q === q)) return { kode: "soal_tak_dikenal" };
  if (draw.room !== seat.roomId) return { kode: "bagian_ruang_lain" };
  const [row] = await db.select().from(recQuestion).where(eq(recQuestion.id, q)).limit(1);
  if (!row) return { kode: "soal_tak_dikenal" };
  return { question: asQuestion(row), voided: row.voidedAt !== null };
}

async function jawab(k: Konteks) {
  const { req, res, db, seat, room } = k;
  const b = jsonBody(req);
  const part = b.part as Phase1Part;
  const q = Number(b.q);
  if (!(PHASE1_PARTS as readonly string[]).includes(part) || !Number.isInteger(q) || q < 1)
    return void tolakKursi(res, "data_salah");
  if (typeof b.tab !== "string" || !TAB_RE.test(b.tab))
    return void tolakKursi(res, "data_salah", { field: "tab" });
  if (b.value !== null && (typeof b.value !== "object" || Array.isArray(b.value)))
    return void tolakKursi(res, "nilai_salah");
  const sd = await soalKursi(k, part, q);
  if ("kode" in sd) return void tolakKursi(res, sd.kode);
  if (!seat || !room) return void tolakKursi(res, "belum_masuk");
  const now = Date.now();
  if (seat.done[part] != null) return void tolakKursi(res, "sudah_kumpul");
  if (!answerOpen(room.state, seat.id, part, now)) return void tolakKursi(res, "waktu_habis");
  if (sd.voided) return void tolakKursi(res, "soal_batal");
  if (!checkValue(sd.question, b.value)) return void tolakKursi(res, "nilai_salah");

  const value = b.value as Value;
  const [row] = await db
    .insert(recAnswer)
    .values({ seatId: seat.id, questionId: q, part, value, rev: 1, tab: b.tab, at: new Date(now) })
    .onConflictDoUpdate({
      target: [recAnswer.seatId, recAnswer.questionId],
      set: { value, rev: sql`${recAnswer.rev} + 1`, tab: b.tab, at: new Date(now) },
    })
    .returning({ rev: recAnswer.rev });

  // A second tab or device within a minute of the last write: last write wins, the page is
  // warned and the pengawas sees a `ganda` kejadian (EXAM-ENGINE 7).
  const lain =
    !!seat.tab && seat.tab !== b.tab && !!seat.tabAt && now - seat.tabAt.getTime() < GANDA_MS;
  await db
    .update(recExamSeat)
    .set({ tab: b.tab, tabAt: new Date(now), lastSeenAt: new Date(now) })
    .where(eq(recExamSeat.id, seat.id));
  if (lain) {
    const id = `${GANDA_ID}${b.tab}-${Math.floor(now / GANDA_MS)}`;
    const [ins] = await db
      .insert(recStrike)
      .values({
        seatId: seat.id,
        roomId: seat.roomId,
        part,
        clientId: id,
        kinds: ["ganda"],
        at: new Date(now),
        backAt: new Date(now),
      })
      .onConflictDoNothing()
      .returning({ id: recStrike.id });
    if (ins)
      antreUjian(res, seat.roomId, [
        {
          j: "pelanggaran",
          s: seat.id,
          d: { s: seat.id, id, kinds: ["ganda"], at: now, back: now },
        },
      ]);
  }
  res
    .status(200)
    .json({ ok: true, rev: row?.rev ?? 1, at: now, ...(lain ? { warn: "tab_lain" } : {}) });
}

/* ---------------------------------------------------------------- strikes */

async function kejadian(k: Konteks) {
  const { req, res, db, seat, room } = k;
  if (!seat || !room || !sudahMasuk(seat.checkin)) return void tolakKursi(res, "belum_masuk");
  const b = jsonBody(req);
  // A reloaded page ends the kejadian its earlier life left open: the absence ends when the page is back.
  if (b.resume === true) {
    const back = new Date();
    const closed = await db
      .update(recStrike)
      .set({ backAt: back })
      .where(and(eq(recStrike.seatId, seat.id), isNull(recStrike.backAt)))
      .returning({ id: recStrike.id, clientId: recStrike.clientId });
    if (closed.length)
      antreUjian(res, seat.roomId, [
        { j: "pelanggaran", s: seat.id, d: { s: seat.id, resume: true, back: back.getTime() } },
      ]);
    return void res.status(200).json({ ok: true, closed: closed.length });
  }
  const kinds = Array.isArray(b.kinds) ? [...new Set(b.kinds.map(String))] : [];
  if (
    typeof b.id !== "string" ||
    !STRIKE_ID_RE.test(b.id) ||
    // `ganda-...` is the id the API makes for itself (answer); a page cannot name, extend or close one.
    b.id.startsWith(GANDA_ID) ||
    !kinds.length ||
    kinds.length > STRIKE_KINDS.length ||
    !kinds.every((x) => KINDS_PAGE.includes(x))
  )
    return void tolakKursi(res, "data_salah");
  const now = Date.now();
  const at = num(b.at);
  if (at === undefined) return void tolakKursi(res, "data_salah", { field: "at" });
  const state = normalize(room.state, now);
  // Only while the parts run: leaving fullscreen in Persiapan is not a kejadian.
  if (state.stage !== "parts" && state.stage !== "spin")
    return void res.status(200).json({ ok: true });
  const part: PartKey =
    typeof b.part === "string" && (PART_KEYS as readonly string[]).includes(b.part)
      ? (b.part as PartKey)
      : (state.cur ?? "logika");
  const mulai = Math.min(at, now);
  const balik = num(b.back);
  const back = balik === undefined ? null : Math.min(Math.max(balik, mulai), now);

  const lihat = async () =>
    (
      await db
        .select({ id: recStrike.id, kinds: recStrike.kinds, backAt: recStrike.backAt })
        .from(recStrike)
        .where(and(eq(recStrike.seatId, seat.id), eq(recStrike.clientId, b.id as string)))
        .limit(1)
    )[0];
  let ada = await lihat();
  if (!ada) {
    const [n] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(recStrike)
      .where(and(eq(recStrike.seatId, seat.id), eq(recStrike.part, part)));
    // Past the cap the page's count grows and the records stop (08's call).
    if ((n?.n ?? 0) >= MAX_STRIKES_PER_PART)
      return void res.status(200).json({ ok: true, capped: true });
    const [baru] = await db
      .insert(recStrike)
      .values({
        seatId: seat.id,
        roomId: seat.roomId,
        part,
        clientId: b.id,
        kinds,
        at: new Date(mulai),
        backAt: back === null ? null : new Date(back),
      })
      .onConflictDoNothing()
      .returning({ id: recStrike.id });
    // Another request of the same page wrote it first: treat this one as an extension of it.
    if (!baru) ada = await lihat();
  }
  let kindsOut = kinds;
  let backOut = back;
  if (ada) {
    // A kejadian only grows: a page can add kinds and set the return once, never take either back.
    kindsOut = [...new Set([...ada.kinds, ...kinds])];
    backOut = ada.backAt ? ada.backAt.getTime() : back;
    await db
      .update(recStrike)
      .set({
        kinds: kindsOut,
        ...(back !== null ? { backAt: sql`coalesce(${recStrike.backAt}, ${new Date(back)})` } : {}),
      })
      .where(eq(recStrike.id, ada.id));
  }
  antreUjian(res, seat.roomId, [
    {
      j: "pelanggaran",
      s: seat.id,
      d: { s: seat.id, id: b.id, kinds: kindsOut, at: mulai, back: backOut },
    },
  ]);
  res.status(200).json({ ok: true });
}

/* -------------------------------------------------------------- Kumpulkan */

async function kumpulkan(k: Konteks) {
  const { req, res, db, seat, room } = k;
  const part = jsonBody(req).part as Phase1Part;
  if (!(PHASE1_PARTS as readonly string[]).includes(part))
    return void tolakKursi(res, "data_salah");
  if (!seat || !room || !sudahMasuk(seat.checkin)) return void tolakKursi(res, "belum_masuk");
  const draw = seat.draw[part];
  if (!draw) return void tolakKursi(res, "soal_tak_dikenal");
  if (draw.room !== seat.roomId) return void tolakKursi(res, "bagian_ruang_lain");
  const now = Date.now();
  if (seat.done[part] != null)
    return void res.status(200).json({ ok: true, done: seat.done[part] });
  if (!answerOpen(room.state, seat.id, part, now)) return void tolakKursi(res, "waktu_habis");
  await db
    .update(recExamSeat)
    .set({
      done: sql`jsonb_set(${recExamSeat.done}, ARRAY[${part}]::text[], ${String(now)}::jsonb, true)`,
      lastSeenAt: new Date(now),
    })
    .where(eq(recExamSeat.id, seat.id));
  antreUjian(res, seat.roomId, [
    { j: "kursi", s: seat.id, d: { seq: room.state.seq, done: { ...seat.done, [part]: now } } },
  ]);
  res.status(200).json({ ok: true, done: now });
}

/* ---------------------------------------------------------------- hotspot */

/**
 * The candidate's own phone hotspot (EXAM-ENGINE 9.6a): `{ ssid, pass }` answers
 * `{ ssid }` only, the password sealed in the room's row and never read back.
 * `{ clear: true }` hands the seat's boards back to the pengawas hotspots.
 */
async function hotspot(k: Konteks) {
  const { req, res, db, seat, room } = k;
  if (!seat || !room) return void tolakKursi(res, "belum_masuk");
  if (normalize(room.state, Date.now()).stage === "finished")
    return void tolakKursi(res, "ruang_selesai");
  const b = jsonBody(req);
  if (b.clear === true) {
    const id = seatHotspotId(seat.id);
    await db.transaction(async (tx) => {
      const [r] = await tx
        .select({ hotspots: recExamRoom.hotspots })
        .from(recExamRoom)
        .where(eq(recExamRoom.id, room.id))
        .for("update");
      await tx
        .update(recExamRoom)
        .set({ hotspots: (r?.hotspots ?? []).filter((h) => h.id !== id), updatedAt: new Date() })
        .where(eq(recExamRoom.id, room.id));
    });
    antreUjian(res, room.id, [
      { j: "kursi", s: seat.id, d: { seq: room.state.seq, hotspot: true } },
    ]);
    return void res.status(200).json({ ok: true });
  }
  if (typeof b.ssid !== "string" || typeof b.pass !== "string")
    return void tolakKursi(res, "data_salah");
  const salah = validHotspot(b.ssid, b.pass);
  if (salah.length) return void tolakKursi(res, "data_salah", { galat: salah });
  const r = await simpanHotspotKursi(db, room.id, seat.id, b.ssid, b.pass);
  if ("galat" in r) return void tolakKursi(res, "data_salah", { galat: r.galat });
  antreUjian(res, room.id, [{ j: "kursi", s: seat.id, d: { seq: room.state.seq, hotspot: true } }]);
  res.status(200).json({ ok: true, ssid: r.ssid });
}
