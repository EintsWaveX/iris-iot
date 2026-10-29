/**
 * What the bank may do with a question (EXAM-ENGINE 1.4, 2 and 10.3, prompt
 * 09), as pure rules the API and the editor share:
 * - `cleanQuestion` copies only the fields a format has, with their types, so
 *   `validateQuestion` never meets a shape it did not expect.
 * - `judgeSave` says whether a save, an import row or a status change is
 *   allowed against what is stored (`struktur_terkunci`, `perlu_catatan`,
 *   `ruang_berjalan`, `bahasa_salah`) and what kind of change it is.
 * - `poolCounts` is the "12 dari 20 siap" per part and language.
 */
import type {
  Blank,
  BlankKey,
  CodeLang,
  ExamConfig,
  FixSlot,
  Format,
  Image,
  Item,
  Lang,
  Phase1Part,
  Question,
} from "./exam-types.js";
import { FORMATS, LANGS, PHASE1_PARTS } from "./exam-types.js";
import { structureKey } from "./formats.js";

/* ----------------------------------------------------------------- clean */

const ID = /^[a-z0-9]{1,12}$/;
export const MAX_PROMPT = 20_000;
export const MAX_CODE = 20_000;
export const MAX_ITEM = 2_000;
export const MAX_TITLE = 200;
const CODE_LANGS: readonly string[] = ["c", "text"];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length <= max ? v : null;
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;

function items(v: unknown): Item[] | null {
  if (!Array.isArray(v) || v.length > 40) return null;
  const out: Item[] = [];
  for (const x of v) {
    if (!isObj(x)) return null;
    const id = str(x.id, 12);
    const text = str(x.text, MAX_ITEM);
    if (id === null || !ID.test(id) || text === null || text.includes("\n")) return null;
    out.push({ id, text });
  }
  return out;
}

function code(v: unknown): { lang: CodeLang; src: string } | null {
  if (!isObj(v)) return null;
  const src = str(v.src, MAX_CODE);
  if (src === null || typeof v.lang !== "string" || !CODE_LANGS.includes(v.lang)) return null;
  return { lang: v.lang as CodeLang, src };
}

function images(v: unknown): Image[] | null | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 12) return null;
  const out: Image[] = [];
  for (const x of v) {
    if (!isObj(x)) return null;
    const id = str(x.id, 40);
    const key = str(x.key, 200);
    const alt = str(x.alt, 300);
    const w = int(x.w);
    const h = int(x.h);
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || !key || alt === null || w === null || h === null)
      return null;
    if (w < 1 || h < 1 || w > 8000 || h > 8000) return null;
    out.push({ id, key, alt, w, h });
  }
  return out;
}

const strList = (v: unknown, max: number): string[] | null => {
  if (!Array.isArray(v) || v.length > 40) return null;
  const out: string[] = [];
  for (const x of v) {
    const s = str(x, max);
    if (s === null) return null;
    out.push(s);
  }
  return out;
};

type Pair = { body: Question["body"]; answer: Question["answer"] };

/**
 * The body and answer a format keeps, copied field by field, or null when the
 * shape is wrong. Meaning (counts, the key pointing at real ids) is
 * `validateQuestion`'s; this only guarantees the types it reads.
 */
