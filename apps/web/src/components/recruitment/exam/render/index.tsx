/**
 * The question as the candidate sees it (mockup r3-soal): the card around a
 * renderer, and the renderer for each format. The bank's preview (09) imports
 * `QuestionCard` and `QuestionBody` from here.
 */
import { FlagIcon, ProhibitIcon } from "@phosphor-icons/react";
import type { Value, View } from "../../../../lib/recruitment/exam-types";
import type { Lang } from "../../../../lib/kelas";
import { Choice, Fix, Fitb, FitbPrompt, Lines, Match, Order } from "./formats";
import { RX } from "./renderStrings";
import { Md } from "./text";

export interface BodyProps {
  view: View;
  value: Value;
  onChange: (v: Value) => void;
  disabled?: boolean;
  lang: Lang;
}

/** Only the answer area of a question: no card, no prompt */
export function QuestionBody(p: BodyProps) {
  const v = p.view;
  const a = { value: p.value, onChange: p.onChange, disabled: p.disabled, lang: p.lang };
  switch (v.format) {
    case "single":
    case "multi":
      return <Choice view={v} {...a} />;
    case "lines":
      return <Lines view={v} {...a} />;
    case "fix":
      return <Fix view={v} {...a} />;
    case "order":
      return <Order view={v} {...a} />;
    case "match":
      return <Match view={v} {...a} />;
    case "fitb":
      return <Fitb view={v} {...a} />;
  }
}

export interface CardProps extends Omit<BodyProps, "view"> {
  view: View | null;
  /** The question's own language: cpp, py or text */
  codeLang: string;
  index: number;
  total: number;
  flagged?: boolean;
  onFlag?: () => void;
  voided?: boolean;
}

export function QuestionCard({
  view,
  codeLang,
  index,
  total,
  value,
  onChange,
  disabled,
  lang,
  flagged,
  onFlag,
  voided,
}: CardProps) {
  const t = RX[lang];
  return (
    <article className="panel r3q" aria-labelledby="r3q-h" data-tip-own>
      <header className="r3q__head">
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">{t.qOf(index + 1, total)}</span>
          <h2 className="r3h" id="r3q-h">
            {view ? t.format[view.format] : t.voidTitle}
            {view && <span className="hint"> · {t.lang[codeLang] ?? codeLang}</span>}
          </h2>
        </div>
        {!voided && view && onFlag && (
          <button type="button" className="r3flag" aria-pressed={!!flagged} onClick={onFlag}>
            <FlagIcon weight={flagged ? "fill" : "regular"} aria-hidden="true" />
            {flagged ? t.flagged : t.flag}
          </button>
        )}
      </header>
      {voided || !view ? (
        <div className="r3void">
          <span className="r3void__ic">
            <ProhibitIcon />
          </span>
          <div className="stack" style={{ gap: 4 }}>
            <b>{t.voidTitle}</b>
            <span className="hint">{t.voidBody}</span>
          </div>
        </div>
      ) : (
        <>
          {view.format === "fitb" ? (
            <FitbPrompt
              view={view}
              value={value}
              onChange={onChange}
              disabled={disabled}
              lang={lang}
            />
          ) : (
            <Md src={view.prompt} images={view.images} />
          )}
          <QuestionBody
            view={view}
            value={value}
            onChange={onChange}
            disabled={disabled}
            lang={lang}
          />
        </>
      )}
    </article>
  );
}
