/**
 * Import and export of the question bank (EXAM-ENGINE 1.5, prompt 09): the
 * seven documented examples parse, every format survives export then import,
 * and the dry run says what is wrong with a line number.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORMATS, type Format, type Question } from "../recruitment/exam-types";
import { structureKey, validateQuestion } from "../recruitment/formats";
import {
  idSequence,
  parseBank,
  writeBank,
  type ExportItem,
  type QuestionDraft,
} from "../recruitment/bank-io";

const EXAMPLES = readFileSync(new URL("./fixtures/bank-examples.md", import.meta.url), "utf8");

/** A draft as the validator reads it. */
const asQ = (d: QuestionDraft): Question =>
  ({
    id: 0,
    version: 1,
    part: d.part,
    lang: d.lang,
    format: d.format,
    body: d.body,
    answer: d.answer,
  }) as Question;

/** A draft with every random id replaced by its place, so two parses compare. */
function canon(d: QuestionDraft) {
  const seq = idSequence(asQ(d));
  const rename = new Map(seq.map((id, i) => [id, `#${i}`]));
  // Order lines are stored by random id, so their stored order is not part of the content.
  const body =
    d.format === "order"
      ? {
          ...d.body,
          lines: [...d.body.lines].sort((a, b) => seq.indexOf(a.id) - seq.indexOf(b.id)),
        }
      : d.body;
  const json = JSON.stringify({
    part: d.part,
    lang: d.lang,
    format: d.format,
    title: d.title,
    status: d.status,
    sample: d.sample,
    refUrls: d.refUrls,
    body,
    answer: d.answer,
  });
  // Ids are 6 plain characters inside quotes; swap the ones we know.
  return json.replace(/"([a-z0-9]{6})"/g, (m, id) => (rename.has(id) ? `"${rename.get(id)}"` : m));
}

function parseOk(text: string) {
  const items = parseBank(text);
  const drafts: QuestionDraft[] = [];
  for (const it of items) {
    expect(it.errors, `${it.title}: ${JSON.stringify(it.errors)}`).toEqual([]);
    drafts.push(it.draft!);
  }
  return drafts;
}

describe("the documented examples", () => {
  const drafts = parseOk(EXAMPLES);

  it("are all seven, each valid, one per format, all C", () => {
    expect(drafts).toHaveLength(7);
    for (const d of drafts) expect(validateQuestion(asQ(d)), d.title).toEqual([]);
    expect(new Set(drafts.map((d) => d.format))).toEqual(new Set(FORMATS));
    expect(drafts.every((d) => d.lang === "c")).toBe(true);
    expect(drafts.every((d) => d.sample && d.status === "ready")).toBe(true);
  });

  it("read the key the way the document says", () => {
    const by = (t: string) => drafts.find((d) => d.title === t)!;
    const one = by("Jumlah Bilangan Ganjil");
    if (one.format !== "single") throw new Error("format");
    const right = one.body.options.find((o) => o.id === one.answer.correct)!;
    expect(right.text).toBe("16");
    const lines = by("Rata-rata Array");
    expect(lines.answer).toEqual({ lines: [4, 5] });
    const fix = by("Cetak Array Terbalik");
    if (fix.format !== "fix") throw new Error("format");
    expect(fix.body.slots.map((s) => s.line)).toEqual([5, 6, 7]);
    const s5 = fix.body.slots[0];
    const pick5 = s5.options.find((o) => o.id === fix.answer.picks[5])!;
    expect(pick5.text).toBe("  int n = sizeof(a) / sizeof(a[0]);");
    const fitb = by("Jumlah Elemen Array");
    if (fitb.format !== "fitb") throw new Error("format");
    expect(fitb.answer.blanks[1]).toEqual({ accept: ["a[0]", "int"], space: "none" });
    expect(fitb.body.blanks.map((b) => b.n)).toEqual([1, 2, 3]);
  });

  it("keep order lines sorted by id, not by the answer, and read `also` as positions", () => {
    const o = by("Jumlah Array");
    if (o.format !== "order") throw new Error("format");
    expect(o.body.lines).toHaveLength(10);
    expect(o.answer.order).toHaveLength(10);
    expect(o.answer.also).toHaveLength(1);
    const text = (id: string) => o.body.lines.find((l) => l.id === id)!.text;
    // `also` swaps lines 3 and 4: the sum starts before the array is declared.
    expect(o.answer.also[0].map(text).slice(2, 4)).toEqual([
      "  int jumlah = 0;",
      "  int a[4] = {5, 8, 2, 9};",
    ]);
    expect([...o.body.lines.map((l) => l.id)]).toEqual([...o.body.lines.map((l) => l.id)].sort());
    function by(t: string) {
      return drafts.find((d) => d.title === t)!;
    }
  });

  it("match: a row with an empty left cell is a distractor on the right", () => {
    const m = drafts.find((d) => d.title === "Ekspresi dan Hasil")!;
    if (m.format !== "match") throw new Error("format");
    expect(m.body.left).toHaveLength(5);
    expect(m.body.right).toHaveLength(6);
    expect(Object.keys(m.answer.pairs)).toHaveLength(5);
  });
});

