/**
 * Exam rooms and the Master console (S3, prompt 11, EXAM-ENGINE 5, 6 and 10.3).
 * The rules are in src/lib/recruitment/room.ts (act, the timer math, the lazy
 * end); this file reads the rows, builds the context the reducer cannot know,
 * stores the result under `WHERE state->>'seq' = $seen`, and tells the room.
 *
 * GET  rooms        the rooms the caller may watch, and the slots with no room
 * GET  room?id=     the console: state, seats, notes, hotspots, the bank's readiness
 * GET  room-log?id= the room's actions, newest first
 * GET  room-ticket?id=  a relay ticket for the Panitia's socket
 * POST room-setup   { slotId?, rehearsal?, title?, pengawas, hotspots? }  (plotPengawas)
 * POST room-delete  { id }  a room nobody has run, or a practice room that is not running  (plotPengawas)
 * POST room-act     { id, seq, act, ...params }  the Master's controls
 * POST room-master  { id, act: claim | ask | give | decline | release | ping, to? }
 * POST room-note    { id, candidateId, text }  a pengawas' note on a seat
 * POST room-strike  { id, seatId, strikeId, excuse, reason? }  forgive a violation (or take it back); it stops counting
 * POST room-warn    { id, seatId, text }  a message to one seat, shown until it acknowledges
 * POST room-hold    { id, seatId, hold }  the Master holds a seat (answers refused) or releases it, giving the time back
 * POST room-penalty { id, seatId, part, state | clear, pct?, note? }  decide a seat's suggested cut (the board right)
 * POST room-kit     { id, candidateId, kit, boards, returned? }  (kitLoans)
 * POST room-move    { candidateId, toRoomId }  (plotting)
 * POST room-seat-reset { id, candidateId }  one CaAs's seat back to nothing, not while a part runs  (cuttingLock)
 *
 * The API is the truth: every accepted action is logged to rec_exam_log and
 * sent to the relay room (`ruang` to everyone, the rest to the Panitia or the
 * one seat). A seat only ever receives RoomPublic: no Master, no names, no
 * other seat's extra time.
 */
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  praktikan,
  recAccount,
  recAnswer,
  recCandidate,
  recExamConfig,
  recExamLog,
  recExamRoom,
  recExamSeat,
  recKitLoan,
  recLivecode,
  recCompileJob,
  recMqttJob,
  recCSubmission,
  recCProblem,
  recQuestion,
  recAttendance,
  recSeatNote,
  recSeatPenalty,
  recSeatWarning,
  recSlot,
  recSlotAssignment,
  recSlotExaminer,
  recStrike,
  type RecExamRoomRow,
  type RecSlotRow,
} from "../../src/lib/schema.js";
import { upgradeConfig } from "../../src/lib/recruitment/exam-config.js";
import { DrawShort, drawProblems, problemShortfall } from "../../src/lib/recruitment/draw.js";
import { sapuKlaim } from "./recruitment-lc-judge.js";
import { contohBiodata } from "../../src/lib/recruitment/latihan.js";
import { konteksLatihan } from "./recruitment-latihan-ctx.js";
import {
  DEFAULT_EXAM_CONFIG,
  LANG_OF_PART,
  PART_KEYS,
  PHASE1_PARTS,
  type ExamConfig,
  type PartKey,
  type Phase1Part,
  type Protocol,
  type RoomState,
} from "../../src/lib/recruitment/exam-types.js";
import {
  act,
  budget,
  newRoomState,
  normalize,
  roomView,
  type Action,
  type Effect,
} from "../../src/lib/recruitment/room.js";
import {
  UJIAN_TIKET_DETIK,
  roomPublic,
  ruangUjian,
  tandaTiketUjian,
  type PesanUjian,
} from "../../src/lib/recruitment/room-relay.js";
import {
  planHotspots,
  seatHotspotId,
  toView,
  validHotspot,
  type SeatLoan,
} from "../../src/lib/recruitment/hotspot.js";
import { kejadianPerSeat, type StrikeRow } from "../../src/lib/recruitment/kejadian.js";
import { bolehDuduk, bolehJadiMaster } from "../../src/lib/recruitment/rights.js";
import { tanggalWib } from "../../src/lib/recruitment/gates.js";
import {
  REROLL_REASONS,
  type ConsoleNote,
  type ConsolePerson,
  type ConsoleSeat,
  type ConsoleView,
  type PendingSlot,
  type PoolCount,
  type RerollReason,
  type RoomLogLine,
  type RoomRow,
  type RoomSlotInfo,
  type RoomsResponse,
} from "../../src/lib/recruitment/room-api.js";
import type { KitBoard, RoomHotspot, SeatCheckin } from "../../src/lib/recruitment/room-types.js";
import { acakId } from "../../src/lib/tanda.js";
import { antreAliran, terbitkan } from "./aliran.js";
import type { PesanAliran } from "../../src/lib/aliran.js";
import { createHmac } from "node:crypto";
import { konsolEnv } from "./konsol.js";
import { bungkus } from "./rahasia.js";
import { muatOrang } from "./hak.js";
import { muatKolam as muatDaftarAsisten, tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { poinKursi } from "./recruitment-violations.js";
import { bebas } from "../../src/lib/recruitment/bebas.js";
import { seatViolations } from "../../src/lib/recruitment/violations.js";
import { muatPelaku, type PelakuServer } from "./recruitment-rights.js";
import { namaKandidat } from "./recruitment-akun.js";

/** No ping from the Master for this long makes the Master stale (EXAM-ENGINE 5.4) */
export const MASTER_BASI_MS = 60_000;
export const LABEL_HOTSPOT = "rec-hotspot";

/* --------------------------------------------------------------- 12's hooks */

/**
 * What Live Coding (prompt 12) plugs into the room: the protocol each seat was
 * dealt (for the hotspot count), whether a topic is ready (the Start guard),
 * and the effects `act()` asks for. 12 replaces these when it builds its
 * handlers; until then Start needs no topic and the effects do nothing.
 */
export interface RoomHooks {
  protokol(db: Db, roomId: number): Promise<Map<number, Protocol>>;
  topikSiap(db: Db, editionId: number): Promise<boolean>;
  spinRest(db: Db, roomId: number): Promise<void>;
  lcClose(db: Db, roomId: number): Promise<void>;
  reroll(
    db: Db,
    roomId: number,
    seatId: number,
    what: "topic" | "protocol",
    reason: RerollReason,
  ): Promise<void>;
}

/** The ready, checked C problems of the edition: what Live Coding can deal from. */
async function soalCSiap(db: Db, edisiId: number) {
  return db
    .select({ id: recCProblem.id, tier: recCProblem.tier })
    .from(recCProblem)
    .where(
      and(
        eq(recCProblem.editionId, edisiId),
        eq(recCProblem.status, "ready"),
        eq(recCProblem.checkOk, true),
      ),
    );
}

export const roomHooks: RoomHooks = {
  protokol: async () => new Map(),
  // Live Coding may start only when the ready, checked C problems cover what a seat is dealt;
  // otherwise every seat gets `soal_kurang` while the clock runs.
  topikSiap: async (db, edisiId) => {
    const config = await muatConfig(db, edisiId);
    if (!config.order.includes("livecode")) return true;
    return problemShortfall(config.livecode.draw, await soalCSiap(db, edisiId)).length === 0;
  },
  // The hand is dealt on a seat's first read, so a seat that never turned its cards over still gets
  // one the moment it opens Live Coding: nothing to do here when the spin ends.
  spinRest: async () => undefined,
  // When the room closes, let go of the judge jobs a dead lab PC left claimed (the waiting ones are
  // let go of after a grace time, see sapuJudgeMati).
  lcClose: async (db) => sapuKlaim(db),
  // Deal the seat another Live Coding hand: the next attempt of the same seeded draw. The IoT protocol
  // reel is gone, so only a topic re-roll does anything.
  reroll: async (db, roomId, seatId, what) => {
    if (what !== "topic") return;
    const [seat] = await db
      .select({
        id: recExamSeat.id,
        editionId: recExamSeat.editionId,
        draw: recExamSeat.draw,
        rehearsal: recExamSeat.rehearsal,
      })
      .from(recExamSeat)
      .where(and(eq(recExamSeat.id, seatId), eq(recExamSeat.roomId, roomId)))
      .limit(1);
    if (!seat) return;
    const lc = (
      seat.draw as {
        livecode?: { problems?: number[]; attempt?: number; prev?: number[][] };
      }
    ).livecode;
    const [conf] = await db
      .select({ salt: recExamConfig.salt })
      .from(recExamConfig)
      .where(eq(recExamConfig.editionId, seat.editionId))
      .limit(1);
    if (!conf) return;
    const config = await muatConfig(db, seat.editionId);
    const pool = await soalCSiap(db, seat.editionId);
    const old = lc?.problems ?? [];
    let attempt = lc?.attempt ?? 0;
    let ids: number[] = old;
    try {
      // A few tries: a small pool can deal the same hand again, and then the seat has nothing better.
      for (let i = 0; i < 8; i++) {
        attempt++;
        ids = drawProblems(conf.salt, config.livecode.draw, pool, attempt);
        if (!old.length || ids.some((x) => !old.includes(x))) break;
      }
    } catch (e) {
      if (e instanceof DrawShort) return;
      throw e;
    }
    const dealt = {
      at: Date.now(),
      room: roomId,
      problems: ids,
      attempt,
      prev: [...(lc?.prev ?? []), ...(old.length ? [old] : [])],
    };
    await db
      .update(recExamSeat)
      .set({
        draw: sql`jsonb_set(${recExamSeat.draw}, '{livecode}', ${JSON.stringify(dealt)}::jsonb, true)`,
      })
      .where(eq(recExamSeat.id, seat.id));
    if (!seat.rehearsal)
      await db
        .update(recCProblem)
        .set({ shownAt: new Date() })
        .where(and(inArray(recCProblem.id, ids), isNull(recCProblem.shownAt)));
  },
};

/* ---------------------------------------------------------------- helpers */

const STATUS: Record<string, number> = {
  bukan_master: 403,
  bukan_pengawas: 403,
  tidak_boleh_master: 403,
  tanpa_hak: 403,
  kursi_tak_dikenal: 404,
  tidak_ditemukan: 404,
  perlu_alasan: 400,
  nilai_salah: 400,
  data_salah: 400,
};
const statusUntuk = (kode: string) => STATUS[kode] ?? 409;

/** The relay room's messages, sent with the write's topics once the answer is out. */
export function antreUjian(res: ApiResponse, roomId: number, m: PesanUjian[]): void {
  antreAliran(res, ruangUjian(roomId), m as unknown as PesanAliran[]);
}

const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);
const nimOk = (v: unknown): v is string => typeof v === "string" && /^[0-9A-Za-z]{2,16}$/.test(v);
const idOk = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

/** A checked in seat passed all three steps of 5.5. */
export const sudahMasuk = (c: SeatCheckin | null | undefined): boolean =>
  !!c && !!c.fullscreen && !!c.connection && !!c.name;

const slotInfo = (r: RecSlotRow): RoomSlotInfo => ({
  id: r.id,
  room: r.room,
  startsAt: r.startsAt.toISOString(),
  endsAt: r.endsAt.toISOString(),
  capacity: r.capacity,
});

/**
 * Whether the room may be opened now: its slot is today, or it is a practice room, or the request is
 * in Mode Latihan, where no time gate blocks anything (free mode, 6 Nov 2026).
 */
