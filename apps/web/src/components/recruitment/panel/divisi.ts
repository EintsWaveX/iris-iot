/** The colour each committee column wears (Panitia board, and the Penguji chips in Plotting). Ketua and Wakil share the Inti column. */
export const WARNA_DIVISI: Record<string, string> = {
  inti: "var(--yellow)",
  acara: "var(--accent)",
  akademik: "var(--violet)",
  logistik: "var(--teal)",
  admin: "var(--red)",
  pdd: "var(--accent-bright)",
};
export const kolomDivisi = (d: string): string => (d === "ketua" || d === "wakil" ? "inti" : d);
export const warnaDivisi = (d: string | null | undefined): string =>
  (d && WARNA_DIVISI[kolomDivisi(d)]) || "var(--hairline-strong)";
