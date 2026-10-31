/**
 * The bank's Markdown + YAML file (EXAM-ENGINE 1.5, prompt 09). Pure and
 * browser safe: the dry run, the apply and the export all go through here.
 *
 * One UTF-8 file holds any number of questions. Each starts with a YAML front
 * matter between two `---` lines and goes on to its Markdown body; a `---`
 * line starts the next question only when a `key:` line follows it, and never
 * inside a code fence, so a horizontal rule in a prompt is safe.
 *
 * The file never names item ids. A new question gets fresh random ids; an
 * update (front matter `id`) hands `parseBank` the stored question and keeps
 * its ids by position in the authored order (`idSequence`), so a question
 * that was already shown keeps its structure through export and import.
 *
 * Where 1.5 is silent:
 * - `images` (front matter) lists `{ id, key, alt, w, h }`, so a question with
 *   pictures survives the round trip. The prompt names them `![alt](img:id)`.
 * - `also` numbers the lines of the authored block with the blank lines
 *   skipped, so the numbers match what the importer sees.
 */
import { parseDocument } from "yaml";
import type {
  Blank,
  BlankKey,
  CodeLang,
  FieldError,
  FixSlot,
  Format,
  Image,
  Item,
  Lang,
  Phase1Part,
  Question,
} from "./exam-types.js";
import { FORMATS, LANGS, PHASE1_PARTS } from "./exam-types.js";
import { newId, validateQuestion } from "./formats.js";

/* ------------------------------------------------------------------ types */

export type Status = "draft" | "ready";

interface DraftMeta {
  id?: number;
  title: string;
  status: Status;
  sample: boolean;
}

/** A question as the file says it: everything but the database's own columns. */
export type QuestionDraft = Question extends infer Q
  ? Q extends Question
    ? Omit<Q, "id" | "version"> & DraftMeta
    : never
  : never;

/** What the export is given: a draft with its database id. */
export type ExportItem = QuestionDraft;

export interface ImportError {
  /** 1-based line in the file */
  line: number;
  kode: string;
  field?: string;
}

export interface ParsedItem {
  /** 0-based place among the questions of the file */
  index: number;
  /** Line of the opening `---` */
  line: number;
  title: string;
  /** The front matter's `id`, when it names a stored question */
  id?: number;
  draft: QuestionDraft | null;
  errors: ImportError[];
}

export interface ParseOptions {
  /** The stored question behind a front matter `id`, to keep its ids by position */
  stored?: (id: number) => Question | undefined;
}

/* -------------------------------------------------------------- id order */

/**
 * Every item id of a question in authored order. The parser makes ids in this
 * order, so a stored question's sequence is the pool an update draws from.
 */
export function idSequence(q: Question): string[] {
  switch (q.format) {
    case "single":
    case "multi":
      return q.body.options.map((o) => o.id);
    case "lines":
      return [];
    case "fix":
      return q.body.slots.flatMap((s) => s.options.map((o) => o.id));
    case "order":
      return [...q.answer.order];
    case "match": {
      const paired = q.body.left.map((l) => q.answer.pairs[l.id]).filter((x) => x !== undefined);
      const rest = q.body.right.map((r) => r.id).filter((id) => !paired.includes(id));
      return [...q.body.left.map((l) => l.id), ...paired, ...rest];
    }
    case "fitb":
      return [];
  }
}

/* ----------------------------------------------------------------- split */

