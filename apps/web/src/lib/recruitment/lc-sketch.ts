/**
 * The rules a candidate's sketch and the generated iris_seat.h must meet
 * (EXAM-ENGINE 9.4). The API applies them before it queues a compile job so a
 * bad sketch never waits in line; the PC agent applies the same ones again
 * (orangepi/agent/kompilasi.py), because the agent never trusts the site.
 * Pure and browser safe.
 */
import { CODE_MAX } from "./lc-types.js";

export type SketchCheck =
  { ok: true } | { ok: false; kode: "berbahaya" | "terlalu_besar"; detail: string };

const INCLUDE_RE = /^[ \t]*#[ \t]*include[ \t]*[<"]([^>"\n]*)[>"]/gm;
const INCBIN_RE = /incbin|["']\s*\.include/i;
const IRIS_DEF_RE = /^[ \t]*#[ \t]*(?:define|undef)[ \t]+IRIS_/m;
const HEADER_LINE_RE = /^(?:|\/\/.*|#pragma once|#define IRIS_[A-Z0-9_]+(?:[ \t].*)?)$/;

const unsafePath = (p: string): boolean =>
  p.startsWith("/") || /^[A-Za-z]:/.test(p) || p.includes("..") || p.includes("\\");

const refuse = (kode: "berbahaya" | "terlalu_besar", detail: string): SketchCheck => ({
  ok: false,
  kode,
  detail,
});

/** Code that reaches outside its folder, sets the seat's constants itself or is too big is refused. */
export function checkSketch(sketch: string): SketchCheck {
  if (new TextEncoder().encode(sketch).length > CODE_MAX)
    return refuse("terlalu_besar", "The sketch is larger than 64 KB");
  for (const m of sketch.matchAll(INCLUDE_RE))
    if (unsafePath(m[1]))
      return refuse("berbahaya", `#include "${m[1]}" reaches outside the sketch`);
  if (INCBIN_RE.test(sketch)) return refuse("berbahaya", "incbin is not allowed");
  if (IRIS_DEF_RE.test(sketch))
    return refuse("berbahaya", "IRIS_ names are set by the seat's header, not by the sketch");
  return { ok: true };
}

/** The generated header holds defines of IRIS_ names and nothing else. */
export function checkHeader(header: string): SketchCheck {
  for (const line of header.split(/\r?\n/))
    if (line.trimEnd().endsWith("\\") || !HEADER_LINE_RE.test(line.trim()))
      return refuse("berbahaya", "The seat header holds something other than IRIS_ defines");
  return { ok: true };
}