const isHariIni = (slot: RecSlotRow | null, rehearsal: boolean, now: number): boolean =>
  rehearsal || !slot || bebas()
    ? true
    : tanggalWib(slot.startsAt).tanggal === tanggalWib(new Date(now)).tanggal;

async function muatRuang(
  db: Db,
  edisiId: number,
  id: number,
): Promise<{ room: RecExamRoomRow; slot: RecSlotRow | null } | null> {
  const [room] = await db
    .select()
    .from(recExamRoom)
    .where(and(eq(recExamRoom.id, id), eq(recExamRoom.editionId, edisiId)))
    .limit(1);
  if (!room) return null;
  let slot: RecSlotRow | null = null;
  if (room.slotId !== null) {
    [slot = null] = await db.select().from(recSlot).where(eq(recSlot.id, room.slotId)).limit(1);
  }
  return { room, slot };
}

interface Pengawas {
  nim: string;
  nama: string;
  kode: string;
  status: string | null;
  badges: readonly string[];
}

/**
 * The pengawas of a room, with their names: the slot's examiners for a real
 * room, the NIMs kept in the room's own state for a practice room (it has no
 * slot). Asisten who have left the lab drop out of both.
 */
async function muatPengawas(
  db: Db,
  room: Pick<RecExamRoomRow, "slotId" | "state">,
): Promise<Pengawas[]> {
  const slotId = room.slotId;
  if (slotId === null) {
    const nims = [...new Set(room.state.latihanPengawas ?? [])];
    if (!nims.length) return [];
    const rows = await db
      .select({
        nim: asisten.nim,
        nama: asisten.nama,
        kode: asisten.kode,
        status: asisten.status,
        badges: asisten.badges,
      })
      .from(asisten)
      .where(inArray(asisten.nim, nims))
      .orderBy(asc(asisten.nama));
    return rows.filter((x) => bolehDuduk(x.status));
  }
  return db
    .select({
      nim: asisten.nim,
      nama: asisten.nama,
      kode: asisten.kode,
      status: asisten.status,
      badges: asisten.badges,
    })
    .from(recSlotExaminer)
    .innerJoin(asisten, eq(asisten.nim, recSlotExaminer.asistenNim))
    .where(and(eq(recSlotExaminer.slotId, slotId), eq(recSlotExaminer.role, "pengawas")))
    .orderBy(asc(asisten.nama));
}

async function namaAsisten(
  db: Db,
  nims: string[],
): Promise<Map<string, { nama: string; kode: string }>> {
  const uniq = [...new Set(nims)];
  if (!uniq.length) return new Map();
  const rows = await db
    .select({ nim: asisten.nim, nama: asisten.nama, kode: asisten.kode })
    .from(asisten)
    .where(inArray(asisten.nim, uniq));
  return new Map(rows.map((r) => [r.nim, { nama: r.nama, kode: r.kode }]));
}

/**
 * Who may press Jadi Master (EXAM-ENGINE 5.4): plotted as pengawas for this
 * room and an active Asisten (the Pencipta too, since 2026-11-06). A practice room: anyone plotted as
 * its pengawas, or holding the plotPengawas or bank right, Pencipta included.
 */
async function bisaJadiMaster(
  db: Db,
  edisiId: number,
  room: RecExamRoomRow,
  pengawas: Pengawas[],
  nim: string,
): Promise<boolean> {
  if (!room.rehearsal) {
    const p = pengawas.find((x) => x.nim === nim);
    return !!p && bolehJadiMaster({ badges: p.badges, status: p.status ?? undefined });
  }
  // A practice room is looser still: anyone with the plotting or bank right may run it,
  // plotted or not. (PRD 7.8's old ban on the Pencipta in real rooms is gone, 2026-11-06.)
  const orang = await muatOrang(nim);
  if (!orang || !(orang.status === "aktif" || orang.status === "cuti")) return false;
  if (pengawas.some((x) => x.nim === nim)) return true;
  const p = await muatPelaku(db, edisiId, nim);
  return !!p && (p.penuh || p.hak.plotPengawas || p.hak.bank);
}

function bisaMenonton(p: PelakuServer | null, pengawas: Pengawas[], nim: string): boolean {
  if (!p) return false;
  return (
    p.penuh ||
    p.hak.bank ||
    p.hak.plotPengawas ||
    p.hak.kitLoans ||
    pengawas.some((x) => x.nim === nim)
  );
}

/** The bank's readiness per part and language against what a room draws. */
async function muatKesiapan(
  db: Db,
  edisiId: number,
  config: ExamConfig,
): Promise<NonNullable<ConsoleView["pool"]>> {
  const rows = await db
    .select({ part: recQuestion.part, lang: recQuestion.lang, n: sql<number>`count(*)::int` })
    .from(recQuestion)
    .where(
      and(
        eq(recQuestion.editionId, edisiId),
        eq(recQuestion.status, "ready"),
        sql`${recQuestion.voidedAt} is null`,
      ),
    )
    .groupBy(recQuestion.part, recQuestion.lang);
  const siap = (part: Phase1Part) =>
    rows.filter((r) => r.part === part).reduce((a, r) => a + r.n, 0);
  const out: NonNullable<ConsoleView["pool"]> = {};
  for (const part of PHASE1_PARTS) {
    const counts: PoolCount[] = [
      { lang: LANG_OF_PART[part], shown: config.parts[part].shown, ready: siap(part) },
    ];
    out[part] = { ok: counts.every((c) => c.ready >= c.shown), counts };
  }
  // Live Coding counts too: a room whose C problems cannot cover one seat's draw is not ready.
  if (config.order.includes("livecode")) {
    const problems = await soalCSiap(db, edisiId);
    const draw = config.livecode.draw;
    out.livecode = {
      ok: problemShortfall(draw, problems).length === 0,
      counts: [{ lang: "c", shown: draw.easy + draw.medium + draw.hard, ready: problems.length }],
    };
  }
  return out;
}

/** The edition's config for reading (scoring): the default when no row exists yet, and it never writes. */
export async function bacaConfig(db: Db, edisiId: number): Promise<ExamConfig> {
  const [r] = await db
    .select({ config: recExamConfig.config })
    .from(recExamConfig)
    .where(eq(recExamConfig.editionId, edisiId))
    .limit(1);
  return r ? upgradeConfig(r.config) : structuredClone(DEFAULT_EXAM_CONFIG);
}

/** The edition's parts config; the first call makes the default with its salt (09 edits it). */
export async function muatConfig(db: Db, edisiId: number): Promise<ExamConfig> {
  const [r] = await db
    .select({ config: recExamConfig.config })
    .from(recExamConfig)
    .where(eq(recExamConfig.editionId, edisiId))
    .limit(1);
  if (r) return upgradeConfig(r.config);
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  await db
    .insert(recExamConfig)
    .values({ editionId: edisiId, config: DEFAULT_EXAM_CONFIG, salt })
    .onConflictDoNothing();
  return DEFAULT_EXAM_CONFIG;
}

/* ------------------------------------------------------- relay, outward */

