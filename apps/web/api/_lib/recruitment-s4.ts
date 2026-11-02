/**
 * Interviews and teaching turns (Open Recruitment R4 Wawancara and R6 Mengajar):
 * who examines which slot, each examiner's own list of slots, the shared sheet
 * of a CaAs, the special cases, and Penilaian. One engine for both stages; the
 * template (src/lib/recruitment/interview.ts) is an editable setting.
 *
 * Panitia (an Asisten session; each action checks its own right):
 * GET  /api/recruitment/iv-crew?stage=      slots with their examiners and PJ, and the pool to pick from
 * POST /api/recruitment/iv-crew-set         { stage, slotIds, role, nims }  plotPengawas (Ketua, Akademik)
 * POST /api/recruitment/iv-standin           { stage, slotId, from }  the inside PJ takes the seat of an examiner who did not come
 * GET  /api/recruitment/iv-mine?stage=      my slots, the booths and the sheet states
 * GET  /api/recruitment/iv-sheet?id=&stage= one CaAs's sheet: shared part, my levels, the template
 * POST /api/recruitment/iv-sheet-save       { id, stage, shared?, levels? }  autosave
 * POST /api/recruitment/iv-sheet-send       { id, stage }
 * POST /api/recruitment/iv-sheet-reopen     { id, stage }   take my sheet back to edit it
 * POST /api/recruitment/iv-case             { id, stage, kind, minutes?, why? }
 * GET  /api/recruitment/iv-nilai?stage=     Penilaian: sheets, mean, spread, verdict (Ketua, Akademik, Admin)
 *
 * An examiner reads and writes only the CaAs of their own booth (or panel);
 * a CaAs never sees who examines them. The levels of the other examiners stay
 * hidden until every sheet is sent, unless the template says otherwise.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { SessionPayload } from "../../src/lib/auth.js";
import { writeAudit } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import {
  praktikan,
  recAccount,
  recAttendance,
  recCandidate,
  recCommittee,
  recDocument,
  recSheet,
  recSheetShared,
  recSlot,
  recSlotAssignment,
  recSlotExaminer,
  recStageResult,
  type SheetCase,
} from "../../src/lib/schema.js";
import {
  caseKindsFor,
  EXCUSE_WHY,
  LATE_WHY,
  caseOutcome,
  crewFor,
  isIvStage,
  levelsDone,
  meanScore,
  sheetMissing,
  sheetScore,
  spreadScore,
  verdictOf,
  type CaseKind,
  type IvStage,
  type IvTemplate,
  type Verdict,
} from "../../src/lib/recruitment/interview.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatEvents, muatKolam, tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { anggotaPanitia, muatPelaku, wajibHak } from "./recruitment-rights.js";
import { bacaSetting } from "./recruitment-settings.js";
import { muatNilaiCutting } from "./recruitment-score.js";
import { anggotaPerPemimpin, labelTim, muatSemuaPeserta, muatTim } from "./recruitment-tim.js";
import { muatBarisMakeup, muatMakeupCtx, posisiMakeup } from "./recruitment-makeup.js";

const ROLES = ["penguji", "pj_luar", "pj_dalam"] as const;
type CrewRole = (typeof ROLES)[number];
const isRole = (v: unknown): v is CrewRole => (ROLES as readonly unknown[]).includes(v);
const VERDICTS = ["lolos", "ragu", "cut"] as const;
const MAX_TEXT = 4000;

/** Who may read Penilaian: the Ketua, Akademik and Admin seats, and hakPenuh. */
const bolehNilai = (p: Awaited<ReturnType<typeof muatPelaku>>): boolean =>
  !!p && (p.penuh || (!!p.kursi && ["ketua", "akademik", "admin"].includes(p.kursi.division)));
/** Who may open any sheet to read or fix it. */
const bolehSemua = (p: Awaited<ReturnType<typeof muatPelaku>>): boolean =>
  !!p && (p.penuh || (!!p.kursi && ["ketua", "akademik"].includes(p.kursi.division)));

async function namaPerNim(db: Db, nims: string[]): Promise<Map<string, string>> {
  const unik = [...new Set(nims)];
  const out = new Map<string, string>();
  if (!unik.length) return out;
  for (const r of await db
    .select({ nim: praktikan.nim, nama: praktikan.nama })
    .from(praktikan)
    .where(inArray(praktikan.nim, unik)))
    out.set(r.nim, r.nama);
  for (const r of await db
    .select({ nim: recAccount.nim, nama: recAccount.nama })
    .from(recAccount)
    .where(inArray(recAccount.nim, unik)))
    if (r.nama) out.set(r.nim, r.nama);
  return out;
}

interface Booth {
  id: number;
  nim: string;
  nama: string;
  kelas: string;
}

interface SlotCrew {
  id: number;
  room: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  booths: Booth[];
  penguji: string[];
  pjOut: string[];
  pjIn: string[];
}

