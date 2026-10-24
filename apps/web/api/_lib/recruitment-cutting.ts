/**
 * Cutting and the envelopes (S2). The Panitia propose Lolos or Gagal per
 * candidate, the Ketua locks a stage with the reveal time copied from its
 * Pengumuman, and a candidate's envelope exists only once the stage is locked
 * and now is past that time (src/lib/recruitment/cutting.ts). A sealed
 * envelope carries no result; the result comes back from envelope-open.
 *
 * The result of a candidate is private to them and to the Panitia with the
 * cuttingPropose right: `results` is a Panitia route and never answers a
 * Praktikan session.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  praktikan,
  recAttendance,
  recCandidate,
  recDocument,
  recStageResult,
} from "../../src/lib/schema.js";
import {
  canLock,
  canUnlock,
  envelopeVisible,
  revealAtFor,
  tally,
} from "../../src/lib/recruitment/cutting.js";
import { nextPublicEvent } from "../../src/lib/recruitment/gates.js";
import { cuttingPool, standing } from "../../src/lib/recruitment/standing.js";
import {
  CUT_STAGES,
  DOC_REQUIRED,
  PROPOSALS,
  type CutRowView,
  type CutStage,
  type EventLite,
  type Proposal,
  type RecEvent,
} from "../../src/lib/recruitment/types.js";
import { lite } from "../../src/lib/recruitment/banner.js";
import {
  muatAmplop,
  muatEventSendiri,
  muatEvents,
  muatHasilBanyak,
  muatKandidat,
  tolak,
  wajibEdisi,
  type Db,
} from "./recruitment-data.js";
import { muatPelaku, wajibHak } from "./recruitment-rights.js";
import { tolakPraktikanTot } from "./session.js";

/** What the deck aims for at each Cutting (PRD 3, Targets). */
const TARGET: Partial<Record<CutStage, { min: number; max: number }>> = {
  berkas: { min: 80, max: 100 },
  tes_tulis: { min: 60, max: 80 },
  tubes: { min: 30, max: 40 },
  mengajar: { min: 20, max: 23 },
};

function tahapDari(v: unknown): CutStage | null {
  return typeof v === "string" && (CUT_STAGES as readonly string[]).includes(v)
    ? (v as CutStage)
    : null;
}

/** The kode (3 letters) of each Asisten NIM, for "proposed by". */
export async function kodePerNim(db: Db, nims: string[]): Promise<Map<string, string>> {
  const unik = [...new Set(nims.filter(Boolean))];
  if (!unik.length) return new Map();
  const rows = await db
    .select({ nim: asisten.nim, kode: asisten.kode })
    .from(asisten)
    .where(inArray(asisten.nim, unik));
  return new Map(rows.map((r) => [r.nim, r.kode]));
}

/** Events whose attendance counts toward a stage's board: First Meet, and the Tes Tulis evenings. */
const hadirFm = (e: RecEvent) => e.stage === "first_meet";
const hadirTt = (e: RecEvent) =>
  e.stage === "tes_tulis" && (e.kind === "test" || e.kind === "makeup");

interface PoolRow {
  id: number;
  nim: string;
  nama: string;
  kelas: string | null;
  status: string;
  score: number | null;
  docs: number;
  result: {
    proposal: Proposal | null;
    proposedBy: string | null;
    note: string | null;
    locked: boolean;
    lockedBy: string | null;
    lockedAt: Date | null;
    revealAt: Date | null;
    openedAt: Date | null;
  } | null;
  fm: boolean;
  tt: boolean;
}