const FENCE = /^\s*(`{3,}|~{3,})/;

interface Doc {
  start: number;
  yaml: string[];
  yamlStart: number;
  closed: boolean;
  body: string[];
  bodyStart: number;
}

/** The questions of a file, front matter and body apart, with their line numbers. */
function split(lines: string[]): { stray: number | null; docs: Doc[] } {
  const docs: Doc[] = [];
  let stray: number | null = null;
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === "---" && lines[i] === "---") {
      const d: Doc = {
        start: i + 1,
        yaml: [],
        yamlStart: i + 2,
        closed: false,
        body: [],
        bodyStart: 0,
      };
      i++;
      while (i < lines.length && lines[i] !== "---") d.yaml.push(lines[i++]);
      if (i < lines.length) {
        d.closed = true;
        i++;
      }
      d.bodyStart = i + 1;
      let fence: { ch: string; n: number } | null = null;
      while (i < lines.length) {
        const f = FENCE.exec(lines[i]);
        if (f) {
          const ch = f[1][0];
          const n = f[1].length;
          if (!fence) fence = { ch, n };
          else if (fence.ch === ch && n >= fence.n && lines[i].trim() === f[1]) fence = null;
        } else if (!fence && lines[i] === "---" && /^[A-Za-z_][\w-]*:/.test(lines[i + 1] ?? "")) {
          break;
        }
        d.body.push(lines[i++]);
      }
      docs.push(d);
    } else {
      if (stray === null && lines[i].trim() !== "") stray = i + 1;
      i++;
    }
  }
  return { stray, docs };
}

/* ---------------------------------------------------------------- helpers */

/** Every code fence in the bank is C; a fence that says cpp or c++ is read as C too. Anything else is plain text. */
const CODE_LANG: Record<string, CodeLang> = {
  c: "c",
  cpp: "c",
  "c++": "c",
  h: "c",
};
const codeLang = (info: string): CodeLang => CODE_LANG[info.trim().toLowerCase()] ?? "text";
const FENCE_LANG: Record<CodeLang, string> = { c: "c", text: "text" };

/** Blank lines at both ends of a block go. */
function trimBlock(xs: string[]): string[] {
  let a = 0;
  let b = xs.length;
  while (a < b && xs[a].trim() === "") a++;
  while (b > a && xs[b - 1].trim() === "") b--;
  return xs.slice(a, b);
}

interface Block {
  /** Prompt-side text before the fence */
  before: string[];
  info: string;
  code: string[];
  /** Lines after the closing fence */
  after: string[];
  /** Index of the opening fence in the body */
  at: number;
}

/** The first fenced block of a body, or null. */
function firstFence(body: string[]): Block | null {
  for (let i = 0; i < body.length; i++) {
    const f = FENCE.exec(body[i]);
    if (!f) continue;
    const info = body[i].trim().slice(f[1].length);
    const code: string[] = [];
    let j = i + 1;
    while (j < body.length) {
      const c = FENCE.exec(body[j]);
      if (c && c[1][0] === f[1][0] && c[1].length >= f[1].length && body[j].trim() === c[1]) break;
      code.push(body[j]);
      j++;
    }
    return { before: body.slice(0, i), info, code, after: body.slice(j + 1), at: i };
  }
  return null;
}

const TASK = /^- \[( |x|X)\] ?(.*)$/;

/** Splits off the last task list of a body: [prompt lines, the tasks]. */
function trailingTasks(body: string[]): { head: string[]; tasks: { on: boolean; text: string }[] } {
  const lines = [...body];
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  const tasks: { on: boolean; text: string }[] = [];
  while (lines.length) {
    const m = TASK.exec(lines[lines.length - 1]);
    if (!m) break;
    tasks.unshift({ on: m[1] !== " ", text: m[2] });
    lines.pop();
  }
  return { head: lines, tasks };
}

const promptOf = (xs: string[]) => trimBlock(xs).join("\n");

/** An id source: the stored question's ids first, fresh random ones after. */
function makeIds(pool: string[]) {
  const taken = new Set<string>();
  let k = 0;
  return () => {
    let id = pool[k++];
    while (id === undefined || taken.has(id)) id = newId();
    taken.add(id);
    return id;
  };
}

type Err = (kode: string, field?: string, line?: number) => void;

/* ----------------------------------------------------------- format parse */

interface Parsed {
  body: Question["body"];
  answer: Question["answer"];
}

interface Ctx {
  fm: Record<string, unknown>;
  body: string[];
  bodyStart: number;
  mk: () => string;
  err: Err;
  lang: Lang;
}

function parseChoice(c: Ctx, multi: boolean): Parsed | null {
  const { head, tasks } = trailingTasks(c.body);
  if (tasks.length === 0) {
    c.err("opsi_hilang", "body.options");
    return null;
  }
  const options: Item[] = tasks.map((t) => ({ id: c.mk(), text: t.text }));
  const right = options.filter((_, i) => tasks[i].on).map((o) => o.id);
  const body = {
    prompt: promptOf(head),
    options,
    shuffle: c.fm.shuffle === false ? false : true,
  };
  return multi
    ? { body, answer: { correct: right } }
    : { body, answer: { correct: right.length === 1 ? right[0] : "" } };
}

function codeBlock(c: Ctx, need = true) {
  const f = firstFence(c.body);
  if (!f && need) c.err("kode_hilang", "body.code");
  return f;
}

function numberList(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map((x) => (typeof x === "number" && Number.isInteger(x) ? x : NaN));
  return out.some(Number.isNaN) ? null : out;
}

function parseLines(c: Ctx): Parsed | null {
  const f = codeBlock(c);
  if (!f) return null;
  const bugs = numberList(c.fm.bugs);
  if (!bugs) c.err("kunci_salah", "answer.lines");
  return {
    body: { prompt: promptOf(f.before), code: { lang: codeLang(f.info), src: f.code.join("\n") } },
    answer: { lines: bugs ?? [] },
  };
}

function parseFix(c: Ctx): Parsed | null {
  const f = codeBlock(c);
  if (!f) return null;
  const slots: FixSlot[] = [];
  const picks: Record<number, string> = {};
  let cur: FixSlot | null = null;
  let any = false;
  for (const raw of f.after) {
    const h = /^###\s+(?:Baris|Line)\s+(\d+)\s*$/i.exec(raw);
    if (h) {
      cur = { line: Number(h[1]), options: [] };
      slots.push(cur);
      continue;
    }
    const m = TASK.exec(raw);
    if (!m || !cur) continue;
    const o = /^(`+)(.*)\1$/.exec(m[2]);
    if (!o) {
      c.err("opsi_salah", "body.slots");
      continue;
    }
    const id = c.mk();
    cur.options.push({ id, text: o[2] });
    if (m[1] !== " ") {
      if (picks[cur.line] !== undefined) c.err("kunci_salah", "answer.picks");
      picks[cur.line] = id;
    }
    any = true;
  }
  if (!any) c.err("slot_hilang", "body.slots");
  return {
    body: {
      prompt: promptOf(f.before),
      code: { lang: codeLang(f.info), src: f.code.join("\n") },
      slots,
    },
    answer: { picks },
  };
}

