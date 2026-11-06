/**
 * The Akademik's side of Live Coding in C (B7.5): the problem bank. Called from
 * recruitment-bank.ts after it has checked the "bank" right, so every function
 * here already knows who is asking. Hidden tests and the reference solution are
 * read and written here and nowhere else: a seat never gets this module.
 *
 *   GET  problems          the list, one summary per problem
 *   GET  problem?id        one problem in full, with the last reference check
 *   POST problem-save      create or change one (optimistic `version`)
 *   POST problem-check     queue the reference solution against the hidden tests
 *   POST problem-delete    only while no seat was ever dealt it
 *
 * A problem is dealt only when it is `ready` AND its reference solution passed
 * every hidden test on the judge (checkOk), so a wrong key cannot reach a seat.
 * After the first real deal its tests, samples, limits and reference are locked,
 * like a question's structure: its text can still be fixed.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { writeAudit } from "../../src/lib/auth.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { recCProblem, recCSubmission, type RecCProblemRow } from "../../src/lib/schema.js";
import {
  parseProblemDraft,
  validateProblem,
  type CProblemDraft,
  type TestVerdict,
} from "../../src/lib/recruitment/c-problem.js";
import {
  parseProblems,
  writeProblems,
  type ProblemFileError,
  type ProblemFileItem,
} from "../../src/lib/recruitment/problem-io.js";
import { tolak, type Db } from "./recruitment-data.js";
import { kirimKode } from "./recruitment-lc-judge.js";

export interface KonteksMasalah {
  req: ApiRequest;
  res: ApiResponse;
  db: Db;
  edisiId: number;
  nim: string;
}

const STATUS: Record<string, number> = {
  tidak_ada: 404,
  format_salah: 400,
  data_salah: 400,
  versi_lama: 409,
  struktur_terkunci: 409,
  sudah_tampil: 409,
  belum_dicek: 409,
  kode_kosong: 400,
  kode_terlalu_besar: 413,
  terlalu_besar: 413,
};
const galat = (res: ApiResponse, kode: string, extra: Record<string, unknown> = {}) =>
  tolak(res, kode, STATUS[kode] ?? 400, extra);

const intOf = (v: unknown): number | null => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const summary = (r: RecCProblemRow) => ({
  id: r.id,
  title: r.title,
  tier: r.tier,
  status: r.status,
  sample: r.sample,
  version: r.version,
  tests: r.tests.length,
  checkedAt: r.checkedAt?.toISOString() ?? null,
  checkOk: r.checkOk,
  shown: r.shownAt !== null,
});

const draftOf = (r: RecCProblemRow): CProblemDraft => ({
  title: r.title,
  tier: r.tier,
  body: r.body,
  limits: r.limits,
  samples: r.samples,
  tests: r.tests,
  reference: r.reference,
});

/** What counts as the problem's judged content: changing any of it means the key must be checked again. */
const judged = (d: CProblemDraft) =>
  JSON.stringify([
    d.tier,
    // Named one by one: Postgres jsonb hands object keys back shortest first ({ memKb, timeMs }),
    // the parsed draft has { timeMs, memKb }, and a plain stringify of the two never matches.
    // That made every save look "changed", wiped the check and refused Siap (6 Nov 2026).
    [d.limits.timeMs, d.limits.memKb],
    d.samples.map((s) => [s.input, s.output]),
    d.tests.map((t) => [t.input, t.output]),
    d.reference,
  ]);

export async function daftarMasalah(k: KonteksMasalah) {
  const rows = await k.db
    .select()
    .from(recCProblem)
    .where(eq(recCProblem.editionId, k.edisiId))
    .orderBy(
      sql`case ${recCProblem.tier} when 'easy' then 0 when 'medium' then 1 else 2 end`,
      recCProblem.id,
    );
  k.res.status(200).json({ ok: true, problems: rows.map(summary) });
}

/** The newest reference check of a problem, as the editor shows it. */
async function cekTerakhir(db: Db, problemId: number) {
  const [c] = await db
    .select()
    .from(recCSubmission)
    .where(and(eq(recCSubmission.problemId, problemId), eq(recCSubmission.kind, "check")))
    .orderBy(desc(recCSubmission.id))
    .limit(1);
  if (!c) return null;
  const o = c.outcome as { compile: { ok: boolean; log: string }; verdicts: TestVerdict[] } | null;
  return {
    id: c.id,
    status: c.status,
    passed: c.passed,
    total: c.total,
    verdicts: o?.verdicts.map((v) => v.v) ?? [],
    compileLog: o && !o.compile.ok ? o.compile.log : null,
    kode: c.kode,
  };
}

export async function bacaMasalah(k: KonteksMasalah) {
  const id = intOf(k.req.query.id);
  if (!id) return galat(k.res, "data_salah");
  const [r] = await k.db
    .select()
    .from(recCProblem)
    .where(and(eq(recCProblem.id, id), eq(recCProblem.editionId, k.edisiId)))
    .limit(1);
  if (!r) return galat(k.res, "tidak_ada");
  k.res.status(200).json({
    ok: true,
    problem: { ...summary(r), draft: draftOf(r) },
    check: await cekTerakhir(k.db, r.id),
  });
}