/** Every slot of a stage with its candidates (in booth order) and its crew. */
async function muatSlotCrew(db: Db, edisiId: number, stage: IvStage): Promise<SlotCrew[]> {
  const slots = await db
    .select()
    .from(recSlot)
    .where(and(eq(recSlot.editionId, edisiId), eq(recSlot.stage, stage)))
    .orderBy(asc(recSlot.startsAt), asc(recSlot.room), asc(recSlot.id));
  if (!slots.length) return [];
  const ids = slots.map((s) => s.id);
  const asg = await db
    .select({
      id: recSlotAssignment.id,
      slotId: recSlotAssignment.slotId,
      cid: recCandidate.id,
      nim: recCandidate.nim,
      bio: recCandidate.biodata,
    })
    .from(recSlotAssignment)
    .innerJoin(recCandidate, eq(recCandidate.id, recSlotAssignment.candidateId))
    .where(and(inArray(recSlotAssignment.slotId, ids), eq(recSlotAssignment.stage, stage)))
    .orderBy(asc(recSlotAssignment.id));
  const nama = await namaPerNim(
    db,
    asg.map((a) => a.nim),
  );
  // A Presentasi turn belongs to a team, keyed by its leader: the booth shows the team.
  const tim =
    stage === "tubes"
      ? new Map((await muatTim(db, edisiId)).map((t) => [t.team.leaderId, labelTim(t)]))
      : null;
  const ex = await db
    .select()
    .from(recSlotExaminer)
    .where(inArray(recSlotExaminer.slotId, ids))
    .orderBy(asc(recSlotExaminer.pos), asc(recSlotExaminer.asistenNim));
  return slots.map((s) => ({
    id: s.id,
    room: s.room,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    capacity: s.capacity,
    booths: asg
      .filter((a) => a.slotId === s.id)
      .map((a) => ({
        id: a.cid,
        nim: a.nim,
        nama: tim?.get(a.cid) ?? nama.get(a.nim) ?? a.nim,
        kelas: a.bio.kelas,
      })),
    penguji: ex.filter((e) => e.slotId === s.id && e.role === "penguji").map((e) => e.asistenNim),
    pjOut: ex.filter((e) => e.slotId === s.id && e.role === "pj_luar").map((e) => e.asistenNim),
    pjIn: ex.filter((e) => e.slotId === s.id && e.role === "pj_dalam").map((e) => e.asistenNim),
  }));
}

/** The slot a candidate sits in for a stage, the booth index and the examiners of that booth. */
async function tempatKandidat(
  db: Db,
  edisiId: number,
  stage: IvStage,
  kandidatId: number,
  t: IvTemplate,
) {
  const semua = await muatSlotCrew(db, edisiId, stage);
  for (const s of semua) {
    const i = s.booths.findIndex((b) => b.id === kandidatId);
    if (i >= 0) return { slot: s, index: i, crew: crewFor(s.penguji, i, t) };
  }
  return null;
}

const kodeMap = async (db: Db): Promise<Map<string, string>> =>
  new Map((await muatKolam(db)).map((a) => [a.nim, a.kode]));

/* ---------------------------------------------------------------- crew */

async function handleCrew(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const stage = String(req.query?.stage ?? "");
  if (!isIvStage(stage)) return void tolak(res, "data_salah", 400);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!anggotaPanitia(p)) return void tolak(res, "tanpa_hak", 403);
  const t = await bacaSetting(db, stage);
  const [slots, pool, seats] = await Promise.all([
    muatSlotCrew(db, edisi.id, stage),
    muatKolam(db),
    db
      .select({ nim: recCommittee.asistenNim, division: recCommittee.division })
      .from(recCommittee)
      .where(eq(recCommittee.editionId, edisi.id)),
  ]);
  // The pool chips wear their division's colour (the mockup's Penguji card).
  const divisi = new Map(seats.map((x) => [x.nim, x.division]));
  return void res.status(200).json({
    ok: true,
    template: {
      mode: t.mode,
      per: t.per,
      pjOut: t.pjOut,
      pjIn: t.pjIn,
      minutes: t.minutes,
      maxMinutes: t.maxMinutes,
      gap: t.gap,
    },
    slots: slots.map((x) => ({
      ...x,
      startsAt: x.startsAt.toISOString(),
      endsAt: x.endsAt.toISOString(),
    })),
    pool: pool.map((x) => ({ ...x, div: divisi.get(x.nim) ?? null })),
  });
}

async function handleCrewSet(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  if (!isIvStage(b.stage) || !isRole(b.role)) return void tolak(res, "data_salah", 400);
  const slotIds = Array.isArray(b.slotIds)
    ? [...new Set(b.slotIds.map(Number))].filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const nims = Array.isArray(b.nims) ? b.nims.map(String) : null;
  if (!slotIds.length || slotIds.length > 20 || !nims || nims.length > 40)
    return void tolak(res, "data_salah", 400);
  if (new Set(nims).size !== nims.length)
    return void tolak(res, "data_salah", 400, { field: "nims" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "plotPengawas")) return;
  const slots = await db
    .select({ id: recSlot.id })
    .from(recSlot)
    .where(
      and(
        eq(recSlot.editionId, edisi.id),
        eq(recSlot.stage, b.stage),
        inArray(recSlot.id, slotIds),
      ),
    );
  if (slots.length !== slotIds.length) return void tolak(res, "slot_tidak_ada", 404);
  const kolam = new Set((await muatKolam(db)).map((a) => a.nim));
  if (nims.some((n) => !kolam.has(n))) return void tolak(res, "bukan_asisten", 400);
  await db.transaction(async (tx) => {
    await tx
      .delete(recSlotExaminer)
      .where(
        and(inArray(recSlotExaminer.slotId, slotIds), eq(recSlotExaminer.role, b.role as CrewRole)),
      );
    if (nims.length)
      await tx
        .insert(recSlotExaminer)
        .values(
          slotIds.flatMap((slotId) =>
            nims.map((nim, pos) => ({ slotId, asistenNim: nim, role: b.role as CrewRole, pos })),
          ),
        );
  });
  await writeAudit(s.nim, "rec_iv_crew", { stage: b.stage, slotIds, role: b.role, nims });
  return void res.status(200).json({ ok: true });
}

