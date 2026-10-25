/**
 * The question editor's working copy (prompt 09, mockup r3-bank): a draft is
 * a question that may not be valid yet. These are the pure parts of the
 * editor: empty drafts per format, changing the format, keeping the blanks
 * of a fill-in question in step with its code, the problems validateQuestion
 * finds, the preview a candidate would get, and the body of question-save.
 */
import type {
  Blank,
  Code,
  CodeLang,
  FieldError,
  Format,
  Image,
  Item,
  Lang,
  Phase1Part,
  Question,
  Rng,
  View,
} from "./exam-types";
import { rngFrom } from "./draw";
import { makePerm, newId, structureKey, toView, validateQuestion } from "./formats";
import { canon } from "./bank-rules";
import type { QuestionFull } from "./bank-api";

type DraftOf<Q extends Question> = {
  id: number | null;
  version: number;
  part: Phase1Part;
  lang: Lang;
  title: string;
  status: "draft" | "ready";
  refIds: number[];
  format: Q["format"];
  body: Q["body"];
  answer: Q["answer"];
};
export type Draft = Question extends infer Q ? (Q extends Question ? DraftOf<Q> : never) : never;

/** The code language a new code area starts with: the question's own, C++ for a part that takes either */
export const codeLangOf = (lang: Lang): CodeLang => (lang === "py" ? "py" : "cpp");

/** A fresh id not in `taken`; the editor adds it to `taken` itself */
export function freshId(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (;;) {
    const id = newId();
    if (!used.has(id)) return id;
  }
}

/** `n` empty items with ids that differ from each other and from everything in `taken` (which grows) */
const items = (n: number, taken: string[] = []): Item[] => {
  const out: Item[] = [];
  for (let i = 0; i < n; i++) {
    const id = freshId(taken);
    taken.push(id);
    out.push({ id, text: "" });
  }
  return out;
};

/** The body and key a format starts with. Not valid until the person fills it in. */
export function starter(format: Format, lang: Lang): Pick<Draft, "format" | "body" | "answer"> {
  const code: Code = { lang: codeLangOf(lang), src: "" };
  switch (format) {
    case "single": {
      const options = items(4);
      return {
        format,
        body: { prompt: "", options, shuffle: true },
        answer: { correct: options[0].id },
      };
    }
    case "multi": {
      const options = items(4);
      return {
        format,
        body: { prompt: "", options, shuffle: true },
        answer: { correct: [options[0].id] },
      };
    }
    case "lines":
      return { format, body: { prompt: "", code }, answer: { lines: [] } };
    case "fix":
      return { format, body: { prompt: "", code, slots: [] }, answer: { picks: {} } };
    case "order": {
      const lines = items(3);
      return {
        format,
        body: { prompt: "", lang: code.lang, lines },
        answer: { order: lines.map((l) => l.id), also: [] },
      };
    }
    case "match": {
      const taken: string[] = [];
      const left = items(3, taken);
      const right = items(3, taken);
      return {
        format,
        body: { prompt: "", left, right },
        answer: { pairs: Object.fromEntries(left.map((l, i) => [l.id, right[i].id])) },
      };
    }
    case "fitb":
      return { format, body: { prompt: "", code, blanks: [] }, answer: { blanks: {} } };
  }
}

export function blankDraft(part: Phase1Part, lang: Lang, format: Format = "single"): Draft {
  return {
    id: null,
    version: 1,
    part,
    lang,
    title: "",
    status: "draft",
    refIds: [],
    ...starter(format, lang),
  } as Draft;
}

/** What the person started from: an existing question as the editor holds it */
export function fromFull(q: QuestionFull): Draft {
  return {
    id: q.id,
    version: q.version,
    part: q.part,
    lang: q.lang,
    title: q.title,
    status: q.status,
    refIds: [...q.refIds],
    format: q.format,
    body: structuredClone(q.body),
    answer: structuredClone(q.answer),
  } as Draft;
}

/** Another format for a question nobody has seen yet: the prompt and the pictures stay, the rest starts over */
export function changeFormat(d: Draft, format: Format): Draft {
  if (d.format === format) return d;
  const s = starter(format, d.lang);
  const keep = { prompt: d.body.prompt, ...(d.body.images ? { images: d.body.images } : {}) };
  return { ...d, ...s, body: { ...s.body, ...keep } } as Draft;
}

/** The question the validator and the preview take; an unsaved draft has id 0 */
export const toQuestion = (d: Draft): Question =>
  ({
    id: d.id ?? 0,
    version: d.version,
    part: d.part,
    lang: d.lang,
    format: d.format,
    body: d.body,
    answer: d.answer,
  }) as Question;

