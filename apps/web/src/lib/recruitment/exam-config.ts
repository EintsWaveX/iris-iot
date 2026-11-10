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
import { BONUS_SHARE } from "./bonus.js";
import type { Penalty } from "./c-problem.js";
import { STRIKE_KINDS } from "./seat-lockdown.js";
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
import { isObj } from "../guards.js";

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

/** The penalty for failed Submits, from the settings (c-problem.ts has the formula). */
export const penaltyOf = (c: ExamConfig): Penalty => ({
  free: c.livecode.penaltyFree,
  step: c.livecode.penaltyStep,
  max: c.livecode.penaltyMax,
});

/** What a seat can earn in Live Coding if every dealt problem passes every test. */
export const dealtPoints = (c: ExamConfig) =>
  TIERS.reduce((sum, t) => sum + c.livecode.draw[t] * c.livecode.points[t], 0);

/** What a written question is worth when it has no score of its own: the part's cap over what a seat is shown. */
export function defaultQuestionPoints(c: ExamConfig): Record<Phase1Part, number> {
  const caps = capsOf(c);
  const out = {} as Record<Phase1Part, number>;
  for (const p of PHASE1_PARTS) out[p] = Math.max(1, Math.round(caps.parts[p] / c.parts[p].shown));
  return out;
}

/** What one Live Coding problem is worth: its own score, or its tier's. */
export const problemWorth = (c: ExamConfig, tier: (typeof TIERS)[number], own?: number | null) =>
  own ?? c.livecode.points[tier];

/**
 * What a seat could reach by finishing everything, bonus included (4 Nov 2026): a part's cap times
 * the whole pool over what it is shown, so equal scores give an exact number. Live Coding adds
 * the pool's other problems at their tier's points, the pool counted as split evenly by tier.
 */
export function maxWithBonus(c: ExamConfig): Caps {
  const base = capsOf(c);
  const parts = {} as Record<Phase1Part, number>;
  for (const p of PHASE1_PARTS)
    parts[p] = Math.round(
      base.parts[p] * (1 + (BONUS_SHARE * (c.parts[p].pool - c.parts[p].shown)) / c.parts[p].shown),
    );
  const written = PHASE1_PARTS.reduce((a, p) => a + parts[p], 0);
  const per = Math.floor(c.livecode.pool / TIERS.length);
  let extra = 0;
  TIERS.forEach((t, i) => {
    const inPool = per + (i < c.livecode.pool - per * TIERS.length ? 1 : 0);
    extra += Math.max(0, inPool - c.livecode.draw[t]) * c.livecode.points[t];
  });
  const livecode = base.livecode + Math.round(extra * BONUS_SHARE);
  return { parts, written, livecode, total: written + livecode };
}

/**
 * `total` problems spread over the tiers in the default 2 : 2 : 1 mix (easy, medium, hard), so
 * a single "Tampil" number in Pengaturan can drive the three draw counts. Largest remainder,
 * ties to the easier tier.
 */
export function spreadDraw(total: number): Record<(typeof TIERS)[number], number> {
  const mix = [2, 2, 1];
  const sum = mix.reduce((a, n) => a + n, 0);
  const exact = mix.map((w) => (total * w) / sum);
  const out = exact.map((x) => Math.floor(x));
  let left = total - out.reduce((a, n) => a + n, 0);
  const order = exact
    .map((x, i) => ({ i, f: x - Math.floor(x) }))
    .sort((a, b) => b.f - a.f || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    out[o.i]++;
    left--;
  }
  return { easy: out[0], medium: out[1], hard: out[2] };
}

/** How many problems one seat is dealt. */
export const dealtCount = (c: ExamConfig) => TIERS.reduce((sum, t) => sum + c.livecode.draw[t], 0);

/** Minutes planned for a part. */
export const minutesOf = (c: ExamConfig, part: PartKey) =>
  part === "livecode" ? c.livecode.minutes : c.parts[part].minutes;

