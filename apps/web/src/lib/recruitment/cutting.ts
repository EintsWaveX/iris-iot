/**
 * Cutting, pure (PRD 6): the tally, the threshold slider's bulk proposals,
 * when a stage may be locked or unlocked, and the one rule that keeps a
 * result private: an envelope exists for the candidate only when the stage is
 * locked and the reveal time has come. The API calls these on every write
 * and on the candidate's own read; the pages use them for display only.
 */
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
  return { ok: rows.length > 0 && missing === 0, missing };
}

interface Kunci {
  locked: boolean;
  revealAt: Date | null;
}

/** A candidate may see the result only when locked and the time has come. */
export const envelopeVisible = (r: Kunci, now: Date): boolean =>
  r.locked && !!r.revealAt && r.revealAt <= now;

/** The Ketua may unlock only before the reveal time. */
export const canUnlock = (r: Kunci, now: Date): boolean =>
  r.locked && !!r.revealAt && now < r.revealAt;

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
