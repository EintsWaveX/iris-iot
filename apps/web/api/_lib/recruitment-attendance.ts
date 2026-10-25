/**
 * QR attendance (S2). The projector at /recruitment/qr shows a token that
 * changes every 20 seconds; a candidate's scan carries it back with their
 * session. Tokens are stateless: an HMAC over the event and the period,
 * keyed by REC_QR_SECRET (or, when that is not set, a key derived from
 * SESSION_SECRET), so a stale token fails on its own and a second scan by the
 * same candidate lands on the one attendance row (unique per candidate and
 * event) and answers "sudah".
 *
 * Who counts as present is decided here, never by the page: the event must be
 * running now, the candidate must have reached its stage (standing.ts), and on
 * an evening they must hold a slot for, it must be that evening's.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import {
  praktikan,
  recAccount,
  recAttendance,
  recCandidate,
  recSlot,
  recSlotAssignment,
} from "../../src/lib/schema.js";
import { lite } from "../../src/lib/recruitment/banner.js";
import { eventHadir, eventLive, tanggalWib } from "../../src/lib/recruitment/gates.js";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  acceptedPeriods,
  periodAt,
  periodEnd,
} from "../../src/lib/recruitment/qr.js";
import { attendEligible, standing } from "../../src/lib/recruitment/standing.js";
import type { RecEvent } from "../../src/lib/recruitment/types.js";
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

/* ------------------------------------------------------------ the token */

function kunci(): Buffer {
  const khusus = process.env.REC_QR_SECRET;
  if (khusus && khusus.length >= 32) return Buffer.from(khusus);
  const sesi = process.env.SESSION_SECRET;
  if (!sesi || sesi.length < 32) throw new Error("REC_QR_SECRET or SESSION_SECRET must be set");
  // The same secret never signs two kinds of thing: this key is derived for the QR alone.
  return createHmac("sha256", sesi).update("rec-qr-v1").digest();
}

const mac = (k: Buffer, label: string, eventId: number, period: number) =>
  createHmac("sha256", k).update(`${label}|${eventId}|${period}`).digest();

/** The signed token the QR carries: event, period and a MAC. */
export function buatToken(eventId: number, period: number, k: Buffer = kunci()): string {
  return `${eventId}.${period}.${mac(k, "qr", eventId, period).subarray(0, 12).toString("base64url")}`;
}

/** The event and period inside a genuine token, or null for anything else. */
export function bacaToken(
  token: unknown,
  k: Buffer = kunci(),
): { eventId: number; period: number } | null {
  if (typeof token !== "string" || token.length > 80) return null;
  const [e, p, m] = token.split(".");
  const eventId = Number(e);
  const period = Number(p);
  if (!Number.isInteger(eventId) || !Number.isInteger(period) || !m) return null;
  const benar = mac(k, "qr", eventId, period).subarray(0, 12).toString("base64url");
  const a = Buffer.from(m);
  const b = Buffer.from(benar);
  return a.length === b.length && timingSafeEqual(a, b) ? { eventId, period } : null;
}

/** The 6 character code for one event and period, for a phone that cannot scan. */
export function kodeKetik(eventId: number, period: number, k: Buffer = kunci()): string {
  const d = mac(k, "code", eventId, period);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[d[i] % CODE_ALPHABET.length];
  return out;
}

/** What a person typed, tidied: upper case, no spaces or dashes. */
export const rapikanKode = (v: unknown): string =>
  typeof v === "string" ? v.toUpperCase().replace(/[\s-]/g, "") : "";

/* ----------------------------------------------------------- who counts */

interface Peserta {
  candidateId: number;
  nim: string;
  nama: string;
}

/** Events a QR makes sense for: a gathering (see eventHadir) and running right now. */
export const bisaDipindai = (e: RecEvent, now: Date): boolean => eventHadir(e) && eventLive(e, now);

/** Whether the event is one a candidate only attends with a slot of their own. */
const butuhSlot = (e: RecEvent) => e.audience === "own" || e.audience === "offered";

interface Kursi {
  slotId: number;
  eventId: number | null;
  startsAt: Date;
}

/** The slots each candidate holds, by candidate id. */
async function muatKursiPeserta(db: Db, ids: number[]): Promise<Map<number, Kursi[]>> {
  const peta = new Map<number, Kursi[]>();
  if (!ids.length) return peta;
  const rows = await db
    .select({
      c: recSlotAssignment.candidateId,
      slotId: recSlot.id,
      eventId: recSlot.eventId,
      startsAt: recSlot.startsAt,
    })
    .from(recSlotAssignment)
    .innerJoin(recSlot, eq(recSlot.id, recSlotAssignment.slotId))
    .where(inArray(recSlotAssignment.candidateId, ids));
  for (const r of rows) {
    const k = { slotId: r.slotId, eventId: r.eventId, startsAt: r.startsAt };
    const ada = peta.get(r.c);
    if (ada) ada.push(k);
    else peta.set(r.c, [k]);
  }
  return peta;
}

