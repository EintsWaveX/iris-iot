/**
 * The exam config's maths (B7.1, 29 Oct 2026): what each part is worth, how an
 * older stored config becomes the current one, and whether a config is sound.
 * Browser safe and pure.
 *
 * The test is always out of TOTAL_SCORE (4000), so Cutting's `tes_tulis` cut
 * keeps its scale. The Akademik edits two things: the split between the
 * written parts and Live Coding (default 40 / 60), and the split of the
 * written share between the three written parts (default 40 / 40 / 20).
 */
import {
  DEFAULT_EXAM_CONFIG,
  PART_KEYS,
  PHASE1_PARTS,
  TIERS,
  TOTAL_SCORE,
  type ExamConfig,
  type FieldError,
  type PartKey,
  type Phase1Part,
} from "./exam-types.js";

export interface Caps {
  /** Each written part's score ceiling. */
  parts: Record<Phase1Part, number>;
  /** All the written parts together. */
  written: number;
  livecode: number;
  total: number;
}

/**
 * Whole points everywhere: Live Coding rounds first, the written parts split
 * what is left by their shares (floored), and the last written part takes the
 * remainder so the parts always add up to the total.
 */
export function capsOf(c: ExamConfig): Caps {
  const livecode = Math.round((TOTAL_SCORE * c.weights.livecode) / 100);
  const written = TOTAL_SCORE - livecode;
  const parts = {} as Record<Phase1Part, number>;
  let used = 0;
  PHASE1_PARTS.forEach((part, i) => {
    parts[part] =
      i === PHASE1_PARTS.length - 1 ? written - used : Math.floor((written * c.shares[part]) / 100);
    used += parts[part];
  });
  return { parts, written, livecode, total: TOTAL_SCORE };
}

/** What a seat can earn in Live Coding if every dealt problem passes every test. */
export const dealtPoints = (c: ExamConfig) =>
  TIERS.reduce((sum, t) => sum + c.livecode.draw[t] * c.livecode.points[t], 0);

/** How many problems one seat is dealt. */
export const dealtCount = (c: ExamConfig) => TIERS.reduce((sum, t) => sum + c.livecode.draw[t], 0);

/** Minutes planned for a part. */
export const minutesOf = (c: ExamConfig, part: PartKey) =>
  part === "livecode" ? c.livecode.minutes : c.parts[part].minutes;

/* --------------------------------------------------------------- upgrading */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const whole = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

/**
 * A stored config of any version, as the current one. A v1 config (the IoT
 * test: Mikro, per-language counts, protocols) keeps only what still means
 * something, the minutes and the shown/pool counts of the three written
 * parts; every Live Coding and score setting comes from the defaults, because
 * the old rubric Live Coding has no counterpart. Anything unreadable falls
 * back to the defaults for that field, so a bad row can never stop the panel.
 */
export function upgradeConfig(raw: unknown): ExamConfig {
  const d = DEFAULT_EXAM_CONFIG;
  if (!isObj(raw)) return structuredClone(d);
  const out = structuredClone(d);
  const budget = whole(raw.budgetMin, 1, 600);
  if (budget !== null) out.budgetMin = budget;
  const parts = isObj(raw.parts) ? raw.parts : {};
  for (const part of PHASE1_PARTS) {
    const p = parts[part];
    if (!isObj(p)) continue;
    const minutes = whole(p.minutes, 1, 60);
    if (minutes !== null) out.parts[part].minutes = minutes;
    // v2 has the counts on the part itself; v1 hid them under counts.<lang>
    const counts = isObj(p.counts) ? p.counts : null;
    const c = counts ? (counts.c ?? counts.cpp ?? counts.any ?? Object.values(counts)[0]) : p;
    if (isObj(c)) {
      const shown = whole(c.shown, 1, 200);
      const pool = whole(c.pool, 1, 400);
      if (shown !== null && pool !== null && pool >= shown) {
        out.parts[part].shown = shown;
        out.parts[part].pool = pool;
      }
    }
  }
  if (raw.v === 2) {
    const lc = isObj(raw.livecode) ? raw.livecode : {};
    const m = whole(lc.minutes, 10, 120);
    if (m !== null) out.livecode.minutes = m;
    const rl = whole(lc.runLimit, 0, 100);
    if (rl !== null) out.livecode.runLimit = rl;
    const w = whole(lc.workers, 1, 16);
    if (w !== null) out.livecode.workers = w;
    for (const t of TIERS) {
      const dr = isObj(lc.draw) ? whole(lc.draw[t], 0, 10) : null;
      if (dr !== null) out.livecode.draw[t] = dr;
      const pt = isObj(lc.points) ? whole(lc.points[t], 0, TOTAL_SCORE) : null;
      if (pt !== null) out.livecode.points[t] = pt;
    }
    if (isObj(raw.weights)) {
      const wr = whole(raw.weights.written, 0, 100);
      const wl = whole(raw.weights.livecode, 0, 100);
      if (wr !== null && wl !== null && wr + wl === 100)
        out.weights = { written: wr, livecode: wl };
    }
    if (isObj(raw.shares)) {
      const sh = PHASE1_PARTS.map((p) => whole((raw.shares as Record<string, unknown>)[p], 0, 100));
      if (sh.every((n) => n !== null) && (sh as number[]).reduce((a, b) => a + b, 0) === 100)
        PHASE1_PARTS.forEach((p, i) => (out.shares[p] = sh[i] as number));
    }
    if (
      Array.isArray(raw.order) &&
      raw.order.length === PART_KEYS.length &&
      PART_KEYS.every((k) => (raw.order as unknown[]).includes(k)) &&
      raw.order[raw.order.length - 1] === "livecode"
    )
      out.order = raw.order as PartKey[];
  }
  return out;
}

