/**
 * The seven question formats (EXAM-ENGINE 1.3): the seat's shuffle, the
 * candidate's view, credit as an exact fraction, validation and the
 * structure fingerprint that locks once a question is shown (1.4).
 * The stored body keeps the authored order; toView is the only way out.
 */
import type {
  FieldError,
  FitbQ,
  FixQ,
  Item,
  LinesQ,
  MatchQ,
  OrderQ,
  Perm,
  Question,
  Rng,
  Value,
  View,
  BlankKey,
} from "./exam-types.js";
import { ONE, ZERO, frac, type Frac } from "./frac.js";

/* ------------------------------------------------------------ randomness */

/** A uniform integer in [0, n), without modulo bias. */
export function below(rng: Rng, n: number): number {
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % n);
  for (;;) {
    const x = rng.u32();
    if (x < limit) return x % n;
  }
}

/** Fisher Yates on a copy. */
export function shuffle<T>(xs: readonly T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = below(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
/** newId makes 6 characters; hand-written fixtures may be shorter. */
const ID_RE = /^[a-z0-9]{1,12}$/;

/** A random, opaque item id. Fixed once the question is shown. */
export function newId(rng?: Rng): string {
  const r: Rng = rng ?? {
    u32: () => crypto.getRandomValues(new Uint32Array(1))[0],
  };
  let s = "";
  for (let i = 0; i < 6; i++) s += ID_CHARS[below(r, ID_CHARS.length)];
  return s;
}

/* ---------------------------------------------------------------- helpers */

const ids = (xs: readonly Item[]) => xs.map((x) => x.id);
const pickIn = (order: readonly string[], items: readonly Item[]) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  return order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
};
const srcLines = (src: string) => src.split("\n");
const isBlankLine = (s: string) => s.trim() === "";

/** max(0, (right − wrong) ÷ |correct|) over distinct picks. */
function checkboxCredit<T>(correct: readonly T[], picks: readonly T[]): Frac {
  const key = new Set(correct);
  const seen = new Set(picks);
  let right = 0;
  let wrong = 0;
  for (const p of seen) {
    if (key.has(p)) right++;
    else wrong++;
  }
  return right <= wrong ? ZERO : frac(right - wrong, key.size);
}

function lcs(a: readonly string[], b: readonly string[]): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(row[j], row[j - 1]);
      diag = up;
    }
  }
  return row[b.length];
}

const orderTexts = (q: OrderQ, order: readonly string[]) => {
  const byId = new Map(q.body.lines.map((l) => [l.id, l.text]));
  return order.map((id) => byId.get(id)!);
};
const acceptedOrders = (q: OrderQ) => [q.answer.order, ...(q.answer.also ?? [])];
const sameTexts = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i]);

function isPermutation(order: readonly string[], of: readonly string[]): boolean {
  if (order.length !== of.length) return false;
  const want = new Set(of);
  const seen = new Set(order);
  return seen.size === order.length && order.every((id) => want.has(id));
}

const QUOTES: [RegExp, string][] = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
];

/** One side of a blank comparison: NFC, straight quotes, then space and case. */
export function normalizeBlank(s: string, rule: Pick<BlankKey, "case" | "space">): string {
  let t = s.normalize("NFC");
  for (const [re, to] of QUOTES) t = t.replace(re, to);
  const space = rule.space ?? "trim";
  if (space === "trim") t = t.trim();
  else if (space === "collapse") t = t.trim().replace(/\s+/g, " ");
  else if (space === "none") t = t.replace(/\s+/g, "");
  return (rule.case ?? "exact") === "ignore" ? t.toLowerCase() : t;
}

/** `__(n)__`: two or more underscores each side. */
const BLANK_RE = /_{2,}\((\d+)\)_{2,}/g;
const blankNumbers = (q: FitbQ) =>
  [...`${q.body.prompt}\n${q.body.code?.src ?? ""}`.matchAll(BLANK_RE)].map((m) => Number(m[1]));

/* ------------------------------------------------------------------ perm */

export function makePerm(q: Question, rng: Rng): Perm {
  switch (q.format) {
    case "single":
    case "multi":
      return { options: q.body.shuffle ? shuffle(ids(q.body.options), rng) : ids(q.body.options) };
    case "fix":
      return {
        slots: Object.fromEntries(q.body.slots.map((s) => [s.line, shuffle(ids(s.options), rng)])),
      };
    case "order": {
      const accepted = acceptedOrders(q).map((o) => orderTexts(q, o));
      for (let tries = 0; tries < 1000; tries++) {
        const lines = shuffle(ids(q.body.lines), rng);
        const texts = orderTexts(q, lines);
        if (!accepted.some((a) => sameTexts(a, texts))) return { lines };
      }
      throw new Error(`makePerm: question ${q.id} has no wrong order`);
    }
    case "match":
      return { left: shuffle(ids(q.body.left), rng), right: shuffle(ids(q.body.right), rng) };
    case "lines":
    case "fitb":
      return null;
  }
}