/**
 * Gantikan Pewawancara: an examiner suddenly does not show, and the PJ who sits inside the room takes their
 * seat (same position, so the booth and the partner stay as they were). Only that slot's inside PJ may do it;
 * one who excused themselves the day before is replaced in Plotting instead.
 */
async function handleStandIn(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const slotId = Number(b.slotId);
  const from = typeof b.from === "string" ? b.from : "";
  if (!isIvStage(b.stage) || !Number.isInteger(slotId) || slotId <= 0 || !from)
    return void tolak(res, "data_salah", 400);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const [slot] = await db
    .select({ id: recSlot.id })
    .from(recSlot)
    .where(
      and(eq(recSlot.id, slotId), eq(recSlot.editionId, edisi.id), eq(recSlot.stage, b.stage)),
    );
  if (!slot) return void tolak(res, "slot_tidak_ada", 404);
  const crew = await db.select().from(recSlotExaminer).where(eq(recSlotExaminer.slotId, slotId));
  const dalam = crew.some((x) => x.role === "pj_dalam" && x.asistenNim === s.nim);
  if (!dalam) return void tolak(res, "tanpa_hak", 403);
  if (crew.some((x) => x.role === "penguji" && x.asistenNim === s.nim))
    return void tolak(res, "sudah_penguji", 409);
  const target = crew.find((x) => x.role === "penguji" && x.asistenNim === from);
  if (!target) return void tolak(res, "bukan_penguji", 404);
  await db.transaction(async (tx) => {
    await tx
      .update(recSlotExaminer)
      .set({ asistenNim: s.nim })
      .where(
        and(
          eq(recSlotExaminer.slotId, slotId),
          eq(recSlotExaminer.asistenNim, from),
          eq(recSlotExaminer.role, "penguji"),
        ),
      );
    await tx
      .delete(recSlotExaminer)
      .where(
        and(
          eq(recSlotExaminer.slotId, slotId),
          eq(recSlotExaminer.asistenNim, s.nim),
          eq(recSlotExaminer.role, "pj_dalam"),
        ),
      );
  });
  await writeAudit(s.nim, "rec_iv_standin", { stage: b.stage, slotId, from });
  return void res.status(200).json({ ok: true });
}

/* ---------------------------------------------------------------- mine */

async function handleMine(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const stage = String(req.query?.stage ?? "");
  if (!isIvStage(stage)) return void tolak(res, "data_salah", 400);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!anggotaPanitia(p) && !s.nim) return void tolak(res, "tanpa_hak", 403);
  const t = await bacaSetting(db, stage);
  const slots = await muatSlotCrew(db, edisi.id, stage);
  const mine = slots.filter(
    (x) => x.penguji.includes(s.nim) || x.pjOut.includes(s.nim) || x.pjIn.includes(s.nim),
  );
  const kode = await kodeMap(db);
  const kandIds = mine.flatMap((x) => x.booths.map((b) => b.id));
  const sheets = kandIds.length
    ? await db
        .select()
        .from(recSheet)
        .where(and(inArray(recSheet.candidateId, kandIds), eq(recSheet.stage, stage)))
    : [];
  const shared = kandIds.length
    ? await db
        .select()
        .from(recSheetShared)
        .where(and(inArray(recSheetShared.candidateId, kandIds), eq(recSheetShared.stage, stage)))
    : [];
  const events = await muatEvents(db, edisi.id);
  const evIds = events.filter((e) => e.stage === stage).map((e) => e.id);
  const hadir =
    kandIds.length && evIds.length
      ? await db
          .select({ cid: recAttendance.candidateId, at: recAttendance.at })
          .from(recAttendance)
          .where(
            and(inArray(recAttendance.candidateId, kandIds), inArray(recAttendance.eventId, evIds)),
          )
      : [];
  return void res.status(200).json({
    ok: true,
    me: { nim: s.nim, kode: kode.get(s.nim) ?? null },
    template: {
      mode: t.mode,
      per: t.per,
      minutes: t.minutes,
      maxMinutes: t.maxMinutes,
      gap: t.gap,
      // The rubric is still the sample one: the mockup shows a "Rubrik Contoh" badge until Akademik replaces it
      example: t.params.some((p) => p.example),
    },
    slots: mine.map((x) => {
      const role = x.penguji.includes(s.nim)
        ? "penguji"
        : x.pjIn.includes(s.nim)
          ? "pj_dalam"
          : "pj_luar";
      return {
        id: x.id,
        room: x.room,
        startsAt: x.startsAt.toISOString(),
        endsAt: x.endsAt.toISOString(),
        role,
        penguji: x.penguji.map((n) => ({ nim: n, kode: kode.get(n) ?? n })),
        pjOut: x.pjOut.map((n) => kode.get(n) ?? n),
        pjIn: x.pjIn.map((n) => kode.get(n) ?? n),
        booths: x.booths.map((bth, i) => {
          const crew = crewFor(x.penguji, i, t);
          const mineBooth = crew.includes(s.nim);
          const sh = sheets.filter((r) => r.candidateId === bth.id);
          const sd = shared.find((r) => r.candidateId === bth.id);
          return {
            index: i,
            candidate: role === "penguji" && !mineBooth ? null : bth,
            mine: mineBooth,
            pair: crew.map((n) => kode.get(n) ?? n),
            here: hadir.find((h) => h.cid === bth.id)?.at.toISOString() ?? null,
            sent: sh.filter((r) => r.sentAt).length,
            need: crew.length,
            mineSent: !!sh.find((r) => r.graderNim === s.nim)?.sentAt,
            verdict: sd?.verdict ?? null,
            case: sd?.caseInfo ? { kind: sd.caseInfo.kind, status: sd.caseInfo.status } : null,
          };
        }),
      };
    }),
  });
}

