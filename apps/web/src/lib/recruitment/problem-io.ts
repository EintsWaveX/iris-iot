/**
 * The Live Coding bank's Markdown + YAML file (6 Nov 2026), the twin of bank-io.ts for the C problems.
 * Pure and browser safe: the dry run, the apply and the export all go through here.
 *
 * One UTF-8 file holds any number of problems. Each starts with a YAML front matter between two `---`
 * lines (`title`, `tier`, and optionally `id`, `status`, `points`, `time` in ms, `memory` in KB), then
 * the body is cut into sections by `## ` headings that are outside a code fence:
 *
 *   ## Soal            the statement (Markdown)           ## Soal (EN)   optional English text
 *   ## Input           what the program reads             ## Input (EN)
 *   ## Output          what the program prints            ## Output (EN)
 *   ## Kode Awal       the starter code, one fence        (left out: the default starter)
 *   ## Contoh          `### Input` / `### Output` fences, repeated for each sample
 *   ## Test            the same, for the hidden tests
 *   ## Reference Solution   the correct program, one fence
 *
 * A `---` line starts the next problem only when a `key:` line follows it and never inside a code fence.
 * A code fence holds the text exactly, except that the last line break is left out; the reader puts it
 * back, so "3 5\n" survives the round trip. A problem with an `id` updates that stored problem.
 */
import { parseDocument } from "yaml";
import { TIERS, type Tier } from "./exam-types.js";
import { C_LIMITS, DEFAULT_STARTER, type CProblemDraft, type CProblemText } from "./c-problem.js";

export type ProblemStatus = "draft" | "ready";

/** A problem as the file says it. */
export interface ProblemFileItem extends CProblemDraft {
  id?: number;
  status: ProblemStatus;
}

export interface ProblemFileError {
  /** 1-based line in the file */
  line: number;
  kode: string;
  field?: string;
  detail?: string;
}

export interface ParsedProblem {
  /** 1-based place among the problems of the file */
  index: number;
  /** Line of the opening `---` */
  line: number;
  title: string;
  id?: number;
  status: ProblemStatus;
  draft: CProblemDraft | null;
  errors: ProblemFileError[];
}

/* ----------------------------------------------------------------- split */

