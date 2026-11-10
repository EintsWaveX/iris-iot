/**
 * The module slides' data: which decks a module has (the PDF first, then the
 * Canva links), kept apart from the dialog that shows them (SlidesDialog.tsx)
 * so a page that only needs to know whether there are slides does not
 * download the PDF viewer with them.
 */
import { useEffect, useState } from "react";
import { getJson } from "../../lib/app";
import { dengar } from "../../lib/siaran";
import { bahasaKonten, langOfPath, type Lang } from "../../lib/kelas";

export type Deck = {
  url: string;
  namaBerkas: string;
  jenis?: "berkas" | "tautan";
  /** A Canva link's class language: id Reguler, en Internasional. */
  bahasa?: "id" | "en";
};
type Aktif = Record<string, Deck & { pilihan?: Deck[] }>;

/** The PDF first, then the Canva link in the reader's content language,
 *  then the other class's. */
export function urutDeck(list: Deck[], lang: Lang): Deck[] {
  const milik = bahasaKonten(lang);
  const nilai = (d: Deck) => (d.jenis !== "tautan" ? 0 : (d.bahasa ?? "id") === milik ? 1 : 2);
  return [...list].sort((a, b) => nilai(a) - nilai(b));
}

// One request serves every module and every caller on the page.
let cache: Promise<Aktif> | null = null;
function activeSlides() {
  if (!cache) {
    cache = getJson<{ ok: boolean; aktif: Aktif }>("/api/presentasi/slides")
      .then((d) => (d.ok ? d.aktif : {}))
      .catch(() => ({}));
  }
  return cache;
}

/** The module's active decks (the PDF first), refreshed when an Asisten
 *  changes them. Empty for a module the caller may not see yet. */
export function useSlides(
  modul: number | null | undefined,
  enabled = true,
): { list: Deck[]; loaded: boolean } {
  const [list, setList] = useState<Deck[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!enabled || !modul) {
      setList([]);
      setLoaded(true);
      return;
    }
    let alive = true;
    const muat = () =>
      void activeSlides().then((a) => {
        if (!alive) return;
        const hit = a[String(modul)];
        const lang = typeof location === "undefined" ? "id" : langOfPath(location.pathname);
        setList(hit ? urutDeck(hit.pilihan ?? [hit], lang) : []);
        setLoaded(true);
      });
    muat();
    const lepas = dengar(["presentasi"], () => {
      cache = null;
      muat();
    });
    return () => {
      alive = false;
      lepas();
    };
  }, [modul, enabled]);
  return { list, loaded };
}
