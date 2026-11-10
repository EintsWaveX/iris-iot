/**
 * A module's slides (a PDF, a Canva design, or both, then a switch), shared
 * by the module page's Brief step, the Praktikan's session bar, the
 * Dashboard's session card and the console's session bar. Decks are per
 * module since 2026-10-08, and a Praktikan only gets the modules they did a
 * practicum of (api/presentasi/[aksi].ts). Since 2026-10-18 a module may
 * have a Canva link for the Reguler classes and one for Internasional: the
 * one in the reader's content language comes first.
 */
import { useState } from "react";
import Dialog from "../ui/Dialog";
import PdfViewer from "../ui/PdfViewer";
import SegmentedControl from "../ui/SegmentedControl";
import { dict } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { modulLabel } from "../../lib/labels";
import type { Deck } from "./slidesData";
import "./SlidesDialog.css";

export { urutDeck, useSlides, type Deck } from "./slidesData";

const T = dict({
  id: {
    sumber: "Sumber presentasi",
    judul: (m: string) => `Presentasi ${m}`,
    polos: "Presentasi",
    canvaId: "Canva Reguler",
    canvaEn: "Canva Internasional",
  },
  en: {
    sumber: "Slides source",
    judul: (m: string) => `${m} slides`,
    polos: "Slides",
    canvaId: "Canva Regular",
    canvaEn: "Canva International",
  },
  zh: {
    sumber: "幻灯片来源",
    judul: (m: string) => `${m} 幻灯片`,
    polos: "幻灯片",
    canvaId: "Canva 普通班",
    canvaEn: "Canva 国际班",
  },
});

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
  const duaCanva = list.filter((d) => d.jenis === "tautan").length > 1;
  const p = list[Math.min(idx, list.length - 1)] ?? null;
  const judul = modul ? t.judul(modulLabel(modul, lang)) : t.polos;
  return (
    <Dialog
      open={open && Boolean(p)}
      onOpenChange={onOpenChange}
      title={judul}
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
              label:
                d.jenis !== "tautan"
                  ? "PDF"
                  : duaCanva
                    ? d.bahasa === "en"
                      ? t.canvaEn
                      : t.canvaId
                    : "Canva",
            }))}
          />
        )}
        {p &&
          (p.jenis === "tautan" ? (
            <div className="slides-frame">
              <iframe src={p.url} title={judul} loading="lazy" allow="fullscreen" allowFullScreen />
            </div>
          ) : (
            <PdfViewer
              url={p.url}
              name={p.namaBerkas}
              title={judul}
              lang={lang}
              className="slides-pdf"
            />
          ))}
      </div>
    </Dialog>
  );
}
