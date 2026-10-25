/**
 * Pilih Jadwal (S2): candidates pick their own slot while the stage's pick
 * window is open, change it by request until H-1 23.59, and Panitia with the
 * Plotting right set up the slots, decide requests, move anyone and run Auto
 * Isi. The rules are in src/lib/recruitment/slots.ts; this file reads the
 * rows, calls them, and does the one thing a pure function cannot: count the
 * seats of a slot inside a transaction that holds the slot's row lock, so two
 * candidates racing for the last seat cannot both win.
 *
 * A candidate only ever receives seat counts, never another candidate's name
 * or number.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, pgErrorCode } from "./http.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import {
  praktikan,
  recAccount,
  recCandidate,
  recEvent,
  recEventLog,
  recSlot,
  recSlotAssignment,
  recSlotChange,
  type RecSlotRow,
} from "../../src/lib/schema.js";
import { addDays } from "../../src/lib/recruitment/calendar.js";
import { tanggalWib } from "../../src/lib/recruitment/gates.js";
import {
  autoFill,
  canChange,
  changeCutoff,
  judgeChange,
  judgeDecision,
  judgePick,
  pickEvent,
  pickOpen,
  pickWindow,
  type SlotInfo,
} from "../../src/lib/recruitment/slots.js";
import { pickEligible, standing } from "../../src/lib/recruitment/standing.js";
import {
  STAGES,
  type BoardRequest,
  type CandidateSlotsStage,
  type PickWindowInfo,
  type RecEvent,
  type SlotChangeStatus,
  type SlotSeat,
  type SlotVia,
  type StageKey,
} from "../../src/lib/recruitment/types.js";
import {
  muatEvents,
  muatHasilBanyak,
  muatKandidat,
  tolak,
  wajibEdisi,
  type Db,
} from "./recruitment-data.js";
import { muatPelaku, wajibHak } from "./recruitment-rights.js";
import { namaKandidat } from "./recruitment-akun.js";
import { sinkronKursi } from "./recruitment-room.js";

const tahap = (v: unknown): StageKey | null =>
  typeof v === "string" && (STAGES as readonly string[]).includes(v) ? (v as StageKey) : null;

const info = (r: RecSlotRow): SlotInfo => ({
  id: r.id,
  stage: r.stage,
  eventId: r.eventId,
  room: r.room,
  startsAt: r.startsAt.toISOString(),
  endsAt: r.endsAt.toISOString(),
  capacity: r.capacity,
});

const waktu = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? null : t;
};

/** The slots of a stage, each with its seat count. */
async function muatKursi(db: Db, edisiId: number, stage: StageKey): Promise<SlotSeat[]> {
  const slots = await db
    .select()
    .from(recSlot)
    .where(and(eq(recSlot.editionId, edisiId), eq(recSlot.stage, stage)))
    .orderBy(asc(recSlot.startsAt), asc(recSlot.room), asc(recSlot.id));
  const ids = slots.map((r) => r.id);
  const hitung = ids.length
    ? await db
        .select({ slotId: recSlotAssignment.slotId, n: sql<number>`count(*)::int` })
        .from(recSlotAssignment)
        .where(inArray(recSlotAssignment.slotId, ids))
        .groupBy(recSlotAssignment.slotId)
    : [];
  const peta = new Map(hitung.map((h) => [h.slotId, h.n]));
  return slots.map((r) => ({ ...info(r), taken: peta.get(r.id) ?? 0 }));
}

function jendela(events: RecEvent[], stage: StageKey, now: Date): PickWindowInfo | null {
  const e = pickEvent(events, stage);
  if (!e) return null;
  const w = pickWindow(e);
  return {
    stage,
    eventId: e.id,
    opensAt: w.opensAt.toISOString(),
    closesAt: w.closesAt.toISOString(),
    open: pickOpen(events, stage, now),
  };
}

