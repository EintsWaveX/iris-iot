/**
 * The shared code-editor assist (components/recruitment/livecode/cmAssist.ts, 5 Nov 2026): the C suggestions
 * are tested headless, a state and a cursor position in, the offered labels out. The closing pairs and the
 * opt-outs from proofreading come from CodeMirror and the attribute lists, so they get a light check.
 */
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  cCompletions,
  cSupport,
  codeAssist,
  closesOpen,
  describeAt,
  signatureAt,
} from "../../components/recruitment/livecode/cmAssist";

/** `doc` with a `|` where the cursor is; the labels offered there (null when no popup would open) */
function offered(doc: string, explicit = false): { labels: string[]; from: number } | null {
  const pos = doc.indexOf("|");
  const text = doc.replace("|", "");
  const state = EditorState.create({ doc: text, extensions: [cSupport()] });
  const r = cCompletions(new CompletionContext(state, pos, explicit));
  if (!r || r instanceof Promise) return null;
  return { labels: r.options.map((o) => o.label), from: r.from };
}

describe("C suggestions", () => {
  it("offers the standard library with the typed prefix", () => {
    const r = offered("#include <stdio.h>\nint main(void) {\n  pri|\n}\n");
    expect(r?.labels).toContain("printf");
    expect(r?.labels).toContain("int");
    expect(r?.from).toBe("#include <stdio.h>\nint main(void) {\n  ".length);
  });

  it("offers statement skeletons as snippets", () => {
    const labels = offered("int main(void) {\n  f|\n}\n")?.labels ?? [];
    for (const k of ["for", "while", "if", "switch", "main"]) expect(labels).toContain(k);
  });

  it("offers the names the file itself declares, functions and variables alike", () => {
    const labels =
      offered(
        "int jumlah(int a, int b) { return a + b; }\nint main(void) {\n  int total = 0;\n  total = jum|\n}\n",
      )?.labels ?? [];
    expect(labels).toContain("jumlah");
    expect(labels).toContain("total");
  });

  it("does not suggest the word being typed as itself", () => {
    const labels =
      offered("int main(void) {\n  int banyakData = 1;\n  banyakDa|\n}\n")?.labels ?? [];
    expect(labels.filter((l) => l === "banyakDa")).toEqual([]);
    expect(labels).toContain("banyakData");
  });

  it("offers struct fields, and only those, after . and ->", () => {
    const doc =
      "struct P { int x; int y; };\nint main(void) {\n  struct P p;\n  struct P *q = &p;\n  p.x = 1;\n  q->|\n}\n";
    const labels = offered(doc)?.labels ?? [];
    expect(labels).toEqual(expect.arrayContaining(["x", "y"]));
    expect(labels).not.toContain("printf");
    expect(labels).not.toContain("int");
  });

  it("does not take 3. for a member access, but does for a1.", () => {
    expect(offered("double d = 3.|;")).toBeNull();
    const doc = "struct P { int x; };\nint main(void) {\n  struct P a1;\n  a1.|\n}\n";
    expect(offered(doc)?.labels).toContain("x");
  });

  it("offers the headers after #include", () => {
    const withBracket = offered("#include <st|")!;
    expect(withBracket.labels).toContain("stdio.h");
    expect(withBracket.labels).toContain("stdlib.h");
    const bare = offered("#include |", true)!;
    expect(bare.labels).toContain("math.h");
  });

  it("offers the directives after #", () => {
    expect(offered("#inc|")?.labels).toContain("#include");
  });

  it("stays quiet inside comments, strings and numbers", () => {
    expect(offered("// pri|")).toBeNull();
    expect(offered("/* pri| */")).toBeNull();
    expect(offered('char *s = "pri|";')).toBeNull();
    expect(offered("int x = 0x1f|;")).toBeNull();
    expect(offered("int x = 12|;")).toBeNull();
  });

  it("never offers plain English words", () => {
    const r = offered("// the quick brown fox\nint main(void) {\n  qui|\n}\n");
    expect(r?.labels ?? []).not.toContain("quick");
    expect(r?.labels ?? []).not.toContain("brown");
  });

  it("opens only on request when nothing is typed", () => {
    expect(offered("int main(void) {\n  |\n}\n")).toBeNull();
    expect(offered("int main(void) {\n  |\n}\n", true)?.labels).toContain("printf");
  });
});

describe("editor assist bundle", () => {
  it("builds into a state", () => {
    const s = EditorState.create({ doc: "int x;", extensions: [cSupport(), codeAssist()] });
    expect(s.doc.toString()).toBe("int x;");
  });
});

const PROG = `#define MAX 10
typedef struct { int x; int *y; } Pt;
struct P { int x; char name[20]; };
int g = 5;
int jumlah(int a, const char *s);
int jumlah(int a, const char *s) {
  int total = 0, arr[10], *p = &total;
  struct P q;
  unsigned long n;
  for (int i = 0; i < a; i++) { total += i; }
  printf("%d", total);
  q.x = jumlah(1, "a");
  return total;
}
int other(void) {
  int total = 1.5;
  return total;
}
`;

/** what hovering the `nth` appearance of `word` in PROG says, as "(kind) sig | note" */
function hover(word: string, nth = 0): string | null {
  const state = EditorState.create({ doc: PROG, extensions: [cSupport()] });
  let at = -1;
  for (let i = 0; i <= nth; i++) at = PROG.indexOf(word, at + 1);
  const h = describeAt(state, at + 1);
  return h ? `(${h.kind}) ${h.sig}${h.note ? ` | ${h.note}` : ""}` : null;
}