/** Everyone on a stage's board, with their result row if any. */
export async function muatPool(
  db: Db,
  edisiId: number,
  stage: CutStage,
  events: RecEvent[],
  now: Date,
): Promise<PoolRow[]> {
  const kand = await db
    .select({
      id: recCandidate.id,
      nim: recCandidate.nim,
      nama: praktikan.nama,
      biodata: recCandidate.biodata,
      status: recCandidate.status,
      stage: recCandidate.currentStage,
      score: recCandidate.berkasScore,
    })
    .from(recCandidate)
    .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
    .where(eq(recCandidate.editionId, edisiId));
  const ids = kand.map((k) => k.id);
  const hasil = await muatHasilBanyak(db, ids);
  const barisHasil = ids.length
    ? await db
        .select()
        .from(recStageResult)
        .where(and(inArray(recStageResult.candidateId, ids), eq(recStageResult.stage, stage)))
    : [];
  const peta = new Map(barisHasil.map((r) => [r.candidateId, r]));
  const jenisDokumen = ids.length
    ? await db
        .select({ id: recDocument.candidateId, n: sql<number>`count(*)::int` })
        .from(recDocument)
        .where(
          and(
            inArray(recDocument.candidateId, ids),
            inArray(recDocument.kind, [...DOC_REQUIRED] as never),
          ),
        )
        .groupBy(recDocument.candidateId)
    : [];
  const jumlah = new Map(jenisDokumen.map((r) => [r.id, r.n]));
  const eventFm = events.filter(hadirFm).map((e) => e.id);
  const eventTt = events.filter(hadirTt).map((e) => e.id);
  const semuaEvent = [...eventFm, ...eventTt];
  const hadir = semuaEvent.length
    ? await db
        .select({ c: recAttendance.candidateId, e: recAttendance.eventId })
        .from(recAttendance)
        .where(inArray(recAttendance.eventId, semuaEvent))
    : [];
  const fm = new Set(hadir.filter((h) => eventFm.includes(h.e)).map((h) => h.c));
  const tt = new Set(hadir.filter((h) => eventTt.includes(h.e)).map((h) => h.c));
  const out: PoolRow[] = [];
  for (const k of kand) {
    const st = standing(
      { status: k.status, currentStage: k.stage },
      hasil.get(k.id) ?? [],
      events,
      now,
    );
    const r = peta.get(k.id) ?? null;
    if (!cuttingPool(st, stage, !!r)) continue;
    out.push({
      id: k.id,
      nim: k.nim,
      nama: k.nama ?? "",
      kelas: k.biodata?.kelas ?? null,
      status: k.status,
      score: k.score,
      docs: jumlah.get(k.id) ?? 0,
      result: r
        ? {
            proposal: r.proposal,
            proposedBy: r.proposedBy,
            note: r.note,
            locked: r.locked,
            lockedBy: r.lockedBy,
            lockedAt: r.lockedAt,
            revealAt: r.revealAt,
            openedAt: r.openedAt,
          }
        : null,
      fm: fm.has(k.id),
      tt: tt.has(k.id),
    });
  }
  return out.sort((a, b) => (a.nim < b.nim ? -1 : 1));
}

/** GET results?stage=: the Panitia board. */
export async function handleHasil(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const stage = tahapDari(req.query.stage);
  if (!stage) return void tolak(res, "data_salah", 400, { field: "stage" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "cuttingPropose")) return;
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const pool = await muatPool(db, edisi.id, stage, events, now);
  const kode = await kodePerNim(
    db,
    pool.flatMap((r) => [r.result?.proposedBy ?? ""]),
  );
  const rows: CutRowView[] = pool.map((r) => ({
    id: r.id,
    nim: r.nim,
    nama: r.nama,
    kelas: r.kelas,
    fm: r.fm,
    tt: r.tt,
    // The four exam parts and the total come from the exam engine (S3).
    parts: [null, null, null, null],
    total: null,
    berkas: stage === "berkas" ? { status: r.status as never, score: r.score, docs: r.docs } : null,
    proposal: r.result?.proposal ?? null,
    proposedBy: r.result?.proposedBy ? (kode.get(r.result.proposedBy) ?? null) : null,
    note: r.result?.note ?? null,
    opened:
      r.result?.locked && r.result.revealAt && r.result.revealAt <= now
        ? !!r.result.openedAt
        : null,
  }));
  const terkunci = pool.find((r) => r.result?.locked)?.result ?? null;
  const dikunci = pool.length > 0 && pool.every((r) => r.result?.locked);
  const kodeKunci = terkunci?.lockedBy
    ? ((await kodePerNim(db, [terkunci.lockedBy])).get(terkunci.lockedBy) ?? null)
    : null;
  const default_ = revealAtFor(events, stage);
  res.status(200).json({
    ok: true,
    stage,
    rows,
    tally: tally(rows),
    lock: {
      locked: dikunci,
      lockedBy: dikunci ? kodeKunci : null,
      lockedAt: dikunci && terkunci?.lockedAt ? terkunci.lockedAt.toISOString() : null,
      revealAt: dikunci && terkunci?.revealAt ? terkunci.revealAt.toISOString() : null,
      defaultRevealAt: default_ ? default_.toISOString() : null,
      revealed: dikunci && !!terkunci?.revealAt && terkunci.revealAt <= now,
      opened: pool.filter((r) => r.result?.locked && r.result.openedAt).length,
    },
    target: TARGET[stage] ?? null,
    now: now.toISOString(),
  });
}

