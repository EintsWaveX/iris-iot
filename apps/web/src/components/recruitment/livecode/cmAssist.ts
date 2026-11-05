/**
 * What the two code editors (the Live Coding page and the Bank Soal boxes) share besides colours (5 Nov 2026):
 *
 *  1. no proofreading: no red spelling line and no blue grammar line under code. `spellcheck="false"` alone is not
 *     enough, the grammar helpers (Edge's Editor, Grammarly, LanguageTool) look for their own opt-out flags.
 *  2. closing pairs: typing ( [ { ' " also types the closing one, typing the closer steps over it,
 *     Backspace on an empty pair removes both, Enter between { } opens an indented line.
 *  3. suggestions like VS Code's C/C++ helper, and only that: keywords, snippets for the usual statements,
 *     the C standard library with its signatures, `#include` headers, and the names the file itself declares
 *     (functions, variables, types, struct fields after . or ->). Plain English words are never suggested.
 *
 * Python boxes get the pairs and the Python grammar's own keyword and builtin suggestions.
 */
import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { cpp } from "@codemirror/lang-cpp";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { Prec, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, hoverTooltip, keymap, showTooltip, type Tooltip } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

/* ------------------------------------------------------------- no proofreading */

const NO_PROOF = {
  spellcheck: "false",
  autocorrect: "off",
  autocapitalize: "off",
  autocomplete: "off",
  translate: "no",
  // Grammarly, LanguageTool and Microsoft Editor (Edge) each read their own flag
  "data-gramm": "false",
  "data-gramm_editor": "false",
  "data-enable-grammarly": "false",
  "data-lt-active": "false",
  "data-ms-editor": "false",
};

/** On the editable area and on the editor's root, so a helper that walks up from either finds the flag */
export const noProofreading: Extension = [
  EditorView.contentAttributes.of(NO_PROOF),
  EditorView.editorAttributes.of(NO_PROOF),
];

/* ------------------------------------------------------------------- C library */

type Lib = [name: string, signature: string, header: string, template?: string];

