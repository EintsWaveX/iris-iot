/**
 * Susulan of Wawancara and Mengajar (R4, R6): the offer, the answer, and
 * Panitia recording an answer that came in through a chat app. Where the CaAs
 * sits in the Susulan is their slot assignment on the Susulan day, moved in
 * Plotting like any other seat; this file only holds the offer.
 *
 * Panitia (an Asisten session with the Plotting right; the write routes wait
 * behind the closed-edition guard in the router):
 * GET  /api/recruitment/ms-list?stage=     who needs the Susulan, their standing, the Susulan slots
 * POST /api/recruitment/ms-offer           { id, stage }  Konfirmasi dan Tawarkan
 * POST /api/recruitment/ms-record          { id, stage, ans, via, note? }  Catat, Ubah, Pulihkan
 * POST /api/recruitment/ms-release         { id, stage }  Lepas: back to the slot they came from
 * POST /api/recruitment/ms-retract         { id, stage }  Tarik Tawaran: the offer was a mistake; the CaAs is as before it
 *
 * A CaAs (oprec account):
 * GET  /api/recruitment/ms-mine            the offers made to me
 * POST /api/recruitment/ms-answer          { stage, ans: "ikut" | "tidak" }
 *
 * An offer nobody answered by the deadline counts as withdrawn the moment it
 * is read (src/lib/recruitment/makeup.ts); Panitia can still reinstate it.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { SessionPayload } from "../../src/lib/auth.js";
import { writeAudit } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import {
  praktikan,
  recAccount,
  recCandidate,
  recMakeup,
  recSheetShared,
  recSlot,
  recSlotAssignment,
  recStageResult,
} from "../../src/lib/schema.js";
import {
  checkRecord,
  isMakeupStage,
  type MakeupStage,
  type MakeupStanding,
} from "../../src/lib/recruitment/makeup.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatKandidat, muatKolam, tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import {
  diHariSusulan,
  muatBarisMakeup,
  muatMakeupCtx,
  posisiMakeup,
} from "./recruitment-makeup.js";
import { muatPelaku, wajibHak } from "./recruitment-rights.js";
import { namaKandidat } from "./recruitment-akun.js";

type Handler = (req: ApiRequest, res: ApiResponse, s: SessionPayload) => unknown;

/** The slot a CaAs holds for a stage, if any. */
async function kursiKandidat(db: Db, kandidatId: number, stage: MakeupStage) {
  const [r] = await db
    .select({
      id: recSlotAssignment.id,
      slotId: recSlot.id,
      room: recSlot.room,
      startsAt: recSlot.startsAt,
      endsAt: recSlot.endsAt,
    })
    .from(recSlotAssignment)
    .innerJoin(recSlot, eq(recSlot.id, recSlotAssignment.slotId))
    .where(and(eq(recSlotAssignment.candidateId, kandidatId), eq(recSlotAssignment.stage, stage)))
    .limit(1);
  return r ?? null;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Give a Susulan seat back. The CaAs goes to the slot they held when the offer
 * was made (so their sheet and case stay in Penilaian); when that slot is gone
 * they are left with no seat.
 */
async function kembalikanKursi(
  tx: Tx,
  row: { fromSlotId: number | null },
  kursi: { id: number },
  stage: MakeupStage,
) {
  const [asal] = row.fromSlotId
    ? await tx
        .select({ id: recSlot.id })
        .from(recSlot)
        .where(and(eq(recSlot.id, row.fromSlotId), eq(recSlot.stage, stage)))
        .limit(1)
    : [];
  if (asal)
    await tx
      .update(recSlotAssignment)
      .set({ slotId: asal.id })
      .where(eq(recSlotAssignment.id, kursi.id));
  else await tx.delete(recSlotAssignment).where(eq(recSlotAssignment.id, kursi.id));
}

/* ---------------------------------------------------------------- Panitia */

async function handleList(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const stage = req.query?.stage;
  if (!isMakeupStage(stage)) return void tolak(res, "data_salah", 400);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "plotting")) return;
  const ctx = await muatMakeupCtx(db, edisi.id, stage);
  const now = new Date();

  const kasus = await db
    .select({ candidateId: recSheetShared.candidateId, info: recSheetShared.caseInfo })
    .from(recSheetShared)
    .innerJoin(recCandidate, eq(recCandidate.id, recSheetShared.candidateId))
    .where(and(eq(recSheetShared.stage, stage), eq(recCandidate.editionId, edisi.id)));
  const susulan = new Map(
    kasus.filter((k) => k.info?.status === "susulan").map((k) => [k.candidateId, k.info!]),
  );
  const barisSemua = await db
    .select()
    .from(recMakeup)
    .innerJoin(recCandidate, eq(recCandidate.id, recMakeup.candidateId))
    .where(and(eq(recMakeup.stage, stage), eq(recCandidate.editionId, edisi.id)));
  const baris = new Map(barisSemua.map((r) => [r.rec_makeup.candidateId, r.rec_makeup]));
  const ids = [...new Set([...susulan.keys(), ...baris.keys()])];

  const orang = ids.length
    ? await db
        .select({ id: recCandidate.id, nim: recCandidate.nim, nama: namaKandidat })
        .from(recCandidate)
        .leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))
        .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
        .where(inArray(recCandidate.id, ids))
    : [];
  const kursi = ids.length
    ? await db
        .select({
          candidateId: recSlotAssignment.candidateId,
          slotId: recSlot.id,
          room: recSlot.room,
          startsAt: recSlot.startsAt,
        })
        .from(recSlotAssignment)
        .innerJoin(recSlot, eq(recSlot.id, recSlotAssignment.slotId))
        .where(and(inArray(recSlotAssignment.candidateId, ids), eq(recSlotAssignment.stage, stage)))
    : [];

  const kode = new Map((await muatKolam(db)).map((a) => [a.nim, a.kode]));
  const rows = orang.map((o) => {
    const k = kursi.find((x) => x.candidateId === o.id) ?? null;
    const row = baris.get(o.id);
    const st = posisiMakeup(ctx, row, k?.startsAt ?? null, now);
    const info = susulan.get(o.id);
    return {
      id: o.id,
      nim: o.nim,
      nama: o.nama ?? o.nim,
      kind: info?.kind ?? null,
      why: info?.why ?? null,
      state: st.state,
      unanswered: st.unanswered,
      via: row?.via ?? null,
      note: row?.note ?? "",
      by: row?.answeredBy ? (kode.get(row.answeredBy) ?? row.answeredBy) : null,
      answeredAt: row?.answeredAt?.toISOString() ?? null,
      slotId: k?.slotId ?? null,
      room: k?.room ?? null,
      startsAt: k ? k.startsAt.toISOString() : null,
    };
  });

  const slots = await db
    .select()
    .from(recSlot)
    .where(and(eq(recSlot.editionId, edisi.id), eq(recSlot.stage, stage)))
    .orderBy(asc(recSlot.startsAt), asc(recSlot.room), asc(recSlot.id));
  const susulanSlots = slots.filter((x) => diHariSusulan(ctx, x.startsAt));
  const duduk = susulanSlots.length
    ? await db
        .select({ slotId: recSlotAssignment.slotId })
        .from(recSlotAssignment)
        .where(
          inArray(
            recSlotAssignment.slotId,
            susulanSlots.map((x) => x.id),
          ),
        )
    : [];
  return void res.status(200).json({
    ok: true,
    day: ctx.event?.startsOn ?? null,
    from: ctx.event?.dayStart ?? null,
    to: ctx.event?.dayEnd ?? null,
    deadline: ctx.deadline?.toISOString() ?? null,
    now: now.toISOString(),
    slots: susulanSlots.map((x) => ({
      id: x.id,
      room: x.room,
      startsAt: x.startsAt.toISOString(),
      endsAt: x.endsAt.toISOString(),
      capacity: x.capacity,
      taken: duduk.filter((d) => d.slotId === x.id).length,
    })),
    rows,
  });
}

