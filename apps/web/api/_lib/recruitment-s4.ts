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
 * POST /api/recruitment/iv-sheet-reset      { id, stage, scope: "start" | "all", preview? }  a control seat starts one CaAs over
 * POST /api/recruitment/iv-case             { id, stage, kind, minutes?, why? }
 * GET  /api/recruitment/iv-nilai?stage=     Penilaian: sheets, mean, spread, verdict (Ketua, Akademik, Admin)
 *
 * An examiner reads and writes only the CaAs of their own booth (or panel);
 * a CaAs never sees who examines them. The levels of the other examiners stay
 * hidden until every sheet is sent, unless the template says otherwise.
 */
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
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
  recIvAudio,
  recSlotExaminer,
  recStageResult,
  type SheetCase,
} from "../../src/lib/schema.js";
import {
  caseKindsFor,
  EXCUSE_WHY,
  LATE_WHY,
  FINAL_MAX,
  NOTE_MAX,
  caseOutcome,
  checkCatatan,
  boothSize,
  cleanSizes,
  crewFor,
  rolesIn,
  isIvStage,
  isLabel,
  labelOf,
  levelsDone,
  meanScore,
  sheetMissing,
  sheetScore,
  spreadScore,
  suggestVerdict,
  type Catatan,
  type CaseKind,
  type IvStage,
  type IvTemplate,
  type Label,
  type Verdict,
} from "../../src/lib/recruitment/interview.js";
import type { Biodata } from "../../src/lib/recruitment/types.js";
import {
  AUDIO_BAGIAN_BANYAK,
  AUDIO_BAGIAN_MAKS,
  AUDIO_MS_MAKS,
  AUDIO_TIPE,
  audioCocok,
  bacaRentang,
  tipeDasar,
} from "./recruitment-iv-audio.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatEvents, muatKolam, tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { bebas } from "../../src/lib/recruitment/bebas.js";
import { KURSI_KENDALI } from "../../src/lib/recruitment/rights.js";
import { anggotaPanitia, muatPelaku, wajibHak } from "./recruitment-rights.js";
import { bacaSetting } from "./recruitment-settings.js";
import { muatNilaiCutting, muatRinciTes } from "./recruitment-score.js";
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
/** Who may open any sheet to read or fix it (and take back another examiner's): the control seats. */
const bolehSemua = (p: Awaited<ReturnType<typeof muatPelaku>>): boolean =>
  !!p &&
  (p.penuh || (!!p.kursi && (KURSI_KENDALI as readonly string[]).includes(p.kursi.division)));

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
  /** Examiners per CaAs set for this slot's booths (null: the template's `per` everywhere) */
  crewSizes: number[] | null;
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
    crewSizes: s.crewSizes ?? null,
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
    if (i >= 0) return { slot: s, index: i, crew: crewFor(s.penguji, i, t, s.crewSizes) };
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
 * Examiners per CaAs for one slot: the template says two, but a shift short of Asisten seats one with a CaAs (or
 * three with a hard one). `sizes` lists the group size of each booth in booth order; null goes back to the
 * template everywhere. The examiners stay as plotted, so the groups simply re-cut along the same list.
 */
async function handleCrewSize(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const slotId = Number(b.slotId);
  if (!isIvStage(b.stage) || !Number.isInteger(slotId) || slotId <= 0)
    return void tolak(res, "data_salah", 400);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "plotPengawas")) return;
  const t = await bacaSetting(db, b.stage);
  if (t.mode === "panel") return void tolak(res, "data_salah", 400, { field: "sizes" });
  const [slot] = await muatSlotCrew(db, edisi.id, b.stage).then((a) =>
    a.filter((x) => x.id === slotId),
  );
  if (!slot) return void tolak(res, "slot_tidak_ada", 404);
  const sizes = cleanSizes(b.sizes, slot.booths.length, t.per);
  if (sizes === undefined) return void tolak(res, "data_salah", 400, { field: "sizes" });
  await db.update(recSlot).set({ crewSizes: sizes }).where(eq(recSlot.id, slotId));
  await writeAudit(s.nim, "rec_iv_crew_size", { stage: b.stage, slotId, sizes });
  return void res.status(200).json({ ok: true });
}

/* ---------------------------------------------------------------- voice recording */

