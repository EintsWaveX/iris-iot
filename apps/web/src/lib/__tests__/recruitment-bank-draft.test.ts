import { describe, expect, it } from "vitest";
import { FORMATS, type Format } from "../recruitment/exam-types";
import { parseBank } from "../recruitment/bank-io";
import { SEED_MD } from "../recruitment/seed-bank";
import {
  blankDraft,
  blankNumbers,
  changeFormat,
  fromFull,
  imageUse,
  keySummary,
  keySig,
  moved,
  previewOf,
  problems,
  savePayload,
  structureChanged,
  syncBlanks,
  type Draft,
} from "../recruitment/bank-draft";
import type { QuestionFull } from "../recruitment/bank-api";

const full = (d: ReturnType<typeof parseBank>[number]["draft"], id: number): QuestionFull =>
  ({
    id,
    version: 3,
    part: d!.part,
    lang: d!.lang,
    format: d!.format,
    title: d!.title,
    status: d!.status,
    sample: true,
    shown: false,
    voided: false,
    refs: 0,
    updatedAt: "2026-10-25T00:00:00Z",
    body: d!.body,
    answer: d!.answer,
    refIds: [],
    refList: [],
    voidNote: null,
  }) as QuestionFull;

describe("a new draft", () => {
  it.each(FORMATS)("starts as a %s the validator still wants filled in", (f: Format) => {
    const d = blankDraft("logika", "cpp", f);
    expect(d.id).toBeNull();
    expect(d.format).toBe(f);
    const ps = problems(d);
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.some((p) => p.field === "title" && p.kode === "judul_kosong")).toBe(true);
    expect(previewOf(d, 1)).toBeNull();
  });

  it("gives every item an id that no other item shares", () => {
    for (let n = 0; n < 40; n++) {
      const d = blankDraft("logika", "cpp", "match");
      if (d.format !== "match") throw new Error("not a match");
      const all = [...d.body.left, ...d.body.right].map((i) => i.id);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("codes in the question's own language, C++ for a part that takes either", () => {
    const py = blankDraft("logika", "py", "lines");
    const any = blankDraft("mikro", "any", "lines");
    if (py.format !== "lines" || any.format !== "lines") throw new Error("not lines");
    expect(py.body.code.lang).toBe("py");
    expect(any.body.code.lang).toBe("cpp");
  });
});

describe("the default bank in the editor", () => {
  const parsed = parseBank(SEED_MD).filter((i) => i.draft);
  it("has the 45 questions", () => expect(parsed.length).toBe(45));
  it.each(parsed.map((p, i) => [p.draft!.title, p.draft!, i] as const))(
    "%s opens with no problems and a preview",
    (_t, d, i) => {
      const dr = fromFull(full(d, i + 1));
      expect(problems(dr)).toEqual([]);
      expect(previewOf(dr, 1)).not.toBeNull();
    },
  );
  it("keeps the same order for the same seat and mixes it between seats", () => {
    const d = parsed.find((p) => p.draft!.format === "single")!.draft!;
    const dr = fromFull(full(d, 1));
    const ids = (seat: number) => {
      const v = previewOf(dr, seat);
      if (!v || v.format !== "single") throw new Error("no view");
      return v.options.map((o) => o.id).join();
    };
    expect(ids(7)).toBe(ids(7));
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(ids));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("changing the format", () => {
  it("keeps the prompt and the pictures and starts the rest over", () => {
    let d = blankDraft("logika", "cpp", "single");
    d = {
      ...d,
      body: { ...d.body, prompt: "Apa?", images: [{ id: "g1", key: "k", alt: "a", w: 1, h: 1 }] },
    } as Draft;
    const e = changeFormat(d, "order");
    expect(e.format).toBe("order");
    expect(e.body.prompt).toBe("Apa?");
    expect(e.body.images).toHaveLength(1);
    expect("lines" in e.body).toBe(true);
    expect(changeFormat(d, "single")).toBe(d);
  });
});

describe("blanks follow the code", () => {
  const base = (src: string): Draft => {
    const d = blankDraft("fitb", "cpp", "fitb");
    if (d.format !== "fitb") throw new Error("not fitb");
    return { ...d, body: { ...d.body, code: { lang: "cpp", src } } };
  };
  it("reads the numbers once each, wherever they stand", () => {
    expect(blankNumbers("a __(2)__ b ____(1)____ c __(2)__")).toEqual([2, 1]);
    expect(blankNumbers("no blanks _(1)_ here")).toEqual([]);
  });
  it("adds an entry and a key for a new blank and drops a blank that was removed", () => {
    let d = syncBlanks(base("x = __(1)__ + __(2)__"));
    if (d.format !== "fitb") throw new Error("not fitb");
    expect(d.body.blanks.map((b) => b.n)).toEqual([1, 2]);
    expect(Object.keys(d.answer.blanks)).toEqual(["1", "2"]);
    d = { ...d, answer: { blanks: { ...d.answer.blanks, 1: { accept: ["begin"] } } } };
    d = { ...d, body: { ...d.body, blanks: [{ n: 1, width: 12 }, { n: 2 }] } };
    d = syncBlanks({ ...d, body: { ...d.body, code: { lang: "cpp", src: "x = __(1)__" } } });
    if (d.format !== "fitb") throw new Error("not fitb");
    expect(d.body.blanks).toEqual([{ n: 1, width: 12 }]);
    expect(d.answer.blanks).toEqual({ 1: { accept: ["begin"] } });
  });
  it("is the same object when nothing changes", () => {
    const d = syncBlanks(base("x = __(1)__"));
    expect(syncBlanks(d)).toBe(d);
  });
  it("leaves a blank without an accepted answer as a problem to fix", () => {
    const d = { ...syncBlanks(base("x = __(1)__")), title: "T" } as Draft;
    expect(problems({ ...d, body: { ...d.body, prompt: "p" } } as Draft)).toContainEqual({
      field: "answer.blanks",
      kode: "kunci_salah",
    });
  });
});

describe("saving", () => {
  const d = (() => {
    const x = fromFull(full(parseBank(SEED_MD).find((i) => i.draft)!.draft, 9));
    return x;
  })();
  it("sends no id for a new question and the id with its version for an old one", () => {
    const fresh = savePayload({ ...d, id: null });
    expect("id" in fresh).toBe(false);
    expect("version" in fresh).toBe(false);
    const old = savePayload(d);
    expect(old).toMatchObject({ id: 9, version: 3, status: "ready" });
  });
  it("trims the title and sends a note only when there is one", () => {
    expect(savePayload({ ...d, title: "  Judul  " }).title).toBe("Judul");
    expect("note" in savePayload(d, "   ")).toBe(false);
    expect(savePayload(d, " Kunci salah ").note).toBe("Kunci salah");
  });
});

describe("what changed", () => {
  const d = fromFull(full(parseBank(SEED_MD).find((i) => i.draft?.format === "single")!.draft, 1));
  it("tells a new key from new text", () => {
    if (d.format !== "single") throw new Error("not single");
    const text = { ...d, body: { ...d.body, prompt: d.body.prompt + "!" } } as Draft;
    expect(keySig(text)).toBe(keySig(d));
    const other = d.body.options.find((o) => o.id !== d.answer.correct)!.id;
    const key = { ...d, answer: { correct: other } } as Draft;
    expect(keySig(key)).not.toBe(keySig(d));
    expect(structureChanged(d, key)).toBe(false);
  });
  it("sees an added option as a changed structure", () => {
    if (d.format !== "single") throw new Error("not single");
    const more = {
      ...d,
      body: { ...d.body, options: [...d.body.options, { id: "zz9", text: "Baru" }] },
    } as Draft;
    expect(structureChanged(d, more)).toBe(true);
  });
});

describe("small helpers", () => {
  it("moves an item up or down and stops at the ends", () => {
    expect(moved([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moved([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    expect(moved([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moved([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
  it("finds pictures the prompt names but nobody listed, and listed ones never used", () => {
    const im = (id: string) => ({ id, key: "k", alt: "", w: 1, h: 1 });
    expect(imageUse("![a](img:g1) dan ![b](img:g2)", [im("g1"), im("g3")])).toEqual({
      missing: ["g2"],
      unused: ["g3"],
    });
  });
});

describe("the key in words", () => {
  const seed = parseBank(SEED_MD).filter((i) => i.draft);
  const say = (format: string) =>
    keySummary(fromFull(full(seed.find((i) => i.draft!.format === format)!.draft, 1)));
  it("names the right option of a single choice and every right one of a checkbox", () => {
    expect(say("single")).toBe("16");
    expect(say("multi").split("; ").length).toBeGreaterThan(1);
  });
  it("lists the wrong lines by number", () => expect(say("lines")).toBe("6, 11"));
  it("says every format in something that is not empty", () => {
    for (const f of ["fix", "order", "match", "fitb"]) expect(say(f).length).toBeGreaterThan(5);
  });
});