/** A candidate's standing as the server sees it (a revealed result counts). */
async function posisi(
  db: Db,
  events: RecEvent[],
  k: Parameters<typeof standing>[0] & { id: number },
  now: Date,
) {
  const hasil = await muatHasilBanyak(db, [k.id]);
  return standing(k, hasil.get(k.id) ?? [], events, now);
}

/* ------------------------------------------------------------------ GET */

/** GET slots: the candidate's own stages, or (Plotting right) the Panitia board. */
export async function handleSlot(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const now = new Date();
  const events = await muatEvents(db, edisi.id);

  if (s.role === "praktikan") {
    const k = await muatKandidat(db, edisi.id, s.nim);
    if (!k) return void res.status(200).json({ ok: true, stages: [], now: now.toISOString() });
    const st = await posisi(db, events, k, now);
    const [kursi, minta] = await Promise.all([
      db.select().from(recSlotAssignment).where(eq(recSlotAssignment.candidateId, k.id)),
      db
        .select()
        .from(recSlotChange)
        .where(eq(recSlotChange.candidateId, k.id))
        .orderBy(desc(recSlotChange.createdAt)),
    ]);
    const stages: CandidateSlotsStage[] = [];
    for (const e of events.filter((v) => v.kind === "pick" && v.stage)) {
      const stage = e.stage!;
      const punya = kursi.find((a) => a.stage === stage) ?? null;
      // Someone not in the stage and with no seat there sees nothing of it.
      if (!punya && !pickEligible(st, stage)) continue;
      const w = jendela(events, stage, now)!;
      const slots = await muatKursi(db, edisi.id, stage);
      const milik = punya ? slots.find((x) => x.id === punya.slotId) : undefined;
      const terakhir = minta.find((m) => m.stage === stage) ?? null;
      stages.push({
        window: w,
        slots,
        mine: punya ? { slotId: punya.slotId, via: punya.via, at: punya.at.toISOString() } : null,
        changeUntil: milik ? changeCutoff(milik).toISOString() : null,
        canChange: !!milik && canChange(milik, now),
        change: terakhir
          ? {
              id: terakhir.id,
              toSlot: terakhir.toSlot,
              reason: terakhir.reason,
              status: terakhir.status,
              note: terakhir.note,
              decidedAt: terakhir.decidedAt ? terakhir.decidedAt.toISOString() : null,
            }
          : null,
      });
    }
    return void res.status(200).json({ ok: true, stages, now: now.toISOString() });
  }

  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "plotting")) return;
  const stage = tahap(req.query.stage) ?? "tes_tulis";
  const slots = await muatKursi(db, edisi.id, stage);
  const duduk = slots.length
    ? await db
        .select({
          slotId: recSlotAssignment.slotId,
          candidateId: recSlotAssignment.candidateId,
          via: recSlotAssignment.via,
          nim: recCandidate.nim,
          nama: namaKandidat,
        })
        .from(recSlotAssignment)
        .innerJoin(recCandidate, eq(recCandidate.id, recSlotAssignment.candidateId))
        .leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))
        .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
        .where(
          inArray(
            recSlotAssignment.slotId,
            slots.map((x) => x.id),
          ),
        )
        .orderBy(asc(recCandidate.nim))
    : [];
  const peserta = await muatPeserta(db, edisi.id, stage, events, now);
  const ditempatkan = new Set(duduk.map((d) => d.candidateId));
  const minta = await db
    .select({
      m: recSlotChange,
      nim: recCandidate.nim,
      nama: namaKandidat,
    })
    .from(recSlotChange)
    .innerJoin(recCandidate, eq(recCandidate.id, recSlotChange.candidateId))
    .leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))
    .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
    .where(and(eq(recCandidate.editionId, edisi.id), eq(recSlotChange.stage, stage)))
    .orderBy(desc(recSlotChange.createdAt))
    .limit(80);
  const requests: BoardRequest[] = minta.map(({ m, nim, nama }) => ({
    id: m.id,
    candidateId: m.candidateId,
    nim,
    nama: nama ?? "",
    fromSlot: m.fromSlot,
    toSlot: m.toSlot,
    reason: m.reason,
    status: m.status,
    note: m.note,
    createdAt: m.createdAt.toISOString(),
    decidedBy: m.decidedBy,
    decidedAt: m.decidedAt ? m.decidedAt.toISOString() : null,
  }));
  res.status(200).json({
    ok: true,
    stage,
    window: jendela(events, stage, now),
    slots: slots.map((x) => ({
      ...x,
      seats: duduk
        .filter((d) => d.slotId === x.id)
        .map((d) => ({
          candidateId: d.candidateId,
          nim: d.nim,
          nama: d.nama ?? "",
          via: d.via as SlotVia,
        })),
    })),
    unplaced: peserta.filter((c) => !ditempatkan.has(c.candidateId)),
    requests,
    now: now.toISOString(),
  });
}

