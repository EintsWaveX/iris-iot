/**
 * What Penilaian (/grading) and Kelola TP (/tp) both read from the address
 * and the clock.
 */

/** ?modul= in the address, when it names a module. */
export function modulDariUrl(): number | null {
  if (typeof location === "undefined") return null;
  const m = Number(new URLSearchParams(location.search).get("modul"));
  return Number.isInteger(m) && m >= 1 && m <= 4 ? m : null;
}

/** This semester ("2026-ganjil"), by the lab's clock (WIB). */
export function semesterKini(): string {
  const d = new Date(Date.now() + 7 * 3_600_000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return m >= 8 ? `${y}-ganjil` : m === 1 ? `${y - 1}-ganjil` : `${y}-genap`;
}
