/**
 * What the Live Coding handlers share (prompt 12): the seat's context, the
 * gateway's secret and tokens, the hotspot a board uses, the seat's header and
 * its number in the room. Reads rows and asks the pure modules; it restates no
 * rule of the room's clock or the hotspot plan.
 */
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { SessionPayload } from "../../src/lib/auth.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import {
  recCandidate,
  recExamConfig,
  recExamSeat,
  recKitLoan,
  recLivecode,
  recSlot,
  recSlotAssignment,
  server,
  type RecExamRoomRow,
  type RecExamSeatRow,
  type RecLivecodeRow,
  type RecSlotRow,
} from "../../src/lib/schema.js";
import type { ExamConfig, Protocol, RoomState } from "../../src/lib/recruitment/exam-types.js";
import { roomView } from "../../src/lib/recruitment/room.js";
import {
  planHotspots,
  type HotspotPlan,
  type SeatLoan,
} from "../../src/lib/recruitment/hotspot.js";
import type { KitBoard, RoomHotspot } from "../../src/lib/recruitment/room-types.js";
import { buildHeader } from "../../src/lib/recruitment/lc-header.js";
import { signLcClaim } from "../../src/lib/recruitment/lc-gateway.js";
import { buka } from "./rahasia.js";
import { tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { muatKursiSendiri } from "./recruitment-seat.js";
import { LABEL_HOTSPOT, muatConfig, sudahMasuk } from "./recruitment-room.js";

export const LABEL_MQTT = "rec-mqtt";
const KURSI_STATUS: Record<string, number> = {
  belum_masuk: 403,
  bukan_peserta: 403,
  langkah_belum: 409,
  belum_dibuka: 409,
  ruang_selesai: 409,
  waktu_habis: 409,
};
export const tolakLc = (res: ApiResponse, kode: string, extra: Record<string, unknown> = {}) =>
  tolak(res, kode, KURSI_STATUS[kode] ?? 409, extra);

/** The gateway Worker's shared secret (REC_GATEWAY_SECRET); null when it is not set up. */
export function gatewaySecret(): string | null {
  const s = process.env.REC_GATEWAY_SECRET?.trim();
  return s && s.length >= 32 ? s : null;
}

/* ------------------------------------------------------------- the context */

export type FaseLc = "belum" | "spin" | "kerja" | "usai" | "selesai";

/** Where the room is for Live Coding: before the spins, spinning, the timer running, over, or finished. */
export function faseLc(state: RoomState, now: number): FaseLc {
  const { view, part } = roomView(state, now);
  if (view === "livecode-spin") return "spin";
  if (view === "finished") return "selesai";
  if (part !== "livecode") {
    const ran = state.runs.livecode;
    return ran ? "usai" : "belum";
  }
  if (view === "livecode-running") return "kerja";
  return "usai";
}

export interface KonteksLc {
  db: Db;
  edisiId: number;
  seat: RecExamSeatRow;
  room: RecExamRoomRow;
  slot: RecSlotRow | null;
  lc: RecLivecodeRow | null;
  config: ExamConfig;
  now: number;
}

/** The candidate's seat for a Live Coding action, or the answer that refuses. */
export async function muatKonteksSeat(
  req: ApiRequest,
  res: ApiResponse,
  s: SessionPayload,
): Promise<KonteksLc | null> {
  void req;
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return null;
  const [cand] = await db
    .select({ id: recCandidate.id })
    .from(recCandidate)
    .where(and(eq(recCandidate.editionId, edisi.id), eq(recCandidate.nim, s.nim)))
    .limit(1);
  if (!cand) return (void tolakLc(res, "bukan_peserta"), null);
  const { seat, room } = await muatKursiSendiri(db, edisi.id, cand.id);
  if (!seat || !room) return (void tolakLc(res, "belum_masuk"), null);
  if (!sudahMasuk(seat.checkin)) return (void tolakLc(res, "langkah_belum"), null);
  const [slot = null] = room.slotId
    ? await db.select().from(recSlot).where(eq(recSlot.id, room.slotId)).limit(1)
    : [];
  const [lc = null] = await db
    .select()
    .from(recLivecode)
    .where(eq(recLivecode.seatId, seat.id))
    .limit(1);
  const config = await muatConfig(db, edisi.id);
  return { db, edisiId: edisi.id, seat, room, slot, lc, config, now: Date.now() };
}

export async function muatGaram(db: Db, edisiId: number): Promise<string> {
  const [r] = await db
    .select({ salt: recExamConfig.salt })
    .from(recExamConfig)
    .where(eq(recExamConfig.editionId, edisiId))
    .limit(1);
  if (!r) throw new Error("the exam config has no salt yet");
  return r.salt;
}

/* ---------------------------------------------------------- numbers, tokens */

/** The seat numbers of a room as the console prints them: candidates by NIM, from 1. */
export async function nomorKursi(db: Db, room: RecExamRoomRow): Promise<Map<number, number>> {
  const duduk = room.slotId
    ? await db
        .select({ candidateId: recSlotAssignment.candidateId })
        .from(recSlotAssignment)
        .where(eq(recSlotAssignment.slotId, room.slotId))
    : [];
  const seats = await db
    .select({ id: recExamSeat.id, candidateId: recExamSeat.candidateId })
    .from(recExamSeat)
    .where(eq(recExamSeat.roomId, room.id));
  const ids = [
    ...new Set([...duduk.map((d) => d.candidateId), ...seats.map((x) => x.candidateId)]),
  ];
  if (!ids.length) return new Map();
  const kand = await db
    .select({ id: recCandidate.id })
    .from(recCandidate)
    .where(inArray(recCandidate.id, ids))
    .orderBy(asc(recCandidate.nim));
  const noOf = new Map(kand.map((k, i) => [k.id, i + 1]));
  return new Map(seats.map((x) => [x.id, noOf.get(x.candidateId) ?? 0]));
}

const JAM = 3600;

/** A seat's gateway token. Its expiry is fixed by the room's evening, so the token (and the header) never changes between compiles. */
export async function tokenKursi(
  room: RecExamRoomRow,
  slot: RecSlotRow | null,
  seatId: number,
): Promise<string> {
  const secret = gatewaySecret();
  if (!secret) return "";
  const base = (slot?.endsAt ?? room.createdAt).getTime() / 1000;
  return signLcClaim({ r: room.id, s: seatId, exp: Math.floor(base) + 8 * JAM }, secret);
}

/* ---------------------------------------------------------------- hotspots */

export interface PapanTempat {
  id: string;
  ssid: string;
  pass: string;
  own: boolean;
}

export interface RencanaRuang {
  plan: HotspotPlan;
  rows: RoomHotspot[];
  /** Every seat's livecode row */
  lcs: Map<number, RecLivecodeRow>;
  /** Boards the room's seats use */
  loans: SeatLoan[];
}

/** The hotspot plan of a room from the lent boards, the seats' boards and the dealt protocols. */
export async function rencanaRuang(db: Db, room: RecExamRoomRow): Promise<RencanaRuang> {
  const seats = await db.select().from(recExamSeat).where(eq(recExamSeat.roomId, room.id));
  const lcs = new Map(
    (await db.select().from(recLivecode).where(eq(recLivecode.roomId, room.id))).map((r) => [
      r.seatId,
      r,
    ]),
  );
  const kits = await db.select().from(recKitLoan).where(eq(recKitLoan.roomId, room.id));
  const loans: SeatLoan[] = seats.map((x) => {
    const lc = lcs.get(x.id);
    const kit = kits.find((k) => k.candidateId === x.candidateId);
    const boards: KitBoard[] =
      lc && lc.boards.length
        ? lc.boards.map((b) => ({ n: b.n, chip: b.chip }))
        : kit && kit.boards.length
          ? kit.boards
          : [{ n: 1, chip: "esp32" }];
    return { seatId: x.id, boards, protocol: lc?.protocol ?? null };
  });
  const moves: Record<string, string> = {};
  for (const [seatId, lc] of lcs)
    for (const b of lc.boards) if (b.moved) moves[`${seatId}:${b.n}`] = b.moved;
  return { plan: planHotspots(room.hotspots, loans, moves), rows: room.hotspots, lcs, loans };
}

/** The hotspot a board uses, or null (a BLE seat, no phone with room, nothing set up). */
export function papanDi(
  r: RencanaRuang,
  roomId: number,
  seatId: number,
  n: number,
): PapanTempat | null {
  const at = r.plan.assignments.find((a) => a.seatId === seatId && a.n === n)?.hotspot;
  const row = at ? r.rows.find((h) => h.id === at) : undefined;
  if (!row) return null;
  const pass = buka(row.pass, `${roomId}:${row.id}`, LABEL_HOTSPOT);
  if (pass === null) return null;
  return { id: row.id, ssid: row.ssid, pass, own: typeof row.owner === "object" };
}

/* ------------------------------------------------------------------ header */

/** The seat's MQTT account with its password opened, or null. */
export function akunMqtt(lc: RecLivecodeRow | null): { user: string; pass: string } | null {
  if (!lc?.mqtt) return null;
  const pass = buka(lc.mqtt.p, String(lc.seatId), LABEL_MQTT);
  return pass === null ? null : { user: lc.mqtt.u, pass };
}

/** iris_seat.h for one board of a seat. */
export async function headerPapan(
  c: Pick<KonteksLc, "room" | "slot" | "lc" | "seat">,
  r: RencanaRuang,
  n: 1 | 2,
): Promise<string> {
  const ble = c.lc?.protocol === "ble";
  const tempat = ble ? null : papanDi(r, c.room.id, c.seat.id, n);
  return buildHeader({
    ssid: tempat?.ssid ?? null,
    pass: tempat?.pass ?? null,
    seatId: c.seat.id,
    board: n,
    token: await tokenKursi(c.room, c.slot, c.seat.id),
    mqtt: c.lc?.protocol === "mqtt" ? akunMqtt(c.lc) : null,
  });
}

/* ------------------------------------------------------------------- agent */

/** Some agent reports it can compile and has beaten recently. */
export async function agenSiap(db: Db, now = Date.now()): Promise<boolean> {
  const [r] = await db
    .select({ id: server.id })
    .from(server)
    .where(
      and(
        sql`${server.infoSistem} -> 'kompilasi' is not null`,
        gt(server.kondisiPada, new Date(now - 120_000)),
      ),
    )
    .limit(1);
  return !!r;
}

export const protokolBoleh = (config: ExamConfig): Protocol[] => config.livecode.protocols;
