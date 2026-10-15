/**
 * The module sections IRIS keeps at the end of every class page (Phase 16,
 * 2026-10-15). The LMS only hands out each module's document and its TP:
 * Module N's section holds the IRIS link, the handbook chapter's PDF and
 * "TP Modul N". The campus K3 course in the sections before stays as it is.
 *
 * A section is IRIS's by its name, "Modul N · …" (Reguler) or "Module N · …"
 * (INT), so neither its number nor its place is assumed.
 */
import { isiKursus, NAMA_MODUL, type BagianLms } from "./lms-menu.js";
import { LmsGalat } from "./lms.js";
import { namaiBagian, tambahBagian, type WebLms } from "./lms-web.js";

/* ============================================================ the names */

export const namaBagianModul = (m: number, inter: boolean) =>
  `${inter ? "Module" : "Modul"} ${m} · ${NAMA_MODUL[m]}`;

/** The module a section's name says it is IRIS's for (either language). */
export function modulBagian(nama: string): number | null {
  const m = nama.trim().match(/^(?:modul|module)\s+([1-4])(?:\s*·|\s*$)/i);
  return m ? Number(m[1]) : null;
}

/* ============================================================ the section */

/**
 * Module m's section in the class, made at the end of the course and named
 * when it is missing. Its id and number come from reading the course again.
 */
export async function pastikanBagianModul(
  web: WebLms,
  token: string,
  kursus: number,
  m: number,
  inter: boolean,
): Promise<BagianLms> {
  const sebelum = await isiKursus(token, kursus);
  const ada = sebelum.find((b) => modulBagian(b.name) === m);
  if (ada) return ada;
  await tambahBagian(web, kursus);
  const lama = new Set(sebelum.map((b) => b.id));
  const baru = (await isiKursus(token, kursus)).filter((b) => !lama.has(b.id));
  if (baru.length !== 1)
    throw new LmsGalat("lms_bagian_ditolak", `${baru.length} new sections after adding one`);
  const nama = namaBagianModul(m, inter);
  await namaiBagian(web, kursus, baru[0].id, nama);
  return { ...baru[0], name: nama };
}