const LIB: Lib[] = [
  ["printf", "int printf(const char *format, ...)", "stdio.h", 'printf("${}")'],
  ["scanf", "int scanf(const char *format, ...)", "stdio.h", 'scanf("${%d}", &${})'],
  ["puts", "int puts(const char *s)", "stdio.h"],
  ["putchar", "int putchar(int c)", "stdio.h"],
  ["getchar", "int getchar(void)", "stdio.h", "getchar()"],
  ["fgets", "char *fgets(char *s, int size, FILE *stream)", "stdio.h", "fgets(${}, ${}, stdin)"],
  ["fputs", "int fputs(const char *s, FILE *stream)", "stdio.h"],
  ["sprintf", "int sprintf(char *buf, const char *format, ...)", "stdio.h"],
  ["snprintf", "int snprintf(char *buf, size_t size, const char *format, ...)", "stdio.h"],
  ["sscanf", "int sscanf(const char *s, const char *format, ...)", "stdio.h"],
  ["fprintf", "int fprintf(FILE *stream, const char *format, ...)", "stdio.h"],
  ["fscanf", "int fscanf(FILE *stream, const char *format, ...)", "stdio.h"],
  ["fopen", "FILE *fopen(const char *path, const char *mode)", "stdio.h"],
  ["fclose", "int fclose(FILE *stream)", "stdio.h"],
  ["strlen", "size_t strlen(const char *s)", "string.h"],
  ["strcpy", "char *strcpy(char *dest, const char *src)", "string.h"],
  ["strncpy", "char *strncpy(char *dest, const char *src, size_t n)", "string.h"],
  ["strcmp", "int strcmp(const char *a, const char *b)", "string.h"],
  ["strncmp", "int strncmp(const char *a, const char *b, size_t n)", "string.h"],
  ["strcat", "char *strcat(char *dest, const char *src)", "string.h"],
  ["strncat", "char *strncat(char *dest, const char *src, size_t n)", "string.h"],
  ["strchr", "char *strchr(const char *s, int c)", "string.h"],
  ["strrchr", "char *strrchr(const char *s, int c)", "string.h"],
  ["strstr", "char *strstr(const char *haystack, const char *needle)", "string.h"],
  ["strtok", "char *strtok(char *s, const char *delim)", "string.h"],
  ["memset", "void *memset(void *s, int c, size_t n)", "string.h"],
  ["memcpy", "void *memcpy(void *dest, const void *src, size_t n)", "string.h"],
  ["memmove", "void *memmove(void *dest, const void *src, size_t n)", "string.h"],
  ["memcmp", "int memcmp(const void *a, const void *b, size_t n)", "string.h"],
  ["malloc", "void *malloc(size_t size)", "stdlib.h", "malloc(${} * sizeof(${int}))"],
  ["calloc", "void *calloc(size_t n, size_t size)", "stdlib.h", "calloc(${}, sizeof(${int}))"],
  ["realloc", "void *realloc(void *ptr, size_t size)", "stdlib.h"],
  ["free", "void free(void *ptr)", "stdlib.h"],
  ["atoi", "int atoi(const char *s)", "stdlib.h"],
  ["atol", "long atol(const char *s)", "stdlib.h"],
  ["atof", "double atof(const char *s)", "stdlib.h"],
  ["strtol", "long strtol(const char *s, char **end, int base)", "stdlib.h"],
  ["abs", "int abs(int n)", "stdlib.h"],
  ["labs", "long labs(long n)", "stdlib.h"],
  [
    "qsort",
    "void qsort(void *base, size_t n, size_t size, int (*cmp)(const void *, const void *))",
    "stdlib.h",
  ],
  ["rand", "int rand(void)", "stdlib.h", "rand()"],
  ["srand", "void srand(unsigned int seed)", "stdlib.h"],
  ["exit", "void exit(int status)", "stdlib.h"],
  ["sqrt", "double sqrt(double x)", "math.h"],
  ["cbrt", "double cbrt(double x)", "math.h"],
  ["pow", "double pow(double base, double exp)", "math.h"],
  ["fabs", "double fabs(double x)", "math.h"],
  ["ceil", "double ceil(double x)", "math.h"],
  ["floor", "double floor(double x)", "math.h"],
  ["round", "double round(double x)", "math.h"],
  ["fmod", "double fmod(double x, double y)", "math.h"],
  ["hypot", "double hypot(double x, double y)", "math.h"],
  ["exp", "double exp(double x)", "math.h"],
  ["log", "double log(double x)", "math.h"],
  ["log10", "double log10(double x)", "math.h"],
  ["sin", "double sin(double x)", "math.h"],
  ["cos", "double cos(double x)", "math.h"],
  ["tan", "double tan(double x)", "math.h"],
  ["atan2", "double atan2(double y, double x)", "math.h"],
  ["isdigit", "int isdigit(int c)", "ctype.h"],
  ["isalpha", "int isalpha(int c)", "ctype.h"],
  ["isalnum", "int isalnum(int c)", "ctype.h"],
  ["isspace", "int isspace(int c)", "ctype.h"],
  ["isupper", "int isupper(int c)", "ctype.h"],
  ["islower", "int islower(int c)", "ctype.h"],
  ["ispunct", "int ispunct(int c)", "ctype.h"],
  ["toupper", "int toupper(int c)", "ctype.h"],
  ["tolower", "int tolower(int c)", "ctype.h"],
];

const HEADERS = [
  "stdio.h",
  "stdlib.h",
  "string.h",
  "math.h",
  "ctype.h",
  "stdbool.h",
  "stdint.h",
  "limits.h",
  "stddef.h",
  "time.h",
];

const MACROS: [string, string][] = [
  ["NULL", "stddef.h"],
  ["EOF", "stdio.h"],
  ["BUFSIZ", "stdio.h"],
  ["stdin", "stdio.h"],
  ["stdout", "stdio.h"],
  ["stderr", "stdio.h"],
  ["EXIT_SUCCESS", "stdlib.h"],
  ["EXIT_FAILURE", "stdlib.h"],
  ["RAND_MAX", "stdlib.h"],
  ["INT_MAX", "limits.h"],
  ["INT_MIN", "limits.h"],
  ["UINT_MAX", "limits.h"],
  ["LONG_MAX", "limits.h"],
  ["LONG_MIN", "limits.h"],
  ["LLONG_MAX", "limits.h"],
  ["LLONG_MIN", "limits.h"],
  ["CHAR_BIT", "limits.h"],
  ["M_PI", "math.h"],
  ["true", "stdbool.h"],
  ["false", "stdbool.h"],
];

