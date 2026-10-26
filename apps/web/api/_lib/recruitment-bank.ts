/**
 * The question bank, the parts config and the reference snapshots (S3,
 * prompt 09, EXAM-ENGINE 1, 2, 8 and 10.3). Everything here needs the `bank`
 * right (Akademik and the Ketua) except two reads a seat may make during its
 * running part: a picture of a question it was dealt (`media`) and a
 * reference attached to its part (`ref`).
 *
 * GET  exam-config       { config, locked, pools }
 * POST exam-config-save  { config }
 * GET  questions         ?part=&lang=&status=  the list, without bodies
 * GET  question          ?id=  one question with its key and its log
 * POST question-save     { id?, part, lang, format, title, body, answer, refs, status, note? }
 * POST question-delete   { id }
 * POST bank-import       { text, dry, note? }  Markdown + YAML (bank-io.ts)
 * GET  bank-export       ?part=  text/markdown
 * POST bank-seed         { }  installs the default bank, skipping what is there
 * POST media-ticket      { mime, size, sha256 }  a relay PUT address for a picture
 * GET  media             ?key=  302 to a 10 minute link
 * GET  references        { references, partRefs, questionRefs }
 * POST reference-add     { url, title?, selector? }
 * POST reference-refetch { id }
 * POST reference-upload  { title, html, url?, id? }
 * POST reference-delete  { id }
 * POST reference-attach  { id, part?, questionId?, on }
 * GET  ref               ?id=  the sanitized page, under a strict CSP
 *
 * The rules (what may change once a question was shown, what a running room
 * freezes) are src/lib/recruitment/bank-rules.ts; this file reads rows and asks.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, noStore, pgErrorCode } from "./http.js";
import {
  asisten,
  recAnswer,
  recCandidate,
  recExamConfig,
  recExamRoom,
  recExamSeat,
  recPartRef,
  recQuestion,
  recQuestionLog,
  recReference,
  type RecQuestionRow,
} from "../../src/lib/schema.js";
import {
  PHASE1_PARTS,
  type ExamConfig,
  type Lang,
  type Phase1Part,
  type Question,
} from "../../src/lib/recruitment/exam-types.js";
import { validateQuestion } from "../../src/lib/recruitment/formats.js";
import { refGagalHtml, refLang } from "../../src/lib/recruitment/ref-gagal.js";
import { validateConfig, normalize, seatLeft } from "../../src/lib/recruitment/room.js";
import {
  parseBank,
  writeBank,
  type ExportItem,
  type ImportError,
} from "../../src/lib/recruitment/bank-io.js";
import {
  canon,
  cleanQuestion,
  isFormat,
  isLang,
  isPart,
  judgeSave,
  langsOf,
  poolCounts,
  MAX_TITLE,
  type QuestionState,
  type StoredState,
} from "../../src/lib/recruitment/bank-rules.js";
import { SEED_MD } from "../../src/lib/recruitment/seed-bank.js";
import { BANK_GAMBAR, REK_BANK_RE, REK_REF_RE, kunciBank, kunciRef } from "../../src/lib/tp-r2.js";
import { tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { muatPelaku, wajibHak, type PelakuServer } from "./recruitment-rights.js";
import { muatConfig } from "./recruitment-room.js";
import { denganKunciNilai, nilaiBeku } from "./recruitment-score.js";
import { muatKursiSendiri } from "./recruitment-seat.js";
import {
  SnapshotError,
  snapshotUpload,
  snapshotUrl,
  type Snapshot,
} from "./recruitment-snapshot.js";
import { ambil, kepala, simpan, simpanSiap, tiketUnggah, urlBaca } from "./tp-simpan.js";

type RecReferenceRow = typeof recReference.$inferSelect;

/** What the handler reaches outside the database, so a test can stand in for it. */
export const dep = {
  snapshotUrl,
  snapshotUpload,
  simpanSiap,
  kepala,
  simpan,
  ambil,
  tiketUnggah,
  urlBaca,
};

const STATUS: Record<string, number> = {
  tanpa_hak: 403,
  tidak_ada: 404,
  format_salah: 400,
  data_salah: 400,
  bahasa_salah: 400,
  struktur_terkunci: 409,
  perlu_catatan: 400,
  ruang_berjalan: 409,
  sudah_tampil: 409,
  terkunci: 409,
  nilai_final: 409,
  versi_lama: 409,
  sudah_ada: 409,
  rujukan_hilang: 400,
  gambar_hilang: 400,
  terlalu_besar: 413,
  belum_diatur: 503,
  tidak_aman: 502,
};
const galat = (res: ApiResponse, kode: string, extra: Record<string, unknown> = {}) =>
  tolak(res, kode, STATUS[kode] ?? 400, extra);

const intOf = (v: unknown): number | null => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const textOf = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? "") : String(v ?? ""));

/* ---------------------------------------------------------------- entry */

export async function handleBank(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const aksi = String(req.query.aksi ?? "");
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const asistenSesi = s.role === "asisten";
  const p = asistenSesi ? await muatPelaku(db, edisi.id, s.nim) : null;

  // The two reads a seat may make during its running part.
  if (aksi === "media") return media(req, res, db, edisi.id, s, p);
  if (aksi === "ref") return ref(req, res, db, edisi.id, s, p);

  if (!asistenSesi) return galat(res, "tanpa_hak");
  if (!wajibHak(res, p, "bank")) return;
  noStore(res);
  const k: Konteks = { req, res, db, edisiId: edisi.id, nim: s.nim, p: p! };
  switch (aksi) {
    case "exam-config":
      return bacaConfig(k);
    case "exam-config-save":
      return simpanConfig(k);
    case "questions":
      return daftarSoal(k);
    case "question":
      return bacaSoal(k);
    case "question-save":
      return simpanSoal(k);
    case "question-delete":
      return hapusSoal(k);
    case "bank-import":
      return impor(k);
    case "bank-export":
      return ekspor(k);
    case "bank-seed":
      return pasangBawaan(k);
    case "media-ticket":
      return tiketGambar(k);
    case "references":
      return daftarRujukan(k);
    case "reference-add":
      return tambahRujukan(k);
    case "reference-refetch":
      return ambilUlang(k);
    case "reference-upload":
      return unggahRujukan(k);
    case "reference-delete":
      return hapusRujukan(k);
    case "reference-attach":
      return kaitkan(k);
  }
  return galat(res, "aksi_tak_dikenal");
}

