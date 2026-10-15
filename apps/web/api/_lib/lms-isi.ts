/**
 * The module sections IRIS keeps at the end of every class page (Phase 16,
 * 2026-10-15). The LMS only hands out each module's document and its TP:
 * Module N's section holds the IRIS link, the handbook chapter's PDF and
 * "TP Modul N". The campus K3 course in the sections before stays as it is.
 *
 * A section is IRIS's by its name, "Modul N · …" (Reguler) or "Module N · …"
 * (INT), so neither its number nor its place is assumed.
 */
import { namaTugasLms } from "../../src/lib/tp.js";
import { isiKursus, NAMA_MODUL, type BagianLms, type ModulLms } from "./lms-menu.js";
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

export const namaTautanModul = (m: number, inter: boolean) =>
  inter
    ? `Module ${m} in IRIS (handbook, slides, journal)`
    : `Modul ${m} di IRIS (handbook, slide, jurnal)`;

export const namaBerkasModul = (m: number, inter: boolean) =>
  inter ? `Module ${m} handbook (PDF)` : `Handbook Modul ${m} (PDF)`;

/** The handbook chapter a class gets: Reguler Indonesian, INT English. */
export const jalanHandbook = (m: number, inter: boolean) =>
  `/handbook/${inter ? "en" : "id"}/modul-${m}.pdf`;

const rata = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const samaSalahSatu = (nama: string, f: (inter: boolean) => string) =>
  rata(nama) === rata(f(false)) || rata(nama) === rata(f(true));

/* ===================================================== keys and merging */

/** What an item in Module m's section is to IRIS. */
export type Peran = "tautan" | "pdf" | "tp";

export function peranIsi(m: number | null, x: Pick<ModulLms, "name" | "modname">): Peran | null {
  if (!m) return null;
  if (x.modname === "url" && samaSalahSatu(x.name, (i) => namaTautanModul(m, i))) return "tautan";
  if (x.modname === "resource" && samaSalahSatu(x.name, (i) => namaBerkasModul(m, i))) return "pdf";
  if (x.modname === "assign" && rata(x.name) === rata(namaTugasLms(m))) return "tp";
  return null;
}

/** A section's key across the classes: Module m's by its number, any other
 *  by its name (the campus course is alike in every class). */
export function kunciBagian(b: Pick<BagianLms, "name">): string {
  const m = modulBagian(b.name);
  return m ? `m${m}` : `k:${rata(b.name)}`;
}

/** The keys of a section's items, in order: IRIS's own by their role, the
 *  rest by kind and name; a second item alike gets #2. */
export function kunciIsiBagian(b: Pick<BagianLms, "name" | "modules">): string[] {
  const m = modulBagian(b.name);
  const seen = new Map<string, number>();
  return b.modules.map((x) => {
    const k = peranIsi(m, x) ?? `${x.modname}:${rata(x.name)}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n > 1 ? `${k}#${n}` : k;
  });
}

export function cariBagian(bacaan: BagianLms[], kunci: string): BagianLms | null {
  return bacaan.find((b) => kunciBagian(b) === kunci) ?? null;
}

export function cariIsi(b: BagianLms, kunci: string): ModulLms | null {
  const i = kunciIsiBagian(b).indexOf(kunci);
  return i < 0 ? null : b.modules[i];
}

/** "TP Modul m" wherever it sits in a class. */
export function cariTp(
  bacaan: BagianLms[],
  m: number,
): { bagian: BagianLms; isi: ModulLms } | null {
  for (const b of bacaan)
    for (const x of b.modules)
      if (x.modname === "assign" && rata(x.name) === rata(namaTugasLms(m)))
        return { bagian: b, isi: x };
  return null;
}

export interface KelasIsi {
  id: number;
  label: string;
  kelas: "reguler" | "inter";
}

/** A name per class language, as each class type writes it. */
export interface Nama2 {
  id?: string;
  en?: string;
}

interface Hitung {
  /** in how many of the read classes */
  ada: number;
  /** the labels of the read classes without it */
  kurang: string[];
  /** in how many it is hidden from students */
  sembunyi: number;
}

export interface IsiGabung extends Hitung {
  kunci: string;
  jenis: string;
  peran: Peran | null;
  nama: Nama2;
  url?: string;
}

export interface BagianGabung extends Hitung {
  kunci: string;
  asal: "kampus" | "iris";
  modul: number | null;
  nomor: number;
  nama: Nama2;
  isi: IsiGabung[];
}

export interface ModulGabung {
  modul: number;
  /** classes holding the section, its link, its PDF, TP Modul m inside it */
  bagian: number;
  tautan: number;
  pdf: number;
  tp: number;
  /** classes where TP Modul m sits in another section */
  tpLuar: number;
}

/**
 * Every read class's course as one: sections and items by key, in the
 * order the classes hold them, each with how many classes have it and
 * which don't (the X/11 marks).
 */