/** POST propose { stage, items: [{ id, proposal, note? }] } */
export async function handleUsul(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const stage = tahapDari(b.stage);
  if (!stage) return void tolak(res, "data_salah", 400, { field: "stage" });
  const items = Array.isArray(b.items) ? b.items : null;
  if (!items || !items.length || items.length > 300)
    return void tolak(res, "data_salah", 400, { field: "items" });
  const bersih: { id: number; proposal: Proposal | null; note: string | null }[] = [];
  const dilihat = new Set<number>();
  for (const it of items as Record<string, unknown>[]) {
    const id = Number(it?.id);
    if (!Number.isInteger(id) || id <= 0 || dilihat.has(id))
      return void tolak(res, "data_salah", 400, { field: "items" });
    dilihat.add(id);
    if (it.proposal !== null && !(PROPOSALS as readonly unknown[]).includes(it.proposal))
      return void tolak(res, "data_salah", 400, { field: "proposal" });
    let catatan: string | null = null;
    if (it.note !== undefined && it.note !== null) {
      if (typeof it.note !== "string" || it.note.trim().length > 200)
        return void tolak(res, "data_salah", 400, { field: "note" });
      catatan = it.note.trim() || null;
    }
    bersih.push({ id, proposal: it.proposal as Proposal | null, note: catatan });
  }
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "cuttingPropose")) return;
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const pool = await muatPool(db, edisi.id, stage, events, now);
  if (pool.some((r) => r.result?.locked)) return void tolak(res, "terkunci", 409);
  const peta = new Map(pool.map((r) => [r.id, r]));
  if (bersih.some((i) => !peta.has(i.id))) return void tolak(res, "tidak_ditemukan", 404);

  const ditimpa: { id: number; by: string }[] = [];
  for (const i of bersih) {
    const lama = peta.get(i.id)!.result;
    if (
      lama?.proposal &&
      lama.proposedBy &&
      lama.proposedBy !== s.nim &&
      lama.proposal !== i.proposal
    )
      ditimpa.push({ id: i.id, by: lama.proposedBy });
  }
  await db.transaction(async (tx) => {
    for (const i of bersih) {
      const nilai = { proposal: i.proposal, proposedBy: i.proposal ? s.nim : null, note: i.note };
      await tx
        .insert(recStageResult)
        .values({ candidateId: i.id, stage, ...nilai })
        .onConflictDoUpdate({
          target: [recStageResult.candidateId, recStageResult.stage],
          set: nilai,
        });
    }
  });
  const kode = await kodePerNim(
    db,
    ditimpa.map((d) => d.by),
  );
  await writeAudit(s.nim, "rec_usul", { stage, n: bersih.length, ditimpa: ditimpa.length });
  res.status(200).json({
    ok: true,
    changed: bersih.length,
    overwrote: ditimpa.map((d) => ({ id: d.id, by: kode.get(d.by) ?? "" })),
  });
}

