/**
 * The bonus offer (4 Nov 2026; reworded 8 Nov 2026), shown when a seat is about to hand in with time
 * left. It never shows a number: it says in words how the seat did and asks if it wants to try some
 * bonus questions. It is asked at most twice (bonus.ts BONUS_ASKS): a No gets a second, gentler ask,
 * a second No ends the offer and the seat goes on to the plain hand-in confirm. Shared by the written
 * runner and Live Coding; the words come from each one's own strings.
 */
import { SparkleIcon } from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import type { Lang } from "../../../lib/kelas";
import type { BonusQuote } from "../../../lib/recruitment/bonus";

export interface BonusText {
  badge: string;
  title: string;
  /** The second ask */
  title2: string;
  counting: string;
  desc: (q: BonusQuote, round: 1 | 2) => string;
  yes: string;
  yes2: string;
  no: string;
  no2: string;
  taking: string;
}

export default function BonusOffer({
  lang,
  open,
  round,
  onOpenChange,
  quote,
  busy,
  t,
  onYes,
  onNo,
}: {
  lang: Lang;
  open: boolean;
  /** 1 the first ask, 2 the last one */
  round: 1 | 2;
  /** Left out for the written parts: the offer must be answered, it has no way out but its buttons */
  onOpenChange?: (open: boolean) => void;
  /** Null while the server is still counting */
  quote: BonusQuote | null;
  busy: boolean;
  t: BonusText;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange ?? (() => undefined)}
      required={!onOpenChange}
      title={round === 1 ? t.title : t.title2}
      description={quote ? t.desc(quote, round) : t.counting}
      size="sm"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onNo}>
            {round === 1 ? t.no : t.no2}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !quote}
            onClick={onYes}
          >
            {busy ? t.taking : round === 1 ? t.yes : t.yes2}
          </button>
        </>
      }
    >
      <div className="r3bonus__offer" aria-busy={!quote} data-round={round}>
        <span className="r3bonus__star" aria-hidden="true">
          <SparkleIcon size={28} weight="fill" />
        </span>
        {!quote && <b className="r3bonus__badge">{t.badge}</b>}
      </div>
    </Dialog>
  );
}