function parseOrder(c: Ctx): Parsed | null {
  const f = codeBlock(c);
  if (!f) return null;
  const kept = f.code.filter((l) => l.trim() !== "");
  const lines: Item[] = kept.map((text) => ({ id: c.mk(), text }));
  const order = lines.map((l) => l.id);
  const alsoRaw = c.fm.also;
  const also: string[][] = [];
  if (alsoRaw !== undefined) {
    if (!Array.isArray(alsoRaw)) c.err("kunci_salah", "answer.also");
    else
      for (const o of alsoRaw) {
        const ns = numberList(o);
        if (!ns || ns.some((n) => n < 1 || n > order.length)) {
          c.err("kunci_salah", "answer.also");
          continue;
        }
        also.push(ns.map((n) => order[n - 1]));
      }
  }
  return {
    body: {
      prompt: promptOf(f.before),
      lang: codeLang(f.info),
      lines: [...lines].sort((a, b) => (a.id < b.id ? -1 : 1)),
    },
    answer: { order, also },
  };
}

/** Cells of a table row; `\|` is a pipe inside a cell. */
function cells(row: string): string[] {
  const t = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "\\" && t[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (t[i] === "|") {
      out.push(cur.trim());
      cur = "";
    } else cur += t[i];
  }
  out.push(cur.trim());
  return out;
}

function parseMatch(c: Ctx): Parsed | null {
  const at = c.body.findIndex((l) => l.trimStart().startsWith("|"));
  if (at < 0) {
    c.err("tabel_hilang", "body.left");
    return null;
  }
  const rows: string[] = [];
  let j = at;
  while (j < c.body.length && c.body[j].trimStart().startsWith("|")) rows.push(c.body[j++]);
  const data = rows
    .slice(1)
    .filter((r) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(r))
    .map(cells);
  const left: Item[] = [];
  const pairedRight: Item[] = [];
  const spare: Item[] = [];
  const pairs: Record<string, string> = {};
  // Ids are made lefts first, then paired rights, then spares (idSequence).
  const lefts = data.filter((r) => r[0] !== "");
  const lids = lefts.map(() => c.mk());
  const rids = lefts.map(() => c.mk());
  lefts.forEach((r, i) => {
    left.push({ id: lids[i], text: r[0] });
    pairedRight.push({ id: rids[i], text: r[1] ?? "" });
    pairs[lids[i]] = rids[i];
  });
  for (const r of data)
    if (r[0] === "" && (r[1] ?? "") !== "") spare.push({ id: c.mk(), text: r[1] });
  if (data.some((r) => r.length !== 2)) c.err("tabel_salah", "body.left");
  return {
    body: { prompt: promptOf(c.body.slice(0, at)), left, right: [...pairedRight, ...spare] },
    answer: { pairs },
  };
}

