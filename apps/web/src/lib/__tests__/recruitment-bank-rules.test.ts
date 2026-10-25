/**
 * The bank's save rules (EXAM-ENGINE 1.4, prompt 09): what `question-save`
 * and the import may do against a stored question, the shapes they accept,
 * and the pool counter.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXAM_CONFIG,
  type Question,
  type SingleAnswer,
  type SingleBody,
} from "../recruitment/exam-types";
import {
  canon,
  cleanQuestion,
  judgeSave,
  langsOf,
  poolCounts,
  type JudgeContext,
  type QuestionState,
  type StoredState,
} from "../recruitment/bank-rules";
import { parseBank } from "../recruitment/bank-io";
import { validateQuestion } from "../recruitment/formats";

const EXAMPLES = readFileSync(new URL("./fixtures/bank-examples.md", import.meta.url), "utf8");
const drafts = parseBank(EXAMPLES).map((i) => i.draft!);

const stateOf = (i: number): QuestionState => {
  const d = drafts[i];
  return {
    part: d.part,
    lang: d.lang,
    format: d.format,
    title: d.title,
    status: d.status,
    body: d.body,
    answer: d.answer,
    refs: [],
  };
};
const stored = (s: QuestionState, shown = false, sample = false): StoredState => ({
  ...s,
  shown,
  sample,
});
const ctx = (o: Partial<JudgeContext> = {}): JudgeContext => ({
  roomRunning: false,
  langs: langsOf(DEFAULT_EXAM_CONFIG),
  ...o,
});
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
/** A single choice question state, with its body and key typed. */
const single = (s: QuestionState) =>
  clone(s) as QuestionState & { body: SingleBody; answer: SingleAnswer };

describe("cleanQuestion", () => {
  it("keeps every example as it is", () => {
    for (const d of drafts) {
      const c = cleanQuestion(
        d.format,
        JSON.parse(JSON.stringify(d.body)),
        JSON.parse(JSON.stringify(d.answer)),
      );
      expect(c, d.title).not.toBeNull();
      expect(canon(c!.body), d.title).toBe(canon(d.body));
      expect(canon(c!.answer), d.title).toBe(canon(d.answer));
      const q = {
        id: 0,
        version: 1,
        part: d.part,
        lang: d.lang,
        format: d.format,
        ...c!,
      } as Question;
      expect(validateQuestion(q), d.title).toEqual([]);
    }
  });

  it("drops fields a format does not have", () => {
    const d = drafts[0];
    if (d.format !== "single") throw new Error("format");
    const c = cleanQuestion(
      "single",
      { ...clone(d.body), evil: "<script>", extra: { a: 1 } },
      { ...clone(d.answer), hint: "x" },
    )!;
    expect(Object.keys(c.body).sort()).toEqual(["options", "prompt", "shuffle"]);
    expect(Object.keys(c.answer)).toEqual(["correct"]);
  });

  it("refuses the wrong types and sizes", () => {
    const d = drafts[0];
    if (d.format !== "single") throw new Error("format");
    const body = clone(d.body);
    const bad: unknown[] = [
      null,
      "x",
      [],
      { ...body, prompt: 5 },
      { ...body, prompt: "x".repeat(20_001) },
      { ...body, options: "no" },
      { ...body, options: [{ id: "A B", text: "x" }] },
      { ...body, options: [{ id: "abc", text: "two\nlines" }] },
      { ...body, options: [{ id: "abc", text: 7 }] },
      { ...body, images: [{ id: "i", key: "k", alt: "a", w: 0, h: 1 }] },
      { ...body, images: "no" },
    ];
    for (const b of bad)
      expect(cleanQuestion("single", b, clone(d.answer)), JSON.stringify(b)).toBeNull();
    expect(cleanQuestion("single", body, { correct: 5 })).toBeNull();
    expect(cleanQuestion("single", body, null)).toBeNull();
    expect(cleanQuestion("multi", body, { correct: "x" })).toBeNull();
    expect(
      cleanQuestion("lines", { prompt: "p", code: { lang: "rust", src: "x" } }, { lines: [1] }),
    ).toBeNull();
    expect(
      cleanQuestion("lines", { prompt: "p", code: { lang: "cpp", src: "x" } }, { lines: [1.5] }),
    ).toBeNull();
    expect(
      cleanQuestion(
        "fitb",
        { prompt: "p", blanks: [{ n: 1, width: "w" }] },
        { blanks: { 1: { accept: ["a"] } } },
      ),
    ).toBeNull();
    expect(
      cleanQuestion(
        "fitb",
        { prompt: "p", blanks: [{ n: 1 }] },
        { blanks: { 1: { accept: ["a"], case: "any" } } },
      ),
    ).toBeNull();
    expect(
      cleanQuestion("order", { prompt: "p", lang: "cpp", lines: [] }, { order: [], also: "no" }),
    ).toBeNull();
  });
});

