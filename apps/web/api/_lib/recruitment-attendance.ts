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
import { and, asc, eq, inArray, ne } from "drizzle-orm";
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
  recSlotExaminer,
  recTeam,
  recTeamMember,
  recTubesSession,
} from "../../src/lib/schema.js";
import { lite } from "../../src/lib/recruitment/banner.js";
import { bebas } from "../../src/lib/recruitment/bebas.js";
import {
  absensiAkhir,
  absensiBuka,
  absensiBukaJam,
  eventHadir,
  eventLive,
  eventSegera,
  tanggalWib,
} from "../../src/lib/recruitment/gates.js";
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
import { bacaSetting } from "./recruitment-settings.js";
import {
  bacaSheet,
  parseCsv,
  qrUntuk,
  type QrMap,
  scanTerbaru,
  sheetCsvUrl,
  type ScanBaru,
} from "../../src/lib/recruitment/qr-luar.js";

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
export const bisaDipindai = (e: RecEvent, now: Date): boolean =>
  eventHadir(e) && (bebas() || eventLive(e, now));

/** Whether a scan counts now: running, and for a gathering in its closing window or opened by hand. */
export const absenBuka = (e: RecEvent, now: Date, map: QrMap | undefined): boolean =>
  eventHadir(e) && absensiBuka(e, now, qrUntuk(map, e.id).buka === true);

/** Test mode is on for this event (the `uji` flag of its qr setting): the Panitia try the wall and a scan before the real window. */
export const modeUji = (map: QrMap | undefined, eventId: number): boolean =>
  qrUntuk(map, eventId).uji === true;

/** The event runs and its attendance is open for real, whatever the test mode says. */
export const sungguhBuka = (e: RecEvent, now: Date, map: QrMap | undefined): boolean =>
  bisaDipindai(e, now) && absenBuka(e, now, map);

/** Whether a scan can be taken now: for real, or because test mode is on (a scan then is saved as a test). */
export const bisaAbsen = (e: RecEvent, now: Date, map: QrMap | undefined): boolean =>
  eventHadir(e) && (modeUji(map, e.id) || sungguhBuka(e, now, map));

/** An event the wall may list for an Asisten: running, or starting within the lead days (to prepare the QR). */
const bisaDisiapkan = (e: RecEvent, now: Date): boolean => eventHadir(e) && eventSegera(e, now);

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

/**
 * The Tubes work evenings: a team picks one evening (rec_tubes_session), so a member is expected, and only counts,
 * on that evening. The set is the candidate ids whose team's evening falls on `hari` (WIB).
 */
export const eventKerjaTubes = (e: RecEvent): boolean => e.kind === "work" && e.stage === "tubes";

async function anggotaSesiHariIni(
  db: Db,
  edisiId: number,
  hari: string,
): Promise<{ hariIni: Set<number>; sesiKu: Map<number, Date> }> {
  const rows = await db
    .select({
      c: recTeamMember.candidateId,
      startsAt: recTubesSession.startsAt,
    })
    .from(recTeamMember)
    .innerJoin(recTeam, eq(recTeam.id, recTeamMember.teamId))
    .innerJoin(recTubesSession, eq(recTubesSession.id, recTeam.sessionId))
    .where(and(eq(recTeam.editionId, edisiId), eq(recTeamMember.status, "joined")));
  const hariIni = new Set<number>();
  const sesiKu = new Map<number, Date>();
  for (const r of rows) {
    sesiKu.set(r.c, r.startsAt);
    if (tanggalWib(r.startsAt).tanggal === hari) hariIni.add(r.c);
  }
  return { hariIni, sesiKu };
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
  const tubes = eventKerjaTubes(e) ? await anggotaSesiHariIni(db, edisiId, hari) : null;
  return kand
    .filter((k) => {
      const st = standing(
        { status: k.status, currentStage: k.stage },
        hasil.get(k.id) ?? [],
        events,
        now,
      );
      if (!attendEligible(st, e.stage)) return false;
      if (tubes) return tubes.hariIni.has(k.id);
      return !butuhSlot(e) || adaKursiHariIni(kursi.get(k.id), e, hari);
    })
    .map((k) => ({ candidateId: k.id, nim: k.nim, nama: k.nama ?? "" }));
}