/* ---------------------------------------------------------------- sheet */

interface Akses {
  t: IvTemplate;
  edisiId: number;
  kandidat: { id: number; nim: string; bio: { kelas: string } };
  tempat: NonNullable<Awaited<ReturnType<typeof tempatKandidat>>>;
  penuh: boolean;
  penguji: boolean;
  terkunci: boolean;
}

/** The CaAs's seat and what this person may do with the sheet; answers the refusal itself. */
async function bukaAkses(
  res: ApiResponse,
  s: SessionPayload,
  stageRaw: unknown,
  idRaw: unknown,
  tulis: boolean,
): Promise<Akses | null> {
  if (!isIvStage(stageRaw)) {
    tolak(res, "data_salah", 400);
    return null;
  }
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    tolak(res, "data_salah", 400);
    return null;
  }
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return null;
  const p = await muatPelaku(db, edisi.id, s.nim);
  const [k] = await db
    .select({ id: recCandidate.id, nim: recCandidate.nim, bio: recCandidate.biodata })
    .from(recCandidate)
    .where(and(eq(recCandidate.id, id), eq(recCandidate.editionId, edisi.id)))
    .limit(1);
  if (!k) {
    tolak(res, "kandidat_tidak_ada", 404);
    return null;
  }
  const t = await bacaSetting(db, stageRaw);
  const tempat = await tempatKandidat(db, edisi.id, stageRaw, k.id, t);
  const penguji = !!tempat && tempat.crew.includes(s.nim);
  const penuh = bolehSemua(p);
  if (!tempat || (!penguji && !penuh)) {
    tolak(res, "tanpa_hak", 403);
    return null;
  }
  const [hasil] = await db
    .select({ locked: recStageResult.locked })
    .from(recStageResult)
    .where(and(eq(recStageResult.candidateId, k.id), eq(recStageResult.stage, stageRaw)))
    .limit(1);
  const terkunci = !!hasil?.locked;
  if (tulis && terkunci) {
    tolak(res, "terkunci", 409);
    return null;
  }
  return { t, edisiId: edisi.id, kandidat: k, tempat, penuh, penguji, terkunci };
}

const bersih = (v: unknown, max = MAX_TEXT): string | null =>
  typeof v === "string" && v.length <= max ? v : null;

