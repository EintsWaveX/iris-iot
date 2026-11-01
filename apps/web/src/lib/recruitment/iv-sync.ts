/**
 * The interview sheet is shared by the pair of examiners of a booth, so it is
 * edited from two screens at once. Two rules keep them from overwriting each
 * other (pure, tested in __tests__/recruitment-iv-sync.test.ts):
 *
 * - sending: `sheetDelta` returns only what changed since the last sync, so a
 *   stale copy of a field the other examiner just filled never goes back up;
 * - receiving: `mixSheet` takes the other's value for every field this
 *   examiner has not touched since the last sync, and keeps the typed one.
 */
import type { Verdict } from "./interview";

export interface SheetBase {
  answers: Record<string, string>;
  skipped: string[];
  concl: Record<string, string>;
  other: string;
  verdict: Verdict | null;
  ba: string;
  recording: boolean;
  levels: Record<string, number>;
}

/** The shape of the `iv-sheet` answer that matters here. */
export interface SheetSource {
  shared: {
    answers: Record<string, string>;
    skipped: string[];
    concl: Record<string, string>;
    other: string;
    verdict: Verdict | null;
    ba: string;
    recording: boolean;
  } | null;
  mine: { levels: Record<string, number> };
}

/** The sheet as the server holds it (and the examiner's own levels). */
export function baseOf(d: SheetSource | null): SheetBase {
  const s = d?.shared;
  return {
    answers: s?.answers ?? {},
    skipped: s?.skipped ?? [],
    concl: s?.concl ?? {},
    other: s?.other ?? "",
    verdict: s?.verdict ?? null,
    ba: s?.ba ?? "",
    recording: s?.recording ?? false,
    levels: d?.mine.levels ?? {},
  };
}

const diffMap = (cur: Record<string, string>, old: Record<string, string>) =>
  Object.fromEntries(Object.entries(cur).filter(([k, v]) => v !== (old[k] ?? "")));

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What to send: only the fields (and, for the two maps, the keys) that differ
 * from `old`. `next` is the base once the send succeeds. Null when nothing
 * changed.
 */
export function sheetDelta(
  old: SheetBase,
  cur: SheetBase,
): {
  body: { shared: Record<string, unknown>; levels?: Record<string, number> };
  next: SheetBase;
} | null {
  const shared: Record<string, unknown> = {};
  const next: SheetBase = { ...old };
  const a = diffMap(cur.answers, old.answers);
  if (Object.keys(a).length) {
    shared.answers = a;
    next.answers = { ...old.answers, ...a };
  }
  const c = diffMap(cur.concl, old.concl);
  if (Object.keys(c).length) {
    shared.concl = c;
    next.concl = { ...old.concl, ...c };
  }
  if (!same(cur.skipped, old.skipped)) {
    shared.skipped = cur.skipped;
    next.skipped = cur.skipped;
  }
  if (cur.other !== old.other) {
    shared.other = cur.other;
    next.other = cur.other;
  }
  if (cur.verdict !== old.verdict) {
    shared.verdict = cur.verdict;
    next.verdict = cur.verdict;
  }
  if (cur.ba !== old.ba) {
    shared.ba = cur.ba;
    next.ba = cur.ba;
  }
  if (cur.recording !== old.recording) {
    shared.recording = cur.recording;
    next.recording = cur.recording;
  }
  const lvChanged = !same(cur.levels, old.levels);
  if (lvChanged) next.levels = cur.levels;
  if (!Object.keys(shared).length && !lvChanged) return null;
  return { body: { shared, ...(lvChanged ? { levels: cur.levels } : {}) }, next };
}

function mixMap(
  loc: Record<string, string>,
  old: Record<string, string>,
  nu: Record<string, string>,
): { out: Record<string, string>; changed: boolean } {
  const out = { ...loc };
  let changed = false;
  for (const k of new Set([...Object.keys(old), ...Object.keys(nu)])) {
    // Typed here since the last sync: keep it.
    if ((loc[k] ?? "") !== (old[k] ?? "")) continue;
    if ((nu[k] ?? "") !== (loc[k] ?? "")) changed = true;
    if (k in nu) out[k] = nu[k];
    else delete out[k];
  }
  return { out, changed };
}

function mixOne<T>(loc: T, old: T, nu: T): { out: T; changed: boolean } {
  if (!same(loc, old)) return { out: loc, changed: false };
  return { out: nu, changed: !same(nu, loc) };
}

/**
 * The screen after the other examiner's save arrives. `loc` is what is on
 * screen, `old` the last sync, `nu` what the server holds now. `changed` is
 * true when something on screen was replaced by the other's value.
 */
export function mixSheet(
  loc: Omit<SheetBase, "levels">,
  old: SheetBase,
  nu: SheetBase,
): { next: Omit<SheetBase, "levels">; changed: boolean } {
  const answers = mixMap(loc.answers, old.answers, nu.answers);
  const concl = mixMap(loc.concl, old.concl, nu.concl);
  const skipped = mixOne(loc.skipped, old.skipped, nu.skipped);
  const other = mixOne(loc.other, old.other, nu.other);
  const verdict = mixOne(loc.verdict, old.verdict, nu.verdict);
  const ba = mixOne(loc.ba, old.ba, nu.ba);
  const recording = mixOne(loc.recording, old.recording, nu.recording);
  return {
    next: {
      answers: answers.out,
      concl: concl.out,
      skipped: skipped.out,
      other: other.out,
      verdict: verdict.out,
      ba: ba.out,
      recording: recording.out,
    },
    changed: [answers, concl, skipped, other, verdict, ba, recording].some((x) => x.changed),
  };
}
