/**
 * The active slides (a PDF, a Canva design, or both, then a switch), shared
 * by the Praktikan dashboard's Presentasi card and, since 2026-10-06, a
 * button on the Praktikan's session bar, so they can be opened from the
 * module pages too (before, only the dashboard card reached them).
 */
import { useState } from "react";
import Dialog from "../ui/Dialog";
import PdfViewer from "../ui/PdfViewer";
import SegmentedControl from "../ui/SegmentedControl";
import { dict, getJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { modulLabel } from "../../lib/labels";
import "./SlidesDialog.css";

export type Deck = { url: string; namaBerkas: string; jenis?: "berkas" | "tautan" };

const T = dict({
  id: { sumber: "Sumber presentasi", judul: (m: string) => `Presentasi ${m}`, polos: "Presentasi" },
  en: { sumber: "Slides source", judul: (m: string) => `${m} slides`, polos: "Slides" },
  zh: { sumber: "幻灯片来源", judul: (m: string) => `${m} 幻灯片`, polos: "幻灯片" },
});

/** The active decks, refreshed when an Asisten changes them. */
export function useSlides(enabled = true): { list: Deck[]; loaded: boolean } {
  const poll = usePoll(
    () =>
      getJson<{ ok: boolean; presentasi: Deck | null; pilihan?: Deck[] }>(
        "/api/presentasi/aktif",
      ).then((d) => (d.ok ? (d.pilihan ?? (d.presentasi ? [d.presentasi] : [])) : [])),
    60_000,
    enabled,
    ["presentasi"],
  );
  return { list: poll.data ?? [], loaded: poll.updatedAt !== null };
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
  /** The running session's module, for the title; none before a session. */
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