/* -------------------------------------------------------------- validating */

export function validateConfig(c: ExamConfig): FieldError[] {
  const errs: FieldError[] = [];
  const order = c.order ?? [];
  if (
    order.length !== PART_KEYS.length ||
    order[order.length - 1] !== "livecode" ||
    new Set(order).size !== order.length ||
    !PART_KEYS.every((p) => order.includes(p))
  )
    errs.push({ field: "order", kode: "urutan_salah" });
  for (const part of PHASE1_PARTS) {
    const p = c.parts?.[part];
    const field = `parts.${part}`;
    if (!p) {
      errs.push({ field, kode: "bagian_hilang" });
      continue;
    }
    if (!Number.isInteger(p.minutes) || p.minutes < 1 || p.minutes > 60)
      errs.push({ field: `${field}.minutes`, kode: "menit_salah" });
    if (!Number.isInteger(p.shown) || p.shown < 1 || !Number.isInteger(p.pool) || p.pool < p.shown)
      errs.push({ field: `${field}.counts`, kode: "jumlah_salah" });
  }
  const lc = c.livecode;
  if (!Number.isInteger(lc?.minutes) || lc.minutes < 10 || lc.minutes > 120)
    errs.push({ field: "livecode.minutes", kode: "menit_salah" });
  if (!Number.isInteger(c.budgetMin) || c.budgetMin < 1)
    errs.push({ field: "budgetMin", kode: "menit_salah" });
  if (!Number.isInteger(lc?.runLimit) || lc.runLimit < 0)
    errs.push({ field: "livecode.runLimit", kode: "batas_salah" });
  if (!Number.isInteger(lc?.workers) || lc.workers < 1 || lc.workers > 16)
    errs.push({ field: "livecode.workers", kode: "jumlah_salah" });
  for (const t of TIERS) {
    if (!Number.isInteger(lc?.draw?.[t]) || lc.draw[t] < 0)
      errs.push({ field: `livecode.draw.${t}`, kode: "jumlah_salah" });
    if (!Number.isInteger(lc?.points?.[t]) || lc.points[t] < 1)
      errs.push({ field: `livecode.points.${t}`, kode: "poin_salah" });
  }
  const w = c.weights;
  if (
    !Number.isInteger(w?.written) ||
    !Number.isInteger(w?.livecode) ||
    w.written < 0 ||
    w.livecode < 0 ||
    w.written + w.livecode !== 100
  )
    errs.push({ field: "weights", kode: "bobot_salah" });
  const sh = PHASE1_PARTS.map((p) => c.shares?.[p]);
  if (
    sh.some((n) => !Number.isInteger(n) || (n as number) < 0) ||
    (sh as number[]).reduce((a, b) => a + b, 0) !== 100
  )
    errs.push({ field: "shares", kode: "bobot_salah" });
  // The problems a seat is dealt must be worth exactly the Live Coding share.
  if (errs.length === 0 && dealtPoints(c) !== capsOf(c).livecode)
    errs.push({ field: "livecode.points", kode: "poin_tidak_cocok" });
  return errs;
}