describe("judgeSave", () => {
  const base = stateOf(0);

  it("creates freely, but a ready question not while a real room runs", () => {
    expect(judgeSave(null, base, ctx())).toEqual({ ok: true, kind: "create" });
    expect(judgeSave(null, base, ctx({ roomRunning: true }))).toEqual({
      ok: false,
      kode: "ruang_berjalan",
    });
    expect(judgeSave(null, { ...base, status: "draft" }, ctx({ roomRunning: true }))).toEqual({
      ok: true,
      kind: "create",
    });
  });

  it("takes only the languages the part counts, and any part that counts `any` takes all three", () => {
    // Logika counts cpp and py: `any` is not one of its languages.
    expect(judgeSave(null, { ...base, part: "logika", lang: "any" }, ctx())).toEqual({
      ok: false,
      kode: "bahasa_salah",
    });
    // Mikro counts `any`, which pools C++ and Python questions alike.
    for (const lang of ["any", "cpp", "py"] as const)
      expect(judgeSave(null, { ...base, part: "mikro", lang }, ctx())).toEqual({
        ok: true,
        kind: "create",
      });
    const cppOnly = structuredClone(DEFAULT_EXAM_CONFIG);
    cppOnly.parts.fitb.counts = { cpp: { shown: 10, pool: 20 } };
    expect(
      judgeSave(null, { ...base, part: "fitb", lang: "py" }, ctx({ langs: langsOf(cppOnly) })),
    ).toEqual({
      ok: false,
      kode: "bahasa_salah",
    });
  });

  it("an identical save is a no-op, even while a room runs", () => {
    expect(judgeSave(stored(base), base, ctx({ roomRunning: true }))).toEqual({
      ok: true,
      kind: "same",
    });
  });

  it("a never shown question edits freely, key and structure included", () => {
    const next = single(base);
    next.body = { ...next.body, options: next.body.options.slice(0, 3) };
    next.answer = { correct: next.body.options[0].id };
    expect(judgeSave(stored(base), next, ctx())).toEqual({ ok: true, kind: "save" });
  });

  it("a shown question keeps its structure: no option added or removed, no format change", () => {
    const shown = stored(base, true);
    const fewer = single(base);
    fewer.body = { ...fewer.body, options: fewer.body.options.slice(0, 3) };
    fewer.answer = { correct: fewer.body.options[0].id };
    expect(judgeSave(shown, fewer, ctx())).toEqual({ ok: false, kode: "struktur_terkunci" });
    expect(judgeSave(shown, { ...base, part: "fitb" }, ctx())).toEqual({
      ok: false,
      kode: "struktur_terkunci",
    });
    expect(judgeSave(shown, { ...base, lang: "py" }, ctx())).toEqual({
      ok: false,
      kode: "struktur_terkunci",
    });
  });

  it("a shown question may change its text, and a key change needs a note", () => {
    const shown = stored(base, true);
    const text = single(base);
    text.body = { ...text.body, prompt: "Berapa angka yang tampil?" };
    expect(judgeSave(shown, text, ctx())).toEqual({ ok: true, kind: "save" });

    const key = single(base);
    key.answer = { correct: key.body.options.find((o) => o.id !== key.answer.correct && true)!.id };
    expect(judgeSave(shown, key, ctx())).toEqual({ ok: false, kode: "perlu_catatan" });
    expect(judgeSave(shown, key, ctx({ note: "   " }))).toEqual({
      ok: false,
      kode: "perlu_catatan",
    });
    expect(judgeSave(shown, key, ctx({ note: "Kuncinya salah hitung" }))).toEqual({
      ok: true,
      kind: "key",
    });
  });

  it("a status change is its own kind", () => {
    expect(judgeSave(stored(base), { ...base, status: "draft" }, ctx())).toEqual({
      ok: true,
      kind: "status",
    });
    expect(judgeSave(stored({ ...base, status: "draft" }), base, ctx())).toEqual({
      ok: true,
      kind: "status",
    });
  });

  it("while a real room runs, a ready question cannot change, move in or move out", () => {
    const run = ctx({ roomRunning: true });
    const text = single(base);
    text.body = { ...text.body, prompt: "baru" };
    expect(judgeSave(stored(base), text, run)).toEqual({ ok: false, kode: "ruang_berjalan" });
    expect(judgeSave(stored(base), { ...base, status: "draft" }, run)).toEqual({
      ok: false,
      kode: "ruang_berjalan",
    });
    expect(judgeSave(stored({ ...base, status: "draft" }), base, run)).toEqual({
      ok: false,
      kode: "ruang_berjalan",
    });
    // A draft stays editable.
    const draft = { ...text, status: "draft" as const };
    expect(judgeSave(stored({ ...base, status: "draft" }), draft, run)).toEqual({
      ok: true,
      kind: "save",
    });
  });

  it("the order of rules: structure first, then the room, then the note", () => {
    const run = ctx({ roomRunning: true });
    const fewer = single(base);
    fewer.body = { ...fewer.body, options: fewer.body.options.slice(0, 3) };
    fewer.answer = { correct: fewer.body.options[0].id };
    expect(judgeSave(stored(base, true), fewer, run).ok).toBe(false);
    expect((judgeSave(stored(base, true), fewer, run) as { kode: string }).kode).toBe(
      "struktur_terkunci",
    );
  });

  it("references and the title count as changes", () => {
    expect(judgeSave(stored(base), { ...base, refs: [3] }, ctx())).toEqual({
      ok: true,
      kind: "save",
    });
    expect(judgeSave(stored(base), { ...base, title: "Judul lain" }, ctx())).toEqual({
      ok: true,
      kind: "save",
    });
    expect(judgeSave(stored({ ...base, refs: [2, 1] }), { ...base, refs: [1, 2] }, ctx())).toEqual({
      ok: true,
      kind: "same",
    });
  });
});

