/**
 * A module's slides (a PDF, a Canva design, or both, then a switch), shared
 * by the module page's Brief step, the Praktikan's session bar, the
 * Dashboard's session card and the console's session bar. Decks are per
 * module since 2026-10-08, and a Praktikan only gets the modules they did a
 * practicum of (api/presentasi/[aksi].ts).
 */
import { useEffect, useState } from "react";
import Dialog from "../ui/Dialog";
import PdfViewer from "../ui/PdfViewer";
import SegmentedControl from "../ui/SegmentedControl";
import { dict, getJson } from "../../lib/app";
import { dengar } from "../../lib/siaran";
import type { Lang } from "../../lib/kelas";
import { modulLabel } from "../../lib/labels";
import "./SlidesDialog.css";

export type Deck = { url: string; namaBerkas: string; jenis?: "berkas" | "tautan" };
type Aktif = Record<string, Deck & { pilihan?: Deck[] }>;

const T = dict({
  id: { sumber: "Sumber presentasi", judul: (m: string) => `Presentasi ${m}`, polos: "Presentasi" },
  en: { sumber: "Slides source", judul: (m: string) => `${m} slides`, polos: "Slides" },
  zh: { sumber: "幻灯片来源", judul: (m: string) => `${m} 幻灯片`, polos: "幻灯片" },
});

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
        setList(hit ? (hit.pilihan ?? [hit]) : []);
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

export default function SlidesDialog({
  open,
  onOpenChange,
  list,
  modul,
  lang,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  list: Deck[];
  /** The deck's module, for the title. */
  modul?: number;
  lang: Lang;
}) {
  const t = T[lang];
  const [idx, setIdx] = useState(0);
  const p = list[Math.min(idx, list.length - 1)] ?? null;
  return (
    <Dialog
      open={open && Boolean(p)}
      onOpenChange={onOpenChange}
      title={modul ? t.judul(modulLabel(modul, lang)) : t.polos}
      size="wide"
      lang={lang}
    >
      <div className={"stack slides" + (list.length > 1 ? " slides--two" : "")}>
        {list.length > 1 && (
          <SegmentedControl
            fill
            aria-label={t.sumber}
            value={String(Math.min(idx, list.length - 1))}
            onValueChange={(v) => setIdx(Number(v))}
            options={list.map((d, i) => ({
              value: String(i),
              label: d.jenis === "tautan" ? "Canva" : "PDF",
            }))}
          />
        )}
        {p &&
          (p.jenis === "tautan" ? (
            <div className="slides-frame">
              <iframe
                src={p.url}
                title={p.namaBerkas}
                loading="lazy"
                allow="fullscreen"
                allowFullScreen
              />
            </div>
          ) : (
            <PdfViewer url={p.url} name={p.namaBerkas} lang={lang} className="slides-pdf" />
          ))}
      </div>
    </Dialog>
  );
}