/** Closes every socket of the room after Finish (code 4000); quietly nothing without a relay. */
async function tutupRuangUjian(roomId: number): Promise<void> {
  const env = konsolEnv();
  if (!env) return;
  const ruang = ruangUjian(roomId);
  const ts = Math.floor(Date.now() / 1000);
  const tanda = createHmac("sha256", env.secret)
    .update(`ujian|tutup|${ruang}||${ts}`)
    .digest("hex");
  try {
    await fetch(`${env.relay.replace(/^ws/, "http")}/ujian/${ruang}/tutup`, {
      method: "POST",
      headers: { "x-ujian-ts": String(ts), "x-ujian-tanda": tanda },
      body: "",
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* the seats' own timers and their next fetch tell them */
  }
}

/** The sockets of a room hear it in this order: the room, then the rest. */
const pesanRuang = (roomId: number, state: RoomState, now: number): PesanUjian => ({
  j: "ruang",
  s: null,
  d: roomPublic(state, now),
});

/* ------------------------------------------------------------------ GET */

export async function handleRoom(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const aksi = String(req.query.aksi ?? "");
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!p) return void tolak(res, "tanpa_hak", 403);
  const ctx: Ctx = { req, res, s, db, edisi, p };
  switch (aksi) {
    case "rooms":
      return daftarRuang(ctx);
    case "room":
      return bacaRuang(ctx);
    case "room-log":
      return bacaLog(ctx);
    case "room-ticket":
      return tiket(ctx);
    case "room-setup":
      return aturRuang(ctx);
    case "room-delete":
      return hapusRuang(ctx);
    case "room-act":
      return aksiRuang(ctx);
    case "room-master":
      return aksiMaster(ctx);
    case "room-note":
      return catat(ctx);
    case "room-strike":
      return maafkan(ctx);
    case "room-warn":
      return peringatkan(ctx);
    case "room-hold":
      return tahanKursi(ctx);
    case "room-penalty":
      return putuskanPotongan(ctx);
    case "room-kit":
      return pinjamKit(ctx);
    case "room-move":
      return pindahKursi(ctx);
    case "room-seat-reset":
      return resetKursi(ctx);
  }
  return void tolak(res, "aksi_tidak_dikenal", 404);
}

interface Ctx {
  req: ApiRequest;
  res: ApiResponse;
  s: SessionPayload;
  db: Db;
  edisi: { id: number };
  p: PelakuServer;
}

const bisaSetup = (p: PelakuServer) => p.penuh || p.hak.plotPengawas;

async function hitungKursiRuang(
  db: Db,
  rooms: { room: RecExamRoomRow; slot: RecSlotRow | null }[],
): Promise<Map<number, { seats: number; masuk: number }>> {
  const out = new Map<number, { seats: number; masuk: number }>();
  for (const { room } of rooms) out.set(room.id, { seats: 0, masuk: 0 });
  const slotIds = rooms.flatMap((r) => (r.slot ? [r.slot.id] : []));
  if (slotIds.length) {
    const a = await db
      .select({ slotId: recSlotAssignment.slotId, n: sql<number>`count(*)::int` })
      .from(recSlotAssignment)
      .where(inArray(recSlotAssignment.slotId, slotIds))
      .groupBy(recSlotAssignment.slotId);
    for (const { room, slot } of rooms)
      out.get(room.id)!.seats = a.find((x) => slot && x.slotId === slot.id)?.n ?? 0;
  }
  if (rooms.length) {
    const seats = await db
      .select({ roomId: recExamSeat.roomId, checkin: recExamSeat.checkin })
      .from(recExamSeat)
      .where(
        inArray(
          recExamSeat.roomId,
          rooms.map((r) => r.room.id),
        ),
      );
    const latihan = new Set(rooms.filter((r) => r.room.slotId === null).map((r) => r.room.id));
    for (const x of seats) {
      const o = out.get(x.roomId);
      if (!o) continue;
      if (sudahMasuk(x.checkin)) o.masuk++;
      // A practice room has no slot assignments, so its seats are the headcount.
      if (latihan.has(x.roomId)) o.seats++;
    }
  }
  return out;
}

async function daftarRuang({ res, db, edisi, p, s }: Ctx) {
  const now = Date.now();
  const rows = await db
    .select({ room: recExamRoom, slot: recSlot })
    .from(recExamRoom)
    .leftJoin(recSlot, eq(recSlot.id, recExamRoom.slotId))
    .where(eq(recExamRoom.editionId, edisi.id))
    .orderBy(asc(recSlot.startsAt), asc(recExamRoom.id));
  const rooms = rows.map((r) => ({ room: r.room, slot: r.slot ?? null }));
  const hitung = await hitungKursiRuang(db, rooms);
  const peng = new Map<number, Pengawas[]>();
  for (const { room } of rooms) peng.set(room.id, await muatPengawas(db, room));
  const lihat = bisaMenonton(p, [], s.nim);
  const namaMaster = await namaAsisten(
    db,
    rooms.flatMap((r) => (r.room.state.master ? [r.room.state.master.nim] : [])),
  );
  const out: RoomRow[] = [];
  for (const { room, slot } of rooms) {
    const pe = peng.get(room.id) ?? [];
    if (!lihat && !pe.some((x) => x.nim === s.nim)) continue;
    const v = roomView(room.state, now);
    const h = hitung.get(room.id)!;
    const m = room.state.master;
    out.push({
      id: room.id,
      title: room.title,
      rehearsal: room.rehearsal,
      slot: slot ? slotInfo(slot) : null,
      view: v.view,
      part: v.part,
      seats: h.seats,
      checkedIn: h.masuk,
      master: m
        ? {
            nim: m.nim,
            nama: pe.find((x) => x.nim === m.nim)?.nama ?? namaMaster.get(m.nim)?.nama ?? m.nim,
            kode: pe.find((x) => x.nim === m.nim)?.kode ?? namaMaster.get(m.nim)?.kode ?? "",
          }
        : null,
      pengawas: pe.map((x) => ({ nim: x.nim, nama: x.nama, kode: x.kode })),
      mine: pe.some((x) => x.nim === s.nim),
    });
  }
  let pending: PendingSlot[] = [];
  if (bisaSetup(p)) {
    const dipakai = new Set(rooms.flatMap((r) => (r.slot ? [r.slot.id] : [])));
    const slots = await db
      .select()
      .from(recSlot)
      .where(and(eq(recSlot.editionId, edisi.id), eq(recSlot.stage, "tes_tulis")))
      .orderBy(asc(recSlot.startsAt), asc(recSlot.room));
    const sisa = slots.filter((x) => !dipakai.has(x.id));
    const n = sisa.length
      ? await db
          .select({ slotId: recSlotAssignment.slotId, n: sql<number>`count(*)::int` })
          .from(recSlotAssignment)
          .where(
            inArray(
              recSlotAssignment.slotId,
              sisa.map((x) => x.id),
            ),
          )
          .groupBy(recSlotAssignment.slotId)
      : [];
    pending = sisa.map((x) => ({
      ...slotInfo(x),
      seats: n.find((y) => y.slotId === x.id)?.n ?? 0,
    }));
  }
  const body: RoomsResponse = {
    ok: true,
    now,
    rooms: out,
    pending,
    canSetup: bisaSetup(p),
    ...(bisaSetup(p) ? { people: await muatDaftarAsisten(db) } : {}),
  };
  res.status(200).json(body);
}

async function bacaRuang({ req, res, db, edisi, p, s }: Ctx) {
  const id = Number(req.query.id);
  if (!idOk(id)) return void tolak(res, "data_salah", 400, { field: "id" });
  const r = await muatRuang(db, edisi.id, id);
  if (!r) return void tolak(res, "tidak_ditemukan", 404);
  const pengawas = await muatPengawas(db, r.room);
  if (!bisaMenonton(p, pengawas, s.nim)) return void tolak(res, "tanpa_hak", 403);
  const now = Date.now();
  const view = await susunKonsol(db, edisi.id, r.room, r.slot, pengawas, p, s.nim, now);
  res.status(200).json(view);
}

async function susunKonsol(
  db: Db,
  edisiId: number,
  room: RecExamRoomRow,
  slot: RecSlotRow | null,
  pengawas: Pengawas[],
  p: PelakuServer,
  nim: string,
  now: number,
): Promise<ConsoleView> {
  const config = await muatConfig(db, edisiId);
  const v = roomView(room.state, now);
  const cur = room.state.cur;
  const run = cur ? room.state.runs[cur] : undefined;

  // Who sits here: the slot's assignments, and any seat moved in (a practice room).
  const duduk = slot
    ? await db
        .select({ candidateId: recSlotAssignment.candidateId })
        .from(recSlotAssignment)
        .where(eq(recSlotAssignment.slotId, slot.id))
    : [];
  const seats = await db.select().from(recExamSeat).where(eq(recExamSeat.roomId, room.id));
  const ids = [
    ...new Set([...duduk.map((d) => d.candidateId), ...seats.map((x) => x.candidateId)]),
  ];
  const kand = ids.length
    ? await db
        .select({ id: recCandidate.id, nim: recCandidate.nim, nama: namaKandidat })
        .from(recCandidate)
        .leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))
        .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
        .where(inArray(recCandidate.id, ids))
        .orderBy(asc(recCandidate.nim))
    : [];
  const seatIds = seats.map((x) => x.id);
  const hadir =
    slot?.eventId && ids.length
      ? await db
          .select({
            candidateId: recAttendance.candidateId,
            // The query leaves test scans out, so the console only ever meets these two
            via: sql<"qr" | "manual">`${recAttendance.via}`,
            by: recAttendance.by,
            reason: recAttendance.reason,
          })
          .from(recAttendance)
          .where(
            and(
              eq(recAttendance.eventId, slot.eventId),
              inArray(recAttendance.candidateId, ids),
              // A test scan (via "uji") never marks a seat as present
              ne(recAttendance.via, "uji"),
            ),
          )
      : [];
  const [strikes, warns, decisions, kits, notes, jawab, protokol] = await Promise.all([
    db.select().from(recStrike).where(eq(recStrike.roomId, room.id)).orderBy(asc(recStrike.at)),
    seatIds.length
      ? db
          .select()
          .from(recSeatWarning)
          .where(inArray(recSeatWarning.seatId, seatIds))
          .orderBy(asc(recSeatWarning.at))
      : Promise.resolve([] as (typeof recSeatWarning.$inferSelect)[]),
    seatIds.length
      ? db.select().from(recSeatPenalty).where(inArray(recSeatPenalty.seatId, seatIds))
      : Promise.resolve([] as (typeof recSeatPenalty.$inferSelect)[]),
    db.select().from(recKitLoan).where(eq(recKitLoan.roomId, room.id)),
    db
      .select()
      .from(recSeatNote)
      .where(eq(recSeatNote.roomId, room.id))
      .orderBy(asc(recSeatNote.at)),
    cur && cur !== "livecode" && seatIds.length
      ? db
          .select({ seatId: recAnswer.seatId, n: sql<number>`count(*)::int` })
          .from(recAnswer)
          .where(and(inArray(recAnswer.seatId, seatIds), eq(recAnswer.part, cur)))
          .groupBy(recAnswer.seatId)
      : Promise.resolve([] as { seatId: number; n: number }[]),
    roomHooks.protokol(db, room.id),
  ]);
  const rows: StrikeRow[] = strikes.map((x) => ({
    id: x.clientId,
    seatId: x.seatId,
    part: x.part,
    kinds: x.kinds,
    at: x.at.getTime(),
    backAt: ms(x.backAt),
    excused: x.excusedAt
      ? { by: x.excusedBy ?? "", reason: x.excuseReason ?? null, at: x.excusedAt.getTime() }
      : null,
  }));
  // A strike still open after its part's run ended was left by a page that closed: its time stops there
  const ends: Partial<Record<PartKey, number>> = {};
  for (const part of PART_KEYS) {
    const r = room.state.runs[part];
    if (r?.state === "ended" && r.endedAt != null) ends[part] = r.endedAt;
    else if (room.state.finishedAt != null) ends[part] = room.state.finishedAt;
  }
  const kej = kejadianPerSeat(rows, now, ends);
  const tiles: ConsoleSeat[] = kand.map((c, i) => {
    const seat = seats.find((x) => x.candidateId === c.id) ?? null;
    const k = seat ? kej[seat.id] : undefined;
    const kit = kits.find((x) => x.candidateId === c.id) ?? null;
    const items = cur && cur !== "livecode" ? (seat?.draw[cur]?.items.length ?? 0) : 0;
    return {
      candidateId: c.id,
      seatId: seat?.id ?? null,
      no: i + 1,
      nim: c.nim,
      nama: c.nama ?? "",
      checkin: seat?.checkin ?? {},
      checkedIn: sudahMasuk(seat?.checkin),
      done: seat?.done ?? {},
      answered: seat ? (jawab.find((a) => a.seatId === seat.id)?.n ?? 0) : 0,
      total: items,
      extraMs: seat && run ? (run.extra[String(seat.id)] ?? 0) : 0,
      count: k?.count ?? 0,
      excused: k?.excused ?? 0,
      awayMs: k?.awayMs ?? 0,
      outSince: k?.open?.at ?? null,
      kejadian: (k?.list ?? []).map((x) => ({
        id: x.id,
        part: x.part,
        kinds: x.kinds,
        at: x.at,
        backAt: x.backAt,
        excused: x.excused ?? null,
      })),
      violations: seat
        ? seatViolations(
            (k?.list ?? []).map((x) => ({ part: x.part, kinds: x.kinds, excused: !!x.excused })),
            seat.strikeOverflow ?? {},
            config.violations,
          )
        : {},
      overflow: seat?.strikeOverflow ?? {},
      heldAt: ms(seat?.heldAt),
      warnings: seat
        ? warns
            .filter((w) => w.seatId === seat.id)
            .map((w) => ({
              id: w.id,
              part: w.part,
              source: w.source,
              level: w.level,
              text: w.text,
              by: w.byNim,
              at: w.at.getTime(),
              seen: !!w.seenAt,
            }))
        : [],
      penalties: seat
        ? Object.fromEntries(
            decisions
              .filter((d) => d.seatId === seat.id)
              .map((d) => [
                d.part,
                { state: d.state, pct: d.pct, by: d.byNim, note: d.note, at: d.at.getTime() },
              ]),
          )
        : {},
      kit: kit ? { code: kit.kitCode, boards: kit.boards, returnedAt: ms(kit.returnedAt) } : null,
      lastSeenAt: ms(seat?.lastSeenAt),
      present: hadir.find((h) => h.candidateId === c.id) ?? null,
    };
  });

  const loans: SeatLoan[] = tiles.flatMap((t) =>
    t.seatId !== null && t.kit && !t.kit.returnedAt
      ? [{ seatId: t.seatId, boards: t.kit.boards, protocol: protokol.get(t.seatId) ?? null }]
      : [],
  );
  const plan = planHotspots(room.hotspots, loans);

  const penjaga = await namaAsisten(db, [
    ...(room.state.master ? [room.state.master.nim] : []),
    ...(room.state.ask ? [room.state.ask.nim] : []),
    ...notes.map((n) => n.authorNim),
  ]);
  const orangDari = (n: string) =>
    penjaga.get(n) ?? pengawas.find((x) => x.nim === n) ?? { nama: n, kode: "" };
  const nama = (n: string) => orangDari(n).nama;
  const orang: ConsolePerson[] = [];
  for (const x of pengawas)
    orang.push({
      nim: x.nim,
      nama: x.nama,
      kode: x.kode,
      canBeMaster: room.rehearsal
        ? bolehDuduk(x.status)
        : bolehJadiMaster({ badges: x.badges, status: x.status ?? undefined }),
    });
  const stale =
    !!room.state.master &&
    (room.masterSeenAt === null || now - room.masterSeenAt.getTime() > MASTER_BASI_MS);
  const isMaster = room.state.master?.nim === nim;
  const isPengawas = pengawas.some((x) => x.nim === nim);
  const catatan: ConsoleNote[] = notes.map((n) => ({
    candidateId: n.candidateId,
    authorNim: n.authorNim,
    authorNama: nama(n.authorNim),
    text: n.text,
    at: n.updatedAt.getTime(),
    mine: n.authorNim === nim,
  }));
  return {
    ok: true,
    now,
    room: {
      id: room.id,
      title: room.title,
      rehearsal: room.rehearsal,
      slot: slot ? slotInfo(slot) : null,
      isToday: isHariIni(slot, room.rehearsal, now),
      eventId: slot?.eventId ?? null,
    },
    state: room.state,
    view: v.view,
    part: v.part,
    config,
    budget: budget(room.state, config, now),
    pool: await muatKesiapan(db, edisiId, config),
    seats: tiles,
    notes: catatan,
    master: room.state.master
      ? {
          nim: room.state.master.nim,
          nama: nama(room.state.master.nim),
          kode: orangDari(room.state.master.nim).kode,
          since: room.state.master.since,
          stale,
        }
      : null,
    ask: room.state.ask
      ? {
          nim: room.state.ask.nim,
          nama: nama(room.state.ask.nim),
          kode: orangDari(room.state.ask.nim).kode,
          at: room.state.ask.at,
        }
      : null,
    pengawas: orang,
    hotspots: room.hotspots.map(toView),
    plan,
    me: {
      nim,
      isMaster,
      canBeMaster: await bisaJadiMaster(db, edisiId, room, pengawas, nim),
      isPengawas,
      canSetup: bisaSetup(p),
      canKit: p.penuh || p.hak.kitLoans,
      canMove: p.penuh || p.hak.plotting,
      canPenalty: p.penuh || p.hak.board,
      canReset: p.hak.cuttingLock,
    },
  };
}