describe("export then import", () => {
  const drafts = parseOk(EXAMPLES);

  it("round trips every example exactly, ids aside", () => {
    const text = writeBank(drafts.map((d, i): ExportItem => ({ ...d, id: i + 1 })));
    const again = parseOk(text);
    expect(again.map(canon)).toEqual(drafts.map(canon));
  });

  it("writes the same text the second time (a stable format)", () => {
    const one = writeBank(drafts.map((d, i): ExportItem => ({ ...d, id: i + 1 })));
    const two = writeBank(parseOk(one).map((d, i): ExportItem => ({ ...d, id: i + 1 })));
    expect(two).toBe(one);
  });

  it("covers all seven formats", () => {
    const formats = new Set<Format>(drafts.map((d) => d.format));
    expect([...formats].sort()).toEqual([...FORMATS].sort());
  });

  it("an update keeps the stored ids by position, so a shown question's structure survives", () => {
    const first = drafts.map((d, i): ExportItem => ({ ...d, id: i + 1 }));
    const stored = new Map(first.map((d) => [d.id!, asQ(d)]));
    const text = writeBank(first);
    const items = parseBank(text, { stored: (id) => stored.get(id) });
    items.forEach((it, i) => {
      expect(it.errors).toEqual([]);
      expect(structureKey(asQ(it.draft!)), first[i].title).toBe(structureKey(asQ(first[i])));
      expect(idSequence(asQ(it.draft!)), first[i].title).toEqual(idSequence(asQ(first[i])));
    });
  });

  it("keeps awkward text: a pipe in a cell, backticks in a fix option, a colon in a title", () => {
    const text = [
      "---",
      "part: logika",
      "lang: c",
      "format: match",
      'title: "Operator: dan artinya"',
      "---",
      "Pasangkan.",
      "",
      "| A | B |",
      "|---|---|",
      "| `a \\| b` | bit OR |",
      "| `a && b` | logika DAN |",
      "",
      "---",
      "part: kodingan",
      "lang: c",
      "format: fix",
      "title: Kutip",
      "---",
      "Perbaiki.",
      "",
      "```c",
      "const char* s = x;",
      "```",
      "",
      "### Baris 1",
      '- [x] `  const char* s = "`";`',
      "- [ ] `  const char* s = 1;`",
      "",
    ].join("\n");
    const ds = parseOk(text);
    expect(ds[0].title).toBe("Operator: dan artinya");
    if (ds[0].format !== "match") throw new Error("format");
    expect(ds[0].body.left[0].text).toBe("`a | b`");
    const again = parseOk(writeBank(ds.map((d) => ({ ...d }))));
    expect(again.map(canon)).toEqual(ds.map(canon));
  });
});

