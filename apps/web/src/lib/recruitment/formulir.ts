/**
 * The team's Google Form as the way in (user, 2026-10-25). Registration for
 * oprec 2026 opened through it on 25 October, before IRIS's own form matched
 * the team's list. While this is set, Daftar (the Home banner and
 * /recruitment) opens the form, nobody makes an oprec account themselves,
 * and the Pencipta and the Admin tier add each candidate by hand in the
 * panel (Kandidat, Tambah CaAs) with a password they hand over.
 *
 * For oprec 2026 only, because the web form was not ready (user, 2026-10-25).
 * Next edition applies in IRIS: set this to null and the in-IRIS sign-up and
 * Daftar dialog come back as they were; Tambah CaAs stays for late cases.
 */
export const FORMULIR: { url: string; grupLine: string } | null = {
  url: "https://forms.gle/tF1ejKGivBd57B3y8",
  /** The CaAs LINE group everyone joins after sending the form */
  grupLine: "https://line.me/R/ti/g/Y5ykNjWVNz",
};