async function bacaLog({ req, res, db, edisi, p, s }: Ctx) {
  const id = Number(req.query.id);
  if (!idOk(id)) return void tolak(res, "data_salah", 400, { field: "id" });
  const r = await muatRuang(db, edisi.id, id);
  if (!r) return void tolak(res, "tidak_ditemukan", 404);
  const pengawas = await muatPengawas(db, r.room);
  if (!bisaMenonton(p, pengawas, s.nim)) return void tolak(res, "tanpa_hak", 403);
  const rows = await db
    .select()
    .from(recExamLog)
    .where(eq(recExamLog.roomId, id))
    .orderBy(desc(recExamLog.at), desc(recExamLog.id))
    .limit(200);
  const nama = await namaAsisten(
    db,
    rows.map((x) => x.who),
  );
  const log: RoomLogLine[] = rows.map((x) => ({
    id: x.id,
    at: x.at.getTime(),
    who: x.who,
    nama: nama.get(x.who)?.nama ?? x.who,
    act: x.act,
    params: x.params,
    seq: x.seq,
  }));
  res.status(200).json({ ok: true, log });
}

async function tiket({ req, res, db, edisi, p, s }: Ctx) {
  const id = Number(req.query.id);
  if (!idOk(id)) return void tolak(res, "data_salah", 400, { field: "id" });
  const r = await muatRuang(db, edisi.id, id);
  if (!r) return void tolak(res, "tidak_ditemukan", 404);
  const pengawas = await muatPengawas(db, r.room);
  if (!bisaMenonton(p, pengawas, s.nim)) return void tolak(res, "tanpa_hak", 403);
  const env = konsolEnv();
  if (!env) return void res.status(200).json({ ok: false, kode: "relay_belum_diatur" });
  const ruang = ruangUjian(id);
  const t = await tandaTiketUjian(
    {
      v: 1,
      p: "ujian",
      r: ruang,
      peran: "panitia",
      s: null,
      u: s.nim,
      exp: Math.floor(Date.now() / 1000) + UJIAN_TIKET_DETIK,
      n: acakId(),
    },
    env.secret,
  );
  res.status(200).json({ ok: true, url: `${env.relay}/ujian/${ruang}`, tiket: t });
}

/* ----------------------------------------------------------------- setup */

type Susun = { ok: true; value: RoomHotspot[] } | { ok: false; field: string; kode: string };

/**
 * The hotspots the Panitia typed, merged with what is stored: a missing
 * password keeps the sealed one, a row a candidate typed stays as they typed
 * it (only its removal counts), and every password is sealed here.
 */
export function susunHotspot(
  roomId: number,
  lama: readonly RoomHotspot[],
  masuk: unknown,
  seatIds: readonly number[],
  newId: () => string = () =>
    `h-${acakId()
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 6)}`,
): Susun {
  if (!Array.isArray(masuk) || masuk.length > 40)
    return { ok: false, field: "hotspots", kode: "data_salah" };
  const out: RoomHotspot[] = [];
  const pakai = new Set<string>();
  for (const [i, x] of (masuk as Record<string, unknown>[]).entries()) {
    const field = `hotspots.${i}`;
    const seat =
      x?.owner && typeof x.owner === "object" ? Number((x.owner as { seat?: unknown }).seat) : null;
    const id = seat !== null ? seatHotspotId(seat) : typeof x?.id === "string" ? x.id : newId();
    if (pakai.has(id) || !/^[A-Za-z0-9-]{1,24}$/.test(id))
      return { ok: false, field, kode: "data_salah" };
    pakai.add(id);
    const ada = lama.find((h) => h.id === id);
    if (ada?.by === "cand") {
      out.push(ada);
      continue;
    }
    if (seat !== null && !(idOk(seat) && seatIds.includes(seat)))
      return { ok: false, field: `${field}.owner`, kode: "kursi_tak_dikenal" };
    if (seat === null && !(typeof x?.owner === "string" && /^[A-Za-z0-9]{1,8}$/.test(x.owner)))
      return { ok: false, field: `${field}.owner`, kode: "data_salah" };
    const pass = typeof x?.pass === "string" && x.pass !== "" ? x.pass : undefined;
    const salah = validHotspot(String(x?.ssid ?? ""), pass);
    if (salah.length)
      return { ok: false, field: `${field}.${salah[0].field}`, kode: salah[0].kode };
    if (!pass && !ada?.pass) return { ok: false, field: `${field}.pass`, kode: "sandi_salah" };
    const cap = Number(x?.cap);
    if (seat === null && !(Number.isInteger(cap) && cap >= 1 && cap <= 30))
      return { ok: false, field: `${field}.cap`, kode: "data_salah" };
    out.push({
      id,
      owner: seat !== null ? { seat } : (x.owner as string),
      ssid: String(x.ssid).trim(),
      pass: pass ? bungkus(pass, `${roomId}:${id}`, LABEL_HOTSPOT) : ada!.pass,
      cap: seat !== null ? 0 : cap,
      ...(seat !== null ? { by: "master" as const } : {}),
    });
  }
  return { ok: true, value: out };
}

