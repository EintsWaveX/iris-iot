/**
 * Cutting, pure (PRD 6): the tally, the threshold slider's bulk proposals,
 * when a stage may be locked or unlocked, and the one rule that keeps a
 * result private: an envelope exists for the candidate only when the stage is
 * locked and the reveal time has come. The API calls these on every write
 * and on the candidate's own read; the pages use them for display only.
 */
import { bebas } from "./bebas.js";
import type { RecEvent, Proposal, StageKey } from "./types.js";

export interface CutRow {
  id: number;
  /** The stage total; null until the scores are in */
  total: number | null;
  /** Came to the evening(s) the stage counts */
  present: boolean;
  proposal: Proposal | null;
}

export function tally(rows: readonly { proposal: Proposal | null }[]) {
  const t = { lolos: 0, gagal: 0, belum: 0, total: rows.length };
  for (const r of rows) {
    if (r.proposal === "lolos") t.lolos++;
    else if (r.proposal === "gagal") t.gagal++;
    else t.belum++;
  }
  return t;
}

export type Ambang = { mode: "top"; n: number } | { mode: "min"; min: number };

/**
 * What the threshold proposes. Top N passes the N highest totals and anyone
 * tied with the Nth, so equal scores are never split. A minimum passes
 * everyone at or above it. No-shows fail when asked to; a present candidate
 * with no score yet is left alone. Existing proposals stay unless
 * `replaceExisting`. Returns only the candidates the rule sets.
 */
export function thresholdProposals(
  rows: readonly CutRow[],
  rule: Ambang,
  opts: { noShowsFail: boolean; replaceExisting: boolean },
): Map<number, Proposal> {
  const out = new Map<number, Proposal>();
  const nilai = rows.filter((r) => r.present && r.total !== null).map((r) => r.total as number);
  let batas = Number.NEGATIVE_INFINITY;
  if (rule.mode === "min") batas = rule.min;
  else if (rule.n > 0 && nilai.length) {
    const urut = [...nilai].sort((a, b) => b - a);
    batas = urut[Math.min(rule.n, urut.length) - 1];
  } else batas = Number.POSITIVE_INFINITY;
  for (const r of rows) {
    if (r.proposal && !opts.replaceExisting) continue;
    if (!r.present) {
      if (opts.noShowsFail) out.set(r.id, "gagal");
      continue;
    }
    if (r.total === null) continue;
    out.set(r.id, r.total >= batas ? "lolos" : "gagal");
  }
  return out;
}

/** The lock needs a proposal for everyone on the board. */
export function canLock(rows: readonly { proposal: Proposal | null }[]): {
  ok: boolean;
  missing: number;
} {
  const missing = rows.filter((r) => !r.proposal).length;
  // Free mode: the lock goes ahead (the handler fills the missing proposals), the count stays true.
  return { ok: bebas() || (rows.length > 0 && missing === 0), missing };
}

interface Kunci {
  locked: boolean;
  revealAt: Date | null;
}

/** A candidate may see the result only when locked and the time has come. */
export const envelopeVisible = (r: Kunci, now: Date): boolean =>
  r.locked && (bebas() || (!!r.revealAt && r.revealAt <= now));

/** The Ketua may unlock only before the reveal time (free mode: any locked row). */
export const canUnlock = (r: Kunci, now: Date): boolean =>
  r.locked && (bebas() || (!!r.revealAt && now < r.revealAt));

/**
 * The instant a stage's envelopes open: the start of its Pengumuman, 12.00
 * WIB on that day unless the event has its own start time (user,
 * 2026-10-23: every Pengumuman defaults to 12.00 and the Ketua may change it
 * at any time). Null when the stage has no Pengumuman.
 */
export function revealAtFor(
  events: readonly Pick<RecEvent, "kind" | "stage" | "startsOn" | "dayStart">[],
  stage: StageKey,
): Date | null {
  const e = events
    .filter((v) => v.kind === "announcement" && v.stage === stage)
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1))[0];
  return e ? new Date(`${e.startsOn}T${e.dayStart ?? "12:00"}:00+07:00`) : null;
}

/* ---------------------------------------------------------------------------
   Why a row sits where it does (3 Nov 2026): the order of the board, the
   distance to the cut line, and the reason tags and filters built from them.
   --------------------------------------------------------------------------- */

/** How many places either side of the cut line count as "near the line". */
export const NEAR_LINE = 5;