/* ------------------------------------------------------------------ view */

const DEFAULT_WIDTH = 10;

export function toView(q: Question, perm: Perm): View {
  const base = {
    prompt: q.body.prompt,
    ...(q.body.images?.length ? { images: q.body.images } : {}),
  };
  switch (q.format) {
    case "single":
    case "multi": {
      const order = perm && "options" in perm ? perm.options : ids(q.body.options);
      return { format: q.format, ...base, options: pickIn(order, q.body.options) };
    }
    case "lines":
      return { format: "lines", ...base, code: q.body.code };
    case "fix": {
      const slots = perm && "slots" in perm ? perm.slots : {};
      return {
        format: "fix",
        ...base,
        code: q.body.code,
        slots: q.body.slots.map((s) => ({
          line: s.line,
          options: pickIn(slots[s.line] ?? ids(s.options), s.options),
        })),
      };
    }
    case "order": {
      const order = perm && "lines" in perm ? perm.lines : ids(q.body.lines);
      return { format: "order", ...base, lang: q.body.lang, lines: pickIn(order, q.body.lines) };
    }
    case "match": {
      const p =
        perm && "left" in perm ? perm : { left: ids(q.body.left), right: ids(q.body.right) };
      return {
        format: "match",
        ...base,
        left: pickIn(p.left, q.body.left),
        right: pickIn(p.right, q.body.right),
      };
    }
    case "fitb":
      return {
        format: "fitb",
        ...base,
        ...(q.body.code ? { code: q.body.code } : {}),
        blanks: q.body.blanks.map((b) => ({
          n: b.n,
          width: b.width ?? DEFAULT_WIDTH,
          ...(b.hint ? { hint: b.hint } : {}),
        })),
      };
  }
}

/* ---------------------------------------------------------------- credit */

/** How right a value is, 0 to 1. Fully correct is exactly 1 (what M counts). */
const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** The field each format's value carries. */
const VALUE_KEY = {
  single: "pick",
  multi: "picks",
  lines: "picks",
  fix: "picks",
  order: "order",
  match: "pairs",
  fitb: "blanks",
} as const;

/** The container a value's field must be, so credit never throws on a stored value. */
function shaped(q: Question, v: unknown): boolean {
  if (!isRecord(v)) return false;
  const x = v[VALUE_KEY[q.format]];
  switch (q.format) {
    case "single":
      return typeof x === "string" || x === null;
    case "multi":
    case "lines":
    case "order":
      return Array.isArray(x);
    default:
      return isRecord(x);
  }
}

/** The longest text one blank takes. */
export const MAX_BLANK = 200;

/**
 * Whether `test-answer` may store this value: the format's one field, ids
 * and line numbers the question has, no repeats, nothing else (null is
 * unanswered and always fine). credit() stays safe on anything regardless.
 */