const SPACES = ["exact", "trim", "collapse", "none"];

function parseFitb(c: Ctx): Parsed | null {
  const f = firstFence(c.body);
  const raw = c.fm.blanks;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    c.err("celah_salah", "body.blanks");
    return null;
  }
  const blanks: Blank[] = [];
  const key: Record<number, BlankKey> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(k);
    const o = (v ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(n) || typeof o !== "object") {
      c.err("celah_salah", "body.blanks");
      continue;
    }
    const accept = (Array.isArray(o.accept) ? o.accept : o.accept === undefined ? [] : [o.accept])
      .filter((a) => typeof a === "string" || typeof a === "number")
      .map(String);
    const b: Blank = { n };
    if (o.width !== undefined) b.width = Number(o.width);
    if (typeof o.hint === "string") b.hint = o.hint;
    blanks.push(b);
    const bk: BlankKey = { accept };
    if (o.case === "exact" || o.case === "ignore") bk.case = o.case;
    else if (o.case !== undefined) c.err("kunci_salah", "answer.blanks");
    if (typeof o.space === "string" && SPACES.includes(o.space))
      bk.space = o.space as BlankKey["space"];
    else if (o.space !== undefined) c.err("kunci_salah", "answer.blanks");
    key[n] = bk;
  }
  blanks.sort((a, b) => a.n - b.n);
  const body: Question["body"] = f
    ? {
        prompt: promptOf(f.before.concat(f.after)),
        code: { lang: codeLang(f.info), src: f.code.join("\n") },
        blanks,
      }
    : { prompt: promptOf(c.body), blanks };
  return { body, answer: { blanks: key } };
}

const PARSERS: Record<Format, (c: Ctx) => Parsed | null> = {
  single: (c) => parseChoice(c, false),
  multi: (c) => parseChoice(c, true),
  lines: parseLines,
  fix: parseFix,
  order: parseOrder,
  match: parseMatch,
  fitb: parseFitb,
};

/* ------------------------------------------------------------------ parse */

const IMG = /!\[[^\]]*\]\(img:([A-Za-z0-9_-]+)\)/g;

function images(c: Ctx, body: Question["body"]) {
  const raw = c.fm.images;
  const list: Image[] = [];
  if (raw !== undefined) {
    if (!Array.isArray(raw)) c.err("gambar_salah", "body.images");
    else
      for (const r of raw as Record<string, unknown>[]) {
        if (
          !r ||
          typeof r.id !== "string" ||
          typeof r.key !== "string" ||
          typeof r.alt !== "string" ||
          !Number.isFinite(Number(r.w)) ||
          !Number.isFinite(Number(r.h))
        )
          c.err("gambar_salah", "body.images");
        else list.push({ id: r.id, key: r.key, alt: r.alt, w: Number(r.w), h: Number(r.h) });
      }
  }
  const used = [...body.prompt.matchAll(IMG)].map((m) => m[1]);
  for (const id of used) if (!list.some((i) => i.id === id)) c.err("gambar_hilang", "body.images");
  if (list.length) body.images = list;
}