const TYPES: [string, string][] = [
  ["size_t", "stddef.h"],
  ["ptrdiff_t", "stddef.h"],
  ["bool", "stdbool.h"],
  ["FILE", "stdio.h"],
  ["int8_t", "stdint.h"],
  ["int16_t", "stdint.h"],
  ["int32_t", "stdint.h"],
  ["int64_t", "stdint.h"],
  ["uint8_t", "stdint.h"],
  ["uint16_t", "stdint.h"],
  ["uint32_t", "stdint.h"],
  ["uint64_t", "stdint.h"],
];

const KEYWORDS = [
  "auto",
  "break",
  "case",
  "char",
  "const",
  "continue",
  "default",
  "double",
  "enum",
  "extern",
  "float",
  "goto",
  "inline",
  "int",
  "long",
  "register",
  "return",
  "short",
  "signed",
  "sizeof",
  "static",
  "unsigned",
  "void",
  "volatile",
  "union",
];

/** Statement skeletons: Tab walks through the ${} places */
const SNIPPETS: [label: string, template: string, detail: string][] = [
  ["for", "for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}", "for loop"],
  ["while", "while (${condition}) {\n\t${}\n}", "while loop"],
  ["do", "do {\n\t${}\n} while (${condition});", "do-while loop"],
  ["if", "if (${condition}) {\n\t${}\n}", "if"],
  ["else", "else {\n\t${}\n}", "else"],
  ["switch", "switch (${value}) {\ncase ${1}:\n\t${}\n\tbreak;\ndefault:\n\tbreak;\n}", "switch"],
  ["main", "int main(void) {\n\t${}\n\treturn 0;\n}", "main function"],
  ["struct", "struct ${Name} {\n\t${}\n};", "struct"],
  ["typedef", "typedef struct {\n\t${}\n} ${Name};", "typedef struct"],
  ["enum", "enum ${Name} { ${A}, ${B} };", "enum"],
];

const DIRECTIVES: [string, string][] = [
  ["#include", "#include <${stdio.h}>"],
  ["#define", "#define ${NAME} ${value}"],
  ["#ifdef", "#ifdef ${NAME}\n${}\n#endif"],
  ["#ifndef", "#ifndef ${NAME}\n${}\n#endif"],
];

const fn = (c: Lib): Completion => {
  const [name, signature, header, template] = c;
  const base: Completion = {
    label: name,
    type: "function",
    detail: `<${header}>`,
    info: signature,
    boost: -1,
  };
  return snippetCompletion(template ?? `${name}(\${})`, base);
};

const LIBRARY: Completion[] = [
  ...KEYWORDS.map((label): Completion => ({ label, type: "keyword", boost: -2 })),
  ...SNIPPETS.map(([label, template, detail]) =>
    snippetCompletion(template, { label, type: "keyword", detail, boost: 2 }),
  ),
  ...LIB.map(fn),
  ...MACROS.map(([label, h]): Completion => ({
    label,
    type: "constant",
    detail: `<${h}>`,
    boost: -2,
  })),
  ...TYPES.map(([label, h]): Completion => ({ label, type: "type", detail: `<${h}>`, boost: -1 })),
];

const LIBRARY_LABELS = new Set(LIBRARY.map((c) => c.label));

/* ----------------------------------------------------------- the file's own names */

const OWN_KINDS = new Set(["Identifier", "TypeIdentifier", "FieldIdentifier"]);

/** The functions, variables, macros, types and fields the file declares or uses, nearest-looking first */
function ownNames(state: EditorState, at: number): { names: Completion[]; fields: Completion[] } {
  const seen = new Map<string, Completion>();
  const fields = new Map<string, Completion>();
  syntaxTree(state).iterate({
    enter(ref) {
      if (!OWN_KINDS.has(ref.name)) return;
      // the word being typed right now is not a suggestion for itself
      if (ref.from <= at && at <= ref.to) return;
      const label = state.sliceDoc(ref.from, ref.to);
      if (!label) return;
      if (ref.name === "FieldIdentifier") {
        fields.set(label, { label, type: "property", boost: 3 });
        return;
      }
      if (LIBRARY_LABELS.has(label)) return;
      const parent = ref.node.parent?.name ?? "";
      const type =
        ref.name === "TypeIdentifier"
          ? "type"
          : parent === "FunctionDeclarator" || parent === "CallExpression"
            ? "function"
            : parent === "PreprocDirective"
              ? "constant"
              : "variable";
      const had = seen.get(label);
      // a name seen as a call or a definition is a function even if it also appears as a plain use
      if (had && (had.type === "function" || type !== "function")) return;
      seen.set(label, { label, type, detail: "file", boost: type === "function" ? 4 : 5 });
    },
  });
  return { names: [...seen.values()], fields: [...fields.values()] };
}