/** Who is present at an event. Test scans only count while the test mode is on, so they never leak into the real number. */
async function hitungHadir(db: Db, eventId: number, denganUji = false): Promise<number> {
  const rows = await db
    .select({ id: recAttendance.id })
    .from(recAttendance)
    .where(
      denganUji
        ? eq(recAttendance.eventId, eventId)
        : and(eq(recAttendance.eventId, eventId), ne(recAttendance.via, "uji")),
    );
  return rows.length;
}

/** How many test scans an event holds (what Reset Data Uji removes). */
async function hitungUji(db: Db, eventId: number): Promise<number> {
  const rows = await db
    .select({ id: recAttendance.id })
    .from(recAttendance)
    .where(and(eq(recAttendance.eventId, eventId), eq(recAttendance.via, "uji")));
  return rows.length;
}

/**
 * The events whose QR screen this Asisten may open without holding the attendance right:
 * the shifts where they are the outside PJ. Their reach stops at their own shifts.
 */
export async function acaraPjLuar(db: Db, edisiId: number, nim: string): Promise<Set<number>> {
  const rows = await db
    .select({ eventId: recSlot.eventId })
    .from(recSlotExaminer)
    .innerJoin(recSlot, eq(recSlot.id, recSlotExaminer.slotId))
    .where(
      and(
        eq(recSlotExaminer.asistenNim, nim),
        eq(recSlotExaminer.role, "pj_luar"),
        eq(recSlot.editionId, edisiId),
      ),
    );
  return new Set(rows.flatMap((r) => (r.eventId === null ? [] : [r.eventId])));
}

/* ------------------------------------------------------------- handlers */

/** GET qr-events: what the projector may show right now, with the counts. */
export async function handleQrAcara(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  // The attendance keepers see every live event; an outside PJ sees only their own shifts' events.
  const sendiri = p && !p.hak.attendance ? await acaraPjLuar(db, edisi.id, s.nim) : null;
  if (!sendiri) {
    if (!wajibHak(res, p, "attendance")) return;
  } else if (sendiri.size === 0) {
    return void res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "attendance" });
  }
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const qrMap = await bacaSetting(db, "qr");
  // An event in test mode is listed wherever it is on the calendar, so the Panitia can find it to turn the mode off.
  const hidup = events.filter(
    (e) =>
      (bisaDisiapkan(e, now) || (eventHadir(e) && modeUji(qrMap, e.id))) &&
      (!sendiri || sendiri.has(e.id)),
  );
  const daftar = [];
  for (const e of hidup) {
    const q = qrUntuk(qrMap, e.id);
    const uji = q.uji === true;
    // Test mode makes the event behave as running and open; the real rules are untouched underneath
    const live = uji || bisaDipindai(e, now);
    daftar.push({
      ...lite(e),
      qr: { mode: q.mode, link: q.mode === "luar" ? q.link : "", sheet: q.sheet },
      // Attendance counts only inside its window: for a gathering the closing 30 minutes (or opened by hand)
      open: uji || absenBuka(e, now, qrMap),
      opensAt: absensiAkhir(e) ? absensiBukaJam(e) : null,
      manual: q.buka === true,
      test: uji,
      testCount: await hitungUji(db, e.id),
      stage: e.stage,
      live,
      // Counts only mean something while it runs; an event still to come is just to prepare
      here: live ? await hitungHadir(db, e.id, uji) : 0,
      expected: live ? (await muatDiharapkan(db, edisi.id, e, events, now)).length : 0,
    });
  }
  // Running first, then the soonest to start
  daftar.sort((a, b) => Number(b.live) - Number(a.live) || a.startsOn.localeCompare(b.startsOn));
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
  if (p && !p.hak.attendance) {
    // Not an attendance keeper: only the outside PJ of a shift of this very event may.
    if (!(await acaraPjLuar(db, edisi.id, s.nim)).has(id))
      return void res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "attendance" });
  } else if (!wajibHak(res, p, "attendance")) return;
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const e = events.find((v) => v.id === id);
  if (!e) return void tolak(res, "tidak_ditemukan", 404);
  const qrMap = await bacaSetting(db, "qr");
  // Test mode: the Panitia try the wall before the real window, so the two window checks are skipped
  const uji = eventHadir(e) && modeUji(qrMap, e.id);
  if (!uji && !bisaDipindai(e, now)) return void tolak(res, "jendela_tutup", 409);
  // A gathering takes attendance at its end: no code before then (the wall shows when it opens).
  if (!uji && !absenBuka(e, now, qrMap))
    return void tolak(res, "absensi_belum", 409, { opensAt: absensiBukaJam(e) });
  // An event that shows a QR made from a pasted link has no IRIS token to hand out.
  if (qrUntuk(qrMap, e.id).mode === "luar") return void tolak(res, "qr_luar", 409);
  const period = periodAt(now.getTime());
  res.status(200).json({
    ok: true,
    token: buatToken(e.id, period),
    code: kodeKetik(e.id, period),
    period,
    until: new Date(periodEnd(period)).toISOString(),
    now: now.toISOString(),
    event: lite(e),
    here: await hitungHadir(db, e.id, uji),
    expected: (await muatDiharapkan(db, edisi.id, e, events, now)).length,
  });
}

