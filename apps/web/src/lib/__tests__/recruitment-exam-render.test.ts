import { describe, expect, it } from "vitest";
import { highlightLines } from "../../components/recruitment/exam/render/hl";
import { parseInline, parseMd } from "../../components/recruitment/exam/render/md";

describe("highlightLines", () => {
  it("cuts the source into the same lines as split('\n') and loses no text", () => {
    const src = "int x = 1; // note\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n}";
    const lines = highlightLines(src, "cpp");
    expect(lines).toHaveLength(src.split("\n").length);
    expect(lines.map((l) => l.map((t) => t.text).join(""))).toEqual(src.split("\n"));
  });
  it("keeps a block comment that spans lines coloured on each line", () => {
    const lines = highlightLines("/* a\n b */ int y;", "cpp");
    expect(lines[0].some((t) => t.kind === "comment")).toBe(true);
    expect(lines[1].some((t) => t.kind === "comment")).toBe(true);
  });
  it("marks keywords and strings in Python", () => {
    const kinds = highlightLines('for i in range(3): print("hi")', "py")[0].map((t) => t.kind);
    expect(kinds).toContain("keyword");
    expect(kinds).toContain("string");
  });
  it("leaves plain text alone", () => {
    expect(highlightLines("a b\nc", "text").every((l) => l.every((t) => !t.kind))).toBe(true);
  });
});

describe("parseInline", () => {
  it("reads bold, italic and code, and nothing else", () => {
    expect(parseInline("a **b** *c* `d`")).toEqual([
      { t: "text", s: "a " },
      { t: "b", s: "b" },
      { t: "text", s: " " },
      { t: "i", s: "c" },
      { t: "text", s: " " },
      { t: "code", s: "d" },
    ]);
  });
  it("turns a link into its text, so the test can never navigate out", () => {
    expect(parseInline("see [docs](https://evil.example/x) now")).toEqual([
      { t: "text", s: "see docs now" },
    ]);
  });
  it("does not read markup inside code", () => {
    expect(parseInline("`**x**`")).toEqual([{ t: "code", s: "**x**" }]);
  });
  it("keeps raw HTML as text", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([
      { t: "text", s: "<script>alert(1)</script>" },
    ]);
  });
});

describe("parseMd", () => {
  it("reads paragraphs, a fenced block with its language, lists and a table", () => {
    const md = [
      "First line",
      "second line of the same paragraph",
      "",
      "```cpp",
      "int a;",
      "```",
      "",
      "- one",
      "- two",
      "",
      "1. x",
      "2. y",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
    ].join("\n");
    const b = parseMd(md);
    expect(b.map((x) => x.t)).toEqual(["p", "code", "ul", "ol", "table"]);
    expect(b[1]).toMatchObject({ t: "code", lang: "cpp", src: "int a;" });
    expect(b[2]).toMatchObject({ t: "ul", items: ["one", "two"] });
    expect(b[4]).toMatchObject({ t: "table", head: ["a", "b"], rows: [["1", "2"]] });
  });
  it("reads an image on its own line", () => {
    expect(parseMd("![wiring](img:ab12cd)")).toEqual([{ t: "img", alt: "wiring", id: "ab12cd" }]);
  });
  it("drops an image that points anywhere but img:<id>", () => {
    expect(parseMd("![x](https://evil.example/a.png)")).toEqual([
      { t: "p", text: "![x](https://evil.example/a.png)" },
    ]);
  });
});

import { highlightBlanks } from "../../components/recruitment/exam/render/hl";

describe("highlightBlanks", () => {
  it("puts the blank where it stood, in order, several to a line", () => {
    const lines = highlightBlanks("int a = ____(1)____;\nx = __(2)__ + __(3)__;", "cpp");
    const blanks = lines.map((l) =>
      l.filter((i) => "blank" in i).map((i) => (i as { blank: number }).blank),
    );
    expect(blanks).toEqual([[1], [2, 3]]);
  });
  it("keeps the text around the blank", () => {
    const line = highlightBlanks("a ____(1)____ b", "py")[0];
    const text = line.map((i) => ("blank" in i ? `<${i.blank}>` : i.text)).join("");
    expect(text).toBe("a <1> b");
  });
});