async function aturRuang({ req, res, s, db, edisi, p }: Ctx) {
  if (!bisaSetup(p)) return void tolak(res, "tanpa_hak", 403, { hak: "plotPengawas" });
  const b = jsonBody(req);
  const rehearsal = b.rehearsal === true;
  const slotId = b.slotId === undefined || b.slotId === null ? null : Number(b.slotId);
  if (slotId !== null && !idOk(slotId))
    return void tolak(res, "data_salah", 400, { field: "slotId" });
  if (!rehearsal && slotId === null) return void tolak(res, "data_salah", 400, { field: "slotId" });
  if (rehearsal && slotId !== null) return void tolak(res, "data_salah", 400, { field: "slotId" });
  const roomId = b.id === undefined ? null : Number(b.id);
  if (roomId !== null && !idOk(roomId)) return void tolak(res, "data_salah", 400, { field: "id" });
  const pengawas = b.pengawas === undefined ? null : b.pengawas;
  if (
    pengawas !== null &&
    (!Array.isArray(pengawas) || !pengawas.every(nimOk) || pengawas.length > 20)
  )
    return void tolak(res, "data_salah", 400, { field: "pengawas" });
  // Practice only: who tries the exam (their sample CaAs gets a seat in this room).
  const pesertaRaw = b.peserta === undefined ? [] : b.peserta;
  if (!Array.isArray(pesertaRaw) || !pesertaRaw.every(nimOk) || pesertaRaw.length > 40)
    return void tolak(res, "data_salah", 400, { field: "peserta" });
  const peserta = [...new Set(pesertaRaw as string[])];
  // Practice only: who leaves this room (their practice seat goes, and what hangs off it).
  const lepasRaw = b.lepas === undefined ? [] : b.lepas;
  if (!Array.isArray(lepasRaw) || !lepasRaw.every(nimOk) || lepasRaw.length > 40)
    return void tolak(res, "data_salah", 400, { field: "lepas" });
  const lepas = [...new Set(lepasRaw as string[])].filter((n) => !peserta.includes(n));
  const tanpaKandidat: string[] = [];
  const sedangJalan: string[] = [];

  let slot: RecSlotRow | null = null;
  if (slotId !== null) {
    [slot = null] = await db
      .select()
      .from(recSlot)
      .where(
        and(
          eq(recSlot.id, slotId),
          eq(recSlot.editionId, edisi.id),
          eq(recSlot.stage, "tes_tulis"),
        ),
      )
      .limit(1);
    if (!slot) return void tolak(res, "slot_salah", 404);
  }
  let room: RecExamRoomRow | null = null;
  if (roomId !== null) room = (await muatRuang(db, edisi.id, roomId))?.room ?? null;
  else if (slot)
    [room = null] = await db
      .select()
      .from(recExamRoom)
      .where(eq(recExamRoom.slotId, slot.id))
      .limit(1);
  if (roomId !== null && !room) return void tolak(res, "tidak_ditemukan", 404);
  if (room && room.state.stage === "finished") return void tolak(res, "tahap_salah", 409);

  if (pengawas !== null) {
    const aktif = pengawas.length
      ? await db
          .select({ nim: asisten.nim, status: asisten.status })
          .from(asisten)
          .where(inArray(asisten.nim, pengawas))
      : [];
    const bukan = pengawas.find((n) => !aktif.some((a) => a.nim === n && bolehDuduk(a.status)));
    if (bukan) return void tolak(res, "bukan_pengawas", 400, { nim: bukan });
  }
  const title =
    typeof b.title === "string" && b.title.trim()
      ? b.title.trim().slice(0, 60)
      : (room?.title ?? slot?.room ?? "Ruang Latihan");

  let hasil: RecExamRoomRow | null = room;
  let galat: { field: string; kode: string } | null = null;
  await db.transaction(async (tx) => {
    if (!room) {
      const [baru] = await tx
        .insert(recExamRoom)
        .values({
          editionId: edisi.id,
          slotId,
          title,
          rehearsal,
          state: newRoomState(),
          hotspots: [],
          createdBy: s.nim,
        })
        .returning();
      hasil = baru;
    }
    const r = hasil!;
    if (b.hotspots !== undefined) {
      const seatRows = await tx
        .select({ id: recExamSeat.id })
        .from(recExamSeat)
        .where(eq(recExamSeat.roomId, r.id));
      const susun = susunHotspot(
        r.id,
        r.hotspots,
        b.hotspots,
        seatRows.map((x) => x.id),
      );
      if (!susun.ok) return void (galat = susun);
      await tx
        .update(recExamRoom)
        .set({ hotspots: susun.value, updatedAt: new Date() })
        .where(eq(recExamRoom.id, r.id));
    }
    if (room) {
      await tx
        .update(recExamRoom)
        .set({ title, updatedAt: new Date() })
        .where(eq(recExamRoom.id, r.id));
    }
    if (pengawas !== null) {
      const uniq = [...new Set(pengawas)];
      if (r.slotId !== null) {
        await tx
          .delete(recSlotExaminer)
          .where(and(eq(recSlotExaminer.slotId, r.slotId), eq(recSlotExaminer.role, "pengawas")));
        if (uniq.length)
          await tx
            .insert(recSlotExaminer)
            .values(uniq.map((n) => ({ slotId: r.slotId!, asistenNim: n })));
      } else {
        // A practice room has no slot: its pengawas live in its own state.
        await tx
          .update(recExamRoom)
          .set({
            state: sql`jsonb_set(${recExamRoom.state}, '{latihanPengawas}', ${JSON.stringify(uniq)}::jsonb, true)`,
            updatedAt: new Date(),
          })
          .where(eq(recExamRoom.id, r.id));
      }
      // Someone taken off the pengawas can no longer hold the Master seat of a real room.
      if (r.slotId !== null && r.state.master && !uniq.includes(r.state.master.nim))
        await tx
          .update(recExamRoom)
          .set({ state: sql`jsonb_set(${recExamRoom.state}, '{master}', 'null'::jsonb, true)` })
          .where(eq(recExamRoom.id, r.id));
    }
    if (lepas.length && r.rehearsal && room) {
      // Only while nothing is on the clock: a seat mid-part keeps its place.
      if (ruangBerjalan(r.state, Date.now()))
        return void (galat = { field: "lepas", kode: "ruang_berjalan" });
      const keluar = await tx
        .select({ id: recCandidate.id })
        .from(recCandidate)
        .where(and(eq(recCandidate.editionId, edisi.id), inArray(recCandidate.nim, lepas)));
      if (keluar.length) {
        const kursi = await tx
          .select({ id: recExamSeat.id })
          .from(recExamSeat)
          .where(
            and(
              eq(recExamSeat.roomId, r.id),
              eq(recExamSeat.rehearsal, true),
              inArray(
                recExamSeat.candidateId,
                keluar.map((k) => k.id),
              ),
            ),
          );
        if (kursi.length) {
          const ids = kursi.map((k) => k.id);
          await tx.delete(recStrike).where(inArray(recStrike.seatId, ids));
          await tx.delete(recExamSeat).where(inArray(recExamSeat.id, ids));
        }
      }
    }
    if (peserta.length && r.rehearsal) {
      const cands = await tx
        .select({ id: recCandidate.id, nim: recCandidate.nim })
        .from(recCandidate)
        .where(and(eq(recCandidate.editionId, edisi.id), inArray(recCandidate.nim, peserta)));
      const orangDi = await namaAsisten(tx as unknown as Db, peserta);
      for (const nim of peserta) {
        let k = cands.find((c) => c.nim === nim);
        if (!k) {
          // In Mode Latihan an Asisten who joined after the edition was made has no sample CaAs yet:
          // make one now, on the test stage, so they can be seated and practice as a CaAs.
          const nm = orangDi.get(nim);
          if (!konteksLatihan() || !nm) {
            tanpaKandidat.push(nim);
            continue;
          }
          await tx.insert(recAccount).values({ nim, nama: nm.nama }).onConflictDoNothing();
          [k] = await tx
            .insert(recCandidate)
            .values({
              editionId: edisi.id,
              nim,
              biodata: contohBiodata(nim, nm.nama),
              status: "approved" as const,
              currentStage: "tes_tulis" as const,
              reviewedBy: s.nim,
              reviewedAt: new Date(),
            })
            .returning({ id: recCandidate.id, nim: recCandidate.nim });
        }
        const [lama] = await tx
          .select({ id: recExamSeat.id, roomId: recExamSeat.roomId })
          .from(recExamSeat)
          .where(
            and(
              eq(recExamSeat.editionId, edisi.id),
              eq(recExamSeat.candidateId, k.id),
              eq(recExamSeat.rehearsal, true),
            ),
          )
          .limit(1);
        if (lama?.roomId === r.id) continue;
        if (lama) {
          // One practice seat per person: start over in this room, unless the old one is mid-part.
          const dari = await muatRuang(tx as unknown as Db, edisi.id, lama.roomId);
          if (dari && ruangBerjalan(dari.room.state, Date.now())) {
            sedangJalan.push(nim);
            continue;
          }
          await tx.delete(recExamSeat).where(eq(recExamSeat.id, lama.id));
        }
        await tx
          .insert(recExamSeat)
          .values({ editionId: edisi.id, roomId: r.id, candidateId: k.id, rehearsal: true });
      }
    }
  });
  if (galat) {
    const g = galat as { field: string; kode: string };
    return void tolak(res, g.kode, g.kode === "ruang_berjalan" ? 409 : 400, g);
  }
  await writeAudit(s.nim, room ? "rec_ruang_ubah" : "rec_ruang_buat", { id: hasil!.id, slotId });
  const sesudah = await muatRuang(db, edisi.id, hasil!.id);
  const fin = sesudah?.room ?? hasil!;
  const pe = await muatPengawas(db, fin);
  res.status(200).json({
    ok: true,
    room: { id: fin.id, title: fin.title, rehearsal: fin.rehearsal },
    pengawas: pe.map((x) => ({ nim: x.nim, nama: x.nama, kode: x.kode })),
    hotspots: fin.hotspots.map(toView),
    peserta: { noCandidate: tanpaKandidat, busy: sedangJalan },
  });
}

/**
 * Delete a room completely: the room, its seats and everything that hangs off them. A room made by
 * mistake goes whatever its state (open, running, even a part ended): only a real room whose
 * candidates already have saved answers or judged submissions stays, since deleting it would throw
 * their work away. A practice room counts toward nobody's score, so it always goes.
 */
async function hapusRuang({ req, res, s, db, edisi, p }: Ctx) {
  if (!bisaSetup(p)) return void tolak(res, "tanpa_hak", 403, { hak: "plotPengawas" });
  const id = Number(jsonBody(req).id);
  if (!idOk(id)) return void tolak(res, "data_salah", 400, { field: "id" });
  const muat = await muatRuang(db, edisi.id, id);
  if (!muat) return void tolak(res, "tidak_ditemukan", 404);
  const { room } = muat;
  if (!room.rehearsal) {
    const kursi = await db
      .select({ id: recExamSeat.id })
      .from(recExamSeat)
      .where(eq(recExamSeat.roomId, room.id));
    if (kursi.length) {
      const ids = kursi.map((k) => k.id);
      const [[jawab], [kirim]] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(recAnswer)
          .where(inArray(recAnswer.seatId, ids)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(recCSubmission)
          .where(and(inArray(recCSubmission.seatId, ids), eq(recCSubmission.kind, "submit"))),
      ]);
      if (Number(jawab?.n ?? 0) + Number(kirim?.n ?? 0) > 0)
        return void tolak(res, "ruang_ada_jawaban", 409);
    }
  }
  // The slot the room was made from goes with it, so the evening shows nothing of it. Only an empty one:
  // a slot with candidates seated in it is their booking, and Plotting keeps those (same rule as slot_terisi).
  let slotDihapus = false;
  await db.transaction(async (tx) => {
    await tx.delete(recStrike).where(eq(recStrike.roomId, room.id));
    await tx.delete(recCSubmission).where(eq(recCSubmission.roomId, room.id));
    await tx.delete(recLivecode).where(eq(recLivecode.roomId, room.id));
    await tx.delete(recCompileJob).where(eq(recCompileJob.roomId, room.id));
    await tx.delete(recMqttJob).where(eq(recMqttJob.roomId, room.id));
    await tx.delete(recExamSeat).where(eq(recExamSeat.roomId, room.id));
    await tx.delete(recExamRoom).where(eq(recExamRoom.id, room.id));
    if (room.slotId === null) return;
    const [[duduk], [lain]] = await Promise.all([
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(recSlotAssignment)
        .where(eq(recSlotAssignment.slotId, room.slotId)),
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(recExamRoom)
        .where(eq(recExamRoom.slotId, room.slotId)),
    ]);
    if (Number(duduk?.n ?? 0) > 0 || Number(lain?.n ?? 0) > 0) return;
    await tx.delete(recSlotExaminer).where(eq(recSlotExaminer.slotId, room.slotId));
    await tx.delete(recSlot).where(eq(recSlot.id, room.slotId));
    slotDihapus = true;
  });
  await writeAudit(s.nim, "rec_ruang_hapus", {
    id: room.id,
    title: room.title,
    rehearsal: room.rehearsal,
    slotId: slotDihapus ? room.slotId : null,
  });
  // Seats that were connected to the room are let go; quietly nothing without a relay.
  await tutupRuangUjian(room.id);
  return void res.status(200).json({ ok: true, slotDihapus });
}

/**
 * room-seat-reset { id, candidateId }: take one CaAs's seat in a room back to nothing (5 Nov 2026), so they
 * check in and draw again. The answers, strikes, Live Coding and submissions of that seat go with it (they
 * hang off the seat). Ketua, Akademik and Admin (cuttingLock), and never while a part is running.
 */
async function resetKursi({ req, res, s, db, edisi, p }: Ctx) {
  if (!p.hak.cuttingLock) return void tolak(res, "tanpa_hak", 403, { hak: "cuttingLock" });
  const b = jsonBody(req);
  const id = Number(b.id);
  const candidateId = Number(b.candidateId);
  if (!idOk(id) || !idOk(candidateId)) return void tolak(res, "data_salah", 400);
  const muat = await muatRuang(db, edisi.id, id);
  if (!muat) return void tolak(res, "tidak_ditemukan", 404);
  const { room } = muat;
  if (room.state.stage === "parts" || room.state.stage === "spin")
    return void tolak(res, "ruang_berjalan", 409);
  const hapus = await db
    .delete(recExamSeat)
    .where(and(eq(recExamSeat.roomId, id), eq(recExamSeat.candidateId, candidateId)))
    .returning({ id: recExamSeat.id });
  if (!hapus.length) return void tolak(res, "tidak_ditemukan", 404);
  await writeAudit(s.nim, "rec_kursi_reset", { room: id, candidateId, rehearsal: room.rehearsal });
  return void res.status(200).json({ ok: true });
}

/* ------------------------------------------------------------ the Master */

class Kalah extends Error {}

/** Everything `act()` needs besides the action (EXAM-ENGINE 5.4). */
async function konteksAksi(
  db: Db,
  edisiId: number,
  room: RecExamRoomRow,
  slot: RecSlotRow | null,
  pengawas: Pengawas[],
  nim: string,
  extraNim: string | null,
  now: number,
) {
  const config = await muatConfig(db, edisiId);
  const bisa = new Map<string, boolean>();
  for (const n of [nim, ...(extraNim ? [extraNim] : [])])
    bisa.set(n, await bisaJadiMaster(db, edisiId, room, pengawas, n));
  const seats = await db
    .select({ id: recExamSeat.id, checkin: recExamSeat.checkin })
    .from(recExamSeat)
    .where(eq(recExamSeat.roomId, room.id));
  const kolam = await muatKesiapan(db, edisiId, config);
  const topik = await roomHooks.topikSiap(db, edisiId);
  return {
    now,
    nim,
    canBeMaster: (n: string) => bisa.get(n) ?? false,
    masterStale:
      !!room.state.master &&
      (room.masterSeenAt === null || now - room.masterSeenAt.getTime() > MASTER_BASI_MS),
    isToday: isHariIni(slot, room.rehearsal, now),
    rehearsal: room.rehearsal,
    seatsIn: seats.filter((x) => sudahMasuk(x.checkin)).map((x) => x.id),
    poolOk: (part: PartKey) => (part === "livecode" ? topik : (kolam[part]?.ok ?? false)),
    config,
  };
}