/** POST lock { stage, revealAt? } (Ketua) */
export async function handleKunci(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const stage = tahapDari(b.stage);
  if (!stage) return void tolak(res, "data_salah", 400, { field: "stage" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "cuttingLock")) return;
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const pool = await muatPool(db, edisi.id, stage, events, now);
  if (pool.some((r) => r.result?.locked)) return void tolak(res, "terkunci", 409);
  const cek = canLock(pool.map((r) => ({ proposal: r.result?.proposal ?? null })));
  if (!cek.ok) return void tolak(res, "belum_lengkap", 409, { missing: cek.missing });

  let buka = revealAtFor(events, stage);
  if (b.revealAt !== undefined) {
    // A rehearsal: the Ketua brings the reveal to a time of their choosing, never to the past.
    const t = typeof b.revealAt === "string" ? new Date(b.revealAt) : null;
    if (!t || Number.isNaN(t.getTime()) || t.getTime() < now.getTime() - 60_000)
      return void tolak(res, "data_salah", 400, { field: "revealAt" });
    buka = t;
  }
  if (!buka) return void tolak(res, "tanpa_pengumuman", 409);
  await db
    .update(recStageResult)
    .set({ locked: true, lockedBy: s.nim, lockedAt: now, revealAt: buka })
    .where(
      and(
        inArray(
          recStageResult.candidateId,
          pool.map((r) => r.id),
        ),
        eq(recStageResult.stage, stage),
      ),
    );
  await writeAudit(s.nim, "rec_kunci", { stage, n: pool.length, revealAt: buka.toISOString() });
  res.status(200).json({ ok: true, locked: true, revealAt: buka.toISOString() });
}

/** POST unlock { stage } (Ketua), only before the reveal time. */
export async function handleBukaKunci(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const stage = tahapDari(b.stage);
  if (!stage) return void tolak(res, "data_salah", 400, { field: "stage" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "cuttingLock")) return;
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const pool = await muatPool(db, edisi.id, stage, events, now);
  const terkunci = pool.filter((r) => r.result?.locked);
  if (!terkunci.length) return void tolak(res, "belum_dikunci", 409);
  // One row past its time ends the chance for the whole stage: the envelopes may be out.
  if (terkunci.some((r) => !canUnlock({ locked: true, revealAt: r.result!.revealAt }, now)))
    return void tolak(res, "lewat_waktu", 409);
  await db
    .update(recStageResult)
    .set({ locked: false, lockedBy: null, lockedAt: null, revealAt: null })
    .where(
      and(
        inArray(
          recStageResult.candidateId,
          terkunci.map((r) => r.id),
        ),
        eq(recStageResult.stage, stage),
      ),
    );
  await writeAudit(s.nim, "rec_buka_kunci", { stage });
  res.status(200).json({ ok: true, locked: false, revealAt: null });
}

/** GET envelopes: the candidate's own inbox. Sealed ones carry no result. */
export async function handleAmplop(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  if (await tolakPraktikanTot(req, res)) return;
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const k = await muatKandidat(db, edisi.id, s.nim);
  const now = new Date();
  const a = k ? await muatAmplop(db, k.id, now) : { envelopes: [], pending: [] };
  res.status(200).json({ ok: true, ...a, now: now.toISOString() });
}

/** POST envelope-open { stage }: stamps opened_at and finally answers the result. */
export async function handleAmplopBuka(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  if (await tolakPraktikanTot(req, res)) return;
  const stage = tahapDari(jsonBody(req).stage);
  if (!stage) return void tolak(res, "data_salah", 400, { field: "stage" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const k = await muatKandidat(db, edisi.id, s.nim);
  if (!k) return void tolak(res, "tidak_ditemukan", 404);
  const now = new Date();
  const [r] = await db
    .select()
    .from(recStageResult)
    .where(and(eq(recStageResult.candidateId, k.id), eq(recStageResult.stage, stage)))
    .limit(1);
  // Before the time, or unlocked, it looks exactly like no envelope at all.
  if (!r || !r.proposal || !envelopeVisible(r, now)) return void tolak(res, "tidak_ditemukan", 404);
  const dibuka = r.openedAt ?? now;
  if (!r.openedAt)
    await db.update(recStageResult).set({ openedAt: dibuka }).where(eq(recStageResult.id, r.id));
  const events = await muatEvents(db, edisi.id);
  let next: EventLite | null = null;
  if (r.proposal === "lolos") {
    const e = nextPublicEvent(events, now, await muatEventSendiri(db, k.id));
    next = e ? lite(e) : null;
  }
  res.status(200).json({
    ok: true,
    stage,
    result: r.proposal,
    openedAt: dibuka.toISOString(),
    next,
  });
}