const FENCE = /^\s*(`{3,}|~{3,})/;

interface Doc {
  start: number;
  yaml: string[];
  yamlStart: number;
  body: string[];
  bodyStart: number;
  closed: boolean;
}

function split(lines: string[]): Doc[] {
  const docs: Doc[] = [];
  let cur: Doc | null = null;
  let state: "yaml" | "body" = "body";
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (state === "yaml") {
      if (line.trim() === "---") {
        state = "body";
        cur!.closed = true;
        cur!.bodyStart = i + 2;
      } else cur!.yaml.push(line);
      continue;
    }
    const f = FENCE.exec(line);
    if (f) {
      if (fence === null) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1])
        fence = null;
    }
    if (
      fence === null &&
      !f &&
      line.trim() === "---" &&
      /^[A-Za-z_]+\s*:/.test(lines[i + 1] ?? "")
    ) {
      cur = { start: i + 1, yaml: [], yamlStart: i + 2, body: [], bodyStart: i + 2, closed: false };
      docs.push(cur);
      state = "yaml";
      continue;
    }
    if (cur) cur.body.push(line);
  }
  return docs;
}

/* -------------------------------------------------------------- sections */

type Section =
  | "statement"
  | "input"
  | "output"
  | "statementEn"
  | "inputEn"
  | "outputEn"
  | "starter"
  | "samples"
  | "tests"
  | "reference";

const NAMES: Record<string, Section> = {
  soal: "statement",
  statement: "statement",
  input: "input",
  output: "output",
  "soal (en)": "statementEn",
  "statement (en)": "statementEn",
  "input (en)": "inputEn",
  "output (en)": "outputEn",
  "kode awal": "starter",
  starter: "starter",
  contoh: "samples",
  samples: "samples",
  test: "tests",
  tests: "tests",
  "reference solution": "reference",
  reference: "reference",
};

interface Block {
  /** line of the heading, 1-based */
  line: number;
  lines: { text: string; n: number }[];
}

/** The text of a fence: its lines, with the last line break put back when there is any text. */
function fenceText(rows: string[]): string {
  return rows.length ? rows.join("\n") + "\n" : "";
}

/** Every top-level fence of a block (language tag ignored), outside nothing else matters. */
function fences(b: Block, onHeading?: (h: string, n: number) => void) {
  const out: { text: string; n: number; under: string }[] = [];
  let fence: string | null = null;
  let rows: string[] = [];
  let at = 0;
  let under = "";
  for (const { text, n } of b.lines) {
    const f = FENCE.exec(text);
    if (fence === null) {
      if (f) {
        fence = f[1];
        rows = [];
        at = n;
      } else {
        const h = /^###\s+(.+?)\s*$/.exec(text);
        if (h) {
          under = h[1].toLowerCase();
          onHeading?.(under, n);
        }
      }
    } else if (f && f[1][0] === fence[0] && f[1].length >= fence.length && text.trim() === f[1]) {
      out.push({ text: fenceText(rows), n: at, under });
      fence = null;
    } else rows.push(text);
  }
  return out;
}

/* ----------------------------------------------------------------- parse */

const TIER_WORDS: Record<string, Tier> = {
  easy: "easy",
  mudah: "easy",
  medium: "medium",
  sedang: "medium",
  hard: "hard",
  susah: "hard",
  sulit: "hard",
};

function toInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
}

/** Cuts a body into its known sections; text before the first one is ignored. */
function sections(doc: Doc): Map<Section, Block> {
  const out = new Map<Section, Block>();
  let cur: Block | null = null;
  let fence: string | null = null;
  doc.body.forEach((text, i) => {
    const n = doc.bodyStart + i;
    const f = FENCE.exec(text);
    if (f) {
      if (fence === null) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && text.trim() === f[1])
        fence = null;
    }
    if (fence === null && !f) {
      const h = /^##\s+(.+?)\s*$/.exec(text);
      const sec = h ? NAMES[h[1].toLowerCase()] : undefined;
      if (sec && !out.has(sec)) {
        cur = { line: n, lines: [] };
        out.set(sec, cur);
        return;
      }
    }
    cur?.lines.push({ text, n });
  });
  return out;
}

const proseOf = (b: Block | undefined) =>
  b
    ? b.lines
        .map((l) => l.text)
        .join("\n")
        .trim()
    : "";

export function parseProblems(text: string): ParsedProblem[] {
  const lines = text.replace(/^﻿/, "").split(/\r\n?|\n/);
  return split(lines).map((doc, k): ParsedProblem => {
    const errors: ProblemFileError[] = [];
    const err = (line: number, kode: string, field?: string, detail?: string) =>
      errors.push({ line, kode, ...(field ? { field } : {}), ...(detail ? { detail } : {}) });
    const base = { index: k + 1, line: doc.start };
    if (!doc.closed) {
      err(doc.start, "front_matter_salah", undefined, "---");
      return { ...base, title: "", status: "draft", draft: null, errors };
    }
    const y = parseDocument(doc.yaml.join("\n"));
    const meta = y.errors.length ? null : y.toJS();
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      err(doc.yamlStart, "front_matter_salah");
      return { ...base, title: "", status: "draft", draft: null, errors };
    }
    const m = meta as Record<string, unknown>;
    const title =
      typeof m.title === "string" ? m.title.trim() : m.title == null ? "" : String(m.title);
    const id = m.id === undefined || m.id === null ? undefined : (toInt(m.id) ?? undefined);
    if (m.id !== undefined && m.id !== null && (id === undefined || id < 1))
      err(doc.yamlStart, "id_salah", "id");
    const tier = TIER_WORDS[String(m.tier ?? "").toLowerCase()];
    if (!tier || !(TIERS as readonly string[]).includes(tier))
      err(doc.yamlStart, "tingkat_salah", "tier");
    const status: ProblemStatus = m.status === "ready" ? "ready" : "draft";
    if (m.status !== undefined && m.status !== "ready" && m.status !== "draft")
      err(doc.yamlStart, "status_salah", "status");
    let points: number | undefined;
    if (m.points !== undefined && m.points !== null) {
      const p = toInt(m.points);
      if (p === null) err(doc.yamlStart, "poin_salah", "points");
      else points = p;
    }
    const timeMs = m.time === undefined ? C_LIMITS.timeMs.def : toInt(m.time);
    if (timeMs === null) err(doc.yamlStart, "batas_salah", "time");
    const memKb = m.memory === undefined ? C_LIMITS.memKb.def : toInt(m.memory);
    if (memKb === null) err(doc.yamlStart, "batas_salah", "memory");

    const sec = sections(doc);
    const need = (s: Section, name: string) => {
      const b = sec.get(s);
      if (!b || !proseOf(b)) err(b?.line ?? doc.bodyStart, "bagian_kosong", undefined, name);
      return proseOf(b);
    };
    const statement = need("statement", "Soal");
    const input = need("input", "Input");
    const output = need("output", "Output");
    const code = (s: Section, name: string, required: boolean): string | null => {
      const b = sec.get(s);
      if (!b) {
        if (required) err(doc.bodyStart, "bagian_kosong", undefined, name);
        return null;
      }
      const f = fences(b);
      if (f.length !== 1) {
        err(b.line, "kode_salah", undefined, name);
        return null;
      }
      return f[0].text;
    };
    const starter = code("starter", "Kode Awal", false) ?? DEFAULT_STARTER;
    const reference = code("reference", "Reference Solution", true);
    const ios = (s: Section, name: string) => {
      const b = sec.get(s);
      if (!b) {
        err(doc.bodyStart, "bagian_kosong", undefined, name);
        return null;
      }
      const items: { input: string; output: string }[] = [];
      let wantOut = false;
      let bad = false;
      for (const f of fences(b)) {
        if (f.under === "input") {
          if (wantOut) {
            err(f.n, "io_salah", undefined, name);
            bad = true;
          }
          items.push({ input: f.text, output: "" });
          wantOut = true;
        } else if (f.under === "output" && wantOut) {
          items[items.length - 1].output = f.text;
          wantOut = false;
        } else {
          err(f.n, "io_salah", undefined, name);
          bad = true;
        }
      }
      if (wantOut || (!items.length && !bad)) err(b.line, "io_salah", undefined, name);
      return items;
    };
    const samples = ios("samples", "Contoh");
    const tests = ios("tests", "Test");

    let en: CProblemText | undefined;
    const enParts = (["statementEn", "inputEn", "outputEn"] as const).map((s) =>
      proseOf(sec.get(s)),
    );
    if (enParts.some((p) => p)) {
      if (enParts.every((p) => p))
        en = { statement: enParts[0], input: enParts[1], output: enParts[2] };
      else err(sec.get("statementEn")?.line ?? doc.bodyStart, "en_tidak_lengkap");
    }

    if (
      errors.length ||
      !tier ||
      timeMs === null ||
      memKb === null ||
      !samples ||
      !tests ||
      reference === null
    )
      return { ...base, title, ...(id ? { id } : {}), status, draft: null, errors };
    return {
      ...base,
      title,
      ...(id ? { id } : {}),
      status,
      errors,
      draft: {
        title,
        tier,
        body: {
          statement,
          input,
          output,
          ...(en ? { en } : {}),
          starter,
          ...(points !== undefined ? { points } : {}),
        },
        limits: { timeMs, memKb },
        samples,
        tests,
        reference,
      },
    };
  });
}

/* ----------------------------------------------------------------- write */

/** A fence that cannot be closed by the text inside it; the last line break is left to the reader. */
function fenced(s: string, lang = ""): string {
  const run = Math.max(2, ...(s.match(/`+/g) ?? []).map((x) => x.length));
  const f = "`".repeat(run + 1);
  const inner = s === "" ? "" : s.replace(/\n$/, "");
  return s === "" ? `${f}${lang}\n${f}` : `${f}${lang}\n${inner}\n${f}`;
}