export function checkValue(q: Question, value: unknown): boolean {
  if (value === null) return true;
  if (!shaped(q, value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 1) return false;
  const nullOr = (x: unknown, allowed: Set<string>) =>
    x === null || (typeof x === "string" && allowed.has(x));
  const distinct = (xs: unknown[]) => new Set(xs).size === xs.length;
  switch (q.format) {
    case "single":
      return nullOr(v.pick, new Set(ids(q.body.options)));
    case "multi": {
      const ok = new Set(ids(q.body.options));
      const picks = v.picks as unknown[];
      return distinct(picks) && picks.every((p) => typeof p === "string" && ok.has(p));
    }
    case "lines": {
      const src = srcLines(q.body.code.src);
      const picks = v.picks as unknown[];
      return (
        distinct(picks) &&
        picks.every(
          (p) =>
            Number.isInteger(p) &&
            (p as number) >= 1 &&
            (p as number) <= src.length &&
            !isBlankLine(src[(p as number) - 1]),
        )
      );
    }
    case "fix": {
      const slots = new Map(q.body.slots.map((s) => [String(s.line), new Set(ids(s.options))]));
      return Object.entries(v.picks as Record<string, unknown>).every(
        ([line, id]) => slots.has(line) && nullOr(id, slots.get(line)!),
      );
    }
    case "order":
      return isPermutation(v.order as string[], ids(q.body.lines));
    case "match": {
      const left = new Set(ids(q.body.left));
      const right = new Set(ids(q.body.right));
      return Object.entries(v.pairs as Record<string, unknown>).every(
        ([l, r]) => left.has(l) && nullOr(r, right),
      );
    }
    case "fitb": {
      const ns = new Set(q.body.blanks.map((b) => String(b.n)));
      return Object.entries(v.blanks as Record<string, unknown>).every(
        ([n, s]) => ns.has(n) && typeof s === "string" && s.length <= MAX_BLANK,
      );
    }
  }
}

export function credit(q: Question, value: Value): Frac {
  if (value == null || !shaped(q, value)) return ZERO;
  switch (q.format) {
    case "single":
      return "pick" in value && value.pick === q.answer.correct ? ONE : ZERO;
    case "multi":
      return "picks" in value && Array.isArray(value.picks)
        ? checkboxCredit(q.answer.correct, value.picks as string[])
        : ZERO;
    case "lines":
      return "picks" in value && Array.isArray(value.picks)
        ? checkboxCredit(q.answer.lines, value.picks as number[])
        : ZERO;
    case "fix": {
      if (!("picks" in value) || Array.isArray(value.picks)) return ZERO;
      const picks = value.picks as Record<number, string | null>;
      const right = q.body.slots.filter(
        (s) => picks[s.line] != null && picks[s.line] === q.answer.picks[s.line],
      );
      return frac(right.length, q.body.slots.length);
    }
    case "order": {
      if (!("order" in value) || !isPermutation(value.order, ids(q.body.lines))) return ZERO;
      const got = orderTexts(q, value.order);
      const accepted = acceptedOrders(q).map((o) => orderTexts(q, o));
      if (accepted.some((a) => sameTexts(a, got))) return ONE;
      const best = Math.max(...accepted.map((a) => lcs(got, a)));
      return frac(best, 2 * got.length);
    }
    case "match": {
      if (!("pairs" in value)) return ZERO;
      const right = q.body.left.filter(
        (l) => value.pairs[l.id] != null && value.pairs[l.id] === q.answer.pairs[l.id],
      );
      return frac(right.length, q.body.left.length);
    }
    case "fitb": {
      if (!("blanks" in value)) return ZERO;
      const right = q.body.blanks.filter((b) => {
        const key = q.answer.blanks[b.n];
        const got = value.blanks[b.n];
        if (!key || typeof got !== "string") return false;
        const g = normalizeBlank(got, key);
        return key.accept.some((a) => normalizeBlank(a, key) === g);
      });
      return frac(right.length, q.body.blanks.length);
    }
  }
}

/* ------------------------------------------------------------- validation */

const LIMITS = {
  single: [2, 8],
  multi: [2, 10],
  fixSlots: [1, 8],
  fixOptions: [2, 6],
  order: [3, 15],
  match: [2, 8],
} as const;

function checkItems(errs: FieldError[], field: string, items: readonly Item[], seen: Set<string>) {
  for (const it of items) {
    if (!ID_RE.test(it.id)) errs.push({ field, kode: "id_salah" });
    if (seen.has(it.id)) errs.push({ field, kode: "id_ganda" });
    seen.add(it.id);
    if (typeof it.text !== "string" || it.text.trim() === "")
      errs.push({ field, kode: "teks_kosong" });
  }
}

const inRange = (n: number, [lo, hi]: readonly [number, number]) => n >= lo && n <= hi;

/** Every rule of 1.3, as `{ field, kode }`. The editor, import and save call it. */
export function validateQuestion(q: Question): FieldError[] {
  const errs: FieldError[] = [];
  const err = (field: string, kode: string) => errs.push({ field, kode });
  if (typeof q.body.prompt !== "string" || q.body.prompt.trim() === "")
    err("body.prompt", "prompt_kosong");
  const seen = new Set<string>();

  switch (q.format) {
    case "single":
    case "multi": {
      const opts = q.body.options;
      if (!inRange(opts.length, LIMITS[q.format])) err("body.options", "opsi_jumlah");
      checkItems(errs, "body.options", opts, seen);
      const optIds = new Set(ids(opts));
      if (q.format === "single") {
        if (!optIds.has(q.answer.correct)) err("answer.correct", "kunci_salah");
      } else {
        const c = q.answer.correct;
        if (c.length < 1 || new Set(c).size !== c.length || !c.every((id) => optIds.has(id)))
          err("answer.correct", "kunci_salah");
      }
      break;
    }
    case "lines":
      validateLines(q, err);
      break;
    case "fix":
      validateFix(q, err, errs, seen);
      break;
    case "order": {
      const ls = q.body.lines;
      if (!inRange(ls.length, LIMITS.order)) err("body.lines", "opsi_jumlah");
      checkItems(errs, "body.lines", ls, seen);
      if (new Set(ls.map((l) => l.text)).size < 2) err("body.lines", "baris_sama");
      const all = ids(ls);
      if (!isPermutation(q.answer.order, all)) err("answer.order", "kunci_salah");
      if (!(q.answer.also ?? []).every((o) => isPermutation(o, all)))
        err("answer.also", "kunci_salah");
      break;
    }
    case "match":
      validateMatch(q, err, errs, seen);
      break;
    case "fitb":
      validateFitb(q, err);
      break;
  }
  return errs;
}

type Err = (field: string, kode: string) => void;

function validateLines(q: LinesQ, err: Err) {
  const ls = srcLines(q.body.code.src);
  if (q.body.code.src.trim() === "") err("body.code", "kode_kosong");
  const key = q.answer.lines;
  if (key.length < 1 || new Set(key).size !== key.length) err("answer.lines", "kunci_salah");
  for (const n of key) {
    if (!Number.isInteger(n) || n < 1 || n > ls.length) err("answer.lines", "kunci_salah");
    else if (isBlankLine(ls[n - 1])) err("answer.lines", "baris_kosong");
  }
}

function validateFix(q: FixQ, err: Err, errs: FieldError[], seen: Set<string>) {
  const ls = srcLines(q.body.code.src);
  const slots = q.body.slots;
  if (!inRange(slots.length, LIMITS.fixSlots)) err("body.slots", "opsi_jumlah");
  const lines = new Set<number>();
  for (const s of slots) {
    if (!Number.isInteger(s.line) || s.line < 1 || s.line > ls.length)
      err("body.slots", "baris_salah");
    if (lines.has(s.line)) err("body.slots", "baris_ganda");
    lines.add(s.line);
    if (!inRange(s.options.length, LIMITS.fixOptions)) err("body.slots", "opsi_jumlah");
    checkItems(errs, "body.slots", s.options, seen);
  }
  const picks = q.answer.picks;
  if (Object.keys(picks).length !== slots.length) err("answer.picks", "kunci_salah");
  for (const s of slots) {
    if (!s.options.some((o) => o.id === picks[s.line])) err("answer.picks", "kunci_salah");
  }
}

function validateMatch(q: MatchQ, err: Err, errs: FieldError[], seen: Set<string>) {
  const { left, right } = q.body;
  if (!inRange(left.length, LIMITS.match)) err("body.left", "opsi_jumlah");
  if (right.length < left.length || right.length > left.length + 2)
    err("body.right", "opsi_jumlah");
  checkItems(errs, "body.left", left, seen);
  checkItems(errs, "body.right", right, seen);
  const rightIds = new Set(ids(right));
  const pairs = q.answer.pairs;
  const used = Object.values(pairs);
  if (
    Object.keys(pairs).length !== left.length ||
    !left.every((l) => rightIds.has(pairs[l.id])) ||
    new Set(used).size !== used.length
  )
    err("answer.pairs", "kunci_salah");
}

function validateFitb(q: FitbQ, err: Err) {
  const k = q.body.blanks.length;
  const nums = q.body.blanks.map((b) => b.n);
  const want = Array.from({ length: k }, (_, i) => i + 1);
  if (k < 1 || !sameNums(nums, want)) err("body.blanks", "celah_salah");
  if (!sameNums(blankNumbers(q), want)) err("body.code", "celah_salah");
  for (const b of q.body.blanks) {
    if (b.width != null && (!Number.isInteger(b.width) || b.width < 1 || b.width > 60))
      err("body.blanks", "lebar_salah");
  }
  const keyNums = Object.keys(q.answer.blanks).map(Number);
  if (!sameNums(keyNums, want)) err("answer.blanks", "kunci_salah");
  for (const n of want) {
    const key = q.answer.blanks[n];
    if (key && (key.accept.length < 1 || key.accept.some((a) => a.trim() === "")))
      err("answer.blanks", "kunci_salah");
  }
}

const sameNums = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && [...a].sort((x, y) => x - y).every((n, i) => n === b[i]);

/* -------------------------------------------------------------- structure */

/** The fingerprint that may not change once a question is shown (1.4). */
export function structureKey(q: Question): string {
  const sorted = (xs: readonly Item[]) => ids(xs).sort();
  switch (q.format) {
    case "single":
    case "multi":
      return JSON.stringify([q.format, sorted(q.body.options)]);
    case "lines":
      return JSON.stringify([q.format, srcLines(q.body.code.src).length]);
    case "fix":
      return JSON.stringify([
        q.format,
        srcLines(q.body.code.src).length,
        [...q.body.slots].sort((a, b) => a.line - b.line).map((s) => [s.line, sorted(s.options)]),
      ]);
    case "order":
      return JSON.stringify([q.format, sorted(q.body.lines)]);
    case "match":
      return JSON.stringify([q.format, sorted(q.body.left), sorted(q.body.right)]);
    case "fitb":
      return JSON.stringify([q.format, q.body.blanks.map((b) => b.n).sort((a, b) => a - b)]);
  }
}