async function handleSheet(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const a = await bukaAkses(res, s, req.query?.stage, req.query?.id, false);
  if (!a) return;
  const db = getDb();
  const stage = req.query!.stage as IvStage;
  const [shared] = await db
    .select()
    .from(recSheetShared)
    .where(and(eq(recSheetShared.candidateId, a.kandidat.id), eq(recSheetShared.stage, stage)))
    .limit(1);
  const sheets = await db
    .select()
    .from(recSheet)
    .where(and(eq(recSheet.candidateId, a.kandidat.id), eq(recSheet.stage, stage)));
  const kode = await kodeMap(db);
  const mine = sheets.find((r) => r.graderNim === s.nim);
  const semuaKirim =
    a.tempat.crew.length > 0 &&
    a.tempat.crew.every((n) => sheets.find((r) => r.graderNim === n)?.sentAt);
  const events = await muatEvents(db, a.edisiId);
  const fm = events.find((e) => e.stage === "first_meet");
  const hadirFm = fm
    ? (
        await db
          .select({ id: recAttendance.id })
          .from(recAttendance)
          .where(
            and(eq(recAttendance.candidateId, a.kandidat.id), eq(recAttendance.eventId, fm.id)),
          )
          .limit(1)
      ).length > 0
    : true;
  const nama = (await namaPerNim(db, [a.kandidat.nim])).get(a.kandidat.nim) ?? a.kandidat.nim;
  const booth = a.tempat.slot.booths[a.tempat.index];
  // The real written and coding scores, for the one interview card that shows them.
  const nilaiAll =
    stage === "wawancara" ? (await muatNilaiCutting(db, a.edisiId)).byCandidate : null;
  const nilaiTes = nilaiAll?.get(a.kandidat.id) ?? null;
  // The rank by Tes Tulis total among the candidates that have one ("Peringkat 12 dari 78").
  const totals = nilaiAll
    ? [...nilaiAll.values()].map((x) => x.total).filter((x): x is number => x !== null)
    : [];
  const rank =
    nilaiTes && nilaiTes.total !== null
      ? totals.filter((x) => x > nilaiTes.total!).length + 1
      : null;
  // When the CaAs scanned in for this stage, and the files the examiners may open (the Berkas button).
  const evIds = events.filter((e) => e.stage === stage).map((e) => e.id);
  const [hadirRow] = evIds.length
    ? await db
        .select({ at: recAttendance.at })
        .from(recAttendance)
        .where(
          and(eq(recAttendance.candidateId, a.kandidat.id), inArray(recAttendance.eventId, evIds)),
        )
        .orderBy(asc(recAttendance.at))
        .limit(1)
    : [];
  const mctx = await muatMakeupCtx(db, a.edisiId, stage as Parameters<typeof muatMakeupCtx>[2]);
  const docRules = await bacaSetting(db, "docs");
  const berkas = (
    await db
      .select({ id: recDocument.id, kind: recDocument.kind })
      .from(recDocument)
      .where(eq(recDocument.candidateId, a.kandidat.id))
      .orderBy(asc(recDocument.id))
  ).map((d) => ({
    id: d.id,
    kind: d.kind,
    label: docRules.find((x) => x.kind === d.kind)?.label ?? { id: d.kind, en: d.kind },
  }));
  return void res.status(200).json({
    ok: true,
    here: hadirRow?.at ? hadirRow.at.toISOString() : null,
    makeup: mctx.event?.startsOn ?? null,
    cutting: events.find((e) => e.kind === "cutting" && e.stage === stage)?.startsOn ?? null,
    files: berkas,
    scores: nilaiTes
      ? { total: nilaiTes.total, parts: nilaiTes.parts, rank, of: totals.length }
      : null,
    template: a.t,
    candidate: { id: a.kandidat.id, nim: a.kandidat.nim, nama, kelas: booth.kelas },
    slot: {
      id: a.tempat.slot.id,
      room: a.tempat.slot.room,
      startsAt: a.tempat.slot.startsAt.toISOString(),
      endsAt: a.tempat.slot.endsAt.toISOString(),
      booth: a.tempat.index + 1,
    },
    pair: a.tempat.crew.map((n) => ({
      nim: n,
      kode: kode.get(n) ?? n,
      sent: !!sheets.find((r) => r.graderNim === n)?.sentAt,
    })),
    me: s.nim,
    cond: { fm: !hadirFm },
    locked: a.terkunci,
    shared: shared
      ? {
          answers: shared.answers,
          skipped: shared.skipped,
          concl: shared.concl,
          other: shared.other,
          verdict: shared.verdict,
          ba: shared.ba,
          recording: shared.recording,
          startedAt: shared.startedAt?.toISOString() ?? null,
          case: shared.caseInfo,
          version: shared.version,
        }
      : null,
    mine: { levels: mine?.levels ?? {}, sentAt: mine?.sentAt?.toISOString() ?? null },
    // The other examiners' levels stay hidden until every sheet is in.
    others:
      semuaKirim || !a.t.hideLevels || a.penuh
        ? sheets
            .filter((r) => r.graderNim !== s.nim && (r.sentAt || a.penuh))
            .map((r) => ({
              kode: kode.get(r.graderNim) ?? r.graderNim,
              levels: r.levels,
              sentAt: r.sentAt?.toISOString() ?? null,
            }))
        : [],
  });
}

async function handleSheetSave(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const a = await bukaAkses(res, s, b.stage, b.id, true);
  if (!a) return;
  const db = getDb();
  const stage = b.stage as IvStage;
  const sh = (b.shared ?? {}) as Record<string, unknown>;
  const upd: Partial<typeof recSheetShared.$inferInsert> = {};
  const qIds = new Set(a.t.questions.map((q) => q.id));
  const pKeys = new Set(a.t.params.map((x) => x.key));
  const [old] = await db
    .select()
    .from(recSheetShared)
    .where(and(eq(recSheetShared.candidateId, a.kandidat.id), eq(recSheetShared.stage, stage)))
    .limit(1);
  if (sh.answers !== undefined) {
    if (typeof sh.answers !== "object" || sh.answers === null || Array.isArray(sh.answers))
      return void tolak(res, "data_salah", 400, { field: "answers" });
    const merged = { ...(old?.answers ?? {}) };
    for (const [k, v] of Object.entries(sh.answers as Record<string, unknown>)) {
      // Cards of the template, and the examiner's own marks (underscore) are the only keys.
      if (!qIds.has(k) && !k.startsWith("_")) continue;
      const t = bersih(v);
      if (t === null) return void tolak(res, "data_salah", 400, { field: "answers" });
      merged[k] = t;
    }
    upd.answers = merged;
  }
  if (Array.isArray(sh.skipped)) upd.skipped = sh.skipped.map(String).filter((k) => qIds.has(k));
  if (sh.concl !== undefined) {
    if (typeof sh.concl !== "object" || sh.concl === null || Array.isArray(sh.concl))
      return void tolak(res, "data_salah", 400, { field: "concl" });
    const merged = { ...(old?.concl ?? {}) };
    for (const [k, v] of Object.entries(sh.concl as Record<string, unknown>)) {
      if (!pKeys.has(k)) continue;
      const t = bersih(v, 1000);
      if (t === null) return void tolak(res, "data_salah", 400, { field: "concl" });
      merged[k] = t;
    }
    upd.concl = merged;
  }
  if (sh.other !== undefined) {
    const t = bersih(sh.other);
    if (t === null) return void tolak(res, "data_salah", 400, { field: "other" });
    upd.other = t;
  }
  if (sh.ba !== undefined) {
    const t = bersih(sh.ba);
    if (t === null) return void tolak(res, "data_salah", 400, { field: "ba" });
    upd.ba = t;
  }
  if (sh.verdict !== undefined) {
    if (sh.verdict !== null && !(VERDICTS as readonly unknown[]).includes(sh.verdict))
      return void tolak(res, "data_salah", 400, { field: "verdict" });
    upd.verdict = sh.verdict as Verdict | null;
  }
  if (typeof sh.recording === "boolean") upd.recording = sh.recording;
  if (sh.start === true && !old?.startedAt) upd.startedAt = new Date();
  // Levels are checked before anything is written, so a refused level never leaves a half-saved sheet.
  let levelsBaru: Record<string, number> | null = null;
  if (b.levels !== undefined) {
    if (!a.penguji) return void tolak(res, "tanpa_hak", 403);
    if (typeof b.levels !== "object" || b.levels === null || Array.isArray(b.levels))
      return void tolak(res, "data_salah", 400, { field: "levels" });
    levelsBaru = {};
    for (const p of a.t.params) {
      const v = (b.levels as Record<string, unknown>)[p.key];
      if (v === undefined) continue;
      if (typeof v !== "number" || !Number.isInteger(v) || v < p.min || v > p.max)
        return void tolak(res, "data_salah", 400, { field: `levels.${p.key}` });
      levelsBaru[p.key] = v;
    }
  }
  const now = new Date();
  const [row] = await db
    .insert(recSheetShared)
    .values({
      candidateId: a.kandidat.id,
      stage,
      ...upd,
      version: 1,
      updatedBy: s.nim,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [recSheetShared.candidateId, recSheetShared.stage],
      set: { ...upd, version: (old?.version ?? 0) + 1, updatedBy: s.nim, updatedAt: now },
    })
    .returning({ version: recSheetShared.version });
  if (levelsBaru) {
    const [mine] = await db
      .select()
      .from(recSheet)
      .where(
        and(
          eq(recSheet.candidateId, a.kandidat.id),
          eq(recSheet.stage, stage),
          eq(recSheet.graderNim, s.nim),
        ),
      )
      .limit(1);
    const lv = { ...(mine?.levels ?? {}), ...levelsBaru };
    await db
      .insert(recSheet)
      .values({ candidateId: a.kandidat.id, stage, graderNim: s.nim, levels: lv, updatedAt: now })
      .onConflictDoUpdate({
        target: [recSheet.candidateId, recSheet.stage, recSheet.graderNim],
        set: { levels: lv, updatedAt: now },
      });
  }
  return void res.status(200).json({ ok: true, version: row.version });
}