export function gabungIsi(
  kelas: KelasIsi[],
  bacaan: Map<number, BagianLms[]>,
): { bagian: BagianGabung[]; modul: ModulGabung[] } {
  const dibaca = kelas.filter((k) => bacaan.has(k.id));
  const urut: string[] = [];
  const bag = new Map<string, BagianGabung>();
  const di = new Map<string, Set<number>>();
  const catat = (kunci: string, id: number) => {
    const s = di.get(kunci) ?? new Set<number>();
    s.add(id);
    di.set(kunci, s);
  };
  // A key first met in a later class goes right after the one before it.
  const sisip = (daftar: string[], kunci: string, sebelum: number) => {
    let i = daftar.indexOf(kunci);
    if (i < 0) {
      i = sebelum + 1;
      daftar.splice(i, 0, kunci);
    }
    return i;
  };
  for (const k of dibaca) {
    const lang = k.kelas === "inter" ? "en" : "id";
    let sebelum = -1;
    for (const b of bacaan.get(k.id)!) {
      const kb = kunciBagian(b);
      sebelum = sisip(urut, kb, sebelum);
      let g = bag.get(kb);
      if (!g) {
        const m = modulBagian(b.name);
        g = {
          kunci: kb,
          asal: m ? "iris" : "kampus",
          modul: m,
          nomor: b.section,
          nama: {},
          ada: 0,
          kurang: [],
          sembunyi: 0,
          isi: [],
        };
        bag.set(kb, g);
      }
      catat(kb, k.id);
      g.ada++;
      if (b.visible === 0) g.sembunyi++;
      g.nama[lang] ??= b.name;
      const kunci = kunciIsiBagian(b);
      const urutIsi = g.isi.map((x) => x.kunci);
      let isiSebelum = -1;
      b.modules.forEach((x, j) => {
        const ki = kunci[j];
        const ada = urutIsi.includes(ki);
        isiSebelum = sisip(urutIsi, ki, isiSebelum);
        if (!ada)
          g.isi.splice(isiSebelum, 0, {
            kunci: ki,
            jenis: x.modname,
            peran: peranIsi(g.modul, x),
            nama: {},
            ada: 0,
            kurang: [],
            sembunyi: 0,
            ...(x.modname === "url" && x.url ? { url: x.url } : {}),
          });
        const it = g.isi[isiSebelum];
        it.ada++;
        if (x.visible === 0) it.sembunyi++;
        it.nama[lang] ??= x.name;
        catat(`${kb}|${ki}`, k.id);
      });
    }
  }
  const tanpa = (kunci: string) =>
    dibaca.filter((k) => !di.get(kunci)?.has(k.id)).map((k) => k.label);
  const bagian = urut.map((kb) => {
    const g = bag.get(kb)!;
    g.kurang = tanpa(kb);
    for (const it of g.isi) it.kurang = tanpa(`${kb}|${it.kunci}`);
    return g;
  });
  const modul = [1, 2, 3, 4].map((m) => {
    const r: ModulGabung = { modul: m, bagian: 0, tautan: 0, pdf: 0, tp: 0, tpLuar: 0 };
    for (const k of dibaca) {
      const bs = bacaan.get(k.id)!;
      const b = cariBagian(bs, `m${m}`);
      const peran = new Set(b ? b.modules.map((x) => peranIsi(m, x)) : []);
      if (b) r.bagian++;
      if (peran.has("tautan")) r.tautan++;
      if (peran.has("pdf")) r.pdf++;
      if (peran.has("tp")) r.tp++;
      else if (cariTp(bs, m)) r.tpLuar++;
    }
    return r;
  });
  return { bagian, modul };
}

/** Moodle's name for a section nobody named yet ("New section", or the
 *  older "Topic 7" / "Topik 7" / "Section 7"). */
export const namaBawaan = (nama: string) =>
  /^(new section|bagian baru|(topic|topik|section|bagian) \d+)$/i.test(nama.trim());

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
  // A section added on an earlier try whose name never came (live
  // 2026-10-15: a call cut off after "Add section" left an empty "New
  // section" in one class, and the retry added another): the last section,
  // empty and still on Moodle's default name, is taken instead.
  const akhir = sebelum.at(-1);
  if (akhir && akhir.section > 0 && !akhir.modules.length && namaBawaan(akhir.name)) {
    const nama = namaBagianModul(m, inter);
    await namaiBagian(web, kursus, akhir.id, nama);
    return { ...akhir, name: nama };
  }
  await tambahBagian(web, kursus);
  const lama = new Set(sebelum.map((b) => b.id));
  const baru = (await isiKursus(token, kursus)).filter((b) => !lama.has(b.id));
  if (baru.length !== 1)
    throw new LmsGalat("lms_bagian_ditolak", `${baru.length} new sections after adding one`);
  const nama = namaBagianModul(m, inter);
  await namaiBagian(web, kursus, baru[0].id, nama);
  return { ...baru[0], name: nama };
}
