/**
 * Grading Live Coding (EXAM-ENGINE 9.8, 11.3 item 1): what a sheet must hold,
 * who may submit one, and what a grader may see of the other sheets (who and
 * when, never the values, so two graders do not anchor on each other). Pure.
 */
import type { FieldError, Rubric, RubricRow } from "./exam-types.js";

export interface StoredSheet {
  grader: string;
  name: string;
  at: number;
  values: Record<string, number>;
  note: string;
}

/** Every row needs a whole value in 0..max; a key the rubric lacks is an error too. */
export function validateSheet(rubric: Rubric, values: Record<string, number>): FieldError[] {
  const errs: FieldError[] = [];
  for (const r of rubric.rows) {
    const v = values[r.key];
    if (!Number.isInteger(v) || v < 0 || v > r.max)
      errs.push({ field: r.key, kode: "nilai_salah" });
  }
  const known = new Set(rubric.rows.map((r) => r.key));
  for (const k of Object.keys(values))
    if (!known.has(k)) errs.push({ field: k, kode: "baris_asing" });
  return errs;
}

/** The first two graders count; a third gets `sudah_dua` unless they already hold one of the two. */
export function canSubmit(
  sheets: readonly Pick<StoredSheet, "grader">[],
  grader: string,
): { ok: true } | { ok: false; kode: "sudah_dua" } {
  if (sheets.some((s) => s.grader === grader)) return { ok: true };
  return sheets.length >= 2 ? { ok: false, kode: "sudah_dua" } : { ok: true };
}

export type PeerSheet = { grader: string; name: string; at: number };

/** My sheet in full; the others by who and when, or in full after Finalkan for the bank right. */
export function peerView(
  sheets: readonly StoredSheet[],
  me: string,
  full: boolean,
): { mine: StoredSheet | null; others: (PeerSheet | StoredSheet)[] } {
  const sorted = [...sheets].sort((a, b) => a.at - b.at);
  const mine = sorted.find((s) => s.grader === me) ?? null;
  const others = sorted
    .filter((s) => full || s.grader !== me)
    .map((s) => (full ? s : { grader: s.grader, name: s.name, at: s.at }));
  return { mine, others };
}

/** Whether two row lists are the same rubric; field by field, since jsonb returns keys in its own order. */
export function sameRubricRows(a: readonly RubricRow[], b: readonly RubricRow[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => {
      const x = b[i];
      return r.key === x.key && r.label === x.label && r.max === x.max && r.weight === x.weight;
    })
  );
}
