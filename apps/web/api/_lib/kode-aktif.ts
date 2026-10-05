/**
 * The journal code each module serves right now (ASO code editor,
 * 2026-10-05): its published kode_versi row, or version 1 built from the
 * bundled files when the module has none yet. Every reader of blanks and
 * answers goes through here: checking, the gated download, Show Answers,
 * and the blank counts on the board and reports.
 *
 * Version 1 is the bundled Praktikan files (src/content/sketches) with each
 * blank's answer from answer-keys.ts spliced back in, so its generated
 * Praktikan files are byte for byte the bundled ones (kode-aktif.test.ts).
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { kodeVersi } from "../../src/lib/schema.js";
import {
  buatTemplat,
  cocokCelah,
  kanonikCelah,
  urutkanCelah,
  type BahasaKode,
  type Celah,
  type KodeBerkas,
} from "../../src/lib/kode-jurnal.js";
import { KUNCI_V1 } from "./answer-keys.js";
import { getSketchSourceForApi } from "./sketch-sources.js";
import m1 from "../../src/content/modules/id/1.json" with { type: "json" };
import m2 from "../../src/content/modules/id/2.json" with { type: "json" };
import m3 from "../../src/content/modules/id/3.json" with { type: "json" };
import m4 from "../../src/content/modules/id/4.json" with { type: "json" };

/** Each module's files, in the module page's order. */
export const BERKAS_MODUL: Record<number, string[]> = Object.fromEntries(
  [m1, m2, m3, m4].map((m) => [m.modul, m.berkas.map((b) => b.path)]),
);

export function slugDari(path: string): string {
  return path.replace(/\.(ino|py)$/, "");
}