describe("poolCounts", () => {
  const row = (
    part: "logika" | "mikro",
    lang: "cpp" | "py" | "any",
    o: Partial<{ status: "draft" | "ready"; sample: boolean; voided: boolean }> = {},
  ) => ({
    part,
    lang,
    status: "ready" as const,
    sample: false,
    voided: false,
    ...o,
  });

  it("counts ready, draft, seeds and voided per language against the config", () => {
    const rows = [
      row("logika", "cpp"),
      row("logika", "cpp", { sample: true }),
      row("logika", "cpp", { status: "draft" }),
      row("logika", "cpp", { voided: true }),
      row("logika", "py"),
    ];
    const p = poolCounts(rows, DEFAULT_EXAM_CONFIG);
    expect(p.logika.find((c) => c.lang === "cpp")).toEqual({
      lang: "cpp",
      ready: 2,
      draft: 1,
      seed: 1,
      voided: 1,
      shown: 10,
      pool: 20,
      missing: 8,
    });
    expect(p.logika.find((c) => c.lang === "py")?.missing).toBe(4);
    expect(p.fitb.every((c) => c.ready === 0 && c.missing === c.shown)).toBe(true);
  });

  it("any pools every language of the part, and a full pool misses nothing", () => {
    const rows = [
      row("mikro", "cpp"),
      row("mikro", "py"),
      row("mikro", "any"),
      row("mikro", "cpp"),
      row("mikro", "py"),
    ];
    const m = poolCounts(rows, DEFAULT_EXAM_CONFIG).mikro;
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ lang: "any", ready: 5, missing: 0 });
  });
});