/** Does a candidate hold a seat in this event today? Their own evening. */
const adaKursiHariIni = (kursi: Kursi[] | undefined, e: RecEvent, hari: string): boolean =>
  (kursi ?? []).some((k) => k.eventId === e.id && tanggalWib(k.startsAt).tanggal === hari);

/** Everyone who is expected at an event, as the server counts them. */
export async function muatDiharapkan(
  db: Db,
  edisiId: number,
  e: RecEvent,
  events: RecEvent[],
  now: Date,
): Promise<Peserta[]> {
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
  const ids = kand.map((k) => k.id);
  const hasil = await muatHasilBanyak(db, ids);
  const kursi = butuhSlot(e) ? await muatKursiPeserta(db, ids) : new Map<number, Kursi[]>();
  const hari = tanggalWib(now).tanggal;
  return kand
    .filter((k) => {
      const st = standing(
        { status: k.status, currentStage: k.stage },
        hasil.get(k.id) ?? [],
        events,
        now,
      );
      if (!attendEligible(st, e.stage)) return false;
      return !butuhSlot(e) || adaKursiHariIni(kursi.get(k.id), e, hari);
    })
    .map((k) => ({ candidateId: k.id, nim: k.nim, nama: k.nama ?? "" }));
}

async function hitungHadir(db: Db, eventId: number): Promise<number> {
  const rows = await db
    .select({ id: recAttendance.id })
    .from(recAttendance)
    .where(eq(recAttendance.eventId, eventId));
  return rows.length;
}

/* ------------------------------------------------------------- handlers */

/** GET qr-events: what the projector may show right now, with the counts. */
export async function handleQrAcara(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "attendance")) return;
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const hidup = events.filter((e) => bisaDipindai(e, now));
  const daftar = [];
  for (const e of hidup)
    daftar.push({
      ...lite(e),
      here: await hitungHadir(db, e.id),
      expected: (await muatDiharapkan(db, edisi.id, e, events, now)).length,
    });
  res.status(200).json({ ok: true, events: daftar, now: now.toISOString() });
}

/** GET qr-token?event=: the token and the code for the current period. */
export async function handleQrToken(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const id = Number(req.query.event);
  if (!Number.isInteger(id) || id <= 0)
    return void tolak(res, "data_salah", 400, { field: "event" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "attendance")) return;
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const e = events.find((v) => v.id === id);
  if (!e) return void tolak(res, "tidak_ditemukan", 404);
  if (!bisaDipindai(e, now)) return void tolak(res, "jendela_tutup", 409);
  const period = periodAt(now.getTime());
  res.status(200).json({
    ok: true,
    token: buatToken(e.id, period),
    code: kodeKetik(e.id, period),
    period,
    until: new Date(periodEnd(period)).toISOString(),
    now: now.toISOString(),
    event: lite(e),
    here: await hitungHadir(db, e.id),
    expected: (await muatDiharapkan(db, edisi.id, e, events, now)).length,
  });
}

/** POST attend { token | code }: a candidate's scan. */
export async function handleHadir(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const k = await muatKandidat(db, edisi.id, s.nim);
  if (!k) return void tolak(res, "tidak_ditemukan", 404);
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const periode = acceptedPeriods(now.getTime());

  let e: RecEvent | undefined;
  if (b.token !== undefined) {
    const t = bacaToken(b.token);
    if (!t) return void tolak(res, "qr_berganti", 400);
    if (!periode.includes(t.period)) return void tolak(res, "qr_berganti", 409);
    e = events.find((v) => v.id === t.eventId);
  } else {
    const kode = rapikanKode(b.code);
    if (kode.length !== CODE_LENGTH) return void tolak(res, "data_salah", 400, { field: "code" });
    e = events.find(
      (v) => bisaDipindai(v, now) && periode.some((p) => kodeKetik(v.id, p) === kode),
    );
    if (!e) return void tolak(res, "qr_berganti", 409);
  }
  if (!e || e.internal) return void tolak(res, "tidak_ditemukan", 404);
  if (!bisaDipindai(e, now)) return void tolak(res, "jendela_tutup", 409);

  const hasil = await muatHasilBanyak(db, [k.id]);
  const st = standing(k, hasil.get(k.id) ?? [], events, now);
  if (!attendEligible(st, e.stage)) return void tolak(res, "bukan_tahapmu", 403);
  if (butuhSlot(e)) {
    const kursi = (await muatKursiPeserta(db, [k.id])).get(k.id);
    if (!adaKursiHariIni(kursi, e, tanggalWib(now).tanggal)) {
      const sendiri = (kursi ?? []).find((v) => v.eventId === e!.id);
      return void tolak(res, "bukan_jadwalmu", 403, {
        mine: sendiri ? sendiri.startsAt.toISOString() : null,
      });
    }
  }
  const [ada] = await db
    .select({ id: recAttendance.id })
    .from(recAttendance)
    .where(and(eq(recAttendance.candidateId, k.id), eq(recAttendance.eventId, e.id)))
    .limit(1);
  if (!ada)
    await db
      .insert(recAttendance)
      .values({ candidateId: k.id, eventId: e.id, at: now, via: "qr", by: null })
      .onConflictDoNothing();
  res.status(200).json({ ok: true, sudah: !!ada, event: lite(e) });
}