/** Every rule of EXAM-ENGINE 1.3 plus a title, as `{ field, kode }` */
export function problems(d: Draft): FieldError[] {
  const errs: FieldError[] = [];
  if (d.title.trim() === "") errs.push({ field: "title", kode: "judul_kosong" });
  errs.push(...validateQuestion(toQuestion(d)));
  return errs;
}

/** The key alone, so a change of it can be told from a change of text */
export const keySig = (d: Pick<Draft, "answer">): string => canon(d.answer);

/** True when the structure (ids, line and blank counts) differs from `old`; refused once a question was shown */
export function structureChanged(old: Draft, d: Draft): boolean {
  return structureKey(toQuestion(old)) !== structureKey(toQuestion(d));
}

const BLANK_RE = /_{2,}\((\d+)\)_{2,}/g;

/** The blank numbers written in a text, in order of appearance, once each */
export function blankNumbers(text: string): number[] {
  const seen: number[] = [];
  for (const m of text.matchAll(BLANK_RE)) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}

/**
 * A fill-in question's blanks follow its code: one entry (with its key) for
 * each `__(n)__` written in the prompt or the code. A blank that was written
 * keeps its width, hint and accepted answers; one that is gone is dropped.
 */
export function syncBlanks(d: Draft): Draft {
  if (d.format !== "fitb") return d;
  const nums = blankNumbers(`${d.body.prompt}\n${d.body.code?.src ?? ""}`).sort((a, b) => a - b);
  const old = new Map(d.body.blanks.map((b) => [b.n, b]));
  const blanks: Blank[] = nums.map((n) => old.get(n) ?? { n });
  const keys = Object.fromEntries(nums.map((n) => [n, d.answer.blanks[n] ?? { accept: [] }]));
  if (canon(blanks) === canon(d.body.blanks) && canon(keys) === canon(d.answer.blanks)) return d;
  return { ...d, body: { ...d.body, blanks }, answer: { blanks: keys } };
}

/** The preview's shuffle for one made-up seat; the same number always gives the same order */
export const previewRng = (seat: number): Rng => rngFrom("", "bank-preview", seat);

/** What a candidate would see, or null while the draft cannot be shown yet */
export function previewOf(d: Draft, seat: number): View | null {
  if (validateQuestion(toQuestion(d)).length) return null;
  try {
    const q = toQuestion(d);
    return toView(q, makePerm(q, previewRng(seat)));
  } catch {
    return null;
  }
}

/** The body of question-save. `note` is for a key fix of a question that was shown. */
export function savePayload(d: Draft, note?: string) {
  return {
    ...(d.id === null ? {} : { id: d.id, version: d.version }),
    part: d.part,
    lang: d.lang,
    format: d.format,
    title: d.title.trim(),
    status: d.status,
    body: d.body,
    answer: d.answer,
    refs: d.refIds,
    ...(note?.trim() ? { note: note.trim() } : {}),
  };
}

/* ---------------------------------------------------------------- lists */

/** Moves the item at `i` one place (-1 up, +1 down); the same array when it cannot move */
export function moved<T>(xs: readonly T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= xs.length) return [...xs];
  const out = [...xs];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** The text of a code area as numbered lines, as the candidate's page numbers them */
export const codeLines = (src: string): string[] => src.split("\n");

/* -------------------------------------------------------------- pictures */

/** Pictures the prompt names but the question does not list, and listed ones the prompt never uses */
export function imageUse(prompt: string, images: readonly Image[]) {
  const used = new Set([...prompt.matchAll(/!\[[^\]]*\]\(img:([a-z0-9]+)\)/g)].map((m) => m[1]));
  return {
    missing: [...used].filter((id) => !images.some((i) => i.id === id)),
    unused: images.filter((i) => !used.has(i.id)).map((i) => i.id),
  };
}

/* ------------------------------------------------------------------- key */

/** The key in a line of words, for the before and after of a key fix */
export function keySummary(d: Draft): string {
  const say = (xs: readonly Item[], id: string) =>
    (xs.find((x) => x.id === id)?.text ?? id).trim() || id;
  switch (d.format) {
    case "single":
      return say(d.body.options, d.answer.correct);
    case "multi":
      return d.answer.correct.map((id) => say(d.body.options, id)).join("; ");
    case "lines":
      return d.answer.lines.join(", ");
    case "fix":
      return d.body.slots
        .map((s) => `${s.line}: ${say(s.options, d.answer.picks[s.line]).trim()}`)
        .join("; ");
    case "order":
      return d.answer.order.map((id) => say(d.body.lines, id).trim()).join(" / ");
    case "match":
      return d.body.left
        .map((l) => `${l.text} = ${say(d.body.right, d.answer.pairs[l.id])}`)
        .join("; ");
    case "fitb":
      return Object.entries(d.answer.blanks)
        .map(([n, k]) => `(${n}) ${k.accept.join(" | ")}`)
        .join("; ");
  }
}
