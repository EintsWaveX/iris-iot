/**
 * One PDF viewer for the whole app (Phase 8): the assistant's slides on the
 * dashboard and the public module handbook on every module page share it.
 * The browser's own PDF viewer in a frame, with the file's name, full
 * screen and "open in a new tab" underneath. Phones that will not show a
 * PDF inside a page still get the new-tab button, which opens their own
 * viewer.
 */
import { useRef } from "react";
import type { Lang } from "../../lib/kelas";
import "./PdfViewer.css";

const T = {
  id: { full: "Layar penuh", tab: "Buka di tab baru" },
  en: { full: "Fullscreen", tab: "Open in a new tab" },
};

export default function PdfViewer({
  url,
  name,
  lang,
  shape = "slides",
}: {
  url: string;
  name: string;
  lang: Lang;
  /** "slides" is 16:9; "page" is a tall A4-like frame for documents. */
  shape?: "slides" | "page";
}) {
  const t = T[lang];
  const box = useRef<HTMLDivElement>(null);
  return (
    <div className="pdfv">
      <div className="pdfv__frame" data-shape={shape} ref={box}>
        <iframe key={url} src={url} title={name} />
      </div>
      <div className="pdfv__bar">
        <span className="hint pdfv__name">{name}</span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => void box.current?.requestFullscreen?.()}
        >
          {t.full}
        </button>
        <a className="btn btn--ghost btn--sm" href={url} target="_blank" rel="noopener noreferrer">
          {t.tab}
        </a>
      </div>
    </div>
  );
}