async function handleSheetSend(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const a = await bukaAkses(res, s, b.stage, b.id, true);
  if (!a) return;
  if (!a.penguji) return void tolak(res, "tanpa_hak", 403);
  const db = getDb();
  const stage = b.stage as IvStage;
  const [shared] = await db
    .select()
    .from(recSheetShared)
    .where(and(eq(recSheetShared.candidateId, a.kandidat.id), eq(recSheetShared.stage, stage)))
    .limit(1);
  const [mine] = await db
    .select()
    .from(recSheet)
    .where(
      and(
        eq(recSheet.candidateId, a.kandidat.id),
        eq(recSheet.stage, stage),
        eq(recSheet.graderNim, s.nim),
      ),
    )
    .limit(1);
  const kurang = sheetMissing(
    { levels: mine?.levels ?? {}, concl: shared?.concl ?? {}, verdict: shared?.verdict ?? null },
    a.t.params,
  );
  if (kurang.length) return void tolak(res, "belum_lengkap", 409, { kurang });
  const now = new Date();
  await db
    .update(recSheet)
    .set({ sentAt: now, updatedAt: now })
    .where(
      and(
        eq(recSheet.candidateId, a.kandidat.id),
        eq(recSheet.stage, stage),
        eq(recSheet.graderNim, s.nim),
      ),
    );
  await writeAudit(s.nim, "rec_iv_kirim", { stage, candidateId: a.kandidat.id });
  return void res.status(200).json({ ok: true });
}

async function handleSheetReopen(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const a = await bukaAkses(res, s, b.stage, b.id, true);
  if (!a) return;
  if (!a.penguji) return void tolak(res, "tanpa_hak", 403);
  await getDb()
    .update(recSheet)
    .set({ sentAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(recSheet.candidateId, a.kandidat.id),
        eq(recSheet.stage, b.stage as IvStage),
        eq(recSheet.graderNim, s.nim),
      ),
    );
  await writeAudit(s.nim, "rec_iv_buka", { stage: b.stage, candidateId: a.kandidat.id });
  return void res.status(200).json({ ok: true });
}

async function handleCase(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const a = await bukaAkses(res, s, b.stage, b.id, true);
  if (!a) return;
  if (!(caseKindsFor(b.stage as IvStage) as readonly unknown[]).includes(b.kind))
    return void tolak(res, "data_salah", 400, { field: "kind" });
  const kind = b.kind as CaseKind;
  const minutes = b.minutes === undefined ? undefined : Number(b.minutes);
  if (minutes !== undefined && !(Number.isInteger(minutes) && minutes >= 0 && minutes <= 240))
    return void tolak(res, "data_salah", 400, { field: "minutes" });
  const why = b.why === undefined ? undefined : String(b.why);
  const ok =
    why === undefined ||
    (kind === "telat" && (LATE_WHY as readonly string[]).includes(why)) ||
    (kind === "absen" && (EXCUSE_WHY as readonly string[]).includes(why));
  if (!ok) return void tolak(res, "data_salah", 400, { field: "why" });
  const out = caseOutcome({ kind, minutes, why }, a.t);
  const info: SheetCase = {
    kind,
    ...(minutes !== undefined ? { minutes } : {}),
    ...(why ? { why } : {}),
    status: out.status,
    note: out.code,
    by: s.nim,
    at: new Date().toISOString(),
  };
  const db = getDb();
  const stage = b.stage as IvStage;
  await db
    .insert(recSheetShared)
    .values({ candidateId: a.kandidat.id, stage, caseInfo: info, updatedBy: s.nim })
    .onConflictDoUpdate({
      target: [recSheetShared.candidateId, recSheetShared.stage],
      set: { caseInfo: info, updatedBy: s.nim, updatedAt: new Date() },
    });
  await writeAudit(s.nim, "rec_iv_kasus", {
    stage,
    candidateId: a.kandidat.id,
    kind,
    status: out.status,
  });
  return void res.status(200).json({ ok: true, outcome: out });
}