/* ------------------------------------------------------------------------ source */

const LITERAL = /Comment|String|CharLiteral/;

function insideLiteral(state: EditorState, pos: number): boolean {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent)
    if (LITERAL.test(n.name)) return true;
  return false;
}

export const cCompletions: CompletionSource = (
  context: CompletionContext,
): CompletionResult | null => {
  const { state, pos } = context;
  if (state.readOnly) return null;
  const line = state.doc.lineAt(pos);
  const before = state.sliceDoc(line.from, pos);

  // #include <st...: the headers (checked first, a <...> after #include is a string in the tree)
  const inc = /^\s*#\s*include\s+(<?)([\w./]*)$/.exec(before);
  if (inc) {
    const from = pos - inc[2].length;
    return {
      from,
      validFor: /^[\w./]*$/,
      options: HEADERS.map((h) => ({
        label: h,
        type: "text",
        // "<" already typed: finish the header; otherwise write the whole <header>
        apply: inc[1] ? `${h}>` : `<${h}>`,
      })),
    };
  }

  if (insideLiteral(state, pos)) return null;

  // #define / #include / ...
  const dir = context.matchBefore(/#\w*/);
  if (dir && /^\s*#\w*$/.test(before)) {
    return {
      from: dir.from,
      validFor: /^#\w*$/,
      options: DIRECTIVES.map(([label, template]) =>
        snippetCompletion(template, { label, type: "keyword", boost: 2 }),
      ),
    };
  }

  const word = context.matchBefore(/\w*/);
  if (!word) return null;
  if (word.text && !/^[A-Za-z_]/.test(word.text)) return null; // a number or 0x1f
  const member = /(\.|->)\s*\w*$/.test(before) && !/(^|[^\w])\d+\.\w*$/.test(before);
  // a bare "." or "->" opens the field list at once, like VS Code; elsewhere wait for a letter
  if (!word.text && !member && !context.explicit) return null;
  const own = ownNames(state, pos);

  // after . or -> only the struct fields the file knows
  if (member) {
    return own.fields.length ? { from: word.from, options: own.fields, validFor: /^\w*$/ } : null;
  }

  return { from: word.from, options: [...own.names, ...LIBRARY], validFor: /^\w*$/ };
};

/* ------------------------------------------------------- what a name is (hover, hints) */

/** One declaration the file makes, or one library entry, ready to show */
export interface Hint {
  from: number;
  to: number;
  /** `local variable`, `parameter`, `function`, `struct`, ... shown in brackets before the text */
  kind: string;
  /** The declaration as written: `int total`, `int jumlah(int a, const char *s)` */
  sig: string;
  /** A second, quieter line: the header it comes from, the struct a field belongs to */
  note?: string;
}

interface Decl {
  name: string;
  sig: string;
  kind: string;
  note?: string;
  /** for a field: the struct or typedef name it belongs to */
  owner?: string;
  /** where the name itself sits in the file */
  at: number;
  /** the range within which the name can be used (a block, a function, the whole file) */
  scopeFrom: number;
  scopeTo: number;
}

interface Scan {
  vars: Decl[];
  funcs: Decl[];
  macros: Decl[];
  fields: Decl[];
  types: Decl[];
}

/** The declarators C can wrap around a name: `*p`, `a[10]`, `f(int)`, `(*f)`, `x = 1` */
const DECLARATORS = new Set([
  "InitDeclarator",
  "PointerDeclarator",
  "ArrayDeclarator",
  "FunctionDeclarator",
  "ParenthesizedDeclarator",
  "ReferenceDeclarator",
  "AttributedDeclarator",
]);

/** The name inside a declarator, found by going down its FIRST declarator child (never into an initializer) */
function declName(n: SyntaxNode, want: string): SyntaxNode | null {
  if (n.name === want) return n;
  if (!DECLARATORS.has(n.name)) return null;
  for (let c = n.firstChild; c; c = c.nextSibling)
    if (c.name === want || DECLARATORS.has(c.name)) return declName(c, want);
  return null;
}

/** `x = 1` is `x`, `*p = &x` is `*p`: the declarator without its initializer */
function bare(n: SyntaxNode): SyntaxNode {
  if (n.name !== "InitDeclarator") return n;
  for (let c = n.firstChild; c; c = c.nextSibling)
    if (c.name === "Identifier" || DECLARATORS.has(c.name)) return c;
  return n;
}

const squash = (s: string, max = 320) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const scans = new WeakMap<object, Scan>();

/** Every declaration of the file, from the syntax tree (cached per document) */
function scan(state: EditorState): Scan {
  const have = scans.get(state.doc);
  if (have) return have;
  const tree = ensureSyntaxTree(state, state.doc.length, 60);
  const out: Scan = { vars: [], funcs: [], macros: [], fields: [], types: [] };
  const text = (a: number, b: number) => state.sliceDoc(a, b);
  const scopeOf = (n: SyntaxNode): SyntaxNode => {
    let p: SyntaxNode | null = n.parent;
    while (p && p.name !== "CompoundStatement" && p.name !== "ForStatement" && p.name !== "Program")
      p = p.parent;
    return p ?? n;
  };
  (tree ?? syntaxTree(state)).iterate({
    enter(ref) {
      const node = ref.node;
      switch (ref.name) {
        case "PreprocDirective": {
          const id = node.getChild("Identifier");
          if (id && text(node.from, node.from + 7) === "#define")
            out.macros.push({
              name: text(id.from, id.to),
              sig: squash(text(node.from, node.to).split("\n")[0]),
              kind: "macro",
              at: id.from,
              scopeFrom: 0,
              scopeTo: state.doc.length,
            });
          break;
        }
        case "FunctionDefinition": {
          const id = node.getChild("FunctionDeclarator")?.getChild("Identifier");
          const body = node.getChild("CompoundStatement");
          if (id)
            out.funcs.push({
              name: text(id.from, id.to),
              sig: squash(text(node.from, body ? body.from : node.to)),
              kind: "function",
              at: id.from,
              scopeFrom: 0,
              scopeTo: state.doc.length,
            });
          break;
        }
        case "Declaration":
        case "ParameterDeclaration": {
          // a parameter reaches the whole function; in a prototype, only the prototype itself
          const isParam = ref.name === "ParameterDeclaration";
          let fn: SyntaxNode | null = null;
          if (isParam)
            for (let p: SyntaxNode | null = node.parent; p; p = p.parent)
              if (p.name === "FunctionDefinition" || p.name === "Declaration") {
                fn = p;
                break;
              } else if (p.name === "CompoundStatement") break;
          if (isParam && !fn) break;
          let first: SyntaxNode | null = null;
          for (let c = node.firstChild; c; c = c.nextSibling) {
            const id = declName(c, "Identifier");
            if (!id) continue;
            first ??= c;
            const type = squash(text(node.from, first.from));
            if (!isParam && c.name === "FunctionDeclarator") {
              out.funcs.push({
                name: text(id.from, id.to),
                sig: squash(text(node.from, node.to).replace(/;\s*$/, "")),
                kind: "function",
                at: id.from,
                scopeFrom: 0,
                scopeTo: state.doc.length,
              });
              continue;
            }
            const part = bare(c);
            const sc = isParam ? fn! : scopeOf(node);
            out.vars.push({
              name: text(id.from, id.to),
              sig: squash(`${type} ${text(part.from, part.to)}`),
              kind: isParam
                ? "parameter"
                : sc.name === "Program"
                  ? "global variable"
                  : "local variable",
              at: id.from,
              scopeFrom: sc.from,
              scopeTo: sc.name === "Program" ? state.doc.length : sc.to,
            });
          }
          break;
        }
        case "FieldDeclaration": {
          let owner = "";
          const list = node.parent;
          const spec = list?.parent;
          if (spec) {
            const nm =
              spec.getChild("TypeIdentifier") ??
              (spec.parent?.name === "TypeDefinition"
                ? spec.parent.getChild("TypeIdentifier")
                : null);
            if (nm) owner = text(nm.from, nm.to);
          }
          let first: SyntaxNode | null = null;
          for (let c = node.firstChild; c; c = c.nextSibling) {
            const id = declName(c, "FieldIdentifier");
            if (!id) continue;
            first ??= c;
            const part = bare(c);
            out.fields.push({
              name: text(id.from, id.to),
              sig: squash(`${text(node.from, first.from)} ${text(part.from, part.to)}`),
              kind: "field",
              owner,
              note: owner
                ? `in ${spec?.name === "UnionSpecifier" ? "union" : "struct"} ${owner}`
                : undefined,
              at: id.from,
              scopeFrom: 0,
              scopeTo: state.doc.length,
            });
          }
          break;
        }
        case "StructSpecifier":
        case "UnionSpecifier":
        case "EnumSpecifier": {
          const id = node.getChild("TypeIdentifier");
          const body = node.getChild("FieldDeclarationList") ?? node.getChild("EnumeratorList");
          if (id && body)
            out.types.push({
              name: text(id.from, id.to),
              sig: squash(text(node.from, node.to)),
              kind:
                ref.name === "StructSpecifier"
                  ? "struct"
                  : ref.name === "UnionSpecifier"
                    ? "union"
                    : "enum",
              at: id.from,
              scopeFrom: 0,
              scopeTo: state.doc.length,
            });
          break;
        }
        case "TypeDefinition": {
          let id: SyntaxNode | null = null;
          for (let c = node.firstChild; c; c = c.nextSibling)
            if (c.name === "TypeIdentifier") id = c;
          if (id)
            out.types.push({
              name: text(id.from, id.to),
              sig: squash(text(node.from, node.to).replace(/;\s*$/, "")),
              kind: "typedef",
              at: id.from,
              scopeFrom: 0,
              scopeTo: state.doc.length,
            });
          break;
        }
      }
    },
  });
  if (tree) scans.set(state.doc, out);
  return out;
}

const LIB_BY_NAME = new Map(LIB.map((l) => [l[0], l]));
const MACRO_BY_NAME = new Map(MACROS);
const TYPE_BY_NAME = new Map(TYPES);

/** The function a call or a hover names: the file's own first, then the C library */
function functionNamed(state: EditorState, name: string): Omit<Hint, "from" | "to"> | null {
  const own = scan(state).funcs;
  const f = own.find((d) => d.name === name);
  if (f) return { kind: "function", sig: f.sig };
  const l = LIB_BY_NAME.get(name);
  return l ? { kind: "function", sig: l[1], note: `<${l[2]}>` } : null;
}

const NAMEY = new Set(["Identifier", "FieldIdentifier", "TypeIdentifier"]);

/** What the name under `pos` is, like VS Code's hover: a variable's type, a function's signature, a struct, a macro */
export function describeAt(state: EditorState, pos: number): Hint | null {
  const tree = syntaxTree(state);
  let n = tree.resolveInner(pos, 1);
  if (!NAMEY.has(n.name)) n = tree.resolveInner(pos, -1);
  if (!NAMEY.has(n.name)) return null;
  const name = state.sliceDoc(n.from, n.to);
  const at = { from: n.from, to: n.to };
  const s = scan(state);
  const pick = (list: Decl[]) => list.find((d) => d.name === name);

  if (n.name === "FieldIdentifier") {
    const named = s.fields.filter((d) => d.name === name);
    // its own declaration; else the struct of the thing in `q.x` / `p->x`; else the first field of that name
    let f = named.find((d) => d.at === n.from);
    const left = n.parent?.name === "FieldExpression" ? n.parent.firstChild : null;
    if (!f && left?.name === "Identifier") {
      const owner = describeAt(state, left.from);
      const words: string[] = owner?.sig.match(/\w+/g) ?? [];
      f = named.find((d) => d.owner && words.includes(d.owner));
    }
    f ??= named[0];
    return f ? { ...at, kind: f.kind, sig: f.sig, note: f.note } : null;
  }
  if (n.name === "TypeIdentifier") {
    const t = pick(s.types);
    if (t) return { ...at, kind: t.kind, sig: t.sig };
    const lib = TYPE_BY_NAME.get(name);
    return lib ? { ...at, kind: "type", sig: name, note: `<${lib}>` } : null;
  }
  // a variable in reach: declared before, in a block that holds the spot; the nearest declaration wins
  const v = s.vars
    .filter(
      (d) => d.name === name && d.at <= n.from && d.scopeFrom <= n.from && n.from <= d.scopeTo,
    )
    .sort((a, b) => b.at - a.at)[0];
  if (v) return { ...at, kind: v.kind, sig: v.sig };
  const fn = functionNamed(state, name);
  if (fn) return { ...at, ...fn };
  const m = pick(s.macros);
  if (m) return { ...at, kind: m.kind, sig: m.sig };
  const lm = MACRO_BY_NAME.get(name);
  if (lm) return { ...at, kind: "macro", sig: name, note: `<${lm}>` };
  return null;
}

/** The call the cursor is inside, with its function's parameters and which one is being typed (VS Code's parameter hints) */
export function signatureAt(
  state: EditorState,
  pos: number,
): { at: number; name: string; sig: string; params: string[]; active: number } | null {
  // the innermost call whose ( is before the cursor and whose ) is not (or is missing)
  let args: SyntaxNode | null = null;
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name !== "ArgumentList") continue;
    const closed = state.sliceDoc(n.to - 1, n.to) === ")";
    if (pos > n.from && (!closed || pos < n.to)) {
      args = n;
      break;
    }
  }
  const call = args?.parent;
  const callee = call?.firstChild;
  if (!args || !call || !callee || callee.name !== "Identifier") return null;
  const name = state.sliceDoc(callee.from, callee.to);
  const fn = functionNamed(state, name);
  if (!fn) return null;
  const open = fn.sig.indexOf("(", fn.sig.indexOf(name));
  const close = fn.sig.lastIndexOf(")");
  if (open < 0 || close < open) return null;
  const params: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of fn.sig.slice(open + 1, close)) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      params.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() && cur.trim() !== "void") params.push(cur.trim());
  let active = 0;
  for (let c = args.firstChild; c; c = c.nextSibling) if (c.name === "," && c.to <= pos) active++;
  if (active >= params.length && params[params.length - 1] === "...") active = params.length - 1;
  return { at: callee.from, name, sig: fn.sig, params, active };
}