const BLANK_LINE = /^(.*?)(_{4,})(.*?)(\/\/|#)\s*\((\d+)\)\s*(.*)$/;

/** Version 1 of one file: the bundled Praktikan text of each language with
 *  group 1's answers put back, and a blank per `(n)`. */
export function berkasV1(modul: number, path: string): KodeBerkas {
  const slug = slugDari(path);
  const sumber = { id: "", en: "" };
  const celah = new Map<number, Celah>();
  for (const bahasa of ["id", "en"] as BahasaKode[]) {
    const template = getSketchSourceForApi(bahasa, path);
    if (template === undefined) throw new Error(`missing bundled sketch ${bahasa}/${path}`);
    let out = "";
    for (const [i, line] of template.split("\n").entries()) {
      if (i > 0) out += "\n";
      const m = BLANK_LINE.exec(line);
      if (!m) {
        out += line;
        continue;
      }
      const nomor = Number(m[5]);
      const kunci = KUNCI_V1[`m${modul}.${slug}.${nomor}`];
      if (!kunci) throw new Error(`no version 1 answer for m${modul}.${slug}.${nomor}`);
      const awal = out.length + m[1].length;
      const r = { awal, akhir: awal + kunci.jawaban.length };
      out += m[1] + kunci.jawaban + line.slice(m[1].length + m[2].length);
      const c = celah.get(nomor) ?? {
        id: `v1-${nomor}`,
        nomor,
        posisi: { id: null, en: null },
        jawaban: kunci.jawaban,
        juga: kunci.juga ?? [],
        perKelompok: kunci.perKelompok ?? null,
        petunjuk: { id: "", en: "" },
        kenapa: { id: kunci.kenapa, en: "" },
      };
      c.posisi[bahasa] = r;
      c.petunjuk[bahasa] = m[6].trim();
      celah.set(nomor, c);
    }
    sumber[bahasa] = out;
  }
  return {
    slug,
    path,
    sumber,
    celah: [...celah.keys()].sort((a, b) => a - b).map((n) => celah.get(n)!),
  };
}

export function kodeV1(modul: number): KodeBerkas[] {
  return (BERKAS_MODUL[modul] ?? []).map((p) => berkasV1(modul, p));
}

export interface BerkasAktif {
  berkas: KodeBerkas;
  /** Blanks in number order: index 0 is blank (1) (periksaBerkas keeps
   *  the numbers 1 to N). */
  urut: Celah[];
  templat: Record<BahasaKode, string>;
}

export interface KodeAktif {
  modul: number;
  /** The published version number; null = version 1 from the bundle. */
  versi: number | null;
  berkas: Map<string, BerkasAktif>;
}

function aktifDari(modul: number, versi: number | null, berkas: KodeBerkas[]): KodeAktif {
  const map = new Map<string, BerkasAktif>();
  for (const b of berkas) {
    map.set(b.slug, {
      berkas: b,
      urut: urutkanCelah(b.celah),
      templat: { id: buatTemplat(b, "id"), en: buatTemplat(b, "en") },
    });
  }
  return { modul, versi, berkas: map };
}

const SIMPAN_MS = 10_000;
const cache = new Map<number, { pada: number; nilai: KodeAktif }>();
const v1 = new Map<number, KodeAktif>();

export function kodeBawaan(modul: number): KodeAktif {
  let k = v1.get(modul);
  if (!k) {
    k = aktifDari(modul, null, kodeV1(modul));
    v1.set(modul, k);
  }
  return k;
}

/** The module's code as served now. A published version changes at most
 *  every few seconds (publishing waits for its sessions to end), so each
 *  function instance keeps it for 10 s. */
export async function kodeModul(modul: number): Promise<KodeAktif> {
  const ada = cache.get(modul);
  if (ada && Date.now() - ada.pada < SIMPAN_MS) return ada.nilai;
  let nilai: KodeAktif;
  try {
    const [row] = await getDb()
      .select({ nomor: kodeVersi.nomor, berkas: kodeVersi.berkas })
      .from(kodeVersi)
      .where(and(eq(kodeVersi.modul, modul), eq(kodeVersi.status, "terbit")))
      .limit(1);
    nilai = row ? aktifDari(modul, row.nomor, row.berkas) : kodeBawaan(modul);
  } catch (err) {
    // Before migration 0024 reaches a database, serve version 1.
    console.error("[kode-aktif] falling back to the bundled code:", err);
    nilai = kodeBawaan(modul);
  }
  cache.set(modul, { pada: Date.now(), nilai });
  return nilai;
}

export function lupakanKode(modul: number): void {
  cache.delete(modul);
}

export function jumlahCelah(k: KodeAktif, slug: string): number {
  return k.berkas.get(slug)?.urut.length ?? 0;
}

export function jumlahCelahModul(k: KodeAktif): number {
  let n = 0;
  for (const b of k.berkas.values()) n += b.urut.length;
  return n;
}

/** Blank counts for several modules at once (reports span modules). */
export async function jumlahCelahPer(moduls: Iterable<number>): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (const m of new Set(moduls)) out.set(m, jumlahCelahModul(await kodeModul(m)));
  return out;
}

export function celahKe(k: KodeAktif, slug: string, nomor: number): Celah | undefined {
  return k.berkas.get(slug)?.urut[nomor - 1];
}

export function cekCelah(
  k: KodeAktif,
  slug: string,
  nomor: number,
  jawaban: string,
  nomorKelompok: number,
  bahasa: BahasaKode,
): { ditemukan: true; benar: boolean; kenapa?: string } | { ditemukan: false } {
  const c = celahKe(k, slug, nomor);
  if (!c) return { ditemukan: false };
  const benar = cocokCelah(c, jawaban, nomorKelompok);
  const kenapa = (c.kenapa[bahasa] || c.kenapa.id).trim();
  return { ditemukan: true, benar, kenapa: benar && kenapa ? kenapa : undefined };
}

export function kanonik(
  k: KodeAktif,
  slug: string,
  nomor: number,
  nomorKelompok: number,
): string | undefined {
  const c = celahKe(k, slug, nomor);
  return c ? kanonikCelah(c, nomorKelompok) : undefined;
}