/* ---------------------------------------------------------------- Penilaian */

export interface NilaiBaris {
  id: number;
  nim: string;
  nama: string;
  slotId: number | null;
  sheets: { by: string; score: number }[];
  expected: number;
  mean: number | null;
  spread: number | null;
  wide: boolean;
  verdict: Verdict | null;
  suggested: Verdict | null;
  case: { kind: string; status: "susulan" | "gugur" | null } | null;
}

/**
 * What the case of a sheet comes to once the Susulan is counted: a CaAs who
 * declined it, or let the deadline pass, is Gugur; one who sat it (a sent
 * sheet) no longer carries the case.
 */
function kasusAkhir(
  info: SheetCase | null,
  makeup: string,
  sudahDinilai: boolean,
): NilaiBaris["case"] {
  if (!info) return null;
  if (info.status !== "susulan") return { kind: info.kind, status: info.status };
  if (makeup === "mundur") return { kind: info.kind, status: "gugur" };
  if (sudahDinilai) return null;
  return { kind: info.kind, status: "susulan" };
}

/** Every CaAs of the stage with the sent sheets, the mean and the verdict. Used by Penilaian and Cutting. */
export async function muatNilaiTahap(
  db: Db,
  edisiId: number,
  stage: IvStage,
  /** Tubes: one row per member of each team (the Cutting), instead of one per team (Penilaian) */
  opts: { anggota?: boolean } = {},
): Promise<NilaiBaris[]> {
  const t = await bacaSetting(db, stage);
  const slots = await muatSlotCrew(db, edisiId, stage);
  const kandIds = slots.flatMap((x) => x.booths.map((b) => b.id));
  if (!kandIds.length) return [];
  const sheets = await db
    .select()
    .from(recSheet)
    .where(and(inArray(recSheet.candidateId, kandIds), eq(recSheet.stage, stage)));
  const shared = await db
    .select()
    .from(recSheetShared)
    .where(and(inArray(recSheetShared.candidateId, kandIds), eq(recSheetShared.stage, stage)));
  const kode = await kodeMap(db);
  // Presentasi has no Susulan (no makeup event for the stage, so the context is empty).
  const mkStage = stage as Parameters<typeof muatMakeupCtx>[2];
  const mctx = await muatMakeupCtx(db, edisiId, mkStage);
  const mrows = await muatBarisMakeup(db, mkStage, kandIds);
  const now = new Date();
  const out: NilaiBaris[] = [];
  for (const sl of slots)
    sl.booths.forEach((bth, i) => {
      const crew = crewFor(sl.penguji, i, t);
      const dikirim = sheets.filter(
        (r) => r.candidateId === bth.id && r.sentAt && levelsDone(r.levels, t.params),
      );
      const lv = dikirim.map((r) => ({
        by: kode.get(r.graderNim) ?? r.graderNim,
        levels: r.levels,
      }));
      const mean = meanScore(lv, t.params);
      const sd = shared.find((r) => r.candidateId === bth.id);
      const spread = spreadScore(lv, t.params);
      out.push({
        id: bth.id,
        nim: bth.nim,
        nama: bth.nama,
        slotId: sl.id,
        sheets: lv.map((x) => ({ by: x.by, score: sheetScore(x.levels, t.params) })),
        expected: Math.max(crew.length, t.mode === "panel" ? t.per : t.per),
        mean,
        spread,
        wide: spread !== null && spread >= t.wide,
        verdict: sd?.verdict ?? null,
        suggested: mean === null ? null : verdictOf(mean, t.cut),
        case: kasusAkhir(
          sd?.caseInfo ?? null,
          posisiMakeup(mctx, mrows.get(bth.id), sl.startsAt, now).state,
          mean !== null,
        ),
      });
    });
  if (stage === "tubes" && opts.anggota) {
    // Every member carries the team's score: the same sheets, the member's own name and number.
    const anggota = await anggotaPerPemimpin(
      db,
      edisiId,
      out.map((r) => r.id),
    );
    const peserta = await muatSemuaPeserta(db, edisiId);
    return out.flatMap((r) =>
      (anggota.get(r.id) ?? [r.id]).map((id) => {
        const p = peserta.get(id);
        return { ...r, id, nim: p?.nim ?? r.nim, nama: p?.nama ?? r.nama };
      }),
    );
  }
  return out;
}