const AKSI_KONTROL = new Set([
  "open",
  "start",
  "pause",
  "resume",
  "skip",
  "reopen",
  "time",
  "seat-time",
  "finish",
  "reroll",
]);
const AKSI_MASTER = new Set(["claim", "ask", "give", "decline", "release"]);

const intOr = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** The body of room-act as an Action, or the field that is wrong. */
export function bacaAksi(
  b: Record<string, unknown>,
): { ok: true; action: Action; note?: string } | { ok: false; field: string } {
  const seq = intOr(b.seq) ?? undefined;
  const nama = String(b.act ?? "");
  switch (nama) {
    case "open":
    case "start":
    case "pause":
    case "resume":
    case "skip":
      return { ok: true, action: { act: nama, seq } };
    case "reopen": {
      const addMs = intOr(b.addMs);
      return addMs === null
        ? { ok: false, field: "addMs" }
        : { ok: true, action: { act: "reopen", addMs, seq } };
    }
    case "time": {
      const deltaMs = intOr(b.deltaMs);
      return deltaMs === null
        ? { ok: false, field: "deltaMs" }
        : { ok: true, action: { act: "time", deltaMs, seq } };
    }
    case "seat-time": {
      const deltaMs = intOr(b.deltaMs);
      const seatId = intOr(b.seatId);
      if (seatId === null || deltaMs === null)
        return { ok: false, field: seatId === null ? "seatId" : "deltaMs" };
      return { ok: true, action: { act: "seat-time", seatId, deltaMs, seq } };
    }
    case "finish": {
      const reason = typeof b.reason === "string" ? b.reason.slice(0, 300) : undefined;
      return { ok: true, action: { act: "finish", early: b.early === true, reason, seq } };
    }
    case "reroll": {
      const seatId = intOr(b.seatId);
      if (seatId === null) return { ok: false, field: "seatId" };
      if (b.what !== "topic" && b.what !== "protocol") return { ok: false, field: "what" };
      if (!(REROLL_REASONS as readonly string[]).includes(String(b.reason)))
        return { ok: false, field: "reason" };
      return {
        ok: true,
        action: { act: "reroll", seatId, what: b.what, reason: String(b.reason), seq },
        note: typeof b.note === "string" ? b.note.slice(0, 300) : undefined,
      };
    }
  }
  return { ok: false, field: "act" };
}

/** Stores an accepted action: the room under its version guard, the log, and what else the action does. */
async function simpanAksi(
  db: Db,
  room: RecExamRoomRow,
  next: RoomState,
  nim: string,
  actName: string,
  params: unknown,
  opts: { master?: boolean; ping?: boolean; reopenPart?: PartKey | null; lockConfig?: boolean },
  now: number,
) {
  await db.transaction(async (tx) => {
    const guard = sql`(${recExamRoom.state}->>'seq')::int = ${room.state.seq}`;
    const upd = await tx
      .update(recExamRoom)
      .set({
        state: next,
        updatedAt: new Date(now),
        ...(opts.master ? { masterSeenAt: new Date(now) } : {}),
      })
      .where(and(eq(recExamRoom.id, room.id), guard))
      .returning({ id: recExamRoom.id });
    if (!upd.length) throw new Kalah();
    await tx.insert(recExamLog).values({
      roomId: room.id,
      at: new Date(now),
      who: nim,
      act: actName,
      params: params ?? null,
      seq: next.seq,
    });
    if (opts.reopenPart)
      await tx
        .update(recExamSeat)
        .set({ done: sql`${recExamSeat.done} - ${opts.reopenPart}::text` })
        .where(eq(recExamSeat.roomId, room.id));
    if (opts.lockConfig)
      await tx
        .update(recExamConfig)
        .set({ lockedAt: new Date(now) })
        .where(
          and(eq(recExamConfig.editionId, room.editionId), sql`${recExamConfig.lockedAt} is null`),
        );
  });
}

async function aksiRuang({ req, res, s, db, edisi, p }: Ctx) {
  const b = jsonBody(req);
  const id = Number(b.id);
  if (!idOk(id)) return void tolak(res, "data_salah", 400, { field: "id" });
  if (!AKSI_KONTROL.has(String(b.act)))
    return void tolak(
      res,
      AKSI_MASTER.has(String(b.act)) ? "pakai_room_master" : "data_salah",
      400,
      {
        field: "act",
      },
    );
  const baca = bacaAksi(b);
  if (!baca.ok) return void tolak(res, "data_salah", 400, { field: baca.field });
  const r = await muatRuang(db, edisi.id, id);
  if (!r) return void tolak(res, "tidak_ditemukan", 404);
  const pengawas = await muatPengawas(db, r.room);
  if (!bisaMenonton(p, pengawas, s.nim)) return void tolak(res, "tanpa_hak", 403);
  const now = Date.now();
  const ctx = await konteksAksi(db, edisi.id, r.room, r.slot, pengawas, s.nim, null, now);
  const hasil = act(r.room.state, baca.action, ctx);
  if (!hasil.ok) return void tolak(res, hasil.kode, statusUntuk(hasil.kode));
  const next = hasil.state;
  const { act: namaAksi, seq: _seq, ...params } = baca.action as Action & { seq?: number };
  void _seq;
  const reopenPart = baca.action.act === "reopen" && r.room.state.cur ? r.room.state.cur : null;
  try {
    await simpanAksi(
      db,
      r.room,
      next,
      s.nim,
      namaAksi,
      { ...params, ...(baca.note ? { note: baca.note } : {}) },
      {
        reopenPart,
        lockConfig: baca.action.act === "start" && !r.room.rehearsal,
      },
      now,
    );
  } catch (e) {
    if (e instanceof Kalah) return void tolak(res, "versi_lama", 409);
    throw e;
  }
  const pesan: PesanUjian[] = [pesanRuang(id, next, now)];
  if (baca.action.act === "seat-time") {
    const a = baca.action;
    const run = next.cur ? next.runs[next.cur] : undefined;
    pesan.push({
      j: "kursi",
      s: a.seatId,
      d: { seq: next.seq, extraMs: run?.extra[String(a.seatId)] ?? 0 },
    });
  }
  if (reopenPart) {
    const sudah = await db
      .select({ id: recExamSeat.id })
      .from(recExamSeat)
      .where(eq(recExamSeat.roomId, id));
    for (const x of sudah) pesan.push({ j: "kursi", s: x.id, d: { seq: next.seq, done: {} } });
  }
  if (baca.action.act === "reroll") {
    const a = baca.action;
    pesan.push({
      j: "kursi",
      s: a.seatId,
      d: { seq: next.seq, reroll: { what: a.what, reason: a.reason } },
    });
  }
  await jalankanEfek(db, id, hasil.effects, baca.action, pesan, res);
  res.status(200).json({ ok: true, state: next });
}

/** What `act()` asked for besides the new state. */
async function jalankanEfek(
  db: Db,
  roomId: number,
  effects: Effect[],
  action: Action,
  pesan: PesanUjian[],
  res: ApiResponse,
) {
  let tutup = false;
  for (const e of effects) {
    if (e.kind === "spin-rest") await roomHooks.spinRest(db, roomId);
    else if (e.kind === "lc-close") {
      await roomHooks.lcClose(db, roomId);
      tutup = true;
    } else if (e.kind === "reroll")
      await roomHooks.reroll(db, roomId, e.seatId, e.what, e.reason as RerollReason);
  }
  void action;
  if (!tutup) return void antreUjian(res, roomId, pesan);
  // The last frames go out before the sockets are closed, not after the answer.
  await terbitkan(ruangUjian(roomId), pesan as unknown as PesanAliran[]);
  await tutupRuangUjian(roomId);
}

async function aksiMaster({ req, res, s, db, edisi, p }: Ctx) {
  const b = jsonBody(req);
  const id = Number(b.id);
  const nama = String(b.act ?? "");
  if (!idOk(id)) return void tolak(res, "data_salah", 400, { field: "id" });
  if (nama !== "ping" && !AKSI_MASTER.has(nama))
    return void tolak(res, "data_salah", 400, { field: "act" });
  const to = nama === "give" ? b.to : undefined;
  if (nama === "give" && !nimOk(to)) return void tolak(res, "data_salah", 400, { field: "to" });
  for (let coba = 0; coba < 3; coba++) {
    const r = await muatRuang(db, edisi.id, id);
    if (!r) return void tolak(res, "tidak_ditemukan", 404);
    const pengawas = await muatPengawas(db, r.room);
    if (!bisaMenonton(p, pengawas, s.nim)) return void tolak(res, "tanpa_hak", 403);
    const now = Date.now();
    if (nama === "ping") {
      if (r.room.state.master?.nim !== s.nim) return void tolak(res, "bukan_master", 403);
      await db
        .update(recExamRoom)
        .set({ masterSeenAt: new Date(now) })
        .where(eq(recExamRoom.id, id));
      return void res
        .status(200)
        .json({ ok: true, master: r.room.state.master, ask: r.room.state.ask });
    }
    const ctx = await konteksAksi(
      db,
      edisi.id,
      r.room,
      r.slot,
      pengawas,
      s.nim,
      typeof to === "string" ? to : null,
      now,
    );
    const action: Action =
      nama === "give" ? { act: "give", to: to as string } : ({ act: nama } as Action);
    const hasil = act(r.room.state, action, ctx);
    if (!hasil.ok) return void tolak(res, hasil.kode, statusUntuk(hasil.kode));
    try {
      await simpanAksi(
        db,
        r.room,
        hasil.state,
        s.nim,
        nama,
        nama === "give" ? { to } : null,
        { master: nama === "claim" || nama === "give" },
        now,
      );
    } catch (e) {
      // Someone else wrote first: look again, and the guards say what is true now.
      if (e instanceof Kalah) continue;
      throw e;
    }
    const nm = await namaAsisten(db, [
      ...(hasil.state.master ? [hasil.state.master.nim] : []),
      ...(hasil.state.ask ? [hasil.state.ask.nim] : []),
    ]);
    antreUjian(res, id, [
      pesanRuang(id, hasil.state, now),
      {
        j: "master",
        s: null,
        d: {
          master: hasil.state.master
            ? {
                ...hasil.state.master,
                nama: nm.get(hasil.state.master.nim)?.nama ?? hasil.state.master.nim,
                kode: nm.get(hasil.state.master.nim)?.kode ?? "",
              }
            : null,
          ask: hasil.state.ask
            ? {
                ...hasil.state.ask,
                nama: nm.get(hasil.state.ask.nim)?.nama ?? hasil.state.ask.nim,
                kode: nm.get(hasil.state.ask.nim)?.kode ?? "",
              }
            : null,
        },
      },
    ]);
    return void res
      .status(200)
      .json({ ok: true, master: hasil.state.master, ask: hasil.state.ask });
  }
  tolak(res, "versi_lama", 409);
}

/* ------------------------------------------------- notes, kits and moves */