/** The CaAs of a Panitia write: in this edition, with their sheet's case and the stage not locked. */
async function bukaKasus(res: ApiResponse, s: SessionPayload, b: Record<string, unknown>) {
  const stage = b.stage;
  const id = Number(b.id);
  if (!isMakeupStage(stage) || !Number.isInteger(id) || id <= 0)
    return void tolak(res, "data_salah", 400);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "plotting")) return;
  const [k] = await db
    .select({ id: recCandidate.id })
    .from(recCandidate)
    .where(and(eq(recCandidate.id, id), eq(recCandidate.editionId, edisi.id)))
    .limit(1);
  if (!k) return void tolak(res, "kandidat_tidak_ada", 404);
  const [hasil] = await db
    .select({ locked: recStageResult.locked })
    .from(recStageResult)
    .where(and(eq(recStageResult.candidateId, k.id), eq(recStageResult.stage, stage)))
    .limit(1);
  if (hasil?.locked) return void tolak(res, "terkunci", 409);
  return { db, edisiId: edisi.id, stage, kandidatId: k.id };
}

async function handleOffer(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const a = await bukaKasus(res, s, jsonBody(req));
  if (!a) return;
  const { db, stage, kandidatId } = a;
  const [sd] = await db
    .select({ info: recSheetShared.caseInfo })
    .from(recSheetShared)
    .where(and(eq(recSheetShared.candidateId, kandidatId), eq(recSheetShared.stage, stage)))
    .limit(1);
  if (sd?.info?.status !== "susulan") return void tolak(res, "bukan_susulan", 409);
  const ctx = await muatMakeupCtx(db, a.edisiId, stage);
  if (!ctx.event) return void tolak(res, "tanpa_hari_susulan", 409);
  const [ada] = await db
    .select({ id: recMakeup.id })
    .from(recMakeup)
    .where(and(eq(recMakeup.candidateId, kandidatId), eq(recMakeup.stage, stage)))
    .limit(1);
  if (ada) return void tolak(res, "sudah_ditawari", 409);
  const kursi = await kursiKandidat(db, kandidatId, stage);
  await db.insert(recMakeup).values({
    candidateId: kandidatId,
    stage,
    // Only a seat outside the Susulan day is somewhere to come back to.
    fromSlotId: kursi && !diHariSusulan(ctx, kursi.startsAt) ? kursi.slotId : null,
    offeredBy: s.nim,
  });
  await writeAudit(s.nim, "rec_susulan_tawar", { stage, candidateId: kandidatId });
  return void res.status(200).json({ ok: true });
}

