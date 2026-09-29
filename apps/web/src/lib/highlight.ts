/**
 * A small syntax highlighter for the Code step's two languages: Arduino C++
 * and Python. It only colours, it never changes text, so the editor can
 * wrap it around the blanks without touching what a student downloads.
 *
 * The whole sketch is tokenized in one pass with every blank stood in for
 * by BLANK_MARK, so a string or comment that runs through a blank (a
 * `"/grup" + ____` or a `// (3) ...` hint line) is still one token and
 * colours correctly on both sides of the input.
 */

export type CodeLang = "cpp" | "py";
export type TokenKind =
  "comment" | "string" | "number" | "keyword" | "type" | "preproc" | "func" | "const" | "deco";

export interface Token {
  text: string;
  kind?: TokenKind;
}

/** Stands in for a blank while tokenizing. Never occurs in a sketch. */
export const BLANK_MARK = "\u0000";

const CPP_KEYWORDS = new Set(
  (
    "if else for while do switch case default break continue return goto " +
    "new delete this true false nullptr NULL class struct enum union public " +
    "private protected virtual override static const constexpr volatile " +
    "extern inline typedef using namespace template typename sizeof auto " +
    "operator friend try catch throw HIGH LOW INPUT OUTPUT INPUT_PULLUP"
  ).split(" "),
);
const CPP_TYPES = new Set(
  (
    "void int long short char bool float double unsigned signed size_t " +
    "uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t " +
    "byte word String boolean"
  ).split(" "),
);
const PY_KEYWORDS = new Set(
  (
    "and as assert async await break class continue def del elif else " +
    "except finally for from global if import in is lambda nonlocal not or " +
    "pass raise return try while with yield True False None"
  ).split(" "),
);
const PY_BUILTINS = new Set(
  (
    "print len range int str float bool dict list set tuple open isinstance " +
    "enumerate zip min max sum abs round sorted any all self"
  ).split(" "),
);

/** Picks the language from the sketch itself, not its file name. */
export function detectLang(source: string): CodeLang {
  return /^\s*#\s*include\b|\bvoid\s+(setup|loop)\s*\(/m.test(source) ? "cpp" : "py";
}

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER = /(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[uUlLfF]*/y;

export function tokenize(src: string, lang: CodeLang): Token[] {
  const out: Token[] = [];
  let plain = "";
  const flush = () => {
    if (plain) out.push({ text: plain });
    plain = "";
  };
  const push = (text: string, kind: TokenKind) => {
    flush();
    out.push({ text, kind });
  };
  const n = src.length;
  let i = 0;
  let lineStart = true;

  /** A string literal from i: returns its end index (exclusive). */
  const stringEnd = (from: number, quote: string, triple: boolean): number => {
    let j = from + (triple ? 3 : 1);
    while (j < n) {
      const c = src[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (triple) {
        if (src.startsWith(quote.repeat(3), j)) return j + 3;
      } else {
        if (c === quote) return j + 1;
        if (c === "\n") return j;
      }
      j++;
    }
    return n;
  };

  while (i < n) {
    const c = src[i];

    // Comments.
    if (lang === "cpp" && src.startsWith("//", i)) {
      const e = src.indexOf("\n", i);
      const end = e === -1 ? n : e;
      push(src.slice(i, end), "comment");
      i = end;
      continue;
    }
    if (lang === "cpp" && src.startsWith("/*", i)) {
      const e = src.indexOf("*/", i + 2);
      const end = e === -1 ? n : e + 2;
      push(src.slice(i, end), "comment");
      i = end;
      continue;
    }
    if (lang === "py" && c === "#") {
      const e = src.indexOf("\n", i);
      const end = e === -1 ? n : e;
      push(src.slice(i, end), "comment");
      i = end;
      continue;
    }

    // Preprocessor directive word, then an <header> on the same line.
    if (lang === "cpp" && c === "#" && lineStart) {
      IDENT.lastIndex = i + 1;
      const m = IDENT.exec(src);
      const end = m ? i + 1 + m[0].length : i + 1;
      push(src.slice(i, end), "preproc");
      i = end;
      const rest = /^\s*<[^>\n]*>/.exec(src.slice(i));
      if (rest) {
        plain += rest[0].slice(0, rest[0].indexOf("<"));
        push(rest[0].slice(rest[0].indexOf("<")), "string");
        i += rest[0].length;
      }
      lineStart = false;
      continue;
    }

    // Strings, with Python's prefixes and triple quotes.
    if (lang === "py" && /[rRbBfFuU]/.test(c) && /["']/.test(src[i + 1] ?? "")) {
      const q = src[i + 1];
      const triple = src.startsWith(q.repeat(3), i + 1);
      const end = stringEnd(i + 1, q, triple);
      push(src.slice(i, end), "string");
      i = end;
      lineStart = false;
      continue;
    }
    if (c === '"' || c === "'") {
      const triple = lang === "py" && src.startsWith(c.repeat(3), i);
      const end = stringEnd(i, c, triple);
      push(src.slice(i, end), "string");
      i = end;
      lineStart = false;
      continue;
    }

    // Python decorators.
    if (lang === "py" && c === "@" && lineStart) {
      IDENT.lastIndex = i + 1;
      const m = IDENT.exec(src);
      const end = m ? i + 1 + m[0].length : i + 1;
      push(src.slice(i, end), "deco");
      i = end;
      lineStart = false;
      continue;
    }

    // Numbers (not the tail of an identifier).
    if (/\d/.test(c) && !/[A-Za-z0-9_]/.test(src[i - 1] ?? "")) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(src);
      if (m) {
        push(m[0], "number");
        i += m[0].length;
        lineStart = false;
        continue;
      }
    }

    // Identifiers.
    if (/[A-Za-z_]/.test(c)) {
      IDENT.lastIndex = i;
      const word = IDENT.exec(src)![0];
      const after = src.slice(i + word.length).match(/^\s*\(/);
      let kind: TokenKind | undefined;
      if (lang === "cpp") {
        if (CPP_KEYWORDS.has(word)) kind = "keyword";
        else if (CPP_TYPES.has(word)) kind = "type";
      } else if (PY_KEYWORDS.has(word)) kind = "keyword";
      else if (PY_BUILTINS.has(word)) kind = "type";
      if (!kind && after) kind = "func";
      if (!kind && /^[A-Z][A-Z0-9_]{2,}$/.test(word)) kind = "const";
      if (kind) push(word, kind);
      else plain += word;
      i += word.length;
      lineStart = false;
      continue;
    }

    plain += c;
    if (c === "\n") lineStart = true;
    else if (c !== " " && c !== "\t") lineStart = false;
    i++;
  }
  flush();
  return out;
}
