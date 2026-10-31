/**
 * The Live Coding deal (EXAM-ENGINE 3.4, 9.1): the seat's topic and protocol,
 * decided on the server and stored before the reels move, the automatic deal at
 * Start, the Master's re-roll, and the room's Finish. This file also plugs
 * into prompt 11's `roomHooks`.
 */
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  recExamRoom,
  recExamSeat,
  recLcTopic,
  recLivecode,
  type RecLcTopicRow,
  type RecLivecodeRow,
} from "../../src/lib/schema.js";
import type { Protocol } from "../../src/lib/recruitment/exam-types.js";
import { roomSeed } from "../../src/lib/recruitment/draw.js";
import {
  dealProtocol,
  dealTopic,
  rerollProtocol,
  rerollTopic,
} from "../../src/lib/recruitment/lc-deal.js";
import {
  templateKey,
  type LcBoard,
  type LcSpin,
  type RerollWhy,
} from "../../src/lib/recruitment/lc-types.js";
import type { SpinReply } from "../../src/lib/recruitment/lc-api.js";
import { bungkus } from "./rahasia.js";
import type { Db } from "./recruitment-data.js";
import { muatConfig, roomHooks } from "./recruitment-room.js";
import { LABEL_MQTT, muatGaram, protokolBoleh, type KonteksLc } from "./recruitment-lc-common.js";
import { antriMqtt } from "./recruitment-lc-agent.js";
import { muatTemplate, semaiKolam, topikSiapRows } from "./recruitment-lc-pool.js";