/* --------------------------------------------------------------- upgrading */

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
    const bonus = whole(p.bonusMin, 0, 60);
    if (bonus !== null) out.parts[part].bonusMin = bonus;
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
    const pf = whole(lc.penaltyFree, 0, 20);
    if (pf !== null) out.livecode.penaltyFree = pf;
    const ps = whole(lc.penaltyStep, 0, 50);
    if (ps !== null) out.livecode.penaltyStep = ps;
    const pm = whole(lc.penaltyMax, 0, 100);
    if (pm !== null) out.livecode.penaltyMax = pm;
    // A config saved before the Susah tier has no `hard`: it keeps dealing what it dealt, none of it.
    if (isObj(lc.draw) && lc.draw.hard === undefined) out.livecode.draw.hard = 0;
    for (const t of TIERS) {
      const dr = isObj(lc.draw) ? whole(lc.draw[t], 0, 10) : null;
      if (dr !== null) out.livecode.draw[t] = dr;
      const pt = isObj(lc.points) ? whole(lc.points[t], 0, TOTAL_SCORE) : null;
      if (pt !== null) out.livecode.points[t] = pt;
    }
    const lb = whole(lc.bonusMin, 0, 120);
    if (lb !== null) out.livecode.bonusMin = lb;
    const lp = whole(lc.pool, 1, 100);
    if (lp !== null) out.livecode.pool = lp;
    if (out.livecode.pool < dealtCount(out)) out.livecode.pool = dealtCount(out);
    if (isObj(raw.weights)) {
      const wr = whole(raw.weights.written, 0, 100);
      const wl = whole(raw.weights.livecode, 0, 100);
      if (wr !== null && wl !== null && wr + wl === 100)
        out.weights = { written: wr, livecode: wl };
    }
    if (isObj(raw.violations)) {
      const v = raw.violations;
      const o = out.violations;
      if (isObj(v.kinds))
        for (const k of STRIKE_KINDS) {
          const r = v.kinds[k];
          if (!isObj(r)) continue;
          const wt = whole(r.weight, 0, 5);
          if (typeof r.counts === "boolean" && wt !== null)
            o.kinds[k] = { counts: r.counts, weight: wt };
        }
      const free = whole(v.free, 0, 50);
      if (free !== null) o.free = free;
      const step = whole(v.step, 0, 50);
      if (step !== null) o.step = step;
      const max = whole(v.max, 0, 100);
      if (max !== null && max >= o.step) o.max = max;
      if (o.max < o.step) o.max = o.step;
      const w = Array.isArray(v.warnAt) ? v.warnAt.map((n) => whole(n, 1, 200)) : [];
      if (w.length === 3 && w.every((n) => n !== null) && w[0]! < w[1]! && w[1]! < w[2]!)
        o.warnAt = w as [number, number, number];
      const cap = whole(v.capPerPart, 10, 500);
      if (cap !== null) o.capPerPart = cap;
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
    if (
      !Number.isInteger(p.shown) ||
      p.shown < 1 ||
      p.shown > 200 ||
      !Number.isInteger(p.pool) ||
      p.pool < p.shown ||
      p.pool > 400
    )
      errs.push({ field: `${field}.counts`, kode: "jumlah_salah" });
    if (!Number.isInteger(p.bonusMin) || p.bonusMin < 0 || p.bonusMin > 60)
      errs.push({ field: `${field}.bonusMin`, kode: "menit_salah" });
  }
  const lc = c.livecode;
  if (!Number.isInteger(lc?.minutes) || lc.minutes < 10 || lc.minutes > 120)
    errs.push({ field: "livecode.minutes", kode: "menit_salah" });
  if (!Number.isInteger(c.budgetMin) || c.budgetMin < 1 || c.budgetMin > 600)
    errs.push({ field: "budgetMin", kode: "menit_salah" });
  if (!Number.isInteger(lc?.bonusMin) || lc.bonusMin < 0 || lc.bonusMin > 120)
    errs.push({ field: "livecode.bonusMin", kode: "menit_salah" });
  if (!Number.isInteger(lc?.pool) || lc.pool < dealtCount(c) || lc.pool > 100)
    errs.push({ field: "livecode.pool", kode: "jumlah_salah" });
  if (!Number.isInteger(lc?.runLimit) || lc.runLimit < 0 || lc.runLimit > 100)
    errs.push({ field: "livecode.runLimit", kode: "batas_salah" });
  if (!Number.isInteger(lc?.workers) || lc.workers < 1 || lc.workers > 16)
    errs.push({ field: "livecode.workers", kode: "jumlah_salah" });
  if (!Number.isInteger(lc?.penaltyFree) || lc.penaltyFree < 0 || lc.penaltyFree > 20)
    errs.push({ field: "livecode.penaltyFree", kode: "denda_salah" });
  if (!Number.isInteger(lc?.penaltyStep) || lc.penaltyStep < 0 || lc.penaltyStep > 50)
    errs.push({ field: "livecode.penaltyStep", kode: "denda_salah" });
  if (
    !Number.isInteger(lc?.penaltyMax) ||
    lc.penaltyMax < 0 ||
    lc.penaltyMax > 100 ||
    lc.penaltyMax < lc.penaltyStep
  )
    errs.push({ field: "livecode.penaltyMax", kode: "denda_salah" });
  for (const t of TIERS) {
    if (!Number.isInteger(lc?.draw?.[t]) || lc.draw[t] < 0 || lc.draw[t] > 10)
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
  const v = c.violations;
  const kindsOk =
    !!v?.kinds &&
    STRIKE_KINDS.every(
      (k) =>
        typeof v.kinds[k]?.counts === "boolean" &&
        Number.isInteger(v.kinds[k].weight) &&
        v.kinds[k].weight >= 0 &&
        v.kinds[k].weight <= 5,
    );
  if (
    !kindsOk ||
    !Number.isInteger(v.free) ||
    v.free < 0 ||
    v.free > 50 ||
    !Number.isInteger(v.step) ||
    v.step < 0 ||
    v.step > 50 ||
    !Number.isInteger(v.max) ||
    v.max < v.step ||
    v.max > 100 ||
    !Array.isArray(v.warnAt) ||
    v.warnAt.length !== 3 ||
    v.warnAt.some((n) => !Number.isInteger(n) || n < 1 || n > 200) ||
    !(v.warnAt[0] < v.warnAt[1] && v.warnAt[1] < v.warnAt[2]) ||
    !Number.isInteger(v.capPerPart) ||
    v.capPerPart < 10 ||
    v.capPerPart > 500
  )
    errs.push({ field: "violations", kode: "pelanggaran_salah" });
  // The problems a seat is dealt must be worth exactly the Live Coding share.
  if (errs.length === 0 && dealtPoints(c) !== capsOf(c).livecode)
    errs.push({ field: "livecode.points", kode: "poin_tidak_cocok" });
  return errs;
}