describe("hover, like VS Code's C/C++ extension", () => {
  it("shows a variable's type, with its pointer star or array size", () => {
    expect(hover("total", 0)).toBe("(local variable) int total");
    expect(hover("arr")).toBe("(local variable) int arr[10]");
    expect(hover("*p = ", 0)?.toString()).toBeTruthy();
    expect(hover("p = &total")).toBe("(local variable) int *p");
    expect(hover("q;")).toBe("(local variable) struct P q");
    expect(hover("n;")).toBe("(local variable) unsigned long n");
    expect(hover("g = 5")).toBe("(global variable) int g = 5".replace(" = 5", ""));
  }, 20_000); // the first parse loads the C grammar: slow under a busy full run

  it("knows a parameter and a for-loop variable, and uses the right `total` in each function", () => {
    expect(hover("a,", 1)).toBe("(parameter) int a");
    expect(hover("a,", 0)).toBe("(parameter) int a"); // in the prototype too
    expect(hover("s)", 1)).toBe("(parameter) const char *s");
    expect(hover("i = 0")).toBe("(local variable) int i");
    // `total` used in other(): its own declaration (int total = 1.5), not jumlah's
    expect(hover("total", 6)).toBe("(local variable) int total");
  });

  it("shows a function's signature at a call and at its definition, and a library function's header", () => {
    expect(hover("jumlah(1")).toBe("(function) int jumlah(int a, const char *s)");
    expect(hover("printf")).toBe("(function) int printf(const char *format, ...) | <stdio.h>");
  });

  it("shows a struct, its fields, a typedef and a macro", () => {
    expect(hover("P q")).toContain("(struct) struct P { int x; char name[20]; }");
    expect(hover("x;", 1)).toBe("(field) int x | in struct P");
    // through the variable: q is a struct P, so q.x is P's x, not the typedef'd struct's x
    expect(hover("x = jumlah")).toBe("(field) int x | in struct P");
    expect(hover("Pt;")).toBe("(typedef) typedef struct { int x; int *y; } Pt");
    expect(hover("MAX")).toBe("(macro) #define MAX 10");
  });

  it("says nothing on keywords, numbers, comments and unknown words", () => {
    expect(hover("return")).toBeNull();
    expect(hover("10;")).toBeNull();
    expect(hover("nothere")).toBeNull();
    const state = EditorState.create({
      doc: ["// total here", "int total;"].join("\n"),
      extensions: [cSupport()],
    });
    expect(describeAt(state, 4)).toBeNull();
  });
});

describe("parameter hints while typing a call", () => {
  const at = (doc: string) => {
    const pos = doc.indexOf("|");
    const state = EditorState.create({ doc: doc.replace("|", ""), extensions: [cSupport()] });
    return signatureAt(state, pos);
  };

  it("names the parameters and the one being typed", () => {
    expect(at("void f(void) { printf(|) }")?.params).toEqual(["const char *format", "..."]);
    expect(at("void f(void) { printf(|) }")?.active).toBe(0);
    expect(at('void f(void) { printf("%d", |) }')?.active).toBe(1);
    expect(at('void f(void) { printf("%d %d", a, |) }')?.active).toBe(1); // the ... carries on
    expect(at("void f(void) { strcmp(a, |) }")?.active).toBe(1);
  });

  it("follows the inner call, and the outer one once it is closed", () => {
    expect(at("void f(void) { strcmp(a, strlen(|)) }")?.name).toBe("strlen");
    expect(at("void f(void) { strcmp(a, strlen(b)|) }")?.name).toBe("strcmp");
  });

  it("works for the file's own functions and not outside a call", () => {
    const doc = [
      "int add(int a, int b) { return a + b; }",
      "int main(void) { return add(1, |); }",
    ].join("\n");
    expect(at(doc)?.params).toEqual(["int a", "int b"]);
    expect(at(doc)?.active).toBe(1);
    expect(at("int main(void) { int x = 1;| }")).toBeNull();
    expect(at("int main(void) { foo(|) }")).toBeNull();
  });
});

describe("stepping over a closer that is already there", () => {
  it("quotes: inside a string yes, outside no, an escaped quote does not count", () => {
    expect(closesOpen('  printf("%d', '  printf("%d', '"')).toBe(true);
    expect(closesOpen('  printf("%d"', '  printf("%d"', '"')).toBe(false);
    expect(closesOpen('  puts("a \\" b', '  puts("a \\" b', '"')).toBe(true);
    expect(closesOpen("  char c = '", "  char c = '", "'")).toBe(true);
  });

  it("brackets: when an opener is still unclosed", () => {
    expect(closesOpen("foo(bar(", "foo(bar(", ")")).toBe(true);
    expect(closesOpen("foo(bar()", "foo(bar()", ")")).toBe(true);
    expect(closesOpen("foo(bar())", "foo(bar())", ")")).toBe(false);
    expect(closesOpen("int a[3", "int a[3", "]")).toBe(true);
    expect(closesOpen(["int main(void) {", "  x;", ""].join("\n"), "  x;", "}")).toBe(true);
    expect(closesOpen(["int f(void) {}", ""].join("\n"), "", "}")).toBe(false);
  });
});