export class GalatLc extends Error {
  constructor(
    public kode: string,
    public status = 409,
  ) {
    super(kode);
  }
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Oleh = LcSpin["by"];

const ALFABET = Array.from({ length: 123 }, (_, i) => String.fromCharCode(i)).filter(
  (c) => /[A-Za-z2-9]/.test(c) && !"IOl".includes(c),
);

/** A random 24 character password for a seat's broker account. */
export function sandiAcak(): string {
  return Array.from(randomBytes(24), (b) => ALFABET[b % ALFABET.length]).join("");
}

export const akunUntuk = (roomId: number, seatId: number) => `rec${roomId}s${seatId}`;

/* ----------------------------------------------------------- the seat's row */

/** The seat's row, made with Papan 1 on its first use; locked for the deal that follows. */
async function kunciBaris(
  tx: Tx,
  edisiId: number,
  seat: { id: number; roomId: number },
  chip: "esp32" | "esp32s3" = "esp32",
): Promise<RecLivecodeRow> {
  await tx
    .insert(recLivecode)
    .values({
      seatId: seat.id,
      editionId: edisiId,
      roomId: seat.roomId,
      boards: [{ n: 1, chip, code: "", rev: 0 }],
    })
    .onConflictDoNothing();
  const [r] = await tx
    .select()
    .from(recLivecode)
    .where(eq(recLivecode.seatId, seat.id))
    .for("update");
  return r;
}

const spinBaru = (
  what: LcSpin["what"],
  value: number | string,
  by: Oleh,
  reason?: RerollWhy,
): LcSpin => ({ at: Date.now(), what, value, by, ...(reason ? { reason } : {}) });

/** The starting code of every board once the protocol is known. */
function papanDariTemplate(boards: LcBoard[], code: string): LcBoard[] {
  return boards.map((b) => ({ ...b, code, rev: b.rev + 1 }));
}

async function pakaiTemplate(
  db: Db,
  edisiId: number,
  protocol: Protocol,
  variant: "http" | "ws" | null,
): Promise<string> {
  return muatTemplate(db, edisiId, templateKey(protocol, variant));
}

/* ----------------------------------------------------------------- the deal */

async function counts(tx: Tx, roomId: number, except?: number) {
  const rows = await tx
    .select({ seatId: recLivecode.seatId, protocol: recLivecode.protocol })
    .from(recLivecode)
    .where(eq(recLivecode.roomId, roomId));
  const used: Partial<Record<Protocol, number>> = {};
  let dealt = 0;
  for (const r of rows) {
    if (!r.protocol || r.seatId === except) continue;
    used[r.protocol] = (used[r.protocol] ?? 0) + 1;
    dealt++;
  }
  return { used, dealt };
}

/**
 * Deals what the seat lacks: the topic first, then the protocol. Returns what
 * the seat holds afterwards. Idempotent: a seat with a result keeps it.
 */
export async function bagikan(
  db: Db,
  edisiId: number,
  seat: { id: number; roomId: number },
  what: "topic" | "protocol",
  by: Oleh,
): Promise<{ lc: RecLivecodeRow; topic: RecLcTopicRow | null; baru: boolean }> {
  const ready = await topikSiapRows(db, edisiId);
  if (!ready.length) throw new GalatLc("tidak_ada_topik");
  const config = await muatConfig(db, edisiId);
  const seed = await roomSeed(await muatGaram(db, edisiId), seat.roomId);
  const nb = { akun: null as { u: string; p: string } | null };

  const res = await db.transaction(async (tx) => {
    const [room] = await tx
      .select()
      .from(recExamRoom)
      .where(eq(recExamRoom.id, seat.roomId))
      .for("update");
    let lc = await kunciBaris(tx, edisiId, seat);
    let baru = false;
    const spins = [...lc.spins];
    let topicId = lc.topicId;
    if (!topicId) {
      topicId = dealTopic(
        seed,
        ready.map((t) => t.id),
        room.topicNext,
      );
      await tx
        .update(recExamRoom)
        .set({ topicNext: room.topicNext + 1 })
        .where(eq(recExamRoom.id, room.id));
      spins.push(spinBaru("topic", topicId, by));
      baru = what === "topic" || baru;
    }
    let protocol = lc.protocol;
    if (what === "protocol" && !protocol) {
      const topic = ready.find((t) => t.id === topicId);
      const { used, dealt } = await counts(tx, room.id);
      protocol = dealProtocol(
        (topic?.fits ?? []) as Protocol[],
        protokolBoleh(config),
        used,
        seed,
        dealt,
      );
      spins.push(spinBaru("protocol", protocol, by));
      baru = true;
    }
    if (!baru && spins.length === lc.spins.length) return { lc, baru: false };
    const variant = protocol === "httpws" ? (lc.variant ?? "http") : null;
    let boards = lc.boards;
    if (protocol && !lc.protocol) {
      // Through tx: a query on db would need a second connection while this one holds the room row.
      const code = await pakaiTemplate(tx as unknown as Db, edisiId, protocol, variant);
      boards = papanDariTemplate(boards, code);
      if (protocol === "mqtt" && !lc.mqtt) {
        nb.akun = { u: akunUntuk(room.id, seat.id), p: sandiAcak() };
      }
    }
    const [row] = await tx
      .update(recLivecode)
      .set({
        topicId,
        protocol,
        variant,
        spins,
        boards,
        ...(nb.akun
          ? { mqtt: { u: nb.akun.u, p: bungkus(nb.akun.p, String(seat.id), LABEL_MQTT) } }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(recLivecode.seatId, seat.id))
      .returning();
    lc = row;
    return { lc, baru };
  });
  if (nb.akun) await antriMqtt(db, seat.roomId, "set", [nb.akun]);
  const topic = res.lc.topicId
    ? (ready.find((t) => t.id === res.lc.topicId) ?? (await ambilTopik(db, res.lc.topicId)))
    : null;
  return { ...res, topic };
}

async function ambilTopik(db: Db, id: number): Promise<RecLcTopicRow | null> {
  const [t = null] = await db.select().from(recLcTopic).where(eq(recLcTopic.id, id)).limit(1);
  return t;
}

/** `lc-spin`: the seat presses Putar. */
export async function putar(c: KonteksLc, what: "topic" | "protocol"): Promise<SpinReply> {
  if (what === "protocol" && !c.lc?.topicId) {
    // The protocol reel wakes only after the topic landed; a protocol asked first is refused
    throw new GalatLc("topik_dulu");
  }
  const r = await bagikan(c.db, c.edisiId, c.seat, what, "seat");
  const last = [...r.lc.spins].reverse().find((s) => s.what === what);
  return {
    ok: true,
    topic: r.topic
      ? {
          id: r.topic.id,
          title: r.topic.title,
          brief: r.topic.brief,
          parts: r.topic.parts,
          icon: r.topic.icon,
        }
      : null,
    protocol: r.lc.protocol,
    by: last?.by ?? "seat",
    at: last?.at ?? Date.now(),
  };
}

/** Start of the Live Coding timer: every seat of the room still without a topic or protocol gets one (`auto`). */
export async function bagikanSisa(db: Db, roomId: number): Promise<void> {
  const [room] = await db.select().from(recExamRoom).where(eq(recExamRoom.id, roomId)).limit(1);
  if (!room) return;
  const seats = await db.select().from(recExamSeat).where(eq(recExamSeat.roomId, roomId));
  const ordered = [...seats].sort((a, b) => a.id - b.id);
  for (const seat of ordered) {
    const [lc = null] = await db
      .select()
      .from(recLivecode)
      .where(eq(recLivecode.seatId, seat.id))
      .limit(1);
    try {
      if (!lc?.topicId) await bagikan(db, room.editionId, seat, "topic", "auto");
      if (!lc?.protocol) await bagikan(db, room.editionId, seat, "protocol", "auto");
    } catch (e) {
      console.error(`[lc] auto deal for seat ${seat.id}:`, e);
    }
  }
}

/** The Master's re-roll of one seat (11.3): a topic and its protocol again, or the protocol alone. */
export async function undiUlang(
  db: Db,
  roomId: number,
  seatId: number,
  what: "topic" | "protocol",
  reason: RerollWhy,
): Promise<void> {
  const [seat] = await db.select().from(recExamSeat).where(eq(recExamSeat.id, seatId)).limit(1);
  if (!seat || seat.roomId !== roomId) return;
  const edisiId = seat.editionId;
  const ready = await topikSiapRows(db, edisiId);
  if (!ready.length) return;
  const config = await muatConfig(db, edisiId);
  const seed = await roomSeed(await muatGaram(db, edisiId), roomId);
  const nb = { akun: null as { u: string; p: string } | null };

  await db.transaction(async (tx) => {
    const [room] = await tx
      .select()
      .from(recExamRoom)
      .where(eq(recExamRoom.id, roomId))
      .for("update");
    const lc = await kunciBaris(tx, edisiId, seat);
    const spins = [...lc.spins];
    let topicId = lc.topicId;
    let protocol = lc.protocol;
    const { used, dealt } = await counts(tx, roomId, seatId);
    if (what === "topic" || !topicId) {
      const r = rerollTopic(
        seed,
        ready.map((t) => t.id),
        room.topicNext,
        topicId,
      );
      topicId = r.topicId;
      await tx
        .update(recExamRoom)
        .set({ topicNext: room.topicNext + r.used })
        .where(eq(recExamRoom.id, roomId));
      spins.push(spinBaru("topic", topicId, "master", reason));
      const topic = ready.find((t) => t.id === topicId);
      protocol = dealProtocol(
        (topic?.fits ?? []) as Protocol[],
        protokolBoleh(config),
        used,
        seed,
        dealt,
      );
      spins.push(spinBaru("protocol", protocol, "master", reason));
    } else {
      const topic = ready.find((t) => t.id === topicId);
      protocol = protocol
        ? rerollProtocol(
            protocol,
            (topic?.fits ?? []) as Protocol[],
            protokolBoleh(config),
            used,
            seed,
            dealt,
          )
        : dealProtocol((topic?.fits ?? []) as Protocol[], protokolBoleh(config), used, seed, dealt);
      spins.push(spinBaru("protocol", protocol, "master", reason));
    }
    const variant = protocol === "httpws" ? (lc.variant ?? "http") : null;
    // A new protocol starts again from its template; the same protocol keeps what the candidate wrote
    let boards = lc.boards;
    if (protocol !== lc.protocol || what === "topic") {
      boards = papanDariTemplate(
        boards,
        await pakaiTemplate(tx as unknown as Db, edisiId, protocol, variant),
      );
    }
    if (protocol === "mqtt" && !lc.mqtt) nb.akun = { u: akunUntuk(roomId, seatId), p: sandiAcak() };
    await tx
      .update(recLivecode)
      .set({
        topicId,
        protocol,
        variant,
        spins,
        boards,
        ...(nb.akun
          ? { mqtt: { u: nb.akun.u, p: bungkus(nb.akun.p, String(seatId), LABEL_MQTT) } }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(recLivecode.seatId, seatId));
  });
  if (nb.akun) await antriMqtt(db, roomId, "set", [nb.akun]);
}

/* ------------------------------------------------------------------ hooks */

/** The protocol each seat of the room was dealt (for the hotspot count). */
export async function protokolRuang(db: Db, roomId: number): Promise<Map<number, Protocol>> {
  const rows = await db
    .select({ seatId: recLivecode.seatId, protocol: recLivecode.protocol })
    .from(recLivecode)
    .where(and(eq(recLivecode.roomId, roomId), sql`${recLivecode.protocol} is not null`));
  return new Map(rows.map((r) => [r.seatId, r.protocol as Protocol]));
}

/** Whether Live Coding can start: at least one ready topic. */
export async function topikSiap(db: Db, edisiId: number): Promise<boolean> {
  await semaiKolam(db, edisiId);
  return (await topikSiapRows(db, edisiId)).length > 0;
}

/** Plugs this file into prompt 11's room (done once, when the Live Coding handler loads). */
export function pasangKait(tutup: (db: Db, roomId: number) => Promise<void>): void {
  roomHooks.protokol = protokolRuang;
  roomHooks.topikSiap = topikSiap;
  roomHooks.spinRest = bagikanSisa;
  roomHooks.reroll = undiUlang;
  roomHooks.lcClose = tutup;
}
