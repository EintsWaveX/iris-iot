/**
 * Live Coding's pool in the bank (EXAM-ENGINE 9.2, 9.3, 9.8): the topics, the
 * starting sketch of each protocol and the grader rubric. The defaults of
 * lc-defaults.ts are written into an edition the first time anything reads
 * the pool, marked `sample` (a "Bawaan" badge and nothing more), and from then
 * on they are the edition's own rows. The `bank` right edits all of it.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { SessionPayload } from "../../src/lib/auth.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, noStore } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import {
  recLcTemplate,
  recLcTopic,
  recLivecode,
  recRubric,
  recRubricScore,
  type RecLcTopicRow,
} from "../../src/lib/schema.js";
import {
  PROTOCOLS,
  type Protocol,
  type Rubric,
  type RubricRow,
} from "../../src/lib/recruitment/exam-types.js";
import {
  DEFAULT_RUBRIC_ROWS,
  DEFAULT_TEMPLATES,
  DEFAULT_TOPICS,
} from "../../src/lib/recruitment/lc-defaults.js";
import { checkSketch } from "../../src/lib/recruitment/lc-sketch.js";
import { sameRubricRows } from "../../src/lib/recruitment/lc-grade.js";
import {
  TEMPLATE_KEYS,
  TOPIC_STATUS,
  type LcTopic,
  type TemplateKey,
} from "../../src/lib/recruitment/lc-types.js";
import type { TemplatesView, TopicsView } from "../../src/lib/recruitment/lc-api.js";
import { tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { muatPelaku, wajibHak } from "./recruitment-rights.js";

/* ---------------------------------------------------------------- seeding */

