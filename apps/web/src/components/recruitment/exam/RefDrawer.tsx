/**
 * The reference drawer (prompt 10, mockup r3-soal, EXAM-ENGINE 8.2): a wide
 * kit Drawer with the part's references and the open question's own, and the
 * reader, which is 09's sanitized snapshot in an iframe with an empty sandbox
 * (no scripts, no same origin, no top navigation, no popups). The snapshot
 * endpoint (`GET ref?id=`) is 09's; until it lands the frame shows its error.
 * The API only serves a reference during a part that has it.
 */
import { useEffect, useState } from "react";
import Drawer from "../../ui/Drawer";
import type { PartKey } from "../../../lib/recruitment/exam-types";
import type { Lang } from "../../../lib/kelas";
import type { RefLite } from "../../../lib/recruitment/seat-types";
import { TS } from "./testStrings";

export default function RefDrawer({
  lang,
  open,
  onClose,
  part,
  refs,
  question,
}: {
  lang: Lang;
  open: boolean;
  onClose: () => void;
  part: PartKey;
  refs: RefLite[];
  /** The question on screen, to mark its own references */
  question: number | null;
}) {
  const t = TS[lang];
  const shown = refs.filter((r) => r.forQuestion === null || r.forQuestion === question);
  const [cur, setCur] = useState<number | null>(shown[0]?.id ?? null);
  useEffect(() => {
    if (open && !shown.some((r) => r.id === cur)) setCur(shown[0]?.id ?? null);
  }, [open, shown, cur]);
  const r = shown.find((x) => x.id === cur);
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t.refs.title}
      description={t.refs.sub(t.part[part].l)}
      storeKey="rec-test-refs"
      minWidth={420}
      closeLabel={t.refs.close}
      resizeLabel={t.refs.resize}
    >
      {shown.length === 0 ? (
        <p className="hint">{t.refs.none}</p>
      ) : (
        <div className="r3refs">
          <ul className="r3refs__list" role="tablist" aria-label={t.refs.list}>
            {shown.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={x.id === cur}
                  onClick={() => setCur(x.id)}
                >
                  <b>{x.title}</b>
                  <span className="hint">
                    {x.host ?? ""}
                    {x.forQuestion !== null ? ` · ${t.refs.forQ}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {r && (
            <div className="r3reader">
              <div className="r3reader__head">
                <b>{r.title}</b>
                <span className="hint">{r.host}</span>
              </div>
              <iframe
                key={r.id}
                className="r3reader__frame"
                title={t.refs.frame(r.title)}
                src={`/api/recruitment/ref?id=${r.id}`}
                sandbox=""
                referrerPolicy="no-referrer"
              />
              <p className="r3reader__foot hint">{t.refs.foot}</p>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