export function cleanQuestion(format: Format, body: unknown, answer: unknown): Pair | null {
  if (!isObj(body) || !isObj(answer)) return null;
  const prompt = str(body.prompt, MAX_PROMPT);
  const imgs = images(body.images);
  if (prompt === null || imgs === null) return null;
  const common = { prompt, ...(imgs ? { images: imgs } : {}) };
  switch (format) {
    case "single":
    case "multi": {
      const options = items(body.options);
      if (!options) return null;
      const shuffle = body.shuffle === false ? false : true;
      if (format === "single") {
        const correct = str(answer.correct, 12);
        return correct === null
          ? null
          : { body: { ...common, options, shuffle }, answer: { correct } };
      }
      const correct = strList(answer.correct, 12);
      return correct ? { body: { ...common, options, shuffle }, answer: { correct } } : null;
    }
    case "lines": {
      const c = code(body.code);
      const lines = Array.isArray(answer.lines) ? answer.lines.map(int) : null;
      if (!c || !lines || lines.length > 200 || lines.includes(null)) return null;
      return { body: { ...common, code: c }, answer: { lines: lines as number[] } };
    }
    case "fix": {
      const c = code(body.code);
      if (!c || !Array.isArray(body.slots) || body.slots.length > 20 || !isObj(answer.picks))
        return null;
      const slots: FixSlot[] = [];
      for (const s of body.slots) {
        if (!isObj(s)) return null;
        const line = int(s.line);
        const options = items(s.options);
        if (line === null || !options) return null;
        slots.push({ line, options });
      }
      const picks: Record<number, string> = {};
      for (const [k, v] of Object.entries(answer.picks)) {
        const n = Number(k);
        const id = str(v, 12);
        if (!Number.isInteger(n) || id === null) return null;
        picks[n] = id;
      }
      return { body: { ...common, code: c, slots }, answer: { picks } };
    }
    case "order": {
      const lines = items(body.lines);
      const order = strList(answer.order, 12);
      const alsoRaw = answer.also === undefined ? [] : answer.also;
      if (!lines || !order || !Array.isArray(alsoRaw) || alsoRaw.length > 20) return null;
      if (typeof body.lang !== "string" || !CODE_LANGS.includes(body.lang)) return null;
      const also: string[][] = [];
      for (const o of alsoRaw) {
        const l = strList(o, 12);
        if (!l) return null;
        also.push(l);
      }
      return {
        body: { ...common, lang: body.lang as CodeLang, lines },
        answer: { order, also },
      };
    }
    case "match": {
      const left = items(body.left);
      const right = items(body.right);
      if (!left || !right || !isObj(answer.pairs)) return null;
      const pairs: Record<string, string> = {};
      for (const [k, v] of Object.entries(answer.pairs)) {
        const id = str(v, 12);
        if (id === null) return null;
        pairs[k] = id;
      }
      return { body: { ...common, left, right }, answer: { pairs } };
    }
    case "fitb": {
      if (!Array.isArray(body.blanks) || body.blanks.length > 40 || !isObj(answer.blanks))
        return null;
      let c: { lang: CodeLang; src: string } | undefined;
      if (body.code !== undefined) {
        const cc = code(body.code);
        if (!cc) return null;
        c = cc;
      }
      const blanks: Blank[] = [];
      for (const b of body.blanks) {
        if (!isObj(b)) return null;
        const n = int(b.n);
        if (n === null) return null;
        const bl: Blank = { n };
        if (b.width !== undefined) {
          const w = int(b.width);
          if (w === null) return null;
          bl.width = w;
        }
        if (b.hint !== undefined) {
          const h = str(b.hint, 300);
          if (h === null) return null;
          bl.hint = h;
        }
        blanks.push(bl);
      }
      const key: Record<number, BlankKey> = {};
      for (const [k, v] of Object.entries(answer.blanks)) {
        const n = Number(k);
        if (!Number.isInteger(n) || !isObj(v)) return null;
        const accept = strList(v.accept, 200);
        if (!accept) return null;
        const bk: BlankKey = { accept };
        if (v.case !== undefined) {
          if (v.case !== "exact" && v.case !== "ignore") return null;
          bk.case = v.case;
        }
        if (v.space !== undefined) {
          if (
            v.space !== "exact" &&
            v.space !== "trim" &&
            v.space !== "collapse" &&
            v.space !== "none"
          )
            return null;
          bk.space = v.space;
        }
        key[n] = bk;
      }
      return { body: { ...common, ...(c ? { code: c } : {}), blanks }, answer: { blanks: key } };
    }
  }
}

export const isFormat = (v: unknown): v is Format => (FORMATS as readonly unknown[]).includes(v);
export const isPart = (v: unknown): v is Phase1Part =>
  (PHASE1_PARTS as readonly unknown[]).includes(v);
export const isLang = (v: unknown): v is Lang => (LANGS as readonly unknown[]).includes(v);

/* ----------------------------------------------------------------- judge */

/** JSON with sorted keys, so two equal values compare as equal text. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (isObj(v))
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

export interface QuestionState {
  part: Phase1Part;
  lang: Lang;
  format: Format;
  title: string;
  status: "draft" | "ready";
  body: Question["body"];
  answer: Question["answer"];
  refs: number[];
}

export interface StoredState extends QuestionState {
  /** Set once a real seat has been dealt it */
  shown: boolean;
  sample: boolean;
}