const STR = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function one(doc: Doc, index: number, opt: ParseOptions): ParsedItem {
  const errors: ImportError[] = [];
  const at = (kode: string, field?: string, line = doc.start) => errors.push({ line, kode, field });
  const item: ParsedItem = { index, line: doc.start, title: "", draft: null, errors };
  if (!doc.closed) {
    at("front_matter_terbuka");
    return item;
  }
  const y = parseDocument(doc.yaml.join("\n"), { prettyErrors: false });
  if (y.errors.length) {
    const e = y.errors[0];
    const row = e.linePos?.[0]?.line ?? 1;
    at("yaml_salah", undefined, doc.yamlStart + row - 1);
    return item;
  }
  const fm = (y.toJS() ?? {}) as Record<string, unknown>;
  if (typeof fm !== "object" || Array.isArray(fm)) {
    at("yaml_salah", undefined, doc.yamlStart);
    return item;
  }
  item.title = STR(fm.title);
  if (item.title === "") at("judul_kosong", "title");
  const part = STR(fm.part);
  const lang = STR(fm.lang);
  const format = STR(fm.format);
  if (!(PHASE1_PARTS as readonly string[]).includes(part)) at("part_salah", "part");
  if (!(LANGS as readonly string[]).includes(lang)) at("bahasa_salah", "lang");
  if (!(FORMATS as readonly string[]).includes(format)) at("format_salah", "format");
  const status = fm.status === undefined ? "draft" : STR(fm.status);
  if (status !== "draft" && status !== "ready") at("status_salah", "status");
  let id: number | undefined;
  if (fm.id !== undefined) {
    if (typeof fm.id === "number" && Number.isInteger(fm.id) && fm.id > 0) id = fm.id;
    else at("id_salah", "id");
  }
  item.id = id;
  if (errors.some((e) => ["part_salah", "bahasa_salah", "format_salah"].includes(e.kode)))
    return item;

  const stored = id !== undefined ? opt.stored?.(id) : undefined;
  const c: Ctx = {
    fm,
    body: doc.body,
    bodyStart: doc.bodyStart,
    mk: makeIds(stored && stored.format === format ? idSequence(stored) : []),
    err: (kode, field, line) => at(kode, field, line ?? doc.bodyStart),
    lang: lang as Lang,
  };
  const p = PARSERS[format as Format](c);
  if (!p) return item;
  images(c, p.body);
  const draft = {
    ...(id !== undefined ? { id } : {}),
    part: part as Phase1Part,
    lang: lang as Lang,
    format: format as Format,
    title: item.title,
    status: status as Status,
    sample: fm.sample === true,
    body: p.body,
    answer: p.answer,
  } as QuestionDraft;
  const q = { id: id ?? 0, version: 1, ...draft } as unknown as Question;
  for (const e of validateQuestion(q) as FieldError[]) at(e.kode, e.field, doc.bodyStart);
  if (errors.length === 0) item.draft = draft;
  return item;
}

/** Every question of a file, with the errors that keep it from being saved. */
export function parseBank(text: string, opt: ParseOptions = {}): ParsedItem[] {
  const lines = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const { stray, docs } = split(lines);
  const items = docs.map((d, i) => one(d, i + (stray !== null ? 1 : 0), opt));
  if (stray !== null)
    items.unshift({
      index: 0,
      line: stray,
      title: "",
      draft: null,
      errors: [{ line: stray, kode: "teks_di_luar" }],
    });
  return items;
}

/* ------------------------------------------------------------------ write */

/** A scalar as YAML wants it. */
function scalar(v: string | number | boolean): string {
  if (typeof v !== "string") return String(v);
  return /^[A-Za-z0-9_./][A-Za-z0-9 _./()+-]*$/.test(v) &&
    !/^(true|false|null|yes|no|on|off|~|-?\d[\d.e+-]*)$/i.test(v) &&
    !/\s$/.test(v)
    ? v
    : JSON.stringify(v);
}
const flow = (v: unknown): string => JSON.stringify(v).replace(/,/g, ", ");
/** JSON with the comma spacing only between items, never inside a string. */
function flowList(xs: unknown[]): string {
  return `[${xs.map((x) => JSON.stringify(x)).join(", ")}]`;
}