/**
 * One part of the voice recording of a Wawancara, uploaded by the examiner's browser as the part ends: the
 * audio bytes in the body (`?stage=wawancara&id=<candidate>&ms=<length>&at=<start, ISO>`). Only an examiner of
 * that CaAs's booth records; the control seats hear, they do not record. Closed with the sheet's stage lock.
 */
async function handleAudioUp(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  if (req.query?.stage !== "wawancara") return void tolak(res, "data_salah", 400);
  const tipe = tipeDasar(req.headers["content-type"]);
  if (!(AUDIO_TIPE as readonly string[]).includes(tipe)) return void tolak(res, "tipe_salah", 415);
  const isi = Buffer.isBuffer(req.body) ? req.body : null;
  if (!isi || isi.length === 0) return void tolak(res, "kosong", 400);
  if (isi.length > AUDIO_BAGIAN_MAKS) return void tolak(res, "terlalu_besar", 413);
  if (!audioCocok(tipe, isi)) return void tolak(res, "isi_tidak_cocok", 400);
  const ms = Number(req.query?.ms);
  const mulai = new Date(String(req.query?.at ?? ""));
  if (!Number.isInteger(ms) || ms < 1 || ms > AUDIO_MS_MAKS || Number.isNaN(mulai.getTime()))
    return void tolak(res, "data_salah", 400);
  const a = await bukaAkses(res, s, "wawancara", req.query?.id, true);
  if (!a) return;
  if (!a.penguji) return void tolak(res, "tanpa_hak", 403);
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recIvAudio)
    .where(and(eq(recIvAudio.candidateId, a.kandidat.id), eq(recIvAudio.stage, "wawancara")));
  if (n >= AUDIO_BAGIAN_BANYAK) return void tolak(res, "terlalu_banyak", 409);
  const [baris] = await db
    .insert(recIvAudio)
    .values({
      candidateId: a.kandidat.id,
      stage: "wawancara",
      recordedBy: s.nim,
      mime: tipe,
      durationMs: ms,
      size: isi.length,
      isi,
      startedAt: mulai,
    })
    .returning({ id: recIvAudio.id });
  return void res.status(200).json({ ok: true, id: baris.id });
}

/** Who may hear a CaAs's recording: the Penilaian seats, and the examiners of that booth. Null after answering a refusal. */
async function bolehDengar(
  res: ApiResponse,
  s: SessionPayload,
  idRaw: unknown,
): Promise<number | null> {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    tolak(res, "data_salah", 400);
    return null;
  }
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return null;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (bolehNilai(p)) {
    const [k] = await db
      .select({ id: recCandidate.id })
      .from(recCandidate)
      .where(and(eq(recCandidate.id, id), eq(recCandidate.editionId, edisi.id)))
      .limit(1);
    if (!k) {
      tolak(res, "kandidat_tidak_ada", 404);
      return null;
    }
    return k.id;
  }
  const a = await bukaAkses(res, s, "wawancara", id, false);
  return a ? a.kandidat.id : null;
}

/** The parts of a CaAs's recording in order: who recorded, how long, and the address to play (iv-audio). */
async function handleAudioList(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  if (req.query?.stage !== "wawancara") return void tolak(res, "data_salah", 400);
  const id = await bolehDengar(res, s, req.query?.id);
  if (id === null) return;
  const db = getDb();
  const rows = await db
    .select({
      id: recIvAudio.id,
      by: recIvAudio.recordedBy,
      ms: recIvAudio.durationMs,
      size: recIvAudio.size,
      at: recIvAudio.startedAt,
    })
    .from(recIvAudio)
    .where(and(eq(recIvAudio.candidateId, id), eq(recIvAudio.stage, "wawancara")))
    .orderBy(asc(recIvAudio.startedAt), asc(recIvAudio.id));
  const kode = await kodeMap(db);
  return void res.status(200).json({
    ok: true,
    parts: rows.map((r) => ({
      id: r.id,
      by: kode.get(r.by) ?? r.by,
      mine: r.by === s.nim,
      ms: r.ms,
      size: r.size,
      at: r.at.toISOString(),
    })),
  });
}