async function handleRecord(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const a = await bukaKasus(res, s, b);
  if (!a) return;
  const { db, stage, kandidatId } = a;
  const [row] = await db
    .select()
    .from(recMakeup)
    .where(and(eq(recMakeup.candidateId, kandidatId), eq(recMakeup.stage, stage)))
    .limit(1);
  if (!row) return void tolak(res, "belum_ditawari", 409);
  const ctx = await muatMakeupCtx(db, a.edisiId, stage);
  const now = new Date();
  const kursi = await kursiKandidat(db, kandidatId, stage);
  const st = posisiMakeup(ctx, row, kursi?.startsAt ?? null, now);
  const cek = checkRecord({ ans: b.ans as never, state: st.state, via: b.via, note: b.note });
  if (!cek.ok) return void tolak(res, "data_salah", 400, { field: cek.field });
  await db.transaction(async (tx) => {
    await tx
      .update(recMakeup)
      .set({
        status: cek.status,
        via: cek.via,
        note: cek.note,
        answeredBy: s.nim,
        answeredAt: now,
        ...(b.ans === "pulihkan" ? { reinstatedAt: now } : {}),
      })
      .where(eq(recMakeup.id, row.id));
    // Someone who can no longer come gives their Susulan seat back.
    if (cek.status === "mundur" && kursi && diHariSusulan(ctx, kursi.startsAt))
      await kembalikanKursi(tx, row, kursi, stage);
  });
  await writeAudit(s.nim, "rec_susulan_jawab", {
    stage,
    candidateId: kandidatId,
    ans: b.ans,
    via: cek.via,
  });
  return void res.status(200).json({ ok: true });
}

async function handleRelease(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const a = await bukaKasus(res, s, jsonBody(req));
  if (!a) return;
  const { db, stage, kandidatId } = a;
  const [row] = await db
    .select()
    .from(recMakeup)
    .where(and(eq(recMakeup.candidateId, kandidatId), eq(recMakeup.stage, stage)))
    .limit(1);
  if (!row) return void tolak(res, "belum_ditawari", 409);
  const ctx = await muatMakeupCtx(db, a.edisiId, stage);
  const kursi = await kursiKandidat(db, kandidatId, stage);
  if (!kursi || !diHariSusulan(ctx, kursi.startsAt)) return void tolak(res, "tanpa_kursi", 409);
  await db.transaction((tx) => kembalikanKursi(tx, row, kursi, stage));
  await writeAudit(s.nim, "rec_susulan_lepas", { stage, candidateId: kandidatId });
  return void res.status(200).json({ ok: true });
}

async function handleRetract(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const a = await bukaKasus(res, s, jsonBody(req));
  if (!a) return;
  const { db, stage, kandidatId } = a;
  const [row] = await db
    .select()
    .from(recMakeup)
    .where(and(eq(recMakeup.candidateId, kandidatId), eq(recMakeup.stage, stage)))
    .limit(1);
  if (!row) return void tolak(res, "belum_ditawari", 409);
  const ctx = await muatMakeupCtx(db, a.edisiId, stage);
  const kursi = await kursiKandidat(db, kandidatId, stage);
  await db.transaction(async (tx) => {
    // A seat in the Susulan goes back to the slot of the offer, then the offer itself goes.
    if (kursi && diHariSusulan(ctx, kursi.startsAt)) await kembalikanKursi(tx, row, kursi, stage);
    await tx.delete(recMakeup).where(eq(recMakeup.id, row.id));
  });
  await writeAudit(s.nim, "rec_susulan_tarik", { stage, candidateId: kandidatId });
  return void res.status(200).json({ ok: true });
}