/** GET attendance?event=: the Kehadiran drawer's list. */
export async function handleKehadiran(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const id = Number(req.query.event);
  if (!Number.isInteger(id) || id <= 0)
    return void tolak(res, "data_salah", 400, { field: "event" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "attendance")) return;
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const e = events.find((v) => v.id === id);
  if (!e) return void tolak(res, "tidak_ditemukan", 404);
  const diharapkan = await muatDiharapkan(db, edisi.id, e, events, now);
  const hadir = await db.select().from(recAttendance).where(eq(recAttendance.eventId, e.id));
  const peta = new Map(hadir.map((h) => [h.candidateId, h]));
  const dikenal = new Set(diharapkan.map((d) => d.candidateId));
  // Someone present who is no longer expected (marked by hand) still shows.
  const lainnya = hadir.filter((h) => !dikenal.has(h.candidateId));
  const tambahan = lainnya.length
    ? await db
        .select({ id: recCandidate.id, nim: recCandidate.nim, nama: namaKandidat })
        .from(recCandidate)
        .leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))
        .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
        .where(
          inArray(
            recCandidate.id,
            lainnya.map((h) => h.candidateId),
          ),
        )
    : [];
  const semua = [
    ...diharapkan,
    ...tambahan.map((t) => ({ candidateId: t.id, nim: t.nim, nama: t.nama ?? "" })),
  ];
  res.status(200).json({
    ok: true,
    event: lite(e),
    live: bisaDipindai(e, now),
    rows: semua.map((d) => {
      const h = peta.get(d.candidateId);
      return {
        id: d.candidateId,
        nim: d.nim,
        nama: d.nama,
        present: !!h,
        via: h?.via ?? null,
        reason: h?.reason ?? null,
        by: h?.by ?? null,
        at: h ? h.at.toISOString() : null,
      };
    }),
  });
}

/** POST attend-manual { id, event, reason?, undo? }: Admin marks someone, or takes a manual mark back. */
export async function handleHadirManual(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const id = Number(b.id);
  const eventId = Number(b.event);
  if (!Number.isInteger(id) || id <= 0) return void tolak(res, "data_salah", 400, { field: "id" });
  if (!Number.isInteger(eventId) || eventId <= 0)
    return void tolak(res, "data_salah", 400, { field: "event" });
  let alasan: string | null = null;
  if (b.reason !== undefined && b.reason !== null) {
    if (typeof b.reason !== "string" || b.reason.trim().length > 60)
      return void tolak(res, "data_salah", 400, { field: "reason" });
    alasan = b.reason.trim() || null;
  }
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "attendance")) return;
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const e = events.find((v) => v.id === eventId);
  if (!e) return void tolak(res, "tidak_ditemukan", 404);
  const [k] = await db
    .select({ id: recCandidate.id, nim: recCandidate.nim })
    .from(recCandidate)
    .where(and(eq(recCandidate.id, id), eq(recCandidate.editionId, edisi.id)))
    .limit(1);
  if (!k) return void tolak(res, "tidak_ditemukan", 404);
  const [ada] = await db
    .select()
    .from(recAttendance)
    .where(and(eq(recAttendance.candidateId, k.id), eq(recAttendance.eventId, e.id)))
    .limit(1);

  if (b.undo === true) {
    if (!ada) return void tolak(res, "tidak_ditemukan", 404);
    // A scan is the candidate's own word; only a hand mark can be taken back.
    if (ada.via !== "manual") return void tolak(res, "tidak_bisa_batal", 409);
    await db
      .delete(recAttendance)
      .where(and(eq(recAttendance.candidateId, k.id), eq(recAttendance.eventId, e.id)));
    await writeAudit(s.nim, "rec_hadir_batal", { id: k.id, event: e.id });
    return void res.status(200).json({ ok: true, present: false });
  }
  // Marking someone before the event began makes no sense.
  if (e.startsOn > tanggalWib(now).tanggal) return void tolak(res, "jendela_tutup", 409);
  if (!ada) {
    await db
      .insert(recAttendance)
      .values({
        candidateId: k.id,
        eventId: e.id,
        at: now,
        via: "manual",
        by: s.nim,
        reason: alasan,
      })
      .onConflictDoNothing();
    await writeAudit(s.nim, "rec_hadir_manual", { id: k.id, event: e.id, reason: alasan });
  }
  res.status(200).json({ ok: true, present: true, sudah: !!ada });
}
