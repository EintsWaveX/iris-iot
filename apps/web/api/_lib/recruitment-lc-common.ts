/**
 * What the Live Coding handlers share: the seat's context, the room's phase for
 * Live Coding, the seat's number in the room, and who may grade a room. Reads
 * rows and asks the pure modules; it restates no rule of the room's clock.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { SessionPayload } from "../../src/lib/auth.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import {
  recCandidate,
  recExamConfig,
  recExamRoom,
  recExamSeat,
  recSlot,
  recSlotAssignment,
  recSlotExaminer,
  type RecExamRoomRow,
  type RecExamSeatRow,
  type RecSlotRow,
} from "../../src/lib/schema.js";
import type { ExamConfig, RoomState } from "../../src/lib/recruitment/exam-types.js";
import { roomView } from "../../src/lib/recruitment/room.js";
import { tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { muatKursiSendiri } from "./recruitment-seat.js";
import { muatConfig, sudahMasuk } from "./recruitment-room.js";
import type { PelakuServer } from "./recruitment-rights.js";

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

/* ------------------------------------------------------------- the context */

export type FaseLc = "belum" | "spin" | "kerja" | "usai" | "selesai";

/** Where the room is for Live Coding: before it, the timer running, over, or finished. */
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
  const config = await muatConfig(db, edisi.id);
  return { db, edisiId: edisi.id, seat, room, slot, config, now: Date.now() };
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

/* ----------------------------------------------------------------- grading */

/** Who may see a room's Live Coding results: the full right, the bank right, or a plotted pengawas. */
async function bolehMenilai(
  db: Db,
  room: RecExamRoomRow,
  p: PelakuServer | null,
  nim: string,
): Promise<boolean> {
  if (!p) return false;
  if (p.penuh || p.hak.bank) return true;
  if (room.slotId === null) return false;
  const [r] = await db
    .select({ n: recSlotExaminer.asistenNim })
    .from(recSlotExaminer)
    .where(
      and(
        eq(recSlotExaminer.slotId, room.slotId),
        eq(recSlotExaminer.asistenNim, nim),
        eq(recSlotExaminer.role, "pengawas"),
      ),
    )
    .limit(1);
  return !!r;
}

export async function ruangDinilai(
  db: Db,
  edisiId: number,
  id: number,
  p: PelakuServer | null,
  nim: string,
): Promise<RecExamRoomRow | null> {
  const [room] = await db
    .select()
    .from(recExamRoom)
    .where(and(eq(recExamRoom.id, id), eq(recExamRoom.editionId, edisiId)))
    .limit(1);
  if (!room) return null;
  return (await bolehMenilai(db, room, p, nim)) ? room : null;
}
