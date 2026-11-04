/**
 * The question list as a drawer, opened from the editor's header beside the
 * previous/next stepper. A third of the screen wide, so the editor behind it
 * stays readable; pick a question and the editor opens it. The arrows and the
 * typeable number stay for walking one by one, this is for jumping.
 */
import { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import Drawer from "../../../../ui/Drawer";
import Pill from "../../../../ui/Pill";
import type { Lang } from "../../../../../lib/kelas";
import { BK } from "./bankStrings";

/** One row of the drawer: a question of a written part, or a Live Coding problem. */
export interface PickItem {
  id: number;
  title: string;
  /** The small grey line: a format, or a tier */
  meta: string;
  state: "ready" | "draft" | "void";
}

export default function BankPicker({
  lang,
  open,
  onOpenChange,
  rows,
  current,
  onPick,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: PickItem[];
  current: number | null;
  onPick: (id: number) => void;
}) {
  const t = BK[lang];
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? rows.filter((r) => r.title.toLowerCase().includes(k)) : rows;
  }, [rows, q]);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={t.navList}
      description={t.navListHint}
      storeKey="rec-bank-list"
      compact
      minWidth={420}
      closeLabel={t.close}
      resizeLabel={t.navListResize}
    >
      <div className="stack">
        <div className="row rec-tools">
          <div className="rec-search" style={{ maxWidth: "none" }}>
            <MagnifyingGlassIcon className="ic" size={18} aria-hidden="true" />
            <input
              className="field__input"
              placeholder={t.search}
              aria-label={t.searchAria}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="empty-note empty-note--sm">{t.emptyFilter}</p>
        ) : (
          <ul className="r3pick" aria-label={t.navList}>
            {shown.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="r3pick__row"
                  aria-current={r.id === current ? "true" : undefined}
                  onClick={() => onPick(r.id)}
                >
                  <span className="r3pick__t">{r.title}</span>
                  <span className="hint">{r.meta}</span>
                  {r.state === "void" ? (
                    <Pill tone="danger">{t.voided}</Pill>
                  ) : r.state === "ready" ? (
                    <Pill tone="ok">{t.ready}</Pill>
                  ) : (
                    <Pill>{t.draft}</Pill>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
