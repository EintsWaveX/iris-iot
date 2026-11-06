/**
 * The bonus offer (4 Nov 2026), shown when a seat is about to hand in with time left: how many
 * bonus questions it gets and why (time left, right answers, wrong answers; bonus.ts), then Yes or
 * No. Shared by the written runner and Live Coding; the words come from each one's own strings.
 */
import { SparkleIcon } from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import type { Lang } from "../../../lib/kelas";
import type { BonusQuote } from "../../../lib/recruitment/bonus";

export interface BonusText {
  badge: string;
  title: string;
  counting: string;
  desc: (q: BonusQuote) => string;
  calc: { time: string; right: string; wrong: string; blank: string; total: string };
  max: (n: number) => string;
  yes: string;
  no: string;
  taking: string;
}

export default function BonusOffer({
  lang,
  open,
  onOpenChange,
  quote,
  busy,
  t,
  onYes,
  onNo,
}: {
  lang: Lang;
  open: boolean;
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
      title={t.title}
      description={quote ? t.desc(quote) : t.counting}
      size="sm"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onNo}>
            {t.no}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !quote}
            onClick={onYes}
          >
            {busy ? t.taking : t.yes}
          </button>
        </>
      }
    >
      <div className="r3bonus__offer" aria-busy={!quote}>
        <span className="r3bonus__star" aria-hidden="true">
          <SparkleIcon size={28} weight="fill" />
        </span>
        {quote ? (
          <>
            <ul className="r3bonus__calc">
              <li>
                <span>{t.calc.time}</span>
                <b className="num">+{quote.time}</b>
              </li>
              <li>
                <span>{t.calc.right}</span>
                <b className="num">+{quote.correct}</b>
              </li>
              <li>
                <span>{t.calc.wrong}</span>
                <b className="num">-{quote.wrong}</b>
              </li>
              <li>
                <span>{t.calc.blank}</span>
                <b className="num">-{quote.blank}</b>
              </li>
              <li data-total="yes">
                <span>
                  {t.calc.total} <small className="hint">({t.max(quote.rest)})</small>
                </span>
                <b className="num r3bonus__n">{quote.quota}</b>
              </li>
            </ul>
          </>
        ) : (
          <b className="r3bonus__badge">{t.badge}</b>
        )}
      </div>
    </Dialog>
  );
}
