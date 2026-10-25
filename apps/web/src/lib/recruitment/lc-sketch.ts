/**
 * The rules a candidate's sketch and the generated iris_seat.h must meet
 * (EXAM-ENGINE 9.4). The API applies them before it queues a compile job so a
 * bad sketch never waits in line; the PC agent applies the same ones again
 * (orangepi/agent/kompilasi.py), because the agent never trusts the site.
 * Pure and browser safe.
 *
 * A regex over source text is a first gate, not the wall: the compile itself
 * runs in a sandbox that cannot read the machine's secrets (kompilasi.py
 * confine()). So this errs toward refusing. It reads the whole text, comments
 * and strings included, after the compiler's own first phases (trigraphs and
 * line splicing), and refuses anything it cannot be sure of: an include whose
 * operand is not a plain path, include_next, import, embed, __has_include,
 * incbin, inline assembly and raw string literals.
 */
import { CODE_MAX } from "./lc-types.js";

export type SketchCheck =
  { ok: true } | { ok: false; kode: "berbahaya" | "terlalu_besar"; detail: string };

// Between the # and the keyword, and after it, only blanks may sit. A comment there is refused
// outright (HASH_COMMENT below) instead of being scanned, so no comment length can make the
// scan miss a directive, and a hostile file cannot make it crawl either.
const GAP = String.raw`[ \t\f\v]*`;
const HASH_COMMENT = /(?:#|%:)[ \t\f\v]*\/\*/;
const DIRECTIVE = new RegExp(
  String.raw`(?:#|%:)${GAP}(include_next|include|import|embed|define|undef)(?![A-Za-z0-9_])${GAP}`,
  "g",
);
const OPERAND = /^(?:<([^>\n]*)>|"([^"\n]*)")/;
const INCBIN_RE = /incbin|["']\s*\.include/i;
const HAS_INCLUDE_RE = /__has_include/;
const ASM_RE = /(?<![A-Za-z0-9_])(?:asm|__asm__|__asm)(?![A-Za-z0-9_])/;
const RAW_STRING_RE = /(?<![A-Za-z0-9_])(?:u8|u|U|L)?R"[^ ()\\\t\v\f\n"]{0,16}\(/;
const HEADER_LINE_RE = /^(?:|\/\/.*|#pragma once|#define IRIS_[A-Z0-9_]+(?:[ \t].*)?)$/;

const unsafePath = (p: string): boolean =>
  p.startsWith("/") || /^[A-Za-z]:/.test(p) || p.includes("..") || p.includes("\\");

const refuse = (kode: "berbahaya" | "terlalu_besar", detail: string): SketchCheck => ({
  ok: false,
  kode,
  detail,
});

/** What the compiler's first phases make of the text: trigraphs, then spliced lines. */
const preprocessed = (src: string): string =>
  src
    .replace(/\?\?\//g, "\\")
    .replace(/\?\?=/g, "#")
    .replace(/\\[ \t\f\v]*(?:\r\n|\n|\r)/g, "");

/** Code that reaches outside its folder, sets the seat's constants itself or is too big is refused. */
export function checkSketch(sketch: string): SketchCheck {
  if (new TextEncoder().encode(sketch).length > CODE_MAX)
    return refuse("terlalu_besar", "The sketch is larger than 64 KB");
  const text = preprocessed(sketch);
  if (HASH_COMMENT.test(text)) return refuse("berbahaya", "a comment right after # is not allowed");
  for (const m of text.matchAll(DIRECTIVE)) {
    const after = m.index + m[0].length;
    if (m[1] === "define" || m[1] === "undef") {
      if (text.startsWith("IRIS_", after))
        return refuse("berbahaya", "IRIS_ names are set by the seat's header, not by the sketch");
      continue;
    }
    const operand = OPERAND.exec(text.slice(after));
    if (!operand)
      return refuse("berbahaya", `#${m[1]} must name a file in quotes or angle brackets`);
    const path = operand[1] ?? operand[2];
    if (m[1] !== "include" || unsafePath(path))
      return refuse("berbahaya", `#${m[1]} "${path}" is not allowed`);
  }
  if (HAS_INCLUDE_RE.test(text)) return refuse("berbahaya", "__has_include is not allowed");
  if (INCBIN_RE.test(text)) return refuse("berbahaya", "incbin is not allowed");
  if (ASM_RE.test(text)) return refuse("berbahaya", "inline assembly is not allowed");
  if (RAW_STRING_RE.test(text)) return refuse("berbahaya", "raw string literals are not allowed");
  return { ok: true };
}

/** The generated header holds defines of IRIS_ names and nothing else. */
export function checkHeader(header: string): SketchCheck {
  for (const line of header.split(/\r?\n/))
    if (line.trimEnd().endsWith("\\") || !HEADER_LINE_RE.test(line.trim()))
      return refuse("berbahaya", "The seat header holds something other than IRIS_ defines");
  return { ok: true };
}