/* -------------------------------------------- latest scans from a sheet */

const SHEET_TTL_MS = 5_000;
const sheetCache = new Map<string, { at: number; scans: ScanBaru[] }>();

/** The newest rows of a responses sheet, read from Google's CSV export; cached for a few seconds. */
async function bacaScanSheet(link: string): Promise<ScanBaru[] | null> {
  const sh = bacaSheet(link);
  if (!sh) return null;
  const url = sheetCsvUrl(sh);
  const hit = sheetCache.get(url);
  if (hit && Date.now() - hit.at < SHEET_TTL_MS) return hit.scans;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: "follow" });
    const ct = r.headers.get("content-type") ?? "";
    // A sheet that is not shared by link answers with a sign-in page, not a CSV.
    if (!r.ok || !ct.includes("csv")) return null;
    const text = (await r.text()).slice(0, 2_000_000);
    const scans = scanTerbaru(parseCsv(text));
    sheetCache.set(url, { at: Date.now(), scans });
    return scans;
  } catch {
    return null;
  }
}

/** GET qr-recent?event=: the last four who scanned, read from the event's responses sheet. */
export async function handleQrTerbaru(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const id = Number(req.query.event);
  if (!Number.isInteger(id) || id <= 0)
    return void tolak(res, "data_salah", 400, { field: "event" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (p && !p.hak.attendance) {
    if (!(await acaraPjLuar(db, edisi.id, s.nim)).has(id))
      return void res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "attendance" });
  } else if (!wajibHak(res, p, "attendance")) return;
  const q = qrUntuk(await bacaSetting(db, "qr"), id);
  if (q.mode !== "luar" || !q.sheet) return void tolak(res, "tidak_ditemukan", 404);
  const scans = await bacaScanSheet(q.sheet);
  if (!scans) return void tolak(res, "sheet_tertutup", 502);
  res.status(200).json({ ok: true, scans, now: new Date().toISOString() });
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
  const qrMap = await bacaSetting(db, "qr");

  let e: RecEvent | undefined;
  if (b.token !== undefined) {
    const t = bacaToken(b.token);
    if (!t) return void tolak(res, "qr_berganti", 400);
    if (!periode.includes(t.period)) return void tolak(res, "qr_berganti", 409);
    e = events.find((v) => v.id === t.eventId);
  } else {
    const kode = rapikanKode(b.code);
    if (kode.length !== CODE_LENGTH) return void tolak(res, "data_salah", 400, { field: "code" });
    // A typed code finds its event among those running, or in test mode (which counts as running)
    e = events.find(
      (v) =>
        (bisaDipindai(v, now) || (eventHadir(v) && modeUji(qrMap, v.id))) &&
        periode.some((p) => kodeKetik(v.id, p) === kode),
    );
    if (!e) return void tolak(res, "qr_berganti", 409);
  }
  if (!e || e.internal) return void tolak(res, "tidak_ditemukan", 404);
  const uji = eventHadir(e) && modeUji(qrMap, e.id);
  if (!uji && !bisaDipindai(e, now)) return void tolak(res, "jendela_tutup", 409);
  // A gathering takes attendance at its end, so a scan before then is turned away.
  if (!uji && !absenBuka(e, now, qrMap))
    return void tolak(res, "absensi_belum", 409, { opensAt: absensiBukaJam(e) });
  // A scan is a real one whenever the real window is open, even with test mode still on; otherwise it is a test.
  const via = sungguhBuka(e, now, qrMap) ? "qr" : "uji";

  const hasil = await muatHasilBanyak(db, [k.id]);
  const st = standing(k, hasil.get(k.id) ?? [], events, now);
  if (!attendEligible(st, e.stage)) return void tolak(res, "bukan_tahapmu", 403);
  if (eventKerjaTubes(e)) {
    // Only on the evening the team picked.
    const t = await anggotaSesiHariIni(db, edisi.id, tanggalWib(now).tanggal);
    if (!t.hariIni.has(k.id))
      return void tolak(res, "bukan_jadwalmu", 403, {
        mine: t.sesiKu.get(k.id)?.toISOString() ?? null,
      });
  } else if (butuhSlot(e)) {
    const kursi = (await muatKursiPeserta(db, [k.id])).get(k.id);
    if (!adaKursiHariIni(kursi, e, tanggalWib(now).tanggal)) {
      const sendiri = (kursi ?? []).find((v) => v.eventId === e!.id);
      return void tolak(res, "bukan_jadwalmu", 403, {
        mine: sendiri ? sendiri.startsAt.toISOString() : null,
      });
    }
  }
  const [lama] = await db
    .select({ id: recAttendance.id, via: recAttendance.via })
    .from(recAttendance)
    .where(and(eq(recAttendance.candidateId, k.id), eq(recAttendance.eventId, e.id)))
    .limit(1);
  // A leftover test scan must never stand in for the real one: the real window is open, so the test row goes.
  const basi = lama !== undefined && lama.via === "uji" && via === "qr";
  if (basi) await db.delete(recAttendance).where(eq(recAttendance.id, lama.id));
  const ada = basi ? undefined : lama;
  if (!ada)
    await db
      .insert(recAttendance)
      .values({ candidateId: k.id, eventId: e.id, at: now, via, by: null })
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
  const qrMap = await bacaSetting(db, "qr");
  const uji = eventHadir(e) && modeUji(qrMap, e.id);
  const hadir = (
    await db.select().from(recAttendance).where(eq(recAttendance.eventId, e.id))
  ).filter(
    // Test scans show here only while the test mode is on
    (h) => uji || h.via !== "uji",
  );
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
    live: uji || bisaDipindai(e, now),
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

/**
 * POST qr-test-reset { event }: removes the test scans (via "uji") of one event, and nothing else. The attendance
 * keepers press it between test rounds and before the real attendance, so the real count starts clean. Real and
 * hand-marked attendance rows are never touched.
 */
export async function handleQrUjiReset(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const id = Number(jsonBody(req).event);
  if (!Number.isInteger(id) || id <= 0)
    return void tolak(res, "data_salah", 400, { field: "event" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "attendance")) return;
  const events = await muatEvents(db, edisi.id);
  if (!events.some((v) => v.id === id)) return void tolak(res, "tidak_ditemukan", 404);
  const dihapus = await db
    .delete(recAttendance)
    .where(and(eq(recAttendance.eventId, id), eq(recAttendance.via, "uji")))
    .returning({ id: recAttendance.id });
  await writeAudit(s.nim, "rec_hadir_uji_reset", { event: id, removed: dihapus.length });
  res.status(200).json({ ok: true, removed: dihapus.length });
}

/**
 * Whether this Asisten examines (any role) a slot of the event that this very candidate
 * sits in. An examiner's reach stops at their own room.
 */
export async function penguji(
  db: Db,
  edisiId: number,
  nim: string,
  eventId: number,
  candidateId: number,
) {
  const [r] = await db
    .select({ slotId: recSlotExaminer.slotId })
    .from(recSlotExaminer)
    .innerJoin(recSlot, eq(recSlot.id, recSlotExaminer.slotId))
    .innerJoin(recSlotAssignment, eq(recSlotAssignment.slotId, recSlot.id))
    .where(
      and(
        eq(recSlotExaminer.asistenNim, nim),
        eq(recSlot.eventId, eventId),
        eq(recSlot.editionId, edisiId),
        eq(recSlotAssignment.candidateId, candidateId),
      ),
    )
    .limit(1);
  return !!r;
}

/** POST attend-manual { id, event, reason?, undo? }: Admin or the room's examiner marks someone, or takes a manual mark back. */
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
  // Attendance keepers always may. So may an Asisten who examines a slot of this very event:
  // when a QR will not scan on exam night, the room's own staff signs the candidate in.
  // The examiner's reach is their own room's candidates, and only the marks they made.
  const hanyaPenguji = !p?.hak.attendance;
  if (hanyaPenguji && !(p && (await penguji(db, edisi.id, s.nim, eventId, id))))
    return void res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "attendance" });
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
    if (hanyaPenguji && ada.by !== s.nim)
      return void res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "attendance" });
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
