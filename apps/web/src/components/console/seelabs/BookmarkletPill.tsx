/** The draggable "IRIS · Isi SeeLabs" bookmark (Phase 9 Stage 3g). */
import { useEffect, useRef } from "react";
import { HREF_BOOKMARKLET, UKURAN_BOOKMARKLET_KB } from "../../../lib/seelabs-helper";
import type { SeelabsStrings } from "./strings";
import "./seelabs.css";

/** The draggable bookmark. Clicking it here does nothing but say so. */
export default function BookmarkletPill({ t }: { t: SeelabsStrings }) {
  // React 19 swaps a javascript: href given as a prop for a stub that only
  // throws "React has blocked a javascript: URL", and that stub is what got
  // dragged to the bookmarks bar. Set on the element itself, it stays ours.
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", HREF_BOOKMARKLET);
  }, []);
  return (
    <div className="bmdrag">
      <a
        ref={ref}
        className="bmpill"
        draggable
        onClick={(e) => {
          e.preventDefault();
          window.Toast?.show(t.dragNotClick, "info");
        }}
      >
        IRIS · Isi SeeLabs
      </a>
      <span className="hint">{t.sizeNote(UKURAN_BOOKMARKLET_KB)}</span>
    </div>
  );
}