export type SaveKind = "create" | "save" | "key" | "status" | "same";
export type Verdict = { ok: true; kind: SaveKind } | { ok: false; kode: string };

export interface JudgeContext {
  /** A real room of the edition is in persiapan, a part or the spins */
  roomRunning: boolean;
  /** The note given with the save, if any */
  note?: string;
  /** The languages each part's config counts */
  langs: Record<Phase1Part, Lang[]>;
}

const asQ = (s: QuestionState): Question =>
  ({
    id: 0,
    version: 1,
    part: s.part,
    lang: s.lang,
    format: s.format,
    body: s.body,
    answer: s.answer,
  }) as Question;

/** The languages a question of each part may have: only C (the test is formal C since 29 Oct 2026). */
export function langsOf(_config: ExamConfig): Record<Phase1Part, Lang[]> {
  const out = {} as Record<Phase1Part, Lang[]>;
  for (const p of PHASE1_PARTS) out[p] = ["c"];
  return out;
}

/**
 * Whether a question may be saved over what is stored (or created, with
 * `old` null), and what kind of change it is. Drafts edit freely; a ready
 * question is locked while a real room runs; once shown, only text may
 * change, and a key change needs a note (1.4).
 */
export function judgeSave(old: StoredState | null, next: QuestionState, c: JudgeContext): Verdict {
  if (!c.langs[next.part].includes(next.lang)) return { ok: false, kode: "bahasa_salah" };
  if (!old) {
    if (c.roomRunning && next.status === "ready") return { ok: false, kode: "ruang_berjalan" };
    return { ok: true, kind: "create" };
  }
  if (old.shown) {
    if (old.part !== next.part || old.lang !== next.lang || old.format !== next.format)
      return { ok: false, kode: "struktur_terkunci" };
    if (structureKey(asQ(old)) !== structureKey(asQ(next)))
      return { ok: false, kode: "struktur_terkunci" };
  }
  const sameBody = canon(old.body) === canon(next.body);
  const sameKey = canon(old.answer) === canon(next.answer);
  const sameRest =
    old.part === next.part &&
    old.lang === next.lang &&
    old.format === next.format &&
    old.title === next.title &&
    canon([...old.refs].sort()) === canon([...next.refs].sort());
  if (sameBody && sameKey && sameRest && old.status === next.status)
    return { ok: true, kind: "same" };
  if (c.roomRunning && (old.status === "ready" || next.status === "ready"))
    return { ok: false, kode: "ruang_berjalan" };
  if (old.shown && !sameKey) {
    if (!c.note || c.note.trim() === "") return { ok: false, kode: "perlu_catatan" };
    return { ok: true, kind: "key" };
  }
  if (sameBody && sameKey && sameRest) return { ok: true, kind: "status" };
  return { ok: true, kind: "save" };
}

/* ----------------------------------------------------------------- pools */

export interface PoolRow {
  part: Phase1Part;
  lang: Lang;
  status: "draft" | "ready";
  sample: boolean;
  voided: boolean;
}

export interface PoolCount {
  lang: Lang;
  /** Ready and not voided */
  ready: number;
  draft: number;
  /** Ready seeds (the "Bawaan" ones) */
  seed: number;
  voided: number;
  /** The part's `shown` for this language, and its target */
  shown: number;
  pool: number;
  /** How many more ready questions a start still needs */
  missing: number;
}

/** "12 dari 20 siap" per part, as the config counts them (one C entry each). */
export function poolCounts(
  rows: readonly PoolRow[],
  config: ExamConfig,
): Record<Phase1Part, PoolCount[]> {
  const out = {} as Record<Phase1Part, PoolCount[]>;
  for (const part of PHASE1_PARTS) {
    const cnt = config.parts[part];
    const mine = rows.filter((r) => r.part === part);
    const live = mine.filter((r) => !r.voided);
    const ready = live.filter((r) => r.status === "ready").length;
    out[part] = [
      {
        lang: "c",
        ready,
        draft: live.filter((r) => r.status === "draft").length,
        seed: live.filter((r) => r.status === "ready" && r.sample).length,
        voided: mine.filter((r) => r.voided).length,
        shown: cnt.shown,
        pool: cnt.pool,
        missing: Math.max(0, cnt.shown - ready),
      },
    ];
  }
  return out;
}