/** A candidate of this edition: notes and kit loans may only name one (a stray id would fail on the key with a 500). */
async function kandidatAda(db: Db, edisiId: number, candidateId: number): Promise<boolean> {
  const [k] = await db
    .select({ id: recCandidate.id })
    .from(recCandidate)
    .where(and(eq(recCandidate.id, candidateId), eq(recCandidate.editionId, edisiId)))
    .limit(1);
  return !!k;
}

async function catat({ req, res, s, db, edisi, p }: Ctx) {
  const b = jsonBody(req);
  const id = Number(b.id);
  const candidateId = Number(b.candidateId);
  if (!idOk(id) || !idOk(candidateId)) return void tolak(res, "data_salah", 400);
  if (typeof b.text !== "string" || b.text.length > 1000)
    return void tolak(res, "data_salah", 400, { field: "text" });
  const r = await muatRuang(db, edisi.id, id);
  if (!r) return void tolak(res, "tidak_ditemukan", 404);
  const pengawas = await muatPengawas(db, r.room);
  if (!bisaMenonton(p, pengawas, s.nim)) return void tolak(res, "tanpa_hak", 403);
  if (!(await kandidatAda(db, edisi.id, candidateId)))
    return void tolak(res, "tidak_ditemukan", 404);
  const isi = b.text.trim();
  if (!isi) {
    await db
      .delete(recSeatNote)
      .where(
        and(
          eq(recSeatNote.roomId, id),
          eq(recSeatNote.candidateId, candidateId),
          eq(recSeatNote.authorNim, s.nim),
        ),
      );
  } else {
    await db
      .insert(recSeatNote)
      .values({ roomId: id, candidateId, authorNim: s.nim, text: isi })
      .onConflictDoUpdate({
        target: [recSeatNote.roomId, recSeatNote.candidateId, recSeatNote.authorNim],
        set: { text: isi, updatedAt: new Date() },
      });
  }
  antreUjian(res, id, [{ j: "catatan", s: null, d: { candidateId } }]);
  const notes = await db.select().from(recSeatNote).where(eq(recSeatNote.roomId, id));
  const nm = await namaAsisten(
    db,
    notes.map((n) => n.authorNim),
  );
  res.status(200).json({
    ok: true,
    notes: notes.map<ConsoleNote>((n) => ({
      candidateId: n.candidateId,
      authorNim: n.authorNim,
      authorNama: nm.get(n.authorNim)?.nama ?? n.authorNim,
      text: n.text,
      at: n.updatedAt.getTime(),
      mine: n.authorNim === s.nim,
    })),
  });
}

/**
 * `room-strike`: staff forgive one violation, with a reason, or take the forgiveness back (9 Nov
 * 2026). A forgiven strike stays in the list but counts for no points, no warning and no cut. The
 * answer carries the seat's new points in that part, and the room hears it.
 */
async function maafkan({ req, res, s, db, edisi, p }: Ctx) {
  const b = jsonBody(req);
  const id = Number(b.id);
  const seatId = Number(b.seatId);
  if (!idOk(id) || !idOk(seatId) || typeof b.strikeId !== "string" || !b.strikeId)
    return void tolak(res, "data_salah", 400);
  const excuse = b.excuse === true;
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (excuse && (reason.length < 3 || reason.length > 300))
    return void tolak(res, "data_salah", 400, { field: "reason" });
  const r = await muatRuang(db, edisi.id, id);
  if (!r) return void tolak(res, "tidak_ditemukan", 404);
  const pengawas = await muatPengawas(db, r.room);
  if (!bisaMenonton(p, pengawas, s.nim)) return void tolak(res, "tanpa_hak", 403);
  const [seat] = await db
    .select({ id: recExamSeat.id, strikeOverflow: recExamSeat.strikeOverflow })
    .from(recExamSeat)
    .where(and(eq(recExamSeat.id, seatId), eq(recExamSeat.roomId, id)))
    .limit(1);
  if (!seat) return void tolak(res, "tidak_ditemukan", 404);
  const [row] = await db
    .update(recStrike)
    .set(
      excuse
        ? { excusedBy: s.nim, excusedAt: new Date(), excuseReason: reason }
        : { excusedBy: null, excusedAt: null, excuseReason: null },
    )
    .where(
      and(
        eq(recStrike.seatId, seatId),
        eq(recStrike.roomId, id),
        eq(recStrike.clientId, b.strikeId),
      ),
    )
    .returning({ part: recStrike.part });
  if (!row) return void tolak(res, "tidak_ditemukan", 404);
  const rules = (await muatConfig(db, edisi.id)).violations;
  const tally = await poinKursi(db, seatId, row.part, seat.strikeOverflow?.[row.part] ?? 0, rules);
  antreUjian(res, id, [
    {
      j: "pelanggaran",
      s: seatId,
      d: {
        s: seatId,
        id: b.strikeId,
        excused: excuse,
        part: row.part,
        points: tally.points,
        level: tally.level,
      },
    },
  ]);
  res.status(200).json({ ok: true, part: row.part, ...tally });
}

/** The seat of this room, or null */
async function kursiRuang(db: Db, id: number, seatId: number) {
  const [seat] = await db
    .select({
      id: recExamSeat.id,
      heldAt: recExamSeat.heldAt,
      strikeOverflow: recExamSeat.strikeOverflow,
    })
    .from(recExamSeat)
    .where(and(eq(recExamSeat.id, seatId), eq(recExamSeat.roomId, id)))
    .limit(1);
  return seat ?? null;
}

/**
 * `room-warn`: a pengawas sends one seat a message (9 Nov 2026). It is kept as a staff warning, the
 * seat sees it as a dialog it must acknowledge, and it comes back with the view until it does.
 */
async function peringatkan({ req, res, s, db, edisi, p }: Ctx) {
  const b = jsonBody(req);
  const id = Number(b.id);
  const seatId = Number(b.seatId);
  if (!idOk(id) || !idOk(seatId)) return void tolak(res, "data_salah", 400);
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text || text.length > 300) return void tolak(res, "data_salah", 400, { field: "text" });
  const r = await muatRuang(db, edisi.id, id);
  if (!r) return void tolak(res, "tidak_ditemukan", 404);
  const pengawas = await muatPengawas(db, r.room);
  if (!bisaMenonton(p, pengawas, s.nim)) return void tolak(res, "tanpa_hak", 403);
  if (!(await kursiRuang(db, id, seatId))) return void tolak(res, "tidak_ditemukan", 404);
  await db.insert(recSeatWarning).values({
    seatId,
    part: r.room.state.cur,
    source: "staff",
    level: 0,
    text,
    byNim: s.nim,
  });
  antreUjian(res, id, [{ j: "kursi", s: seatId, d: { warn: { staff: true } } }]);
  res.status(200).json({ ok: true });
}

/**
 * `room-hold`: the Master holds a seat, so its answers are refused and the page shows a hold card,
 * then releases it (9 Nov 2026). On release the held time goes back as extra time through the same
 * rule as a time gift (whole minutes, 1 to 30, rounded up), but only while the part still runs: a
 * part that ended is never reopened by a release.
 */
async function tahanKursi({ req, res, s, db, edisi, p }: Ctx) {
  const b = jsonBody(req);
  const id = Number(b.id);
  const seatId = Number(b.seatId);
  if (!idOk(id) || !idOk(seatId) || typeof b.hold !== "boolean")
    return void tolak(res, "data_salah", 400);
  const r = await muatRuang(db, edisi.id, id);
  if (!r) return void tolak(res, "tidak_ditemukan", 404);
  const pengawas = await muatPengawas(db, r.room);
  if (!bisaMenonton(p, pengawas, s.nim)) return void tolak(res, "tanpa_hak", 403);
  if (r.room.state.master?.nim !== s.nim) return void tolak(res, "bukan_master", 403);
  const seat = await kursiRuang(db, id, seatId);
  if (!seat) return void tolak(res, "tidak_ditemukan", 404);
  const now = Date.now();
  if (b.hold) {
    if (!seat.heldAt)
      await db
        .update(recExamSeat)
        .set({ heldAt: new Date(now) })
        .where(eq(recExamSeat.id, seatId));
    antreUjian(res, id, [{ j: "kursi", s: seatId, d: { held: true } }]);
    return void res.status(200).json({ ok: true });
  }
  if (!seat.heldAt) return void res.status(200).json({ ok: true, creditedMs: 0 });
  await db.update(recExamSeat).set({ heldAt: null }).where(eq(recExamSeat.id, seatId));
  const state = normalize(r.room.state, now);
  const run = state.cur ? state.runs[state.cur] : undefined;
  let creditedMs = 0;
  let next: RoomState | null = null;
  if (state.stage === "parts" && run && run.state !== "ended") {
    const mnt = Math.min(30, Math.max(1, Math.ceil((now - seat.heldAt.getTime()) / 60_000)));
    const ctx = await konteksAksi(db, edisi.id, r.room, r.slot, pengawas, s.nim, null, now);
    const hasil = act(
      r.room.state,
      { act: "seat-time", seatId, deltaMs: mnt * 60_000, seq: r.room.state.seq },
      ctx,
    );
    if (hasil.ok) {
      try {
        await simpanAksi(
          db,
          r.room,
          hasil.state,
          s.nim,
          "seat-time",
          { seatId, deltaMs: mnt * 60_000, held: true },
          { reopenPart: null, lockConfig: false },
          now,
        );
        creditedMs = mnt * 60_000;
        next = hasil.state;
      } catch (e) {
        if (!(e instanceof Kalah)) throw e;
      }
    }
  }
  const pesan: PesanUjian[] = [];
  const cur = next?.cur ? next.runs[next.cur] : undefined;
  if (next) pesan.push(pesanRuang(id, next, now));
  pesan.push({
    j: "kursi",
    s: seatId,
    d: {
      held: false,
      ...(next ? { seq: next.seq, extraMs: cur?.extra[String(seatId)] ?? 0 } : {}),
    },
  });
  antreUjian(res, id, pesan);
  res.status(200).json({ ok: true, creditedMs });
}

/**
 * `room-penalty`: decide a seat's suggested score cut for one part (9 Nov 2026). Applied cuts that
 * many percent off the part's score, waived leaves it whole, clear puts it back to pending. This
 * is for the people who run the edition (the board right), never for a pengawas alone.
 */
async function putuskanPotongan({ req, res, s, db, edisi, p }: Ctx) {
  const b = jsonBody(req);
  const id = Number(b.id);
  const seatId = Number(b.seatId);
  if (!idOk(id) || !idOk(seatId)) return void tolak(res, "data_salah", 400);
  if (!p.penuh && !p.hak.board) return void tolak(res, "tanpa_hak", 403);
  if (!(PART_KEYS as readonly string[]).includes(String(b.part)))
    return void tolak(res, "data_salah", 400, { field: "part" });
  const part = b.part as PartKey;
  const clear = b.clear === true;
  const state = String(b.state);
  if (!clear && state !== "applied" && state !== "waived")
    return void tolak(res, "data_salah", 400, { field: "state" });
  const pct = state === "waived" ? 0 : Number(b.pct);
  if (!clear && (!Number.isInteger(pct) || pct < 0 || pct > 100))
    return void tolak(res, "data_salah", 400, { field: "pct" });
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 300) : "";
  const r = await muatRuang(db, edisi.id, id);
  if (!r) return void tolak(res, "tidak_ditemukan", 404);
  if (!(await kursiRuang(db, id, seatId))) return void tolak(res, "tidak_ditemukan", 404);
  if (clear) {
    await db
      .delete(recSeatPenalty)
      .where(and(eq(recSeatPenalty.seatId, seatId), eq(recSeatPenalty.part, part)));
  } else {
    await db
      .insert(recSeatPenalty)
      .values({
        seatId,
        part,
        state: state as "applied" | "waived",
        pct,
        byNim: s.nim,
        note: note || null,
      })
      .onConflictDoUpdate({
        target: [recSeatPenalty.seatId, recSeatPenalty.part],
        set: {
          state: state as "applied" | "waived",
          pct,
          byNim: s.nim,
          note: note || null,
          at: new Date(),
        },
      });
  }
  antreUjian(res, id, [
    {
      j: "pelanggaran",
      s: seatId,
      d: {
        s: seatId,
        penalty: clear ? { part, state: null, pct: 0 } : { part, state, pct },
      },
    },
  ]);
  res.status(200).json({ ok: true });
}