function yamlValue(s: string): string {
  return /^[A-Za-z0-9 .,()\-_/]+$/.test(s) &&
    !/^\s|\s$/.test(s) &&
    !/^(true|false|null|yes|no|\d+)$/i.test(s)
    ? s
    : JSON.stringify(s);
}

export function writeProblems(items: ProblemFileItem[]): string {
  return items
    .map((p) => {
      const head = [
        "---",
        ...(p.id !== undefined ? [`id: ${p.id}`] : []),
        `title: ${yamlValue(p.title)}`,
        `tier: ${p.tier}`,
        `status: ${p.status}`,
        ...(p.body.points !== undefined ? [`points: ${p.body.points}`] : []),
        `time: ${p.limits.timeMs}`,
        `memory: ${p.limits.memKb}`,
        "---",
      ];
      const io = (name: string, rows: { input: string; output: string }[]) => [
        `## ${name}`,
        "",
        ...rows.flatMap((r) => [
          "### Input",
          "",
          fenced(r.input),
          "",
          "### Output",
          "",
          fenced(r.output),
          "",
        ]),
      ];
      const en = p.body.en
        ? [
            "## Soal (EN)",
            "",
            p.body.en.statement.trim(),
            "",
            "## Input (EN)",
            "",
            p.body.en.input.trim(),
            "",
            "## Output (EN)",
            "",
            p.body.en.output.trim(),
            "",
          ]
        : [];
      return [
        ...head,
        "",
        "## Soal",
        "",
        p.body.statement.trim(),
        "",
        "## Input",
        "",
        p.body.input.trim(),
        "",
        "## Output",
        "",
        p.body.output.trim(),
        "",
        ...en,
        "## Kode Awal",
        "",
        fenced(p.body.starter, "c"),
        "",
        ...io("Contoh", p.samples),
        ...io("Test", p.tests),
        "## Reference Solution",
        "",
        fenced(p.reference, "c"),
        "",
      ].join("\n");
    })
    .join("\n");
}