/** The part of a board row these helpers read (CutRowView satisfies it). */
export interface ReasonRow {
  id: number;
  nama: string;
  total: number | null;
  fm: boolean;
  tt: boolean;
  berkas: { status: string; score: number | null } | null;
  iv?: {
    wide: boolean;
    verdict: "lolos" | "ragu" | "cut" | null;
    sheets: number;
    expected: number;
    case: { status: "susulan" | "gugur" | null } | null;
  } | null;
  potensiCut: boolean;
  revisions: number;
  hasPanitiaNote: boolean;
  note: string | null;
}

/**
 * The board in the order the committee reads it: best score first. Berkas has no total, so
 * its own score leads and a file with no score comes after those with one; ties and gaps
 * fall back to the name so the order never jumps between refreshes.
 */
export function boardOrder<T extends ReasonRow>(rows: readonly T[]): T[] {
  const key = (r: T) => r.total ?? r.berkas?.score ?? Number.NEGATIVE_INFINITY;
  return [...rows].sort((a, b) => {
    if (key(a) !== key(b)) return key(b) > key(a) ? 1 : -1;
    return a.nama.localeCompare(b.nama, "id");
  });
}

export type NearLine = { side: "above" | "below"; n: number } | null;

/**
 * Where a place (1-based, in boardOrder) sits against the cut line, when it is within
 * NEAR_LINE places of it: "above" counts back from the last place inside (1 = the last one
 * in), "below" counts forward from the first place out (1 = the first one out).
 */
export function nearLine(rank: number, passN: number | null): NearLine {
  if (passN === null || passN <= 0) return null;
  if (rank <= passN)
    return passN - rank < NEAR_LINE ? { side: "above", n: passN - rank + 1 } : null;
  return rank - passN <= NEAR_LINE ? { side: "below", n: rank - passN } : null;
}

export type ReasonKey =
  | "nearAbove"
  | "nearBelow"
  | "potensiCut"
  | "revisions"
  | "noFm"
  | "noTt"
  | "noScore"
  | "wide"
  | "ragu"
  | "susulan"
  | "gugur"
  | "sheetsMissing"
  | "hasNote";

export interface Reason {
  key: ReasonKey;
  /** A count the tag mentions (places from the line, revision rounds, missing sheets) */
  n?: number;
}

/**
 * The reasons worth a tag on a row, most telling first. `ivStage` is Wawancara, Tubes or Mengajar,
 * where "tt" means "sat the session" and the examiners' sheets stand in for a score.
 */
export function reasonsOf(
  r: ReasonRow,
  o: { stage: StageKey; ivStage: boolean; rank: number; passN: number | null },
): Reason[] {
  const out: Reason[] = [];
  const line = nearLine(o.rank, o.passN);
  if (line) out.push({ key: line.side === "above" ? "nearAbove" : "nearBelow", n: line.n });
  if (r.potensiCut) out.push({ key: "potensiCut" });
  if (r.revisions > 0) out.push({ key: "revisions", n: r.revisions });
  if (o.stage !== "berkas") {
    if (o.ivStage) {
      if (r.iv?.case?.status === "gugur") out.push({ key: "gugur" });
      else if (r.iv?.case?.status === "susulan") out.push({ key: "susulan" });
      if (r.iv?.wide) out.push({ key: "wide" });
      if (r.iv?.verdict === "ragu") out.push({ key: "ragu" });
      if (r.iv && !r.iv.case?.status && r.iv.sheets < r.iv.expected)
        out.push({ key: "sheetsMissing", n: r.iv.expected - r.iv.sheets });
    } else {
      if (!r.fm) out.push({ key: "noFm" });
      if (!r.tt) out.push({ key: "noTt" });
      else if (r.total === null) out.push({ key: "noScore" });
    }
  }
  if (r.hasPanitiaNote) out.push({ key: "hasNote" });
  return out;
}

/** The extra filters of the Saring list; each reads the same reasons the tags show. */
export type ReasonFilter = "catatan" | "potensi" | "dekat" | "ragu" | "selisih" | "susulan";

export function matchesReason(f: ReasonFilter, reasons: readonly Reason[], r: ReasonRow): boolean {
  const has = (k: ReasonKey) => reasons.some((x) => x.key === k);
  switch (f) {
    case "catatan":
      return r.hasPanitiaNote || !!r.note;
    case "potensi":
      return r.potensiCut;
    case "dekat":
      return has("nearAbove") || has("nearBelow");
    case "ragu":
      return has("ragu");
    case "selisih":
      return has("wide");
    case "susulan":
      return has("susulan") || has("gugur") || has("sheetsMissing");
  }
}