/** Everyone in a stage who may pick its slots (the server's standing). */
async function muatPeserta(
  db: Db,
  edisiId: number,
  stage: StageKey,
  events: RecEvent[],
  now: Date,
): Promise<{ candidateId: number; nim: string; nama: string }[]> {
  const kand = await db
    .select({
      id: recCandidate.id,
      nim: recCandidate.nim,
      nama: namaKandidat,
      status: recCandidate.status,
      stage: recCandidate.currentStage,
    })
    .from(recCandidate)
    .leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))
    .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
    .where(eq(recCandidate.editionId, edisiId))
    .orderBy(asc(recCandidate.nim));
  const hasil = await muatHasilBanyak(
    db,
    kand.map((k) => k.id),
  );
  return kand
    .filter((k) =>
      pickEligible(
        standing({ status: k.status, currentStage: k.stage }, hasil.get(k.id) ?? [], events, now),
        stage,
      ),
    )
    .map((k) => ({ candidateId: k.id, nim: k.nim, nama: k.nama ?? "" }));
}

/* ----------------------------------------------------------- candidate */

const KODE_PILIH: Record<string, number> = {
  bukan_peserta: 403,
  slot_salah: 404,
  jendela_tutup: 409,
  sudah_pilih: 409,
  penuh: 409,
};