async function handleNilai(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const stage = String(req.query?.stage ?? "");
  if (!isIvStage(stage)) return void tolak(res, "data_salah", 400);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  const t = await bacaSetting(db, stage);
  const rows = await muatNilaiTahap(db, edisi.id, stage);
  if (!bolehNilai(p)) {
    // Lembarku: an examiner without the Penilaian right sees only the sheets they sent themselves,
    // and which partners have sent too (their levels stay hidden).
    const kode = await kodeMap(db);
    const saya = kode.get(s.nim) ?? s.nim;
    const slots = await muatSlotCrew(db, edisi.id, stage);
    const where = new Map(slots.flatMap((sl) => sl.booths.map((b) => [b.id, sl] as const)));
    const mine = rows.filter((r) => r.sheets.some((x) => x.by === saya));
    return void res.status(200).json({
      ok: true,
      mine: true,
      rows: mine.map((r) => ({
        id: r.id,
        nama: r.nama,
        room: where.get(r.id)?.room ?? null,
        startsAt: where.get(r.id)?.startsAt.toISOString() ?? null,
        score: r.sheets.find((x) => x.by === saya)?.score ?? 0,
        verdict: r.verdict,
        others: r.sheets.filter((x) => x.by !== saya).map((x) => x.by),
      })),
    });
  }
  const perPenguji = new Map<string, { n: number; sum: number }>();
  for (const r of rows)
    for (const x of r.sheets) {
      const c = perPenguji.get(x.by) ?? { n: 0, sum: 0 };
      c.n++;
      c.sum += x.score;
      perPenguji.set(x.by, c);
    }
  const all = rows.map((r) => r.mean).filter((m): m is number => m !== null);
  // What the mockup's Penilaian shows beside the numbers: where and when each CaAs sat, the Tes Tulis total
  // (context only), each examiner's levels with the shared conclusions (the Rincian), and who has not sent yet.
  const slots = await muatSlotCrew(db, edisi.id, stage);
  const kandIds = rows.map((r) => r.id);
  const sheetRows = kandIds.length
    ? await db
        .select()
        .from(recSheet)
        .where(and(inArray(recSheet.candidateId, kandIds), eq(recSheet.stage, stage)))
    : [];
  const sharedRows = kandIds.length
    ? await db
        .select()
        .from(recSheetShared)
        .where(and(inArray(recSheetShared.candidateId, kandIds), eq(recSheetShared.stage, stage)))
    : [];
  const kode = await kodeMap(db);
  const tes = stage === "wawancara" ? (await muatNilaiCutting(db, edisi.id)).byCandidate : null;
  // The teaching test reads the interview average and the Tubes score beside its own (context only).
  const wawMean =
    stage === "mengajar"
      ? new Map((await muatNilaiTahap(db, edisi.id, "wawancara")).map((r) => [r.id, r.mean]))
      : null;
  const tubesMean =
    stage === "mengajar"
      ? new Map(
          (await muatNilaiTahap(db, edisi.id, "tubes", { anggota: true })).map((r) => [
            r.id,
            r.mean,
          ]),
        )
      : null;
  const where = new Map<
    number,
    { room: string; startsAt: string; booth: number; crew: string[] }
  >();
  for (const sl of slots)
    sl.booths.forEach((b, i) =>
      where.set(b.id, {
        room: sl.room,
        startsAt: sl.startsAt.toISOString(),
        booth: i + 1,
        crew: crewFor(sl.penguji, i, t).map((n) => kode.get(n) ?? n),
      }),
    );
  const rinci = rows.map((r) => {
    const w = where.get(r.id);
    const sent = sheetRows.filter(
      (x) => x.candidateId === r.id && x.sentAt && levelsDone(x.levels, t.params),
    );
    const sd = sharedRows.find((x) => x.candidateId === r.id);
    const byKode = sent.map((x) => ({
      by: kode.get(x.graderNim) ?? x.graderNim,
      levels: x.levels,
      at: x.sentAt ? x.sentAt.toISOString() : null,
    }));
    return {
      ...r,
      room: w?.room ?? null,
      startsAt: w?.startsAt ?? null,
      booth: w?.booth ?? null,
      total: tes?.get(r.id)?.total ?? null,
      ctx: wawMean && tubesMean ? [wawMean.get(r.id) ?? null, tubesMean.get(r.id) ?? null] : null,
      detail: byKode,
      concl: sd?.concl ?? {},
      ba: sd?.ba ?? "",
      waiting: (w?.crew ?? []).filter((c) => !byKode.some((x) => x.by === c)),
    };
  });
  return void res.status(200).json({
    ok: true,
    me: kode.get(s.nim) ?? null,
    cut: t.cut,
    wide: t.wide,
    per: t.per,
    example: t.params.some((x) => x.example),
    params: t.params,
    levels: t.levels,
    rows: rinci,
    penguji: [...perPenguji.entries()].map(([by, c]) => ({ by, n: c.n, avg: c.sum / c.n })),
    avg: all.length ? all.reduce((a, x) => a + x, 0) / all.length : null,
  });
}

/* ---------------------------------------------------------------- routes */

type H = (req: ApiRequest, res: ApiResponse, s: SessionPayload) => unknown;
export const S4_GET: Record<string, H> = {
  "iv-crew": handleCrew,
  "iv-mine": handleMine,
  "iv-sheet": handleSheet,
  "iv-nilai": handleNilai,
};
export const S4_POST: Record<string, H> = {
  "iv-crew-set": handleCrewSet,
  "iv-standin": handleStandIn,
  "iv-sheet-save": handleSheetSave,
  "iv-sheet-send": handleSheetSend,
  "iv-sheet-reopen": handleSheetReopen,
  "iv-case": handleCase,
};