export async function simpanMasalah(k: KonteksMasalah) {
  const b = jsonBody(k.req);
  const draft = parseProblemDraft(b.draft);
  if (!draft) return galat(k.res, "format_salah");
  const errors = validateProblem(draft);
  if (errors.length) return galat(k.res, "format_salah", { errors });
  const wantReady = b.status === "ready";
  const id = b.id === undefined || b.id === null ? null : intOf(b.id);
  if (b.id !== undefined && b.id !== null && !id) return galat(k.res, "data_salah");

  if (!id) {
    const [row] = await k.db
      .insert(recCProblem)
      .values({
        editionId: k.edisiId,
        title: draft.title.trim(),
        tier: draft.tier,
        body: draft.body,
        limits: draft.limits,
        samples: draft.samples,
        tests: draft.tests,
        reference: draft.reference,
        status: "draft",
        createdBy: k.nim,
        updatedBy: k.nim,
      })
      .returning();
    await writeAudit(k.nim, "rec_masalah_baru", { id: row.id, title: row.title });
    return void k.res
      .status(200)
      .json({ ok: true, problem: { ...summary(row), draft: draftOf(row) } });
  }

  const [r] = await k.db
    .select()
    .from(recCProblem)
    .where(and(eq(recCProblem.id, id), eq(recCProblem.editionId, k.edisiId)))
    .limit(1);
  if (!r) return galat(k.res, "tidak_ada");
  if (Number(b.version) !== r.version) return galat(k.res, "versi_lama");
  const changedJudged = judged(draft) !== judged(draftOf(r));
  if (r.shownAt && changedJudged) return galat(k.res, "struktur_terkunci");
  // A changed test, limit or reference must be checked again before the problem can be dealt.
  const checkOk = changedJudged ? null : r.checkOk;
  if (wantReady && checkOk !== true) return galat(k.res, "belum_dicek");
  const [row] = await k.db
    .update(recCProblem)
    .set({
      title: draft.title.trim(),
      tier: draft.tier,
      body: draft.body,
      limits: draft.limits,
      samples: draft.samples,
      tests: draft.tests,
      reference: draft.reference,
      status: wantReady ? "ready" : "draft",
      checkOk,
      checkedAt: changedJudged ? null : r.checkedAt,
      version: r.version + 1,
      updatedBy: k.nim,
      updatedAt: new Date(),
    })
    .where(and(eq(recCProblem.id, id), eq(recCProblem.version, r.version)))
    .returning();
  if (!row) return galat(k.res, "versi_lama");
  await writeAudit(k.nim, "rec_masalah_ubah", { id, version: row.version });
  k.res.status(200).json({ ok: true, problem: { ...summary(row), draft: draftOf(row) } });
}

export async function cekMasalah(k: KonteksMasalah) {
  const id = intOf(jsonBody(k.req).id);
  if (!id) return galat(k.res, "data_salah");
  const [r] = await k.db
    .select({ id: recCProblem.id, reference: recCProblem.reference })
    .from(recCProblem)
    .where(and(eq(recCProblem.id, id), eq(recCProblem.editionId, k.edisiId)))
    .limit(1);
  if (!r) return galat(k.res, "tidak_ada");
  const sent = await kirimKode(k.db, {
    kind: "check",
    seatId: null,
    roomId: null,
    problemId: r.id,
    code: r.reference,
    runLimit: 0,
  });
  if (!sent.ok) return galat(k.res, sent.kode);
  k.res.status(200).json({ ok: true, check: sent.id });
}

export async function hapusMasalah(k: KonteksMasalah) {
  const id = intOf(jsonBody(k.req).id);
  if (!id) return galat(k.res, "data_salah");
  const [r] = await k.db
    .select()
    .from(recCProblem)
    .where(and(eq(recCProblem.id, id), eq(recCProblem.editionId, k.edisiId)))
    .limit(1);
  if (!r) return galat(k.res, "tidak_ada");
  if (r.shownAt) return galat(k.res, "sudah_tampil");
  await k.db.delete(recCProblem).where(eq(recCProblem.id, id));
  await writeAudit(k.nim, "rec_masalah_hapus", { id, title: r.title });
  k.res.status(200).json({ ok: true });
}

/* ------------------------------------------------------- Impor and Ekspor */

const MAX_IMPORT = 2_500_000;
const MAX_ITEMS = 200;

/** Object keys in sorted order, so two copies of the same value compare equal whoever stored them. */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : x,
  );

export interface ImportItemMasalah {
  index: number;
  line: number;
  title: string;
  action: "create" | "update" | "same" | "error";
  id?: number;
  errors: ProblemFileError[];
}