/** POST slot-pick { slotId }: first come first served, one transaction. */
export async function handlePilih(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const slotId = Number(jsonBody(req).slotId);
  if (!Number.isInteger(slotId) || slotId <= 0)
    return void tolak(res, "data_salah", 400, { field: "slotId" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const k = await muatKandidat(db, edisi.id, s.nim);
  if (!k) return void tolak(res, "tidak_ditemukan", 404);
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const st = await posisi(db, events, k, now);

  let kode = "ok";
  try {
    await db.transaction(async (tx) => {
      // The row lock is what makes the count below true for this transaction alone.
      const [slot] = await tx
        .select()
        .from(recSlot)
        .where(and(eq(recSlot.id, slotId), eq(recSlot.editionId, edisi.id)))
        .for("update");
      const [{ n }] = slot
        ? await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(recSlotAssignment)
            .where(eq(recSlotAssignment.slotId, slot.id))
        : [{ n: 0 }];
      const [punya] = slot
        ? await tx
            .select({ id: recSlotAssignment.id })
            .from(recSlotAssignment)
            .where(
              and(eq(recSlotAssignment.candidateId, k.id), eq(recSlotAssignment.stage, slot.stage)),
            )
            .limit(1)
        : [];
      const stage = slot?.stage ?? "tes_tulis";
      kode = judgePick({
        open: pickOpen(events, stage, now),
        eligible: pickEligible(st, stage),
        hasPick: !!punya,
        slot: slot ? info(slot) : null,
        stage,
        taken: n,
      });
      if (kode !== "ok") return;
      await tx
        .insert(recSlotAssignment)
        .values({ slotId, candidateId: k.id, stage, via: "self", by: s.nim, at: now });
      if (stage === "tes_tulis") await sinkronKursi(tx, k.id, slotId);
    });
  } catch (e) {
    if (pgErrorCode(e) === "23505") return void tolak(res, "sudah_pilih", 409);
    throw e;
  }
  if (kode !== "ok") return void tolak(res, kode, KODE_PILIH[kode] ?? 409);
  await writeAudit(s.nim, "rec_pilih", { slotId });
  const [slot] = await db.select().from(recSlot).where(eq(recSlot.id, slotId)).limit(1);
  res.status(200).json({ ok: true, slotId, stage: slot?.stage ?? null });
}

/** POST slot-change { toSlot, reason } or { withdraw: true }: one open request at a time. */
export async function handleUbah(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const k = await muatKandidat(db, edisi.id, s.nim);
  if (!k) return void tolak(res, "tidak_ditemukan", 404);
  const now = new Date();

  if (b.withdraw === true) {
    const [buka] = await db
      .select()
      .from(recSlotChange)
      .where(and(eq(recSlotChange.candidateId, k.id), eq(recSlotChange.status, "open")))
      .limit(1);
    if (!buka) return void tolak(res, "tidak_ditemukan", 404);
    await db
      .update(recSlotChange)
      .set({ status: "withdrawn", decidedAt: now })
      .where(eq(recSlotChange.id, buka.id));
    return void res.status(200).json({ ok: true, status: "withdrawn" });
  }

  const toId = Number(b.toSlot);
  if (!Number.isInteger(toId) || toId <= 0)
    return void tolak(res, "data_salah", 400, { field: "toSlot" });
  const alasan = typeof b.reason === "string" ? b.reason.trim() : "";
  if (alasan.length < 10 || alasan.length > 200)
    return void tolak(res, "data_salah", 400, { field: "reason" });

  const [ke] = await db
    .select()
    .from(recSlot)
    .where(and(eq(recSlot.id, toId), eq(recSlot.editionId, edisi.id)))
    .limit(1);
  const [punya] = ke
    ? await db
        .select({ a: recSlotAssignment, slot: recSlot })
        .from(recSlotAssignment)
        .innerJoin(recSlot, eq(recSlot.id, recSlotAssignment.slotId))
        .where(and(eq(recSlotAssignment.candidateId, k.id), eq(recSlotAssignment.stage, ke.stage)))
        .limit(1)
    : [];
  const [buka] = ke
    ? await db
        .select({ id: recSlotChange.id })
        .from(recSlotChange)
        .where(
          and(
            eq(recSlotChange.candidateId, k.id),
            eq(recSlotChange.stage, ke.stage),
            eq(recSlotChange.status, "open"),
          ),
        )
        .limit(1)
    : [];
  const [{ n }] = ke
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(recSlotAssignment)
        .where(eq(recSlotAssignment.slotId, ke.id))
    : [{ n: 0 }];
  const kode = judgeChange({
    now,
    from: punya ? info(punya.slot) : null,
    to: ke ? info(ke) : null,
    hasOpen: !!buka,
    takenTo: n,
  });
  if (kode !== "ok") return void tolak(res, kode, kode === "slot_salah" ? 404 : 409);
  try {
    await db.insert(recSlotChange).values({
      candidateId: k.id,
      stage: ke!.stage,
      fromSlot: punya!.slot.id,
      toSlot: ke!.id,
      reason: alasan,
    });
  } catch (e) {
    if (pgErrorCode(e) === "23505") return void tolak(res, "sudah_ada_permintaan", 409);
    throw e;
  }
  await writeAudit(s.nim, "rec_ubah_jadwal", { from: punya!.slot.id, to: ke!.id });
  res.status(200).json({ ok: true, status: "open" });
}

/* -------------------------------------------------------------- Panitia */

/** POST slot-decide { id, approve, over?, note? } */
export async function handleKeputusan(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return void tolak(res, "data_salah", 400, { field: "id" });
  if (typeof b.approve !== "boolean")
    return void tolak(res, "data_salah", 400, { field: "approve" });
  let catatan: string | null = null;
  if (b.note !== undefined && b.note !== null) {
    if (typeof b.note !== "string" || b.note.trim().length > 200)
      return void tolak(res, "data_salah", 400, { field: "note" });
    catatan = b.note.trim() || null;
  }
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "plotting")) return;
  const now = new Date();

  let kode = "ok";
  await db.transaction(async (tx) => {
    const [m] = await tx
      .select({ m: recSlotChange, edisi: recCandidate.editionId })
      .from(recSlotChange)
      .innerJoin(recCandidate, eq(recCandidate.id, recSlotChange.candidateId))
      .where(eq(recSlotChange.id, id))
      .limit(1);
    if (!m || m.edisi !== edisi.id) return void (kode = "tidak_ditemukan");
    if (m.m.status !== "open" || !m.m.toSlot) return void (kode = "status_salah");
    if (b.approve === false) {
      await tx
        .update(recSlotChange)
        .set({ status: "declined", decidedBy: s.nim, decidedAt: now, note: catatan })
        .where(eq(recSlotChange.id, id));
      return;
    }
    const [ke] = await tx.select().from(recSlot).where(eq(recSlot.id, m.m.toSlot)).for("update");
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(recSlotAssignment)
      .where(eq(recSlotAssignment.slotId, m.m.toSlot));
    const [punya] = await tx
      .select({ id: recSlotAssignment.id, slotId: recSlotAssignment.slotId })
      .from(recSlotAssignment)
      .where(
        and(
          eq(recSlotAssignment.candidateId, m.m.candidateId),
          eq(recSlotAssignment.stage, m.m.stage),
        ),
      )
      .limit(1);
    // Moved by Panitia since they asked: the request no longer says where they are.
    if (!ke || !punya || punya.slotId !== m.m.fromSlot) return void (kode = "status_salah");
    const j = judgeDecision({
      approve: true,
      capacity: ke.capacity,
      taken: n,
      over: b.over === true,
    });
    if (j !== "ok") return void (kode = j);
    await tx
      .update(recSlotAssignment)
      .set({ slotId: ke.id, via: "panitia", by: s.nim, at: now })
      .where(eq(recSlotAssignment.id, punya.id));
    if (m.m.stage === "tes_tulis") await sinkronKursi(tx, m.m.candidateId, ke.id);
    await tx
      .update(recSlotChange)
      .set({ status: "approved", decidedBy: s.nim, decidedAt: now, note: catatan })
      .where(eq(recSlotChange.id, id));
  });
  if (kode !== "ok") return void tolak(res, kode, kode === "tidak_ditemukan" ? 404 : 409);
  await writeAudit(s.nim, "rec_putus_ubah", { id, approve: b.approve, over: b.over === true });
  res
    .status(200)
    .json({ ok: true, status: (b.approve ? "approved" : "declined") as SlotChangeStatus });
}