/* ------------------------------------------------------------------- CaAs */

interface TawaranView {
  stage: "wawancara" | "mengajar";
  state: MakeupStanding["state"];
  unanswered: boolean;
  day: string | null;
  from: string | null;
  to: string | null;
  place: string | null;
  deadline: string | null;
  via: string | null;
  seat: { room: string; startsAt: string; endsAt: string } | null;
}

async function handleMine(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const k = await muatKandidat(db, edisi.id, s.nim);
  if (!k) return void res.status(200).json({ ok: true, offers: [] });
  const now = new Date();
  const offers: TawaranView[] = [];
  for (const stage of ["wawancara", "mengajar"] as const) {
    const baris = (await muatBarisMakeup(db, stage, [k.id])).get(k.id);
    if (!baris) continue;
    const ctx = await muatMakeupCtx(db, edisi.id, stage);
    const kursi = await kursiKandidat(db, k.id, stage);
    const st = posisiMakeup(ctx, baris, kursi?.startsAt ?? null, now);
    const dudukDiSusulan = st.state === "ditempatkan" && kursi;
    offers.push({
      stage,
      state: st.state,
      unanswered: st.unanswered,
      day: ctx.event?.startsOn ?? null,
      from: ctx.event?.dayStart ?? null,
      to: ctx.event?.dayEnd ?? null,
      place: ctx.event?.place ?? null,
      deadline: ctx.deadline?.toISOString() ?? null,
      // The channel is told only when Panitia wrote the answer, so the CaAs sees it was theirs.
      via: baris.answeredBy ? baris.via : null,
      seat: dudukDiSusulan
        ? {
            room: kursi.room,
            startsAt: kursi.startsAt.toISOString(),
            endsAt: kursi.endsAt.toISOString(),
          }
        : null,
    });
  }
  return void res.status(200).json({ ok: true, offers, now: now.toISOString() });
}

async function handleAnswer(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  if (!isMakeupStage(b.stage) || (b.ans !== "ikut" && b.ans !== "tidak"))
    return void tolak(res, "data_salah", 400);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const k = await muatKandidat(db, edisi.id, s.nim);
  if (!k) return void tolak(res, "kandidat_tidak_ada", 404);
  const [row] = await db
    .select()
    .from(recMakeup)
    .where(and(eq(recMakeup.candidateId, k.id), eq(recMakeup.stage, b.stage)))
    .limit(1);
  if (!row) return void tolak(res, "belum_ditawari", 409);
  const ctx = await muatMakeupCtx(db, edisi.id, b.stage);
  const kursi = await kursiKandidat(db, k.id, b.stage);
  const st = posisiMakeup(ctx, row, kursi?.startsAt ?? null, new Date());
  // Only an open offer takes an answer; after it, Panitia are the ones who change it.
  if (st.state !== "tawar")
    return void tolak(res, st.unanswered ? "lewat_batas" : "sudah_dijawab", 409);
  const baru = await db
    .update(recMakeup)
    .set({
      status: b.ans === "ikut" ? "ya" : "mundur",
      via: "web",
      note: "",
      answeredBy: null,
      answeredAt: new Date(),
    })
    .where(and(eq(recMakeup.id, row.id), eq(recMakeup.status, "tawar")))
    .returning({ id: recMakeup.id });
  if (!baru.length) return void tolak(res, "sudah_dijawab", 409);
  await writeAudit(s.nim, "rec_susulan_jawab_caas", { stage: b.stage, ans: b.ans });
  return void res.status(200).json({ ok: true });
}

/* ---------------------------------------------------------------- routes */

export const S6_GET: Record<string, Handler> = {
  "ms-list": handleList,
};
export const S6_POST: Record<string, Handler> = {
  "ms-offer": handleOffer,
  "ms-record": handleRecord,
  "ms-release": handleRelease,
  "ms-retract": handleRetract,
};
export const S6_OPREC_GET: Record<string, Handler> = {
  "ms-mine": handleMine,
};
export const S6_OPREC_POST: Record<string, Handler> = {
  "ms-answer": handleAnswer,
};