/** A fence long enough to hold the text. */
function fenced(info: string, src: string): string[] {
  let n = 3;
  for (const m of src.matchAll(/`{3,}/g)) n = Math.max(n, m[0].length + 1);
  const f = "`".repeat(n);
  return [f + info, ...src.split("\n"), f];
}

/** Backticks around a whole line, long enough not to meet its own. */
function inlineCode(text: string): string {
  let n = 1;
  for (const m of text.matchAll(/`+/g)) n = Math.max(n, m[0].length + 1);
  const f = "`".repeat(n);
  return f + text + f;
}

const cell = (s: string) => s.replace(/\|/g, "\\|");

function writeBody(q: ExportItem): string[] {
  const out: string[] = [];
  const prompt = (p: string) => {
    if (p !== "") out.push(...p.split("\n"), "");
  };
  switch (q.format) {
    case "single": {
      const b = q.body as { prompt: string; options: Item[] };
      prompt(b.prompt);
      const a = q.answer as { correct: string };
      for (const o of b.options) out.push(`- [${o.id === a.correct ? "x" : " "}] ${o.text}`);
      break;
    }
    case "multi": {
      const b = q.body as { prompt: string; options: Item[] };
      prompt(b.prompt);
      const a = q.answer as { correct: string[] };
      for (const o of b.options) out.push(`- [${a.correct.includes(o.id) ? "x" : " "}] ${o.text}`);
      break;
    }
    case "lines": {
      const b = q.body as { prompt: string; code: { lang: CodeLang; src: string } };
      prompt(b.prompt);
      out.push(...fenced(FENCE_LANG[b.code.lang], b.code.src));
      break;
    }
    case "fix": {
      const b = q.body as {
        prompt: string;
        code: { lang: CodeLang; src: string };
        slots: FixSlot[];
      };
      const a = q.answer as { picks: Record<number, string> };
      prompt(b.prompt);
      out.push(...fenced(FENCE_LANG[b.code.lang], b.code.src));
      for (const s of b.slots) {
        out.push("", `### Baris ${s.line}`);
        for (const o of s.options)
          out.push(`- [${a.picks[s.line] === o.id ? "x" : " "}] ${inlineCode(o.text)}`);
      }
      break;
    }
    case "order": {
      const b = q.body as { prompt: string; lang: CodeLang; lines: Item[] };
      const a = q.answer as { order: string[] };
      prompt(b.prompt);
      const text = new Map(b.lines.map((l) => [l.id, l.text]));
      out.push(...fenced(FENCE_LANG[b.lang], a.order.map((id) => text.get(id) ?? "").join("\n")));
      break;
    }
    case "match": {
      const b = q.body as { prompt: string; left: Item[]; right: Item[] };
      const a = q.answer as { pairs: Record<string, string> };
      prompt(b.prompt);
      const right = new Map(b.right.map((r) => [r.id, r.text]));
      const paired = new Set(Object.values(a.pairs));
      out.push("| Kiri | Kanan |", "|---|---|");
      for (const l of b.left)
        out.push(`| ${cell(l.text)} | ${cell(right.get(a.pairs[l.id]) ?? "")} |`);
      for (const r of b.right) if (!paired.has(r.id)) out.push(`|  | ${cell(r.text)} |`);
      break;
    }
    case "fitb": {
      const b = q.body as { prompt: string; code?: { lang: CodeLang; src: string } };
      prompt(b.prompt);
      if (b.code) out.push(...fenced(FENCE_LANG[b.code.lang], b.code.src));
      break;
    }
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

function writeFront(q: ExportItem): string[] {
  const y: string[] = [];
  if (q.id !== undefined) y.push(`id: ${q.id}`);
  y.push(`part: ${q.part}`, `lang: ${q.lang}`, `format: ${q.format}`, `status: ${q.status}`);
  y.push(`title: ${scalar(q.title)}`);
  if (q.sample) y.push("sample: true");
  if (
    (q.format === "single" || q.format === "multi") &&
    (q.body as { shuffle: boolean }).shuffle === false
  )
    y.push("shuffle: false");
  if (q.format === "lines") y.push(`bugs: ${flow((q.answer as { lines: number[] }).lines)}`);
  if (q.format === "order") {
    const a = q.answer as { order: string[]; also: string[][] };
    if (a.also.length)
      y.push(
        `also: [${a.also.map((o) => flow(o.map((id) => a.order.indexOf(id) + 1))).join(", ")}]`,
      );
  }
  if (q.format === "fitb") {
    const b = q.body as { blanks: Blank[] };
    const a = q.answer as { blanks: Record<number, BlankKey> };
    y.push("blanks:");
    for (const bl of b.blanks) {
      const k = a.blanks[bl.n];
      const parts = [`accept: ${flowList(k?.accept ?? [])}`];
      if (k?.case) parts.push(`case: ${k.case}`);
      if (k?.space) parts.push(`space: ${k.space}`);
      if (bl.width !== undefined) parts.push(`width: ${bl.width}`);
      if (bl.hint !== undefined) parts.push(`hint: ${JSON.stringify(bl.hint)}`);
      y.push(`  ${bl.n}: { ${parts.join(", ")} }`);
    }
  }
  const imgs = (q.body as { images?: Image[] }).images;
  if (imgs?.length) {
    y.push("images:");
    for (const i of imgs)
      y.push(
        `  - { id: ${scalar(i.id)}, key: ${scalar(i.key)}, alt: ${JSON.stringify(i.alt)}, w: ${i.w}, h: ${i.h} }`,
      );
  }
  return y;
}

/** The file for these questions; `parseBank` reads back what this writes. */
export function writeBank(items: ExportItem[]): string {
  const out: string[] = [];
  for (const q of items) {
    if (out.length) out.push("");
    out.push("---", ...writeFront(q), "---", ...writeBody(q));
  }
  return out.join("\n") + "\n";
}