interface Konteks {
  req: ApiRequest;
  res: ApiResponse;
  db: Db;
  edisiId: number;
  nim: string;
  p: PelakuServer;
}

/* -------------------------------------------------------------- helpers */

/** A real room of the edition is in persiapan, a part or the spins (1.4). */
async function ruangBerjalan(db: Db, edisiId: number): Promise<boolean> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recExamRoom)
    .where(
      and(
        eq(recExamRoom.editionId, edisiId),
        eq(recExamRoom.rehearsal, false),
        sql`${recExamRoom.state}->>'stage' in ('prep', 'parts', 'spin')`,
      ),
    );
  return (r?.n ?? 0) > 0;
}

const asQuestion = (r: RecQuestionRow): Question =>
  ({
    id: r.id,
    part: r.part,
    lang: r.lang,
    format: r.format,
    version: r.version,
    body: r.body,
    answer: r.answer,
  }) as Question;

const stateOf = (r: RecQuestionRow): StoredState => ({
  part: r.part,
  lang: r.lang,
  format: r.format,
  title: r.title,
  status: r.status,
  body: r.body,
  answer: r.answer,
  refs: r.refs,
  shown: r.shownAt !== null,
  sample: r.sample,
});

function summary(r: RecQuestionRow) {
  return {
    id: r.id,
    part: r.part,
    lang: r.lang,
    format: r.format,
    title: r.title,
    status: r.status,
    sample: r.sample,
    version: r.version,
    shown: r.shownAt !== null,
    voided: r.voidedAt !== null,
    refs: r.refs.length,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function full(r: RecQuestionRow, refList: { id: number; title: string; url: string | null }[]) {
  return {
    ...summary(r),
    body: r.body,
    answer: r.answer,
    refIds: r.refs,
    refList,
    voidNote: r.voidNote,
  };
}

async function refInfo(db: Db, edisiId: number, ids: number[]) {
  if (!ids.length) return [];
  return db
    .select({ id: recReference.id, title: recReference.title, url: recReference.url })
    .from(recReference)
    .where(and(eq(recReference.editionId, edisiId), inArray(recReference.id, ids)));
}

async function muatSemua(db: Db, edisiId: number): Promise<RecQuestionRow[]> {
  return db
    .select()
    .from(recQuestion)
    .where(eq(recQuestion.editionId, edisiId))
    .orderBy(asc(recQuestion.part), asc(recQuestion.lang), asc(recQuestion.id));
}

/* --------------------------------------------------------------- config */

async function bacaConfig(k: Konteks) {
  const config = await muatConfig(k.db, k.edisiId);
  const [row] = await k.db
    .select({ lockedAt: recExamConfig.lockedAt })
    .from(recExamConfig)
    .where(eq(recExamConfig.editionId, k.edisiId))
    .limit(1);
  const rows = await k.db
    .select({
      part: recQuestion.part,
      lang: recQuestion.lang,
      status: recQuestion.status,
      sample: recQuestion.sample,
      voided: sql<boolean>`${recQuestion.voidedAt} is not null`,
    })
    .from(recQuestion)
    .where(eq(recQuestion.editionId, k.edisiId));
  k.res.status(200).json({
    ok: true,
    config,
    locked: row?.lockedAt != null,
    pools: poolCounts(rows, config),
    running: await ruangBerjalan(k.db, k.edisiId),
  });
}

async function simpanConfig(k: Konteks) {
  const b = jsonBody(k.req);
  const next = b.config as ExamConfig | undefined;
  if (!next || typeof next !== "object" || next.v !== 1) return galat(k.res, "format_salah");
  const errors = validateConfig(next);
  if (errors.length) return galat(k.res, "format_salah", { errors });
  const old = await muatConfig(k.db, k.edisiId);
  const [row] = await k.db
    .select({ lockedAt: recExamConfig.lockedAt })
    .from(recExamConfig)
    .where(eq(recExamConfig.editionId, k.edisiId))
    .limit(1);
  // After the first real Start, only the budget may change (EXAM-ENGINE 2).
  if (row?.lockedAt && canon({ ...next, budgetMin: old.budgetMin }) !== canon(old))
    return galat(k.res, "terkunci");
  await k.db
    .update(recExamConfig)
    .set({ config: next, updatedBy: k.nim, updatedAt: new Date() })
    .where(eq(recExamConfig.editionId, k.edisiId));
  await writeAudit(k.nim, "rec_exam_config", { edition: k.edisiId });
  k.res.status(200).json({ ok: true, config: next });
}

/* ------------------------------------------------------------ questions */

async function daftarSoal(k: Konteks) {
  const part = textOf(k.req.query.part);
  const lang = textOf(k.req.query.lang);
  const status = textOf(k.req.query.status);
  const rows = (await muatSemua(k.db, k.edisiId)).filter(
    (r) =>
      (!part || r.part === part) && (!lang || r.lang === lang) && (!status || r.status === status),
  );
  k.res.status(200).json({ ok: true, questions: rows.map(summary) });
}

async function bacaSoal(k: Konteks) {
  const id = intOf(k.req.query.id);
  if (!id) return galat(k.res, "data_salah");
  const [r] = await k.db
    .select()
    .from(recQuestion)
    .where(and(eq(recQuestion.id, id), eq(recQuestion.editionId, k.edisiId)))
    .limit(1);
  if (!r) return galat(k.res, "tidak_ada");
  const log = await k.db
    .select({
      id: recQuestionLog.id,
      who: recQuestionLog.who,
      nama: asisten.nama,
      kind: recQuestionLog.kind,
      note: recQuestionLog.note,
      at: recQuestionLog.at,
    })
    .from(recQuestionLog)
    .leftJoin(asisten, eq(asisten.nim, recQuestionLog.who))
    .where(eq(recQuestionLog.questionId, id))
    .orderBy(asc(recQuestionLog.at));
  k.res.status(200).json({
    ok: true,
    question: full(r, await refInfo(k.db, k.edisiId, r.refs)),
    log: log.map((l) => ({ ...l, at: l.at.toISOString() })),
  });
}

interface SoalMasuk {
  id?: number;
  part: Phase1Part;
  lang: Lang;
  format: Question["format"];
  title: string;
  status: "draft" | "ready";
  body: unknown;
  answer: unknown;
  refs: number[];
  sample?: boolean;
  note?: string;
  /** The version the editor loaded: when it is behind the stored one, someone saved in between */
  baseVersion?: number;
}

type Hasil =
  | {
      ok: true;
      kind: "create" | "save" | "key" | "status" | "same";
      row: RecQuestionRow | null;
      id?: number;
    }
  | { ok: false; kode: string; errors?: unknown };

const bankKey = (edisiId: number, key: string) =>
  REK_BANK_RE.test(key) && key.startsWith(`recruitment/${edisiId}/bank/`);

/** Every rule of a save, then (unless `dry`) the write; one place for question-save and the import. */
async function simpanSatu(
  db: Db,
  edisiId: number,
  nim: string,
  m: SoalMasuk,
  o: { dry: boolean; running: boolean; langs: Record<Phase1Part, Lang[]> },
): Promise<Hasil> {
  if (!isPart(m.part) || !isLang(m.lang) || !isFormat(m.format))
    return { ok: false, kode: "format_salah" };
  const title = typeof m.title === "string" ? m.title.trim() : "";
  if (!title || title.length > MAX_TITLE)
    return { ok: false, kode: "format_salah", errors: [{ field: "title", kode: "judul_kosong" }] };
  if (m.status !== "draft" && m.status !== "ready") return { ok: false, kode: "format_salah" };
  const clean = cleanQuestion(m.format, m.body, m.answer);
  if (!clean) return { ok: false, kode: "format_salah" };
  const q = {
    id: m.id ?? 0,
    version: 1,
    part: m.part,
    lang: m.lang,
    format: m.format,
    ...clean,
  } as Question;
  const errors = validateQuestion(q);
  if (errors.length) return { ok: false, kode: "format_salah", errors };
  const images = (clean.body as { images?: { key: string }[] }).images ?? [];
  if (images.some((i) => !bankKey(edisiId, i.key))) return { ok: false, kode: "gambar_hilang" };

  const refs = [...new Set(m.refs ?? [])];
  if (refs.some((r) => !Number.isInteger(r))) return { ok: false, kode: "data_salah" };
  if (refs.length) {
    const have = await refInfo(db, edisiId, refs);
    if (have.length !== refs.length) return { ok: false, kode: "rujukan_hilang" };
  }
  if (images.length && dep.simpanSiap()) {
    for (const i of images) {
      const h = await dep.kepala(i.key).catch(() => ({ ada: false }));
      if (!h.ada) return { ok: false, kode: "gambar_hilang" };
    }
  }

  let old: RecQuestionRow | null = null;
  if (m.id !== undefined) {
    const [r] = await db
      .select()
      .from(recQuestion)
      .where(and(eq(recQuestion.id, m.id), eq(recQuestion.editionId, edisiId)))
      .limit(1);
    if (!r) return { ok: false, kode: "tidak_ada" };
    if (m.baseVersion !== undefined && m.baseVersion !== r.version)
      return { ok: false, kode: "versi_lama" };
    old = r;
  }
  const next: QuestionState = {
    part: m.part,
    lang: m.lang,
    format: m.format,
    title,
    status: m.status,
    body: clean.body,
    answer: clean.answer,
    refs,
  };
  const v = judgeSave(old ? stateOf(old) : null, next, {
    roomRunning: o.running,
    note: m.note,
    langs: o.langs,
  });
  if (!v.ok) return v;
  if (o.dry || v.kind === "same") return { ok: true, kind: v.kind, row: old, id: old?.id };

  const now = new Date();
  if (!old) {
    const [row] = await db
      .insert(recQuestion)
      .values({
        editionId: edisiId,
        part: next.part,
        lang: next.lang,
        format: next.format,
        title,
        body: next.body,
        answer: next.answer,
        refs,
        status: next.status,
        sample: m.sample === true,
        createdBy: nim,
        updatedBy: nim,
        updatedAt: now,
      })
      .returning();
    await db.insert(recQuestionLog).values({
      questionId: row.id,
      who: nim,
      kind: "save",
      before: null,
      after: { title, status: next.status },
      note: m.note ?? null,
      at: now,
    });
    return { ok: true, kind: "create", row, id: row.id };
  }
  // The version guard: of two editors saving the same question, one wins and the other rereads.
  const [row] = await db
    .update(recQuestion)
    .set({
      part: next.part,
      lang: next.lang,
      format: next.format,
      title,
      body: next.body,
      answer: next.answer,
      refs,
      status: next.status,
      sample: false,
      version: old.version + 1,
      updatedBy: nim,
      updatedAt: now,
    })
    .where(and(eq(recQuestion.id, old.id), eq(recQuestion.version, old.version)))
    .returning();
  if (!row) return { ok: false, kode: "versi_lama" };
  const kind = v.kind === "key" ? "key" : v.kind === "status" ? "status" : "save";
  await db.insert(recQuestionLog).values({
    questionId: old.id,
    who: nim,
    kind,
    before: { title: old.title, status: old.status, body: old.body, answer: old.answer },
    after: { title, status: next.status, body: next.body, answer: next.answer },
    note: m.note?.trim() || null,
    at: now,
  });
  return { ok: true, kind: v.kind, row, id: old.id };
}

async function simpanSoal(k: Konteks) {
  const b = jsonBody(k.req);
  const id = b.id === undefined || b.id === null ? undefined : intOf(b.id);
  if (b.id !== undefined && b.id !== null && !id) return galat(k.res, "data_salah");
  // Finalkan froze the scores: a question that was dealt keeps its key (EXAM-ENGINE 4.3).
  // The freeze is read under the score lock, with the write inside it, so a Finalkan that
  // commits between the two cannot be missed.
  const r = await denganKunciNilai(k.db, k.edisiId, async (tx) => {
    if (id && (await nilaiBeku(tx, k.edisiId))) {
      const [ada] = await tx
        .select({ shownAt: recQuestion.shownAt })
        .from(recQuestion)
        .where(and(eq(recQuestion.id, id), eq(recQuestion.editionId, k.edisiId)))
        .limit(1);
      if (ada?.shownAt) return null;
    }
    const config = await muatConfig(tx, k.edisiId);
    return simpanSatu(
      tx,
      k.edisiId,
      k.nim,
      {
        id: id ?? undefined,
        part: b.part as Phase1Part,
        lang: b.lang as Lang,
        format: b.format as Question["format"],
        title: b.title as string,
        status: b.status as "draft" | "ready",
        body: b.body,
        answer: b.answer,
        refs: Array.isArray(b.refs) ? (b.refs as number[]) : [],
        note: typeof b.note === "string" ? b.note : undefined,
        baseVersion:
          typeof b.version === "number" && Number.isInteger(b.version) ? b.version : undefined,
      },
      { dry: false, running: await ruangBerjalan(tx, k.edisiId), langs: langsOf(config) },
    );
  });
  if (r === null) return galat(k.res, "nilai_final");
  if (!r.ok) return galat(k.res, r.kode, r.errors ? { errors: r.errors } : {});
  const row = r.row!;
  k.res.status(200).json({
    ok: true,
    kind: r.kind,
    question: full(row, await refInfo(k.db, k.edisiId, row.refs)),
  });
}

/**
 * Whether any seat holds the question: an answer row, or a draw that names it.
 * A practice room draws and answers without setting `shownAt` (it never locks a
 * question), but those rows still point at it, and the answer's foreign key
 * would refuse the delete.
 */
async function dipakaiSeat(db: Db, edisiId: number, questionId: number): Promise<boolean> {
  const [jawab] = await db
    .select({ seatId: recAnswer.seatId })
    .from(recAnswer)
    .where(eq(recAnswer.questionId, questionId))
    .limit(1);
  if (jawab) return true;
  const seats = await db
    .select({ draw: recExamSeat.draw })
    .from(recExamSeat)
    .where(eq(recExamSeat.editionId, edisiId));
  return seats.some((x) =>
    Object.values(x.draw).some((d) => d?.items.some((it) => it.q === questionId)),
  );
}

async function hapusSoal(k: Konteks) {
  const id = intOf(jsonBody(k.req).id);
  if (!id) return galat(k.res, "data_salah");
  const [r] = await k.db
    .select()
    .from(recQuestion)
    .where(and(eq(recQuestion.id, id), eq(recQuestion.editionId, k.edisiId)))
    .limit(1);
  if (!r) return galat(k.res, "tidak_ada");
  if (r.shownAt || (await dipakaiSeat(k.db, k.edisiId, id))) return galat(k.res, "sudah_tampil");
  if (r.status === "ready" && (await ruangBerjalan(k.db, k.edisiId)))
    return galat(k.res, "ruang_berjalan");
  try {
    await k.db.delete(recQuestion).where(eq(recQuestion.id, id));
  } catch (e) {
    // A seat answered it between the check and the delete: rec_answer holds it.
    if (pgErrorCode(e) === "23503") return galat(k.res, "sudah_tampil");
    throw e;
  }
  await writeAudit(k.nim, "rec_soal_hapus", { id, title: r.title });
  k.res.status(200).json({ ok: true });
}

/* ------------------------------------------------------ import / export */

const MAX_IMPORT = 2_500_000;
const MAX_ITEMS = 400;

interface ItemHasil {
  index: number;
  line: number;
  title: string;
  action: "create" | "update" | "same" | "error";
  id?: number;
  errors: (ImportError & { detail?: string })[];
}

async function impor(k: Konteks) {
  const b = jsonBody(k.req);
  const text = typeof b.text === "string" ? b.text : null;
  if (text === null) return galat(k.res, "data_salah");
  if (text.length > MAX_IMPORT) return galat(k.res, "terlalu_besar");
  const dry = b.dry !== false;
  const note = typeof b.note === "string" ? b.note : undefined;
  const all = await muatSemua(k.db, k.edisiId);
  const byId = new Map(all.map((r) => [r.id, r]));
  const parsed = parseBank(text, {
    stored: (id) => (byId.has(id) ? asQuestion(byId.get(id)!) : undefined),
  });
  if (parsed.length > MAX_ITEMS) return galat(k.res, "terlalu_besar");
  const refs = await k.db.select().from(recReference).where(eq(recReference.editionId, k.edisiId));
  const refByUrl = new Map(refs.filter((r) => r.url).map((r) => [r.url!, r.id]));
  const config = await muatConfig(k.db, k.edisiId);
  const running = await ruangBerjalan(k.db, k.edisiId);
  const langs = langsOf(config);

  const run = async (db: Db) => {
    const out: ItemHasil[] = [];
    for (const it of parsed) {
      const base = { index: it.index, line: it.line, title: it.title };
      if (!it.draft) {
        out.push({ ...base, action: "error", errors: it.errors });
        continue;
      }
      const d = it.draft;
      const missing = d.refUrls.filter((u) => !refByUrl.has(u));
      if (missing.length) {
        out.push({
          ...base,
          action: "error",
          errors: missing.map((u) => ({
            line: it.line,
            kode: "rujukan_hilang",
            field: "refs",
            detail: u,
          })),
        });
        continue;
      }
      if (d.id !== undefined && !byId.has(d.id)) {
        out.push({
          ...base,
          action: "error",
          errors: [{ line: it.line, kode: "id_tak_dikenal", field: "id" }],
        });
        continue;
      }
      const r = await simpanSatu(
        db,
        k.edisiId,
        k.nim,
        {
          id: d.id,
          part: d.part,
          lang: d.lang,
          format: d.format,
          title: d.title,
          status: d.status,
          body: d.body,
          answer: d.answer,
          refs: d.refUrls.map((u) => refByUrl.get(u)!),
          sample: d.sample,
          note,
        },
        { dry, running, langs },
      );
      if (!r.ok) {
        const errs = Array.isArray(r.errors)
          ? (r.errors as { field: string; kode: string }[]).map((e) => ({
              line: it.line,
              kode: e.kode,
              field: e.field,
            }))
          : [{ line: it.line, kode: r.kode }];
        out.push({ ...base, action: "error", errors: errs });
      } else
        out.push({
          ...base,
          action: r.kind === "create" ? "create" : r.kind === "same" ? "same" : "update",
          id: r.id,
          errors: [],
        });
    }
    return out;
  };
  // A real import reads the freeze under the score lock, in the transaction it writes in.
  const items = dry
    ? await run(k.db)
    : await denganKunciNilai(k.db, k.edisiId, async (tx) =>
        (await nilaiBeku(tx, k.edisiId)) ? null : run(tx),
      );
  if (items === null) return galat(k.res, "nilai_final");
  if (!dry)
    await writeAudit(k.nim, "rec_bank_impor", {
      n: items.filter((i) => i.action !== "error" && i.action !== "same").length,
    });
  k.res.status(200).json({
    ok: true,
    dry,
    items,
    counts: {
      create: items.filter((i) => i.action === "create").length,
      update: items.filter((i) => i.action === "update").length,
      same: items.filter((i) => i.action === "same").length,
      error: items.filter((i) => i.action === "error").length,
    },
  });
}

async function ekspor(k: Konteks) {
  const part = textOf(k.req.query.part);
  if (part && !isPart(part)) return galat(k.res, "data_salah");
  const rows = (await muatSemua(k.db, k.edisiId)).filter(
    (r) => r.voidedAt === null && (!part || r.part === part),
  );
  const refs = await k.db.select().from(recReference).where(eq(recReference.editionId, k.edisiId));
  const url = new Map(refs.map((r) => [r.id, r.url]));
  const items: ExportItem[] = rows.map((r) => ({
    id: r.id,
    part: r.part,
    lang: r.lang,
    format: r.format,
    title: r.title,
    status: r.status,
    sample: r.sample,
    refUrls: r.refs.flatMap((id) => (url.get(id) ? [url.get(id)!] : [])),
    body: r.body,
    answer: r.answer,
  })) as ExportItem[];
  const teks = writeBank(items);
  k.res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  k.res.setHeader("Content-Disposition", `attachment; filename="bank-soal-${part || "semua"}.md"`);
  k.res.status(200);
  k.res.end(teks);
}

/** Installs the default bank; what is already there (same part, language and title, still a seed) is skipped. */
async function pasangBawaan(k: Konteks) {
  const config = await muatConfig(k.db, k.edisiId);
  const have = await muatSemua(k.db, k.edisiId);
  const key = (part: string, lang: string, title: string) => `${part}|${lang}|${title}`;
  const taken = new Set(have.map((r) => key(r.part, r.lang, r.title)));
  const items = parseBank(SEED_MD);
  const running = await ruangBerjalan(k.db, k.edisiId);
  let created = 0;
  let skipped = 0;
  const failed: string[] = [];
  await k.db.transaction(async (tx) => {
    for (const it of items) {
      const d = it.draft;
      if (!d) {
        failed.push(it.title || `#${it.index}`);
        continue;
      }
      if (taken.has(key(d.part, d.lang, d.title))) {
        skipped++;
        continue;
      }
      const r = await simpanSatu(
        tx as unknown as Db,
        k.edisiId,
        k.nim,
        { ...d, id: undefined, refs: [], sample: true },
        { dry: false, running, langs: langsOf(config) },
      );
      if (r.ok) created++;
      else failed.push(`${d.title}: ${r.kode}`);
    }
  });
  k.res.status(200).json({ ok: true, created, skipped, failed });
}

/* --------------------------------------------------------------- images */

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const GAMBAR_MAKS = 2 * 1024 * 1024;

async function tiketGambar(k: Konteks) {
  const b = jsonBody(k.req);
  const ext = typeof b.mime === "string" ? MIME_EXT[b.mime] : undefined;
  const size = b.size;
  const sha = typeof b.sha256 === "string" ? b.sha256.toLowerCase() : "";
  if (!ext || !(BANK_GAMBAR as readonly string[]).includes(ext))
    return galat(k.res, "format_salah");
  if (
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size < 8 ||
    !/^[0-9a-f]{64}$/.test(sha)
  )
    return galat(k.res, "data_salah");
  if (size > GAMBAR_MAKS) return galat(k.res, "terlalu_besar");
  if (!dep.simpanSiap()) return galat(k.res, "belum_diatur");
  const key = kunciBank(k.edisiId, sha, ext);
  const ada = await dep.kepala(key).catch(() => ({ ada: false }));
  if (ada.ada) return void k.res.status(200).json({ ok: true, key, sama: true });
  const put = await dep.tiketUnggah({ kunci: key, ukuran: size, sha256: sha, halaman: 1 });
  k.res.status(200).json({ ok: true, key, sama: false, url: put.url });
}

async function media(
  req: ApiRequest,
  res: ApiResponse,
  db: Db,
  edisiId: number,
  s: SessionPayload,
  p: PelakuServer | null,
) {
  const key = textOf(req.query.key);
  if (!bankKey(edisiId, key)) return galat(res, "data_salah");
  let ok = false;
  if (s.role === "asisten") ok = !!p?.hak.bank;
  else ok = await seatPunyaGambar(db, edisiId, s.nim, key);
  if (!ok) return galat(res, "tanpa_hak");
  if (!dep.simpanSiap()) return galat(res, "belum_diatur");
  const ext = key.slice(key.lastIndexOf(".") + 1);
  const mime =
    Object.entries(MIME_EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
  const url = await dep.urlBaca({ kunci: key, nama: `gambar.${ext}`, mime });
  res.setHeader("Location", url);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.status(302);
  res.end();
}

/** A seat may load a picture only while a question that uses it is in its draw. */
async function seatPunyaGambar(
  db: Db,
  edisiId: number,
  nim: string,
  key: string,
): Promise<boolean> {
  const [cand] = await db
    .select({ id: recCandidate.id })
    .from(recCandidate)
    .where(and(eq(recCandidate.editionId, edisiId), eq(recCandidate.nim, nim)))
    .limit(1);
  if (!cand) return false;
  const { seat } = await muatKursiSendiri(db, edisiId, cand.id);
  if (!seat) return false;
  const ids = Object.values(seat.draw).flatMap((d) => d?.items.map((i) => i.q) ?? []);
  if (!ids.length) return false;
  const rows = await db
    .select({ body: recQuestion.body })
    .from(recQuestion)
    .where(and(inArray(recQuestion.id, ids), eq(recQuestion.editionId, edisiId)));
  return rows.some((r) =>
    ((r.body as { images?: { key: string }[] }).images ?? []).some((i) => i.key === key),
  );
}

/* ----------------------------------------------------------- references */

const rujukanJson = (r: RecReferenceRow) => ({
  id: r.id,
  url: r.url,
  title: r.title,
  selector: r.selector,
  status: r.status,
  error: r.error,
  bytes: r.bytes,
  fetchedAt: r.fetchedAt?.toISOString() ?? null,
  by: r.by,
});

async function lampiran(db: Db, edisiId: number) {
  const part = await db
    .select()
    .from(recPartRef)
    .where(eq(recPartRef.editionId, edisiId))
    .orderBy(asc(recPartRef.part), asc(recPartRef.sort));
  const partRefs: Record<string, number[]> = {};
  for (const x of part) (partRefs[x.part] ??= []).push(x.referenceId);
  const qs = await db
    .select({ id: recQuestion.id, title: recQuestion.title, refs: recQuestion.refs })
    .from(recQuestion)
    .where(eq(recQuestion.editionId, edisiId));
  const questionRefs = qs
    .filter((q) => q.refs.length)
    .map((q) => ({ questionId: q.id, title: q.title, refs: q.refs }));
  return { partRefs, questionRefs };
}

async function daftarRujukan(k: Konteks) {
  const rows = await k.db
    .select()
    .from(recReference)
    .where(eq(recReference.editionId, k.edisiId))
    .orderBy(asc(recReference.id));
  k.res.status(200).json({
    ok: true,
    references: rows.map(rujukanJson),
    attachments: await lampiran(k.db, k.edisiId),
  });
}

const galatSnapshot = (res: ApiResponse, e: unknown) => {
  if (e instanceof SnapshotError) {
    const status =
      e.kode === "url_salah" ||
      e.kode === "alamat_terlarang" ||
      e.kode === "jenis_salah" ||
      e.kode === "kosong"
        ? 400
        : 502;
    return tolak(res, e.kode, status, e.message !== e.kode ? { detail: e.message } : {});
  }
  throw e;
};

/** Writes a snapshot to R2 (content addressed, so the same page again is the same key). */
async function simpanRujukan(edisiId: number, snap: Snapshot): Promise<string> {
  if (!dep.simpanSiap()) throw new SnapshotError("belum_diatur");
  const key = kunciRef(edisiId, snap.sha256);
  await dep.simpan(key, snap.bytes, "text/html");
  return key;
}

async function tambahRujukan(k: Konteks) {
  const b = jsonBody(k.req);
  const url = typeof b.url === "string" ? b.url.trim() : "";
  const selector =
    typeof b.selector === "string" && b.selector.trim() ? b.selector.trim().slice(0, 200) : null;
  if (!url) return galat(k.res, "data_salah");
  const dup = await k.db
    .select({ id: recReference.id })
    .from(recReference)
    .where(and(eq(recReference.editionId, k.edisiId), eq(recReference.url, url)))
    .limit(1);
  if (dup.length) return galat(k.res, "sudah_ada", { id: dup[0].id });
  let snap: Snapshot;
  let key: string;
  try {
    snap = await dep.snapshotUrl(url, { selector: selector ?? undefined });
    key = await simpanRujukan(k.edisiId, snap);
  } catch (e) {
    return galatSnapshot(k.res, e);
  }
  const title = (typeof b.title === "string" && b.title.trim()) || snap.title;
  const [row] = await k.db
    .insert(recReference)
    .values({
      editionId: k.edisiId,
      url,
      title: title.slice(0, 200),
      selector,
      r2Key: key,
      sha256: snap.sha256,
      bytes: snap.bytes.length,
      status: "ok",
      fetchedAt: new Date(),
      by: k.nim,
    })
    .returning();
  await writeAudit(k.nim, "rec_rujukan_tambah", { id: row.id, url });
  k.res.status(200).json({ ok: true, reference: rujukanJson(row), skipped: snap.skipped });
}

async function muatRujukan(k: Konteks, id: number | null): Promise<RecReferenceRow | null> {
  if (!id) return null;
  const [r] = await k.db
    .select()
    .from(recReference)
    .where(and(eq(recReference.id, id), eq(recReference.editionId, k.edisiId)))
    .limit(1);
  return r ?? null;
}

async function ambilUlang(k: Konteks) {
  const r = await muatRujukan(k, intOf(jsonBody(k.req).id));
  if (!r) return galat(k.res, "tidak_ada");
  if (!r.url) return galat(k.res, "data_salah");
  try {
    const snap = await dep.snapshotUrl(r.url, { selector: r.selector ?? undefined });
    const key = await simpanRujukan(k.edisiId, snap);
    const [row] = await k.db
      .update(recReference)
      .set({
        r2Key: key,
        sha256: snap.sha256,
        bytes: snap.bytes.length,
        status: "ok",
        error: null,
        fetchedAt: new Date(),
        by: k.nim,
      })
      .where(eq(recReference.id, r.id))
      .returning();
    k.res.status(200).json({ ok: true, reference: rujukanJson(row), skipped: snap.skipped });
  } catch (e) {
    // The page a seat reads stays as it was; only the note says the refresh failed.
    const pesan = e instanceof Error ? e.message : String(e);
    await k.db
      .update(recReference)
      .set({ error: pesan.slice(0, 300) })
      .where(eq(recReference.id, r.id));
    return galatSnapshot(k.res, e);
  }
}

async function unggahRujukan(k: Konteks) {
  const b = jsonBody(k.req);
  const html = typeof b.html === "string" ? b.html : null;
  if (html === null || html.trim() === "") return galat(k.res, "data_salah");
  const id = b.id === undefined ? null : intOf(b.id);
  const url = typeof b.url === "string" && b.url.trim() ? b.url.trim() : undefined;
  const judul = typeof b.title === "string" ? b.title.trim() : "";
  const lama = id ? await muatRujukan(k, id) : null;
  if (id && !lama) return galat(k.res, "tidak_ada");
  let snap: Snapshot;
  let key: string;
  try {
    snap = dep.snapshotUpload(html, {
      url,
      title: judul || undefined,
      selector: lama?.selector ?? undefined,
    });
    key = await simpanRujukan(k.edisiId, snap);
  } catch (e) {
    return galatSnapshot(k.res, e);
  }
  if (lama) {
    const [row] = await k.db
      .update(recReference)
      .set({
        r2Key: key,
        sha256: snap.sha256,
        bytes: snap.bytes.length,
        status: "ok",
        error: null,
        fetchedAt: new Date(),
        by: k.nim,
        ...(judul ? { title: judul.slice(0, 200) } : {}),
      })
      .where(eq(recReference.id, lama.id))
      .returning();
    return void k.res.status(200).json({ ok: true, reference: rujukanJson(row) });
  }
  const [row] = await k.db
    .insert(recReference)
    .values({
      editionId: k.edisiId,
      url: url ?? null,
      title: (judul || snap.title).slice(0, 200),
      selector: null,
      r2Key: key,
      sha256: snap.sha256,
      bytes: snap.bytes.length,
      status: "ok",
      fetchedAt: new Date(),
      by: k.nim,
    })
    .returning();
  await writeAudit(k.nim, "rec_rujukan_unggah", { id: row.id });
  k.res.status(200).json({ ok: true, reference: rujukanJson(row) });
}

async function hapusRujukan(k: Konteks) {
  const r = await muatRujukan(k, intOf(jsonBody(k.req).id));
  if (!r) return galat(k.res, "tidak_ada");
  if (await ruangBerjalan(k.db, k.edisiId)) return galat(k.res, "ruang_berjalan");
  await k.db.transaction(async (tx) => {
    await tx
      .update(recQuestion)
      .set({ refs: sql`array_remove(${recQuestion.refs}, ${r.id})` })
      .where(and(eq(recQuestion.editionId, k.edisiId), sql`${r.id} = any(${recQuestion.refs})`));
    await tx.delete(recReference).where(eq(recReference.id, r.id));
  });
  await writeAudit(k.nim, "rec_rujukan_hapus", { id: r.id, url: r.url });
  k.res.status(200).json({ ok: true, attachments: await lampiran(k.db, k.edisiId) });
}

async function kaitkan(k: Konteks) {
  const b = jsonBody(k.req);
  const r = await muatRujukan(k, intOf(b.id));
  if (!r) return galat(k.res, "tidak_ada");
  const on = b.on !== false;
  const part = b.part;
  const qid = b.questionId === undefined ? null : intOf(b.questionId);
  if ((part === undefined) === (qid === null)) return galat(k.res, "data_salah");
  if (part !== undefined) {
    if (!isPart(part)) return galat(k.res, "data_salah");
    if (on) {
      const [mx] = await k.db
        .select({ n: sql<number>`coalesce(max(${recPartRef.sort}), -1)::int` })
        .from(recPartRef)
        .where(and(eq(recPartRef.editionId, k.edisiId), eq(recPartRef.part, part)));
      await k.db
        .insert(recPartRef)
        .values({ editionId: k.edisiId, part, referenceId: r.id, sort: (mx?.n ?? -1) + 1 })
        .onConflictDoNothing();
    } else {
      await k.db
        .delete(recPartRef)
        .where(
          and(
            eq(recPartRef.editionId, k.edisiId),
            eq(recPartRef.part, part),
            eq(recPartRef.referenceId, r.id),
          ),
        );
    }
  } else {
    const [q] = await k.db
      .select({ id: recQuestion.id })
      .from(recQuestion)
      .where(and(eq(recQuestion.id, qid!), eq(recQuestion.editionId, k.edisiId)))
      .limit(1);
    if (!q) return galat(k.res, "tidak_ada");
    await k.db
      .update(recQuestion)
      .set(
        on
          ? {
              refs: sql`case when ${r.id} = any(${recQuestion.refs}) then ${recQuestion.refs} else array_append(${recQuestion.refs}, ${r.id}) end`,
            }
          : { refs: sql`array_remove(${recQuestion.refs}, ${r.id})` },
      )
      .where(eq(recQuestion.id, q.id));
  }
  k.res.status(200).json({ ok: true, attachments: await lampiran(k.db, k.edisiId) });
}

/* ------------------------------------------------------------------ ref */

/** The headers of EXAM-ENGINE 8.2: the page can load nothing, run nothing and be framed only by IRIS. */
export const REF_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Cache-Control": "private, max-age=600",
};

/** A seat may read a reference only while its part runs for it and the part or a question it was dealt has it (8.2). */
export async function seatBolehBaca(
  db: Db,
  edisiId: number,
  nim: string,
  refId: number,
  now = Date.now(),
): Promise<boolean> {
  const [cand] = await db
    .select({ id: recCandidate.id })
    .from(recCandidate)
    .where(and(eq(recCandidate.editionId, edisiId), eq(recCandidate.nim, nim)))
    .limit(1);
  if (!cand) return false;
  const { seat, room } = await muatKursiSendiri(db, edisiId, cand.id);
  if (!seat || !room) return false;
  const state = normalize(room.state, now);
  const key = state.cur;
  if (state.stage !== "parts" || !key || key === "livecode") return false;
  const run = state.runs[key];
  if (!run || run.state === "ended" || seat.done[key] != null) return false;
  const draw = seat.draw[key];
  if (!draw || draw.room !== seat.roomId || seatLeft(run, seat.id, now) <= 0) return false;
  const [onPart] = await db
    .select({ r: recPartRef.referenceId })
    .from(recPartRef)
    .where(
      and(
        eq(recPartRef.editionId, edisiId),
        eq(recPartRef.part, key),
        eq(recPartRef.referenceId, refId),
      ),
    )
    .limit(1);
  if (onPart) return true;
  const ids = draw.items.map((i) => i.q);
  if (!ids.length) return false;
  const rows = await db
    .select({ refs: recQuestion.refs })
    .from(recQuestion)
    .where(and(inArray(recQuestion.id, ids), eq(recQuestion.editionId, edisiId)));
  return rows.some((x) => x.refs.includes(refId));
}

async function ref(
  req: ApiRequest,
  res: ApiResponse,
  db: Db,
  edisiId: number,
  s: SessionPayload,
  p: PelakuServer | null,
) {
  const id = intOf(req.query.id);
  if (!id) return galat(res, "data_salah");
  const [r] = await db
    .select()
    .from(recReference)
    .where(and(eq(recReference.id, id), eq(recReference.editionId, edisiId)))
    .limit(1);
  // The same answer for "not there" and "not yours", so ids cannot be probed.
  const bisa =
    !!r &&
    (s.role === "asisten"
      ? !!p?.hak.bank
      : r.status === "ok" && (await seatBolehBaca(db, edisiId, s.nim, id)));
  // The reader frame gets a short page in the seat's language, never the JSON (prompt 14).
  const bingkai = req.headers?.["sec-fetch-dest"] === "iframe";
  const tolakRef = (kode: string) => {
    if (!bingkai) return galat(res, kode);
    for (const [h, v] of Object.entries(REF_HEADERS)) res.setHeader(h, v);
    res.setHeader("Cache-Control", "no-store");
    res.status(STATUS[kode] ?? 404);
    res.end(refGagalHtml(refLang(req.query.lang)));
  };
  if (!r || !bisa || !r.r2Key || !REK_REF_RE.test(r.r2Key)) return tolakRef("tidak_ada");
  if (!dep.simpanSiap()) return tolakRef("belum_diatur");
  let up: Response;
  try {
    up = await dep.ambil(r.r2Key);
  } catch {
    return tolakRef("tidak_ada");
  }
  // A document is at most 6 MB, so it is read whole and its length is exact.
  const bytes = Buffer.from(await up.arrayBuffer());
  for (const [h, v] of Object.entries(REF_HEADERS)) res.setHeader(h, v);
  res.setHeader("Content-Length", String(bytes.length));
  res.status(200);
  res.end(bytes);
}

export { PHASE1_PARTS };