/** One part's audio, with byte ranges so a player can seek (`?id=<candidate>&part=<id>`). */
async function handleAudio(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  if (req.query?.stage !== "wawancara") return void tolak(res, "data_salah", 400);
  const kandidatId = await bolehDengar(res, s, req.query?.id);
  if (kandidatId === null) return;
  const part = Number(req.query?.part);
  if (!Number.isInteger(part) || part <= 0) return void tolak(res, "data_salah", 400);
  const db = getDb();
  const [r] = await db
    .select({ mime: recIvAudio.mime, isi: recIvAudio.isi })
    .from(recIvAudio)
    .where(
      and(
        eq(recIvAudio.id, part),
        eq(recIvAudio.candidateId, kandidatId),
        eq(recIvAudio.stage, "wawancara"),
      ),
    )
    .limit(1);
  if (!r) return void tolak(res, "tidak_ada", 404);
  const size = r.isi.length;
  const rentang = bacaRentang(req.headers.range, size);
  res.setHeader("Content-Type", r.mime);
  res.setHeader("Accept-Ranges", "bytes");
  // An examiner's recording is an interview: kept in this browser only, for the session.
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (rentang === "salah") {
    res.setHeader("Content-Range", `bytes */${size}`);
    res.statusCode = 416;
    return void res.end();
  }
  if (rentang) {
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${rentang.mulai}-${rentang.akhir}/${size}`);
    res.setHeader("Content-Length", String(rentang.akhir - rentang.mulai + 1));
    return void res.end(r.isi.subarray(rentang.mulai, rentang.akhir + 1));
  }
  res.statusCode = 200;
  res.setHeader("Content-Length", String(size));
  return void res.end(r.isi);
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
            and(
              inArray(recAttendance.candidateId, kandIds),
              inArray(recAttendance.eventId, evIds),
              // A test scan (via "uji", from the QR wall's test mode) is never real attendance
              ne(recAttendance.via, "uji"),
            ),
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
      // The template has Catatan Khusus checklists: the PJ's room list then offers a note button per CaAs
      catatan: !!t.tags,
      // The rubric is still the sample one: the mockup shows a "Rubrik Contoh" badge until Akademik replaces it
      example: t.params.some((p) => p.example),
    },
    // One card per role: a person may examine and be PJ in the same slot, so a slot can come back more than once.
    slots: mine.flatMap((x) =>
      rolesIn(x, s.nim).map((role) => {
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
            const crew = crewFor(x.penguji, i, t, x.crewSizes);
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
    ),
  });
}

/* ---------------------------------------------------------------- sheet */

/** A locked stage closes its sheets for writing; free mode (Mode Latihan) keeps them open. */
export const sheetTertutup = (tulis: boolean, terkunci: boolean): boolean =>
  tulis && terkunci && !bebas();

/** A sheet goes in only when no level is missing; free mode lets it go as it is. */
export const sheetBolehKirim = (kurang: readonly unknown[]): boolean =>
  kurang.length === 0 || bebas();

interface Akses {
  t: IvTemplate;
  edisiId: number;
  kandidat: { id: number; nim: string; bio: Biodata };
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
  if (sheetTertutup(tulis, terkunci)) {
    tolak(res, "terkunci", 409);
    return null;
  }
  return { t, edisiId: edisi.id, kandidat: k, tempat, penuh, penguji, terkunci };
}

const bersih = (v: unknown, max = MAX_TEXT): string | null =>
  typeof v === "string" && v.length <= max ? v : null;

/** A new editing sitting starts when the last edit mark is older than this. */
const SITTING_MS = 10 * 60_000;

/**
 * The edit mark of a sheet changed after it was sent: when, and how many sittings. Typing for ten minutes is
 * one sitting (autosave must not count each keystroke), coming back later is another.
 */
export function tandaiEdit(
  prev: { editedAt: Date | null; editCount: number },
  now: Date,
): { editedAt: Date; editCount: number } {
  const baru = !prev.editedAt || now.getTime() - prev.editedAt.getTime() > SITTING_MS;
  return { editedAt: now, editCount: prev.editCount + (baru ? 1 : 0) };
}

/**
 * When each special card applies to a CaAs. fm comes from the attendance. a24 (angkatan 24 taking the IoT course)
 * and te (Teknik Elektro taking the IoT practicum) come from the form the CaAs filled in; null means the form did
 * not say, and the card then shows anyway with a "check the data" note, because asking is cheaper than skipping.
 */
export function kondisiKhusus(
  bio: Pick<Biodata, "angkatan" | "prodi" | "mkIot" | "praktikumIot">,
  fm: boolean,
): { fm: boolean; a24: boolean | null; te: boolean | null } {
  return {
    fm,
    a24: bio.angkatan === 2024 ? (bio.mkIot ?? null) : false,
    te: bio.prodi === undefined ? null : bio.prodi === "te" ? (bio.praktikumIot ?? null) : false,
  };
}

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
            and(
              eq(recAttendance.candidateId, a.kandidat.id),
              eq(recAttendance.eventId, fm.id),
              ne(recAttendance.via, "uji"),
            ),
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
          and(
            eq(recAttendance.candidateId, a.kandidat.id),
            inArray(recAttendance.eventId, evIds),
            ne(recAttendance.via, "uji"),
          ),
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
    penuh: a.penuh,
    me: s.nim,
    cond: kondisiKhusus(a.kandidat.bio, !hadirFm),
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
    mine: {
      levels: mine?.levels ?? {},
      sentAt: mine?.sentAt?.toISOString() ?? null,
      editedAt: mine?.editedAt?.toISOString() ?? null,
      edits: mine?.editCount ?? 0,
    },
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
  // Only the keys sent are written, and the database merges them into the row in one
  // statement (jsonb ||), so two examiners saving at once never drop each other's keys.
  if (sh.answers !== undefined) {
    if (typeof sh.answers !== "object" || sh.answers === null || Array.isArray(sh.answers))
      return void tolak(res, "data_salah", 400, { field: "answers" });
    const merged: Record<string, string> = {};
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
    const merged: Record<string, string> = {};
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
  if (sh.start === true) upd.startedAt = new Date();
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
  // Changing a sheet that is already sent leaves a mark (when, and which sitting), shown to the Penilaian.
  const [ownRow] = a.penguji
    ? await db
        .select()
        .from(recSheet)
        .where(
          and(
            eq(recSheet.candidateId, a.kandidat.id),
            eq(recSheet.stage, stage),
            eq(recSheet.graderNim, s.nim),
          ),
        )
        .limit(1)
    : [];
  const [old] = await db
    .select()
    .from(recSheetShared)
    .where(and(eq(recSheetShared.candidateId, a.kandidat.id), eq(recSheetShared.stage, stage)))
    .limit(1);
  const beda = (x: unknown, y: unknown) => JSON.stringify(x) !== JSON.stringify(y);
  // Answers and conclusions arrive as the keys that changed, so each key is compared with the row.
  const kunciBeda = (kirim?: Record<string, string>, ada?: Record<string, string>) =>
    kirim !== undefined && Object.entries(kirim).some(([k, v]) => (ada?.[k] ?? "") !== v);
  const diubah =
    (levelsBaru !== null &&
      Object.entries(levelsBaru).some(([k, v]) => ownRow?.levels?.[k] !== v)) ||
    kunciBeda(upd.answers, old?.answers) ||
    kunciBeda(upd.concl, old?.concl) ||
    (["skipped", "other", "ba", "verdict", "recording"] as const).some(
      (k) => k in upd && beda(upd[k], old?.[k]),
    );
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
      set: {
        ...upd,
        ...(upd.answers ? { answers: sql`${recSheetShared.answers} || excluded.answers` } : {}),
        ...(upd.concl ? { concl: sql`${recSheetShared.concl} || excluded.concl` } : {}),
        // The first Start stays; a second press never moves it.
        ...(upd.startedAt
          ? { startedAt: sql`coalesce(${recSheetShared.startedAt}, excluded.started_at)` }
          : {}),
        version: sql`${recSheetShared.version} + 1`,
        updatedBy: s.nim,
        updatedAt: now,
      },
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
  if (ownRow?.sentAt && diubah)
    await db.update(recSheet).set(tandaiEdit(ownRow, now)).where(eq(recSheet.id, ownRow.id));
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
  if (!sheetBolehKirim(kurang)) return void tolak(res, "belum_lengkap", 409, { kurang });
  const now = new Date();
  await db
    .update(recSheet)
    .set({
      sentAt: now,
      updatedAt: now,
      // Sent again after being pulled back or changed: the edit mark moves to this send.
      ...(mine && mine.editCount > 0 ? tandaiEdit(mine, now) : {}),
    })
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

/** The edit mark for pulling a sent sheet back; nothing when the sheet was not sent. */
async function tandaiTarik(candidateId: number, stage: IvStage, grader: string, now: Date) {
  const [r] = await getDb()
    .select()
    .from(recSheet)
    .where(
      and(
        eq(recSheet.candidateId, candidateId),
        eq(recSheet.stage, stage),
        eq(recSheet.graderNim, grader),
      ),
    )
    .limit(1);
  return r?.sentAt ? tandaiEdit(r, now) : {};
}

async function handleSheetReopen(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const a = await bukaAkses(res, s, b.stage, b.id, true);
  if (!a) return;
  // My own sheet needs me to examine the CaAs; another examiner's (`grader`) needs the control seats.
  const grader = typeof b.grader === "string" && b.grader.trim() ? b.grader.trim() : s.nim;
  if (grader === s.nim ? !a.penguji : !a.penuh) return void tolak(res, "tanpa_hak", 403);
  const jam = new Date();
  await getDb()
    .update(recSheet)
    .set({
      sentAt: null,
      updatedAt: jam,
      // Only a sheet that was sent counts: pulling back one still being written is not an edit.
      ...(await tandaiTarik(a.kandidat.id, b.stage as IvStage, grader, jam)),
    })
    .where(
      and(
        eq(recSheet.candidateId, a.kandidat.id),
        eq(recSheet.stage, b.stage as IvStage),
        eq(recSheet.graderNim, grader),
      ),
    );
  await writeAudit(s.nim, "rec_iv_buka", {
    stage: b.stage,
    candidateId: a.kandidat.id,
    ...(grader !== s.nim ? { grader } : {}),
  });
  return void res.status(200).json({ ok: true });
}

/**
 * The Tes Tulis and Koding result of the CaAs, for the one interview card that tells it to them: every
 * part with its score and how many answers were right, partly right, wrong and empty, and the Live Coding
 * problems with the tests they passed. No question text. Fetched only when the examiner presses the reveal
 * button, so opening a sheet stays light.
 */
async function handleTes(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  if (req.query?.stage !== "wawancara") return void tolak(res, "data_salah", 400);
  const a = await bukaAkses(res, s, req.query.stage, req.query?.id, false);
  if (!a) return;
  const tes = await muatRinciTes(getDb(), a.edisiId, a.kandidat.id);
  return void res.status(200).json({
    ok: true,
    tes: tes ? { ...tes, parts: tes.parts.map((p) => ({ ...p, questions: [] })) } : null,
  });
}

/**
 * A control seat starts one CaAs's interview over: what was left by testing, or a sheet opened by mistake.
 * `scope: "start"` only stops the running clock (Mulai Wawancara is back to not started); `scope: "all"`
 * also clears the shared sheet (answers, conclusions, verdict, berita acara, the recording mark, the case),
 * every examiner's levels and sent marks, and the voice recording parts of that CaAs. `preview: true`
 * only counts. What is cleared goes into the audit row, so it can be read back. The stage result, the slot
 * and the attendance are not touched: this is the sheet, not the CaAs's standing.
 */
async function handleSheetReset(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const a = await bukaAkses(res, s, b.stage, b.id, true);
  if (!a) return;
  if (!a.penuh) return void tolak(res, "tanpa_hak", 403);
  if (b.scope !== "start" && b.scope !== "all")
    return void tolak(res, "data_salah", 400, { field: "scope" });
  const scope: "start" | "all" = b.scope;
  const stage = b.stage as IvStage;
  const db = getDb();
  const cand = a.kandidat.id;
  const [shared] = await db
    .select()
    .from(recSheetShared)
    .where(and(eq(recSheetShared.candidateId, cand), eq(recSheetShared.stage, stage)))
    .limit(1);
  const sheets = await db
    .select()
    .from(recSheet)
    .where(and(eq(recSheet.candidateId, cand), eq(recSheet.stage, stage)));
  const audio = await db
    .select({
      id: recIvAudio.id,
      by: recIvAudio.recordedBy,
      ms: recIvAudio.durationMs,
      size: recIvAudio.size,
      at: recIvAudio.startedAt,
    })
    .from(recIvAudio)
    .where(and(eq(recIvAudio.candidateId, cand), eq(recIvAudio.stage, stage)));
  const count = {
    started: !!shared?.startedAt,
    answers: Object.values(shared?.answers ?? {}).filter((v) => String(v).trim()).length,
    conclusions: Object.values(shared?.concl ?? {}).filter((v) => String(v).trim()).length,
    verdict: shared?.verdict ?? null,
    case: !!shared?.caseInfo,
    levels: sheets.filter((r) => Object.keys(r.levels ?? {}).length).length,
    sent: sheets.filter((r) => r.sentAt).length,
    audio: audio.length,
  };
  if (b.preview === true) return void res.status(200).json({ ok: true, scope, count });
  await db.transaction(async (tx) => {
    if (scope === "start") {
      await tx
        .update(recSheetShared)
        .set({ startedAt: null, updatedBy: s.nim, updatedAt: new Date() })
        .where(and(eq(recSheetShared.candidateId, cand), eq(recSheetShared.stage, stage)));
      return;
    }
    await tx.delete(recSheet).where(and(eq(recSheet.candidateId, cand), eq(recSheet.stage, stage)));
    await tx
      .delete(recSheetShared)
      .where(and(eq(recSheetShared.candidateId, cand), eq(recSheetShared.stage, stage)));
    await tx
      .delete(recIvAudio)
      .where(and(eq(recIvAudio.candidateId, cand), eq(recIvAudio.stage, stage)));
  });
  await writeAudit(s.nim, "rec_iv_reset", {
    stage,
    candidateId: cand,
    scope,
    count,
    // Kept so a reset can be read back: the shared sheet, each examiner's levels, the audio parts' sizes.
    before: {
      shared: shared
        ? {
            answers: shared.answers,
            skipped: shared.skipped,
            concl: shared.concl,
            other: shared.other,
            verdict: shared.verdict,
            ba: shared.ba,
            recording: shared.recording,
            startedAt: shared.startedAt,
            caseInfo: shared.caseInfo,
          }
        : null,
      sheets: sheets.map((r) => ({ grader: r.graderNim, levels: r.levels, sentAt: r.sentAt })),
      audio,
    },
  });
  return void res.status(200).json({ ok: true, scope, count });
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
  sheets: { by: string; score: number; editedAt: string | null; edits: number }[];
  expected: number;
  mean: number | null;
  spread: number | null;
  wide: boolean;
  /** A red flag: Attitude or Komitmen rated low by an examiner, so a Fix Lolos is held at Ragu-ragu */
  flag: boolean;
  verdict: Verdict | null;
  suggested: Verdict | null;
  /** Catatan Khusus: how many red notes and plus points, and the label they come to (null with no checklist) */
  red: number;
  plus: number;
  label: Label | null;
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
      const crew = crewFor(sl.penguji, i, t, sl.crewSizes);
      const dikirim = sheets.filter(
        (r) => r.candidateId === bth.id && r.sentAt && levelsDone(r.levels, t.params),
      );
      const lv = dikirim.map((r) => ({
        by: kode.get(r.graderNim) ?? r.graderNim,
        levels: r.levels,
        editedAt: r.editedAt?.toISOString() ?? null,
        edits: r.editCount,
      }));
      const mean = meanScore(lv, t.params, t.floor);
      const sd = shared.find((r) => r.candidateId === bth.id);
      const spread = spreadScore(lv, t.params, t.floor);
      const sug = mean === null ? null : suggestVerdict(mean, lv, t);
      const ct = checkCatatan(sd?.catatan, t.tags);
      out.push({
        id: bth.id,
        nim: bth.nim,
        nama: bth.nama,
        slotId: sl.id,
        sheets: lv.map((x) => ({
          by: x.by,
          score: sheetScore(x.levels, t.params, t.floor),
          editedAt: x.editedAt,
          edits: x.edits,
        })),
        expected: Math.max(
          crew.length,
          t.mode === "panel" ? t.per : boothSize(sl.crewSizes, i, t.per),
        ),
        mean,
        spread,
        wide: spread !== null && spread >= t.wide,
        flag: sug?.flag ?? false,
        verdict: sd?.verdict ?? null,
        suggested: sug?.verdict ?? null,
        red: ct.red.length,
        plus: ct.plus.length,
        label: t.tags ? labelOf(ct, t.tags) : null,
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
        crew: crewFor(sl.penguji, i, t, sl.crewSizes).map((n) => kode.get(n) ?? n),
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
      editedAt: x.editedAt ? x.editedAt.toISOString() : null,
      edits: x.editCount,
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
      ct: t.tags ? tampilCatatan(checkCatatan(sd?.catatan, t.tags), kode, "") : null,
      waiting: (w?.crew ?? []).filter((c) => !byKode.some((x) => x.by === c)),
    };
  });
  return void res.status(200).json({
    ok: true,
    me: kode.get(s.nim) ?? null,
    cut: t.cut,
    wide: t.wide,
    per: t.per,
    flag: t.flag,
    tags: t.tags,
    example: t.params.some((x) => x.example),
    params: t.params,
    levels: t.levels,
    rows: rinci,
    penguji: [...perPenguji.entries()].map(([by, c]) => ({ by, n: c.n, avg: c.sum / c.n })),
    avg: all.length ? all.reduce((a, x) => a + x, 0) / all.length : null,
  });
}

/* ---------------------------------------------------------------- Catatan Khusus */

type PeranCatatan = "penguji" | "pjDalam" | "pjLuar" | "lain";

/**
 * A Catatan as the screens read it: the notes as a list (an examiner's NIM shown as their code), and which one is
 * the reader's own. `mijnKey` is the key the reader's own note is kept under.
 */
function tampilCatatan(c: Catatan, kode: Map<string, string>, mijnKey: string) {
  const roles = ["pjDalam", "pjLuar", "lain"];
  return {
    red: c.red,
    plus: c.plus,
    label: c.label,
    final: c.final,
    notes: Object.entries(c.notes).map(([key, text]) => ({
      key,
      who: roles.includes(key) ? key : (kode.get(key) ?? key),
      text,
      mine: key === mijnKey,
    })),
  };
}

/**
 * Who may touch a CaAs's Catatan Khusus: the examiners of the booth, the PJ of its room, any committee member, and
 * the control seats (who may also set the label and the conclusion). Anyone else is refused. The sheet itself stays
 * closed to a PJ; only this note is open to them.
 */
async function bukaCatatan(
  res: ApiResponse,
  s: SessionPayload,
  stageRaw: unknown,
  idRaw: unknown,
  tulis: boolean,
) {
  if (!isIvStage(stageRaw)) return void tolak(res, "data_salah", 400);
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) return void tolak(res, "data_salah", 400);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  const [k] = await db
    .select({ id: recCandidate.id, nim: recCandidate.nim })
    .from(recCandidate)
    .where(and(eq(recCandidate.id, id), eq(recCandidate.editionId, edisi.id)))
    .limit(1);
  if (!k) return void tolak(res, "kandidat_tidak_ada", 404);
  const t = await bacaSetting(db, stageRaw);
  if (!t.tags) return void tolak(res, "tanpa_catatan", 404);
  const tempat = await tempatKandidat(db, edisi.id, stageRaw, k.id, t);
  const semua = bolehNilai(p);
  let peran: PeranCatatan | null = null;
  if (tempat?.crew.includes(s.nim)) peran = "penguji";
  else if (tempat?.slot.pjIn.includes(s.nim)) peran = "pjDalam";
  else if (tempat?.slot.pjOut.includes(s.nim)) peran = "pjLuar";
  else if (anggotaPanitia(p)) peran = "lain";
  if (!peran && !semua) return void tolak(res, "tanpa_hak", 403);
  if (tulis && !semua) {
    const [hasil] = await db
      .select({ locked: recStageResult.locked })
      .from(recStageResult)
      .where(and(eq(recStageResult.candidateId, k.id), eq(recStageResult.stage, stageRaw)))
      .limit(1);
    if (sheetTertutup(true, !!hasil?.locked)) return void tolak(res, "terkunci", 409);
  }
  const mijnKey = peran === "penguji" ? s.nim : (peran ?? "lain");
  return {
    db,
    t,
    tags: t.tags,
    stage: stageRaw,
    edisiId: edisi.id,
    kandidat: k,
    semua,
    peran,
    mijnKey,
  };
}

async function handleCatatan(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const a = await bukaCatatan(res, s, req.query?.stage, req.query?.id, false);
  if (!a) return;
  const [sd] = await a.db
    .select({ catatan: recSheetShared.catatan })
    .from(recSheetShared)
    .where(and(eq(recSheetShared.candidateId, a.kandidat.id), eq(recSheetShared.stage, a.stage)))
    .limit(1);
  const c = checkCatatan(sd?.catatan, a.tags);
  const kode = await kodeMap(a.db);
  const nama = (await namaPerNim(a.db, [a.kandidat.nim])).get(a.kandidat.nim) ?? a.kandidat.nim;
  return void res.status(200).json({
    ok: true,
    nama,
    tags: a.tags,
    catatan: tampilCatatan(c, kode, a.mijnKey),
    auto: labelOf({ ...c, label: null }, a.tags),
    label: labelOf(c, a.tags),
    peran: a.peran,
    semua: a.semua,
    mijnKey: a.mijnKey,
  });
}

/**
 * One change at a time, so two people writing about the same CaAs never overwrite each other: tick (or untick)
 * a red note or plus point, write your own note, and (control seats only) set the label, the conclusion or
 * someone else's note. The row is locked while it is read and written back.
 */
async function handleCatatanSave(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const a = await bukaCatatan(res, s, b.stage, b.id, true);
  if (!a) return;
  const tick = b.tick as { list?: unknown; key?: unknown; on?: unknown } | undefined;
  if (tick !== undefined) {
    const ok =
      (tick.list === "red" || tick.list === "plus") &&
      typeof tick.key === "string" &&
      typeof tick.on === "boolean" &&
      a.tags[tick.list].some((x) => x.key === tick.key);
    if (!ok) return void tolak(res, "data_salah", 400, { field: "tick" });
  }
  if (b.note !== undefined && (typeof b.note !== "string" || b.note.length > NOTE_MAX))
    return void tolak(res, "data_salah", 400, { field: "note" });
  // Only a control seat writes under another name; everyone else writes under their own.
  if (b.noteKey !== undefined && !a.semua) return void tolak(res, "tanpa_hak", 403);
  const noteKey = typeof b.noteKey === "string" ? b.noteKey : a.mijnKey;
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(noteKey)) return void tolak(res, "data_salah", 400);
  if (b.label !== undefined && b.label !== null && !isLabel(b.label))
    return void tolak(res, "data_salah", 400, { field: "label" });
  if (b.final !== undefined && (typeof b.final !== "string" || b.final.length > FINAL_MAX))
    return void tolak(res, "data_salah", 400, { field: "final" });
  if ((b.label !== undefined || b.final !== undefined) && !a.semua)
    return void tolak(res, "tanpa_hak", 403);
  const now = new Date();
  const saved = await a.db.transaction(async (tx) => {
    const [row] = await tx
      .select({ catatan: recSheetShared.catatan })
      .from(recSheetShared)
      .where(and(eq(recSheetShared.candidateId, a.kandidat.id), eq(recSheetShared.stage, a.stage)))
      .limit(1)
      .for("update");
    const c = checkCatatan(row?.catatan, a.tags);
    if (tick) {
      const list = tick.list as "red" | "plus";
      const rest = c[list].filter((k) => k !== tick.key);
      c[list] = tick.on ? [...rest, tick.key as string] : rest;
    }
    if (typeof b.note === "string") {
      const text = b.note.trim();
      if (text) c.notes[noteKey] = text;
      else delete c.notes[noteKey];
    }
    if (b.label !== undefined) c.label = b.label as Label | null;
    if (typeof b.final === "string") c.final = b.final.trim();
    const next = checkCatatan(c, a.tags);
    await tx
      .insert(recSheetShared)
      .values({ candidateId: a.kandidat.id, stage: a.stage, catatan: next, updatedAt: now })
      .onConflictDoUpdate({
        target: [recSheetShared.candidateId, recSheetShared.stage],
        set: { catatan: next },
      });
    return next;
  });
  await writeAudit(s.nim, "rec_iv_catatan", {
    stage: a.stage,
    candidateId: a.kandidat.id,
    peran: a.peran,
  });
  const kode = await kodeMap(a.db);
  return void res.status(200).json({
    ok: true,
    catatan: tampilCatatan(saved, kode, a.mijnKey),
    auto: labelOf({ ...saved, label: null }, a.tags),
    label: labelOf(saved, a.tags),
  });
}

/* ---------------------------------------------------------------- routes */

type H = (req: ApiRequest, res: ApiResponse, s: SessionPayload) => unknown;
export const S4_GET: Record<string, H> = {
  "iv-crew": handleCrew,
  "iv-mine": handleMine,
  "iv-sheet": handleSheet,
  "iv-nilai": handleNilai,
  "iv-catatan": handleCatatan,
  "iv-tes": handleTes,
  "iv-audio-list": handleAudioList,
  "iv-audio": handleAudio,
};
export const S4_POST: Record<string, H> = {
  "iv-crew-set": handleCrewSet,
  "iv-crew-size": handleCrewSize,
  "iv-audio-up": handleAudioUp,
  "iv-standin": handleStandIn,
  "iv-sheet-save": handleSheetSave,
  "iv-sheet-send": handleSheetSend,
  "iv-sheet-reopen": handleSheetReopen,
  "iv-sheet-reset": handleSheetReset,
  "iv-case": handleCase,
  "iv-catatan-save": handleCatatanSave,
};