/** Writes the defaults an edition does not have yet. A pool with no topic gets the six again. */
export async function semaiKolam(db: Db, edisiId: number): Promise<void> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recLcTopic)
    .where(eq(recLcTopic.editionId, edisiId));
  if (n === 0)
    await db.insert(recLcTopic).values(
      DEFAULT_TOPICS.map((t) => ({
        editionId: edisiId,
        title: t.title,
        brief: t.brief,
        fits: t.fits,
        parts: t.parts,
        libs: t.libs,
        hints: t.hints,
        icon: t.icon,
        status: "ready" as const,
        sample: true,
      })),
    );
  await db
    .insert(recLcTemplate)
    .values(
      TEMPLATE_KEYS.map((key) => ({
        editionId: edisiId,
        key,
        code: DEFAULT_TEMPLATES[key],
        sample: true,
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(recRubric)
    .values({ editionId: edisiId, stage: "tes_tulis", kind: "livecode", rows: DEFAULT_RUBRIC_ROWS })
    .onConflictDoNothing();
}

export const topikDariRow = (r: RecLcTopicRow): LcTopic => ({
  id: r.id,
  title: r.title,
  brief: r.brief,
  fits: r.fits as Protocol[],
  parts: r.parts,
  libs: r.libs,
  hints: r.hints,
  icon: r.icon,
  status: r.status,
  sample: r.sample,
});

/** The ready topics, seeding first. */
export async function topikSiapRows(db: Db, edisiId: number): Promise<RecLcTopicRow[]> {
  await semaiKolam(db, edisiId);
  return db
    .select()
    .from(recLcTopic)
    .where(and(eq(recLcTopic.editionId, edisiId), eq(recLcTopic.status, "ready")))
    .orderBy(asc(recLcTopic.id));
}

/** The edition's Live Coding rubric, seeding first. */
export async function muatRubrik(db: Db, edisiId: number): Promise<Rubric> {
  await semaiKolam(db, edisiId);
  const [r] = await db
    .select()
    .from(recRubric)
    .where(
      and(
        eq(recRubric.editionId, edisiId),
        eq(recRubric.stage, "tes_tulis"),
        eq(recRubric.kind, "livecode"),
      ),
    )
    .limit(1);
  return { id: r.id, stage: "tes_tulis", kind: "livecode", rows: r.rows };
}

/** The template for a key, seeding first. */
export async function muatTemplate(db: Db, edisiId: number, key: TemplateKey): Promise<string> {
  await semaiKolam(db, edisiId);
  const [r] = await db
    .select({ code: recLcTemplate.code })
    .from(recLcTemplate)
    .where(and(eq(recLcTemplate.editionId, edisiId), eq(recLcTemplate.key, key)))
    .limit(1);
  return r?.code ?? DEFAULT_TEMPLATES[key];
}

/* ------------------------------------------------------------- validation */

const str = (v: unknown, max: number, min = 0): string | null =>
  typeof v === "string" && v.trim().length >= min && v.length <= max ? v : null;
const list = (v: unknown, each: number, n: number): string[] | null =>
  Array.isArray(v) &&
  v.length <= n &&
  v.every((x) => typeof x === "string" && x.trim().length > 0 && x.length <= each)
    ? v.map((x: string) => x.trim())
    : null;

export interface TopikMasuk {
  title: string;
  brief: string;
  fits: Protocol[];
  parts: string[];
  libs: string[];
  hints: string;
  icon: string;
  status: (typeof TOPIC_STATUS)[number];
}

export function periksaTopik(
  b: Record<string, unknown>,
): { ok: true; value: TopikMasuk } | { ok: false; field: string } {
  const title = str(b.title, 80, 3);
  if (title === null) return { ok: false, field: "title" };
  const brief = str(b.brief, 4000, 10);
  if (brief === null) return { ok: false, field: "brief" };
  const fits =
    Array.isArray(b.fits) &&
    b.fits.length > 0 &&
    b.fits.every((x) => PROTOCOLS.includes(x as Protocol))
      ? [...new Set(b.fits as Protocol[])]
      : null;
  if (!fits) return { ok: false, field: "fits" };
  const parts = list(b.parts ?? [], 40, 12);
  if (!parts) return { ok: false, field: "parts" };
  const libs = list(b.libs ?? [], 60, 8);
  if (!libs) return { ok: false, field: "libs" };
  const hints = str(b.hints ?? "", 2000);
  if (hints === null) return { ok: false, field: "hints" };
  const icon = typeof b.icon === "string" && /^[a-z][a-z0-9-]{0,23}$/.test(b.icon) ? b.icon : null;
  if (!icon) return { ok: false, field: "icon" };
  const status = TOPIC_STATUS.find((x) => x === b.status);
  if (!status) return { ok: false, field: "status" };
  return {
    ok: true,
    value: { title: title.trim(), brief, fits, parts, libs, hints, icon, status },
  };
}

export function periksaBaris(
  v: unknown,
): { ok: true; rows: RubricRow[] } | { ok: false; field: string } {
  if (!Array.isArray(v) || v.length < 1 || v.length > 12) return { ok: false, field: "rows" };
  const seen = new Set<string>();
  const rows: RubricRow[] = [];
  for (const [i, x] of (v as Record<string, unknown>[]).entries()) {
    const key = typeof x?.key === "string" && /^[a-z]{2,12}$/.test(x.key) ? x.key : null;
    const label = str(x?.label, 80, 2);
    const max = Number(x?.max);
    const weight = Number(x?.weight);
    if (!key || seen.has(key)) return { ok: false, field: `rows.${i}.key` };
    if (label === null) return { ok: false, field: `rows.${i}.label` };
    if (!Number.isInteger(max) || max < 1 || max > 10) return { ok: false, field: `rows.${i}.max` };
    if (!Number.isInteger(weight) || weight < 1 || weight > 10)
      return { ok: false, field: `rows.${i}.weight` };
    seen.add(key);
    rows.push({ key, label: label.trim(), max, weight });
  }
  return { ok: true, rows };
}

/* --------------------------------------------------------------- handlers */

export async function aksiKolam(
  req: ApiRequest,
  res: ApiResponse,
  s: SessionPayload,
  aksi: string,
) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "bank")) return;
  noStore(res);
  await semaiKolam(db, edisi.id);

  if (aksi === "lc-topics") {
    const rows = await db
      .select()
      .from(recLcTopic)
      .where(eq(recLcTopic.editionId, edisi.id))
      .orderBy(asc(recLcTopic.id));
    const view: TopicsView & { ok: true } = { ok: true, topics: rows.map(topikDariRow) };
    return void res.status(200).json(view);
  }

  if (aksi === "lc-templates") {
    const rows = await db.select().from(recLcTemplate).where(eq(recLcTemplate.editionId, edisi.id));
    const rubrik = await muatRubrik(db, edisi.id);
    const view: TemplatesView & { ok: true } = {
      ok: true,
      templates: TEMPLATE_KEYS.map((key) => {
        const r = rows.find((x) => x.key === key);
        return {
          key,
          code: r?.code ?? DEFAULT_TEMPLATES[key],
          sample: r?.sample ?? true,
          updatedAt: r?.updatedAt.getTime() ?? 0,
        };
      }),
      rubric: { rows: rubrik.rows },
    };
    return void res.status(200).json(view);
  }

  const b = jsonBody(req);

  if (aksi === "lc-topic-save") {
    const c = periksaTopik(b);
    if (!c.ok) return void tolak(res, "data_salah", 400, { field: c.field });
    const id = b.id === undefined ? null : Number(b.id);
    if (id !== null && !Number.isInteger(id))
      return void tolak(res, "data_salah", 400, { field: "id" });
    const nilai = { ...c.value, updatedBy: s.nim, updatedAt: new Date() };
    if (id === null) {
      const [r] = await db
        .insert(recLcTopic)
        .values({ ...nilai, editionId: edisi.id })
        .returning();
      res.status(200).json({ ok: true, topic: topikDariRow(r) });
    } else {
      const [r] = await db
        .update(recLcTopic)
        .set(nilai)
        .where(and(eq(recLcTopic.id, id), eq(recLcTopic.editionId, edisi.id)))
        .returning();
      if (!r) return void tolak(res, "tidak_ditemukan", 404);
      res.status(200).json({ ok: true, topic: topikDariRow(r) });
    }
    return;
  }

  if (aksi === "lc-topic-delete") {
    const id = Number(b.id);
    if (!Number.isInteger(id)) return void tolak(res, "data_salah", 400, { field: "id" });
    const [dipakai] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(recLivecode)
      .where(eq(recLivecode.topicId, id));
    if (dipakai.n > 0) return void tolak(res, "dipakai", 409);
    const gone = await db
      .delete(recLcTopic)
      .where(and(eq(recLcTopic.id, id), eq(recLcTopic.editionId, edisi.id)))
      .returning({ id: recLcTopic.id });
    if (!gone.length) return void tolak(res, "tidak_ditemukan", 404);
    res.status(200).json({ ok: true });
    return;
  }

  if (aksi === "lc-template-save") {
    const key = TEMPLATE_KEYS.find((k) => k === b.key);
    if (!key) return void tolak(res, "data_salah", 400, { field: "key" });
    const code = typeof b.code === "string" ? b.code : null;
    if (code === null) return void tolak(res, "data_salah", 400, { field: "code" });
    const cek = checkSketch(code);
    if (!cek.ok) return void tolak(res, cek.kode, 400, { field: "code", rinci: cek.detail });
    if (!/^[ \t]*#[ \t]*include[ \t]*"iris_seat\.h"/m.test(code))
      return void tolak(res, "tanpa_header", 400, { field: "code" });
    await db
      .insert(recLcTemplate)
      .values({ editionId: edisi.id, key, code, sample: false, updatedBy: s.nim })
      .onConflictDoUpdate({
        target: [recLcTemplate.editionId, recLcTemplate.key],
        set: { code, sample: false, updatedBy: s.nim, updatedAt: new Date() },
      });
    res.status(200).json({ ok: true });
    return;
  }

  if (aksi === "lc-rubric-save") {
    const c = periksaBaris(b.rows);
    if (!c.ok) return void tolak(res, "data_salah", 400, { field: c.field });
    const rubrik = await muatRubrik(db, edisi.id);
    const [dinilai] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(recRubricScore)
      .where(eq(recRubricScore.rubricId, rubrik.id));
    const sama = sameRubricRows(rubrik.rows, c.rows);
    if (dinilai.n > 0 && !sama) return void tolak(res, "sudah_dinilai", 409);
    await db
      .update(recRubric)
      .set({ rows: c.rows, updatedBy: s.nim, updatedAt: new Date() })
      .where(eq(recRubric.id, rubrik.id));
    res.status(200).json({ ok: true, rows: c.rows });
    return;
  }

  tolak(res, "aksi_tidak_dikenal", 404);
}