function cekSlot(b: Record<string, unknown>, penuh: boolean) {
  const out: { room?: string; startsAt?: Date; endsAt?: Date; capacity?: number } = {};
  if (penuh || b.room !== undefined) {
    if (typeof b.room !== "string" || !b.room.trim() || b.room.trim().length > 24) return null;
    out.room = b.room.trim();
  }
  if (penuh || b.startsAt !== undefined) {
    const t = waktu(b.startsAt);
    if (!t) return null;
    out.startsAt = t;
  }
  if (penuh || b.endsAt !== undefined) {
    const t = waktu(b.endsAt);
    if (!t) return null;
    out.endsAt = t;
  }
  if (penuh || b.capacity !== undefined) {
    if (!Number.isInteger(b.capacity) || (b.capacity as number) < 0 || (b.capacity as number) > 200)
      return null;
    out.capacity = b.capacity as number;
  }
  return out;
}

async function hitungKursi(db: Db, slotId: number): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recSlotAssignment)
    .where(eq(recSlotAssignment.slotId, slotId));
  return n;
}

/** POST slot-set { op: create | edit | delete | move | window, ... } */
export async function handleAtur(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "plotting")) return;
  const now = new Date();
  const events = await muatEvents(db, edisi.id);

  if (b.op === "create") {
    const stage = tahap(b.stage);
    const nilai = cekSlot(b, true);
    if (!stage || !nilai) return void tolak(res, "data_salah", 400);
    if (nilai.endsAt! <= nilai.startsAt!)
      return void tolak(res, "data_salah", 400, { field: "endsAt" });
    // The evening belongs to the stage's test, interview or teaching event, unless one is named.
    let eventId: number | null = null;
    if (b.eventId !== undefined && b.eventId !== null) {
      eventId = Number(b.eventId);
      if (!events.some((e) => e.id === eventId))
        return void tolak(res, "data_salah", 400, { field: "eventId" });
    } else {
      eventId =
        events.find((e) => e.stage === stage && ["test", "interview", "teaching"].includes(e.kind))
          ?.id ?? null;
    }
    const [r] = await db
      .insert(recSlot)
      .values({
        editionId: edisi.id,
        stage,
        eventId,
        room: nilai.room!,
        startsAt: nilai.startsAt!,
        endsAt: nilai.endsAt!,
        capacity: nilai.capacity!,
      })
      .returning();
    await writeAudit(s.nim, "rec_slot_buat", { id: r.id, stage });
    return void res.status(200).json({ ok: true, slot: { ...info(r), taken: 0 } });
  }

  if (b.op === "edit" || b.op === "delete") {
    const id = Number(b.id);
    if (!Number.isInteger(id) || id <= 0)
      return void tolak(res, "data_salah", 400, { field: "id" });
    const [r] = await db
      .select()
      .from(recSlot)
      .where(and(eq(recSlot.id, id), eq(recSlot.editionId, edisi.id)))
      .limit(1);
    if (!r) return void tolak(res, "tidak_ditemukan", 404);
    const terisi = await hitungKursi(db, r.id);
    if (b.op === "delete") {
      if (terisi > 0) return void tolak(res, "slot_terisi", 409);
      await db.delete(recSlot).where(eq(recSlot.id, r.id));
      await writeAudit(s.nim, "rec_slot_hapus", { id: r.id });
      return void res.status(200).json({ ok: true });
    }
    const nilai = cekSlot(b, false);
    if (!nilai) return void tolak(res, "data_salah", 400);
    // The Stepper never goes below the seats taken.
    if (nilai.capacity !== undefined && nilai.capacity < terisi)
      return void tolak(res, "slot_terisi", 409, { taken: terisi });
    const mulai = nilai.startsAt ?? r.startsAt;
    const selesai = nilai.endsAt ?? r.endsAt;
    if (selesai <= mulai) return void tolak(res, "data_salah", 400, { field: "endsAt" });
    const [baru] = await db.update(recSlot).set(nilai).where(eq(recSlot.id, r.id)).returning();
    await writeAudit(s.nim, "rec_slot_ubah", { id: r.id });
    return void res.status(200).json({ ok: true, slot: { ...info(baru), taken: terisi } });
  }

  if (b.op === "move") {
    const stage = tahap(b.stage);
    const candidateId = Number(b.candidateId);
    const tujuan = b.toSlot === null ? null : Number(b.toSlot);
    if (!stage || !Number.isInteger(candidateId) || candidateId <= 0)
      return void tolak(res, "data_salah", 400);
    if (tujuan !== null && (!Number.isInteger(tujuan) || tujuan <= 0))
      return void tolak(res, "data_salah", 400, { field: "toSlot" });
    const [k] = await db
      .select({ id: recCandidate.id })
      .from(recCandidate)
      .where(and(eq(recCandidate.id, candidateId), eq(recCandidate.editionId, edisi.id)))
      .limit(1);
    if (!k) return void tolak(res, "tidak_ditemukan", 404);
    let kode = "ok";
    await db.transaction(async (tx) => {
      if (tujuan === null) {
        await tx
          .delete(recSlotAssignment)
          .where(and(eq(recSlotAssignment.candidateId, k.id), eq(recSlotAssignment.stage, stage)));
      } else {
        const [ke] = await tx
          .select()
          .from(recSlot)
          .where(and(eq(recSlot.id, tujuan), eq(recSlot.editionId, edisi.id)))
          .for("update");
        if (!ke || ke.stage !== stage) return void (kode = "slot_salah");
        const [{ n }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(recSlotAssignment)
          .where(eq(recSlotAssignment.slotId, ke.id));
        const [punya] = await tx
          .select({ id: recSlotAssignment.id, slotId: recSlotAssignment.slotId })
          .from(recSlotAssignment)
          .where(and(eq(recSlotAssignment.candidateId, k.id), eq(recSlotAssignment.stage, stage)))
          .limit(1);
        if (punya?.slotId === ke.id) return;
        // Panitia may go over a full slot, but they say so first.
        if (n >= ke.capacity && b.over !== true) return void (kode = "penuh");
        if (punya)
          await tx
            .update(recSlotAssignment)
            .set({ slotId: ke.id, via: "panitia", by: s.nim, at: now })
            .where(eq(recSlotAssignment.id, punya.id));
        else
          await tx.insert(recSlotAssignment).values({
            slotId: ke.id,
            candidateId: k.id,
            stage,
            via: "panitia",
            by: s.nim,
            at: now,
          });
      }
      if (stage === "tes_tulis") await sinkronKursi(tx, k.id, tujuan);
      // Whatever they asked for no longer applies once Panitia placed them.
      await tx
        .update(recSlotChange)
        .set({ status: "withdrawn", decidedBy: s.nim, decidedAt: now, note: "Dipindah Panitia" })
        .where(
          and(
            eq(recSlotChange.candidateId, k.id),
            eq(recSlotChange.stage, stage),
            eq(recSlotChange.status, "open"),
          ),
        );
    });
    if (kode !== "ok") return void tolak(res, kode, kode === "slot_salah" ? 404 : 409);
    await writeAudit(s.nim, "rec_slot_pindah", { candidateId: k.id, stage, to: tujuan });
    return void res.status(200).json({ ok: true });
  }

  if (b.op === "window") {
    const stage = tahap(b.stage);
    const e = stage ? pickEvent(events, stage) : null;
    if (!stage || !e || (b.mode !== "extend" && b.mode !== "close"))
      return void tolak(res, "data_salah", 400);
    const { tanggal, jam } = tanggalWib(now);
    const lama = e;
    let akhir: string;
    let jamAkhir: string;
    if (b.mode === "extend") {
      // One more day, counted from today when the window had already run out.
      akhir = addDays(e.endsOn >= tanggal ? e.endsOn : tanggal, 1);
      jamAkhir = "23:59";
    } else {
      const { opensAt } = pickWindow(e);
      if (now < opensAt) return void tolak(res, "jendela_tutup", 409);
      akhir = tanggal;
      jamAkhir = jam;
      // The window cannot end at or before the moment it opened.
      if (akhir === e.startsOn && jamAkhir <= (e.dayStart ?? "00:00"))
        return void tolak(res, "jendela_tutup", 409);
    }
    await db
      .update(recEvent)
      .set({ endsOn: akhir, dayEnd: jamAkhir, updatedBy: s.nim, updatedAt: now })
      .where(and(eq(recEvent.id, e.id), eq(recEvent.editionId, edisi.id)));
    await db.insert(recEventLog).values({
      editionId: edisi.id,
      eventId: e.id,
      who: s.nim,
      before: lama,
      after: { ...lama, endsOn: akhir, dayEnd: jamAkhir },
    });
    await writeAudit(s.nim, "rec_jendela_pilih", { stage, mode: b.mode });
    return void res.status(200).json({ ok: true, endsOn: akhir, dayEnd: jamAkhir });
  }

  tolak(res, "data_salah", 400, { field: "op" });
}

