/**
 * Build-time data for the module cards (landing page, modules index): the
 * content entry's title, tagline and facts, plus each sketch's blank count
 * for the progress ring. Server-only (astro:content).
 */
import { getEntry } from "astro:content";
import { parseBlanks } from "./blanks";
import { getSketchSource } from "./sketches";
import type { ModulKartu } from "../components/home/ModuleCards";

export async function moduleCards(lang: "id" | "en"): Promise<ModulKartu[]> {
  const out: ModulKartu[] = [];
  for (const n of [1, 2, 3, 4]) {
    const entry = await getEntry("modules", `${lang}/${n}`);
    if (!entry) throw new Error(`no module content for ${lang}/${n}`);
    const m = entry.data;
    out.push({
      modul: m.modul,
      judul: m.judul,
      tagline: m.tagline,
      fakta: m.fakta,
      berkas: m.berkas.map((b) => ({
        slug: b.path.replace(/\.(ino|py)$/, ""),
        blanks: parseBlanks(getSketchSource(m.bahasa, b.path)).filter((s) => s.kind === "blank")
          .length,
      })),
    });
  }
  return out;
}