/**
 * POST problem-import { text, dry }: the file's problems, one verdict each. A problem with an `id` updates that
 * stored problem (refused when a seat was dealt it and its tests, limits or reference differ); one without is
 * created. Whatever the file says, a created or changed problem lands as a draft unless its check still holds:
 * Siap needs a reference check, and a changed test, limit or reference clears the old one.
 */
export async function imporMasalah(k: KonteksMasalah) {
  const b = jsonBody(k.req);
  const text = typeof b.text === "string" ? b.text : null;
  if (text === null) return galat(k.res, "data_salah");
  if (text.length > MAX_IMPORT) return galat(k.res, "terlalu_besar");
  const dry = b.dry !== false;
  const parsed = parseProblems(text);
  if (parsed.length > MAX_ITEMS) return galat(k.res, "terlalu_besar");
  const stored = await k.db.select().from(recCProblem).where(eq(recCProblem.editionId, k.edisiId));
  const byId = new Map(stored.map((r) => [r.id, r]));
  const items: ImportItemMasalah[] = [];
  for (const it of parsed) {
    const base = { index: it.index, line: it.line, title: it.title };
    if (!it.draft) {
      items.push({ ...base, action: "error", errors: it.errors });
      continue;
    }
    const d = it.draft;
    const bad = validateProblem(d);
    if (bad.length) {
      items.push({
        ...base,
        action: "error",
        errors: bad.map((e) => ({ line: it.line, kode: e.kode, field: e.field })),
      });
      continue;
    }
    const old = it.id !== undefined ? byId.get(it.id) : undefined;
    if (it.id !== undefined && !old) {
      items.push({
        ...base,
        action: "error",
        errors: [{ line: it.line, kode: "id_tak_dikenal", field: "id" }],
      });
      continue;
    }
    if (!old) {
      if (!dry) {
        const [row] = await k.db
          .insert(recCProblem)
          .values({
            editionId: k.edisiId,
            title: d.title.trim(),
            tier: d.tier,
            body: d.body,
            limits: d.limits,
            samples: d.samples,
            tests: d.tests,
            reference: d.reference,
            status: "draft",
            createdBy: k.nim,
            updatedBy: k.nim,
          })
          .returning();
        if (row) byId.set(row.id, row);
        items.push({ ...base, action: "create", id: row?.id, errors: [] });
      } else items.push({ ...base, action: "create", errors: [] });
      continue;
    }
    const changedJudged = judged(d) !== judged(draftOf(old));
    if (old.shownAt && changedJudged) {
      items.push({
        ...base,
        action: "error",
        errors: [{ line: it.line, kode: "struktur_terkunci" }],
      });
      continue;
    }
    const checkOk = changedJudged ? null : old.checkOk;
    const status = it.status === "ready" && checkOk === true ? "ready" : "draft";
    const same =
      !changedJudged &&
      status === old.status &&
      d.title.trim() === old.title &&
      canon(d.body) === canon(old.body);
    if (same) {
      items.push({ ...base, action: "same", id: old.id, errors: [] });
      continue;
    }
    if (!dry) {
      const [row] = await k.db
        .update(recCProblem)
        .set({
          title: d.title.trim(),
          tier: d.tier,
          body: d.body,
          limits: d.limits,
          samples: d.samples,
          tests: d.tests,
          reference: d.reference,
          status,
          checkOk,
          checkedAt: changedJudged ? null : old.checkedAt,
          version: old.version + 1,
          updatedBy: k.nim,
          updatedAt: new Date(),
        })
        .where(and(eq(recCProblem.id, old.id), eq(recCProblem.version, old.version)))
        .returning();
      if (!row) {
        items.push({
          ...base,
          action: "error",
          errors: [{ line: it.line, kode: "versi_lama" }],
        });
        continue;
      }
      byId.set(row.id, row);
    }
    items.push({ ...base, action: "update", id: old.id, errors: [] });
  }
  if (!dry)
    await writeAudit(k.nim, "rec_masalah_impor", {
      n: items.filter((i) => i.action === "create" || i.action === "update").length,
    });
  const count = (a: ImportItemMasalah["action"]) => items.filter((i) => i.action === a).length;
  k.res.status(200).json({
    ok: true,
    dry,
    items,
    counts: {
      create: count("create"),
      update: count("update"),
      same: count("same"),
      error: count("error"),
    },
  });
}

/** GET problem-export: every problem of the edition as one .md file (with the reference solutions). */
export async function eksporMasalah(k: KonteksMasalah) {
  const rows = await k.db
    .select()
    .from(recCProblem)
    .where(eq(recCProblem.editionId, k.edisiId))
    .orderBy(
      sql`case ${recCProblem.tier} when 'easy' then 0 when 'medium' then 1 else 2 end`,
      recCProblem.id,
    );
  const items: ProblemFileItem[] = rows.map((r) => ({
    ...draftOf(r),
    id: r.id,
    status: r.status,
  }));
  k.res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  k.res.setHeader("Content-Disposition", 'attachment; filename="bank-live-coding.md"');
  k.res.status(200);
  k.res.end(writeProblems(items));
}
