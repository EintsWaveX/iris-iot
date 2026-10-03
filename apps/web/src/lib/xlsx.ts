/** XLSX downloads (Phase 9 Stage 6), the sibling of csv.ts: a header row in
 *  bold, then the rows, written in the browser. The writer is loaded only
 *  when someone actually exports. */
import type { Cell, SheetData } from "write-excel-file";

export async function unduhXlsx(
  nama: string,
  header: string[],
  baris: (string | number | null)[][],
  sheet = "Data",
): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file");
  const sel = (v: string | number | null): Cell =>
    v === null
      ? null
      : typeof v === "number"
        ? { value: v, type: Number }
        : { value: v, type: String };
  const data: SheetData = [
    header.map((h): Cell => ({ value: h, type: String, fontWeight: "bold" })),
    ...baris.map((r) => r.map(sel)),
  ];
  await writeXlsxFile(data, {
    fileName: nama.endsWith(".xlsx") ? nama : `${nama}.xlsx`,
    sheet,
  });
}