/* ---------------------------------------------------------------- the tooltips */

const el = (tag: string, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function hintDom(h: Hint): HTMLElement {
  const dom = el("div", "cm-sig");
  const code = el("code", "cm-sig__code");
  code.append(el("span", "cm-sig__kind", `(${h.kind}) `), document.createTextNode(h.sig));
  dom.append(code);
  if (h.note) dom.append(el("div", "cm-sig__note", h.note));
  return dom;
}

function paramsDom(s: NonNullable<ReturnType<typeof signatureAt>>): HTMLElement {
  const dom = el("div", "cm-sig");
  const code = el("code", "cm-sig__code");
  const open = s.sig.indexOf("(", s.sig.indexOf(s.name));
  const close = s.sig.lastIndexOf(")");
  code.append(document.createTextNode(s.sig.slice(0, open + 1)));
  s.params.forEach((p, i) => {
    if (i) code.append(document.createTextNode(", "));
    code.append(el("span", i === s.active ? "cm-sig__on" : "cm-sig__off", p));
  });
  code.append(document.createTextNode(s.sig.slice(close)));
  dom.append(code);
  return dom;
}

/** Hover a name: its declaration, like VS Code's C/C++ extension */
const hoverInfo = hoverTooltip(
  (view, pos) => {
    const h = describeAt(view.state, pos);
    return h ? { pos: h.from, end: h.to, above: true, create: () => ({ dom: hintDom(h) }) } : null;
  },
  { hideOnChange: true },
);

function helpTooltip(state: EditorState): Tooltip | null {
  const sel = state.selection.main;
  if (state.readOnly || !sel.empty) return null;
  const s = signatureAt(state, sel.head);
  if (!s || s.params.length === 0) return null;
  return { pos: s.at, above: true, strictSide: true, create: () => ({ dom: paramsDom(s) }) };
}

/** While the cursor is inside a call, a hint above it with the parameters, the one being typed in bold */
const parameterHints = StateField.define<Tooltip | null>({
  create: helpTooltip,
  update: (v, tr) => (tr.docChanged || tr.selection ? helpTooltip(tr.state) : v),
  provide: (f) => showTooltip.from(f),
});

/* --------------------------------------------------------------------- bundles */

const assistTheme = EditorView.theme({
  ".cm-tooltip": {
    border: "1px solid var(--hairline-strong, #3a3d52)",
    borderRadius: "8px",
    backgroundColor: "var(--surface-2, #1c1e2c)",
    color: "var(--text, #e8e9f2)",
    boxShadow: "0 12px 32px rgb(0 0 0 / 0.35)",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)",
    fontSize: "12.5px",
    maxHeight: "248px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "2px 10px", lineHeight: "1.6" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "color-mix(in srgb, var(--accent, #7c8cff) 26%, transparent)",
    color: "var(--text, #e8e9f2)",
  },
  ".cm-completionDetail": {
    marginLeft: "1.2em",
    fontStyle: "normal",
    color: "var(--text-faint, #7d8099)",
  },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    fontWeight: "700",
    color: "var(--accent, #7c8cff)",
  },
  ".cm-tooltip .cm-completionInfo": {
    padding: "6px 10px",
    fontFamily: "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)",
    fontSize: "12px",
    color: "var(--text-muted, #aeb1c8)",
  },
  ".cm-sig": { padding: "6px 10px", maxWidth: "460px" },
  ".cm-sig__code": {
    display: "block",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)",
    fontSize: "12.5px",
    lineHeight: "1.55",
  },
  ".cm-sig__kind": { color: "var(--text-faint, #7d8099)" },
  ".cm-sig__note": {
    marginTop: "3px",
    fontSize: "11.5px",
    color: "var(--text-faint, #7d8099)",
  },
  ".cm-sig__on": { fontWeight: "700", color: "var(--accent, #7c8cff)" },
  ".cm-sig__off": { color: "var(--text-muted, #aeb1c8)" },
  ".cm-snippetField": {
    backgroundColor: "color-mix(in srgb, var(--accent, #7c8cff) 20%, transparent)",
  },
});

