/** Generates and downloads a CSV file entirely in the browser, from data
 *  already fetched -- no server round trip, no extra API function. Shared
 *  by ReportsView.tsx and SessionConsole.tsx's grading tab, since both
 *  export the same "per member" shape with different trailing columns. */
export function unduhCsv(nama: string, header: string[], baris: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const teks = [header, ...baris].map((row) => row.map(escape).join(",")).join("\n");
  // A UTF-8 BOM so Excel (which otherwise guesses the system codepage)
  // reads Indonesian names with diacritics correctly rather than mangling
  // them -- plain UTF-8 without it is fine in most spreadsheet apps but not
  // universally, and this project's own gate requires the CSV to "open
  // correctly with UTF-8 names".
  const blob = new Blob(["﻿" + teks], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  a.click();
  URL.revokeObjectURL(url);
}
