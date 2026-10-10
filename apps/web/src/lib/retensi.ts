/**
 * Data retention (2026-10-10): practicum records live for one semester,
 * six months. Ganjil runs August to January and genap February to July;
 * genap holds no practicum but turns over the same way. On the first day of
 * a semester everything from before it is deleted (api/_lib/retensi.ts), and
 * an Admin may delete a finished semester earlier by hand.
 */
import { semesterDariTanggal } from "./jadwal-parser.js";

// ---------- Semester Dates ----------
// ---------- Semester Dates ----------
// ---------- Semester Dates ----------

/** The first day of a semester ("2026-ganjil" is 2026-08-01) */
export function semesterMulai(semester: string): string {
  const [y, s] = semester.split("-");
  return s === "ganjil" ? `${y}-08-01` : `${y}-02-01`;
}

/** The semester after this one ("2026-ganjil" is followed by "2027-genap") */
export function semesterBerikut(semester: string): string {
  const [y, s] = semester.split("-");
  return s === "ganjil" ? `${Number(y) + 1}-genap` : `${y}-ganjil`;
}

/** The first day after a semester, where its records stop */
export function semesterSelesai(semester: string): string {
  return semesterMulai(semesterBerikut(semester));
}

/** Older first, the way the semesters follow each other */
export function urutSemester(a: string, b: string): number {
  return semesterMulai(a).localeCompare(semesterMulai(b));
}

// ---------- Retention ----------
// ---------- Retention ----------
// ---------- Retention ----------

export interface Retensi {
  /** The semester of today */
  semester: string;
  /** Its first day: everything dated before it is gone */
  batas: string;
  /** The day the next turnover deletes this semester */
  berikut: string;
}

/** Where the automatic deletion stands on a given day (ISO date, WIB) */
export function retensiPada(hariIni: string): Retensi {
  const semester = semesterDariTanggal(hariIni);
  return { semester, batas: semesterMulai(semester), berikut: semesterSelesai(semester) };
}

/** The semester keys whose records end on or before a cut-off date */
export function semesterSebelum(kunci: readonly string[], batas: string): string[] {
  return [...new Set(kunci)].filter((k) => semesterSelesai(k) <= batas).sort(urutSemester);
}