describe("the dry run reports what is wrong, with a line", () => {
  const head = (extra: string[] = []) => [
    "---",
    "part: logika",
    "lang: c",
    "format: single",
    "title: T",
    ...extra,
    "---",
  ];

  it("a question with no right option", () => {
    const [it] = parseBank([...head(), "Q?", "", "- [ ] a", "- [ ] b", ""].join("\n"));
    expect(it.draft).toBeNull();
    expect(it.errors.map((e) => e.kode)).toContain("kunci_salah");
    expect(it.line).toBe(1);
  });

  it("an unknown format or part, a missing title, an unclosed front matter", () => {
    const text = [
      "---",
      "part: nilai",
      "lang: c",
      "format: single",
      "title: A",
      "---",
      "x",
      "---",
      "part: logika",
      "lang: c",
      "format: esai",
      "title: B",
      "---",
      "x",
      "---",
      "part: logika",
      "lang: c",
      "format: single",
      "---",
      "x",
      "- [x] a",
      "- [ ] b",
      "---",
      "part: logika",
      "lang: c",
    ].join("\n");
    const items = parseBank(text);
    expect(items).toHaveLength(4);
    expect(items[0].errors.map((e) => e.kode)).toContain("part_salah");
    expect(items[1].errors.map((e) => e.kode)).toContain("format_salah");
    expect(items[2].errors.map((e) => e.kode)).toContain("judul_kosong");
    expect(items[3].errors.map((e) => e.kode)).toContain("front_matter_terbuka");
    expect(items[1].line).toBe(8);
    expect(items[2].line).toBe(15);
  });

  it("YAML that does not parse is an error on its own line", () => {
    const [it] = parseBank(
      ["---", "part: logika", "lang: [c", "format: single", "title: T", "---", "x"].join("\n"),
    );
    expect(it.errors[0].kode).toBe("yaml_salah");
    expect(it.errors[0].line).toBeGreaterThan(1);
  });

  it("a horizontal rule inside a prompt does not start a question", () => {
    const [it, ...rest] = parseBank(
      [...head(), "Atas", "", "---", "", "Bawah", "", "- [x] a", "- [ ] b"].join("\n"),
    );
    expect(rest).toHaveLength(0);
    expect(it.errors).toEqual([]);
    if (it.draft?.format !== "single") throw new Error("format");
    expect(it.draft.body.prompt).toBe("Atas\n\n---\n\nBawah");
  });

  it("a --- inside a code fence is code", () => {
    const text = [
      ...head(),
      "```c",
      "x = 1",
      "---",
      "title: not a question",
      "```",
      "",
      "- [x] a",
      "- [ ] b",
    ].join("\n");
    const items = parseBank(text);
    expect(items).toHaveLength(1);
    expect(items[0].errors).toEqual([]);
  });

  it("fitb: blank numbers in the code must match the front matter", () => {
    const text = [
      "---",
      "part: fitb",
      "lang: c",
      "format: fitb",
      "title: F",
      "blanks:",
      "  1: { accept: [a] }",
      "  2: { accept: [b] }",
      "---",
      "Isi.",
      "",
      "```c",
      "x = __(1)__",
      "```",
    ].join("\n");
    const [it] = parseBank(text);
    expect(it.errors.map((e) => e.field)).toContain("body.code");
  });

  it("order: other orders must be permutations of the lines", () => {
    const text = [
      "---",
      "part: logika",
      "lang: c",
      "format: order",
      "title: O",
      "also: [[1, 2]]",
      "---",
      "Susun.",
      "",
      "```c",
      "a = 1",
      "b = 2",
      "c = 3",
      "```",
    ].join("\n");
    const [it] = parseBank(text);
    expect(it.errors.map((e) => e.kode)).toContain("kunci_salah");
  });

  it("an empty file has no questions", () => {
    expect(parseBank("")).toEqual([]);
    expect(parseBank("\n\n")).toEqual([]);
  });

  it("text before the first question is reported", () => {
    const items = parseBank(["catatan lepas", ...head(), "x", "- [x] a", "- [ ] b"].join("\n"));
    expect(items).toHaveLength(2);
    expect(items[0].errors[0].kode).toBe("teks_di_luar");
  });
});

describe("references and images", () => {
  it("carry reference URLs and images through the front matter", () => {
    const text = [
      "---",
      "part: kodingan",
      "lang: c",
      "format: single",
      "title: Gambar",
      "refs: [https://docs.arduino.cc/language-reference/en/functions/digital-io/digitalwrite/]",
      "images:",
      "  - { id: im1, key: recruitment/1/bank/aaaa.png, alt: Rangkaian, w: 320, h: 200 }",
      "---",
      "Lihat ![Rangkaian](img:im1).",
      "",
      "- [x] a",
      "- [ ] b",
    ].join("\n");
    const [it] = parseBank(text);
    expect(it.errors).toEqual([]);
    expect(it.draft!.refUrls).toEqual([
      "https://docs.arduino.cc/language-reference/en/functions/digital-io/digitalwrite/",
    ]);
    expect(it.draft!.body.images).toEqual([
      { id: "im1", key: "recruitment/1/bank/aaaa.png", alt: "Rangkaian", w: 320, h: 200 },
    ]);
    const again = parseBank(writeBank([{ ...it.draft!, id: 9 }]))[0];
    expect(again.errors).toEqual([]);
    expect(again.draft!.body.images).toEqual(it.draft!.body.images);
    expect(again.draft!.refUrls).toEqual(it.draft!.refUrls);
  });

  it("an image the prompt names but the front matter lacks is an error", () => {
    const [it] = parseBank(
      [
        "---",
        "part: kodingan",
        "lang: c",
        "format: single",
        "title: G",
        "---",
        "![x](img:nope)",
        "",
        "- [x] a",
        "- [ ] b",
      ].join("\n"),
    );
    expect(it.errors.map((e) => e.kode)).toContain("gambar_hilang");
  });
});
