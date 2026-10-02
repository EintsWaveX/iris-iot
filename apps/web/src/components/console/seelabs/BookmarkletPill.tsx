/** The draggable "IRIS · Isi SeeLabs" bookmark (Phase 9 Stage 3g). */
import { CursorClickIcon } from "@phosphor-icons/react";
import { HREF_BOOKMARKLET, UKURAN_BOOKMARKLET_KB } from "../../../lib/seelabs-helper";
import type { SeelabsStrings } from "./strings";
import "./seelabs.css";

/** The draggable bookmark. Clicking it here does nothing but say so. */
export default function BookmarkletPill({ t }: { t: SeelabsStrings }) {
  return (
    <div className="bmdrag">
      <a
        className="bmpill"
        href={HREF_BOOKMARKLET}
        draggable
        onClick={(e) => {
          e.preventDefault();
          window.Toast?.show(t.dragNotClick, "info");
        }}
      >
        <CursorClickIcon size={20} aria-hidden="true" />
        IRIS · Isi SeeLabs
      </a>
      <span className="hint">{t.sizeNote(UKURAN_BOOKMARKLET_KB)}</span>
    </div>
  );
}