const CHIPS = ["esp32", "esp32s3"] as const;

/** The boards of a kit loan as typed: one or two, numbered 1 and 2, a known chip. */
export function cekPapan(v: unknown): KitBoard[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > 2) return null;
  const out: KitBoard[] = [];
  for (const [i, x] of (v as Record<string, unknown>[]).entries()) {
    if (!(CHIPS as readonly string[]).includes(String(x?.chip))) return null;
    const code =
      typeof x.code === "string" && x.code.trim() ? x.code.trim().slice(0, 24) : undefined;
    out.push({ n: (i + 1) as 1 | 2, chip: x.chip as KitBoard["chip"], ...(code ? { code } : {}) });
  }
  return out;
}

async function pinjamKit({ req, res, s, db, edisi, p }: Ctx) {
  if (!(p.penuh || p.hak.kitLoans)) return void tolak(res, "tanpa_hak", 403, { hak: "kitLoans" });
  const b = jsonBody(req);
  const id = Number(b.id);
  const candidateId = Number(b.candidateId);
  if (!idOk(id) || !idOk(candidateId)) return void tolak(res, "data_salah", 400);
  const kit = typeof b.kit === "string" ? b.kit.trim().slice(0, 24) : "";
  if (!kit) return void tolak(res, "data_salah", 400, { field: "kit" });
  const boards = cekPapan(b.boards);
  if (!boards) return void tolak(res, "data_salah", 400, { field: "boards" });
  const r = await muatRuang(db, edisi.id, id);
  if (!r) return void tolak(res, "tidak_ditemukan", 404);
  if (r.room.state.stage === "finished") return void tolak(res, "tahap_salah", 409);
  if (!(await kandidatAda(db, edisi.id, candidateId)))
    return void tolak(res, "tidak_ditemukan", 404);
  const returned = b.returned === true;
  const set = {
    kitCode: kit,
    boards,
    returnedAt: returned ? new Date() : null,
    returnedTo: returned ? s.nim : null,
  };
  await db
    .insert(recKitLoan)
    .values({ roomId: id, candidateId, lentBy: s.nim, ...set })
    .onConflictDoUpdate({ target: [recKitLoan.roomId, recKitLoan.candidateId], set });
  await writeAudit(s.nim, "rec_kit", { id, candidateId, kit, returned });
  const kits = await db.select().from(recKitLoan).where(eq(recKitLoan.roomId, id));
  antreUjian(res, id, [{ j: "catatan", s: null, d: { candidateId } }]);
  res.status(200).json({
    ok: true,
    kits: kits.map((k) => ({
      candidateId: k.candidateId,
      code: k.kitCode,
      boards: k.boards,
      returnedAt: ms(k.returnedAt),
    })),
  });
}

/** A room with a part under way: its seats are not moved (the same rule as `room-move`). */
export function ruangBerjalan(state: RoomState, now: number): boolean {
  const v = roomView(state, now).view;
  return (
    v === "part-running" || v === "livecode-running" || v === "part-paused" || v === "part-ended"
  );
}

/**
 * After a candidate's tes_tulis assignment changed (Plotting's move, Auto Isi
 * and its Urungkan, a decided request, a pick): their real seat follows to
 * the room of the new slot, when both exist (W1's ruling, 2026-10-24). A
 * practice seat stays where it is. With no room to follow to (the slot has
 * none yet, or the candidate was taken out) a seat that never drew, handed in
 * or struck is dropped, since the check-in makes it again; one that did is
 * kept where it is, because its draw is the candidate's and Susulan needs it.
 *
 * A seat is never touched while its current room, or the room it would go
 * to, has a part running (the rule `pindahKursi` applies): it stays where it
 * is and Panitia use `room-move` once that room is between parts. Returns
 * `{ tetap: true }` then, so the caller can say so in its audit line and
 * answer. Pass the transaction the assignment was written in.
 */
export async function sinkronKursi(
  db: Pick<Db, "select" | "update" | "delete">,
  candidateId: number,
  slotId: number | null,
  now = Date.now(),
): Promise<{ tetap: boolean }> {
  const kursi = await db
    .select({
      id: recExamSeat.id,
      roomId: recExamSeat.roomId,
      draw: recExamSeat.draw,
      done: recExamSeat.done,
    })
    .from(recExamSeat)
    .where(and(eq(recExamSeat.candidateId, candidateId), eq(recExamSeat.rehearsal, false)));
  if (!kursi.length) return { tetap: false };
  let tujuan: { id: number; state: RoomState } | null = null;
  if (slotId !== null) {
    [tujuan = null] = await db
      .select({ id: recExamRoom.id, state: recExamRoom.state })
      .from(recExamRoom)
      .where(and(eq(recExamRoom.slotId, slotId), eq(recExamRoom.rehearsal, false)))
      .limit(1);
  }
  let tetap = false;
  for (const k of kursi) {
    const [dari] = await db
      .select({ state: recExamRoom.state })
      .from(recExamRoom)
      .where(eq(recExamRoom.id, k.roomId))
      .limit(1);
    if ((dari && ruangBerjalan(dari.state, now)) || (tujuan && ruangBerjalan(tujuan.state, now))) {
      tetap = true;
      continue;
    }
    if (tujuan) {
      await db.update(recExamSeat).set({ roomId: tujuan.id }).where(eq(recExamSeat.id, k.id));
      continue;
    }
    if (Object.keys(k.draw).length || Object.keys(k.done).length) continue;
    const kena = await db
      .select({ id: recStrike.id })
      .from(recStrike)
      .where(eq(recStrike.seatId, k.id))
      .limit(1);
    if (kena.length) continue;
    await db.delete(recExamSeat).where(eq(recExamSeat.id, k.id));
  }
  return { tetap };
}

async function pindahKursi({ req, res, s, db, edisi, p }: Ctx) {
  if (!(p.penuh || p.hak.plotting)) return void tolak(res, "tanpa_hak", 403, { hak: "plotting" });
  const b = jsonBody(req);
  const candidateId = Number(b.candidateId);
  const toRoomId = Number(b.toRoomId);
  if (!idOk(candidateId) || !idOk(toRoomId)) return void tolak(res, "data_salah", 400);
  const [k] = await db
    .select({ id: recCandidate.id })
    .from(recCandidate)
    .where(and(eq(recCandidate.id, candidateId), eq(recCandidate.editionId, edisi.id)))
    .limit(1);
  if (!k) return void tolak(res, "tidak_ditemukan", 404);
  const tujuan = await muatRuang(db, edisi.id, toRoomId);
  if (!tujuan) return void tolak(res, "tidak_ditemukan", 404);
  const now = Date.now();
  // Only into a room that has not started.
  const vt = roomView(tujuan.room.state, now).view;
  if (vt !== "setup" && vt !== "persiapan") return void tolak(res, "tahap_salah", 409);
  const [ada] = await db
    .select()
    .from(recExamSeat)
    .where(
      and(
        eq(recExamSeat.candidateId, candidateId),
        eq(recExamSeat.rehearsal, tujuan.room.rehearsal),
      ),
    )
    .limit(1);
  // And only for a seat with no part running in its current room.
  if (ada) {
    const dari = await muatRuang(db, edisi.id, ada.roomId);
    if (dari) {
      if (ruangBerjalan(dari.room.state, now)) return void tolak(res, "ruang_berjalan", 409);
    }
  }
  let seat = ada ?? null;
  await db.transaction(async (tx) => {
    if (!tujuan.room.rehearsal && tujuan.slot) {
      const [punya] = await tx
        .select({ id: recSlotAssignment.id, slotId: recSlotAssignment.slotId })
        .from(recSlotAssignment)
        .where(
          and(
            eq(recSlotAssignment.candidateId, candidateId),
            eq(recSlotAssignment.stage, "tes_tulis"),
          ),
        )
        .limit(1);
      if (punya) {
        if (punya.slotId !== tujuan.slot.id)
          await tx
            .update(recSlotAssignment)
            .set({ slotId: tujuan.slot.id, via: "panitia", by: s.nim, at: new Date(now) })
            .where(eq(recSlotAssignment.id, punya.id));
      } else
        await tx.insert(recSlotAssignment).values({
          slotId: tujuan.slot.id,
          candidateId,
          stage: "tes_tulis",
          via: "panitia",
          by: s.nim,
          at: new Date(now),
        });
    }
    if (ada)
      [seat] = await tx
        .update(recExamSeat)
        .set({ roomId: toRoomId })
        .where(eq(recExamSeat.id, ada.id))
        .returning();
    else if (tujuan.room.rehearsal)
      [seat] = await tx
        .insert(recExamSeat)
        .values({ editionId: edisi.id, roomId: toRoomId, candidateId, rehearsal: true })
        .returning();
  });
  await writeAudit(s.nim, "rec_ruang_pindah", { candidateId, toRoomId });
  if (seat)
    antreUjian(res, toRoomId, [
      { j: "kursi", s: seat.id, d: { seq: tujuan.room.state.seq, moved: true } },
    ]);
  res.status(200).json({ ok: true, seat: seat ? { id: seat.id, roomId: seat.roomId } : null });
}

/* --------------------------------------------------- a candidate's phone */

/**
 * A candidate's own hotspot (EXAM-ENGINE 9.6a): their SSID and sealed password
 * become the room's row owned by their seat (`by: cand`, replacing an earlier
 * one). Prompt 10's seat endpoint calls this; the password never leaves.
 */
export async function simpanHotspotKursi(
  db: Db,
  roomId: number,
  seatId: number,
  ssid: string,
  pass: string,
): Promise<{ ssid: string } | { galat: { field: string; kode: string }[] }> {
  const salah = validHotspot(ssid, pass);
  if (salah.length) return { galat: salah };
  const id = seatHotspotId(seatId);
  const baris: RoomHotspot = {
    id,
    owner: { seat: seatId },
    ssid: ssid.trim(),
    pass: bungkus(pass, `${roomId}:${id}`, LABEL_HOTSPOT),
    cap: 0,
    by: "cand",
  };
  await db.transaction(async (tx) => {
    const [r] = await tx
      .select({ hotspots: recExamRoom.hotspots })
      .from(recExamRoom)
      .where(eq(recExamRoom.id, roomId))
      .for("update");
    const lain = (r?.hotspots ?? []).filter((h) => h.id !== id);
    await tx
      .update(recExamRoom)
      .set({ hotspots: [...lain, baris], updatedAt: new Date() })
      .where(eq(recExamRoom.id, roomId));
  });
  return { ssid: baris.ssid };
}