/** POST slot-autofill { stage, undo? }: Auto Isi for those who did not pick, or one Urungkan of the last run. */
export async function handleIsiOtomatis(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const stage = tahap(b.stage);
  if (!stage) return void tolak(res, "data_salah", 400, { field: "stage" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "plotting")) return;
  const now = new Date();

  if (b.undo !== undefined) {
    const at = waktu(b.undo);
    if (!at) return void tolak(res, "data_salah", 400, { field: "undo" });
    const slots = await db
      .select({ id: recSlot.id })
      .from(recSlot)
      .where(and(eq(recSlot.editionId, edisi.id), eq(recSlot.stage, stage)));
    if (slots.length) {
      const ids = slots.map((x) => x.id);
      const kena = and(
        inArray(recSlotAssignment.slotId, ids),
        eq(recSlotAssignment.via, "auto"),
        eq(recSlotAssignment.at, at),
      );
      await db.transaction(async (tx) => {
        const dicabut = await tx
          .select({ c: recSlotAssignment.candidateId })
          .from(recSlotAssignment)
          .where(kena);
        await tx.delete(recSlotAssignment).where(kena);
        if (stage === "tes_tulis") for (const x of dicabut) await sinkronKursi(tx, x.c, null);
      });
    }
    await writeAudit(s.nim, "rec_isi_batal", { stage });
    return void res.status(200).json({ ok: true, placed: 0, left: 0, at: null });
  }

  const events = await muatEvents(db, edisi.id);
  let hasil = { placed: [] as { candidateId: number; slotId: number }[], left: [] as number[] };
  await db.transaction(async (tx) => {
    // Lock the stage's slots in id order so two runs (or a pick) cannot interleave their counts.
    const kunci = await tx
      .select()
      .from(recSlot)
      .where(and(eq(recSlot.editionId, edisi.id), eq(recSlot.stage, stage)))
      .orderBy(asc(recSlot.id))
      .for("update");
    if (!kunci.length) return;
    const hitung = await tx
      .select({ slotId: recSlotAssignment.slotId, n: sql<number>`count(*)::int` })
      .from(recSlotAssignment)
      .where(
        inArray(
          recSlotAssignment.slotId,
          kunci.map((x) => x.id),
        ),
      )
      .groupBy(recSlotAssignment.slotId);
    const peta = new Map(hitung.map((h) => [h.slotId, h.n]));
    const peserta = await muatPeserta(db, edisi.id, stage, events, now);
    const sudah = await tx
      .select({ c: recSlotAssignment.candidateId })
      .from(recSlotAssignment)
      .where(eq(recSlotAssignment.stage, stage));
    const punya = new Set(sudah.map((x) => x.c));
    const belum = peserta
      .filter((c) => !punya.has(c.candidateId))
      .map((c) => ({ id: c.candidateId, nim: c.nim }));
    hasil = autoFill(
      belum,
      kunci.map((x) => ({ ...info(x), taken: peta.get(x.id) ?? 0 })),
    );
    if (hasil.placed.length)
      await tx.insert(recSlotAssignment).values(
        hasil.placed.map((x) => ({
          slotId: x.slotId,
          candidateId: x.candidateId,
          stage,
          via: "auto" as const,
          by: s.nim,
          at: now,
        })),
      );
    if (stage === "tes_tulis")
      for (const x of hasil.placed) await sinkronKursi(tx, x.candidateId, x.slotId);
  });
  await writeAudit(s.nim, "rec_isi_otomatis", { stage, placed: hasil.placed.length });
  res.status(200).json({
    ok: true,
    placed: hasil.placed.length,
    left: hasil.left.length,
    at: hasil.placed.length ? now.toISOString() : null,
  });
}