const OPENER: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/** Would a typed `ch` right here close something that is still open? (quotes: an odd count on the line so far) */
export function closesOpen(before: string, line: string, ch: string): boolean {
  if (ch === '"' || ch === "'") {
    let n = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "\\") i++;
      else if (line[i] === ch) n++;
    }
    return n % 2 === 1;
  }
  const open = OPENER[ch];
  if (!open) return false;
  let depth = 0;
  for (const c of before) {
    if (c === open) depth++;
    else if (c === ch) depth--;
  }
  return depth > 0;
}

/**
 * A snippet (printf("") and the like) writes its closing quote or bracket as plain text, so closeBrackets does
 * not know it is a closer, and typing one would add a second. When the typed closer already stands right
 * after the cursor and closes something still open, the cursor just steps over it.
 */
const closerStepOver = Prec.high(
  EditorView.inputHandler.of((view, from, to, text) => {
    if (from !== to || text.length !== 1 || !`"')]}`.includes(text)) return false;
    const st = view.state;
    if (st.readOnly || st.sliceDoc(to, to + 1) !== text) return false;
    const line = st.doc.lineAt(to);
    if (!closesOpen(st.sliceDoc(0, to), st.sliceDoc(line.from, to), text)) return false;
    view.dispatch({ selection: { anchor: to + 1 }, scrollIntoView: true, userEvent: "input.type" });
    return true;
  }),
);

/** The C language with its suggestions; use it where `cpp()` was */
export function cSupport(): Extension {
  const lang = cpp();
  return [lang, lang.language.data.of({ autocomplete: cCompletions })];
}

/**
 * Closing pairs, the suggestion popup and the opt-outs from proofreading. Put it BEFORE the editor's own
 * keymap: Backspace on a pair and Tab to accept must win over the plain defaults.
 */
export function codeAssist(): Extension {
  return [
    noProofreading,
    closerStepOver,
    closeBrackets(),
    autocompletion({ icons: true, maxRenderedOptions: 60 }),
    keymap.of([...closeBracketsKeymap, { key: "Tab", run: acceptCompletion }]),
    hoverInfo,
    parameterHints,
    assistTheme,
  ];
}
