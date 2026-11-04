/**
 * What a candidate sees of a Live Coding problem, drawn from the editor's draft (4 Nov 2026):
 * the same statement card and code card as the candidate's workbench (livecode/LccPage), with
 * the Run and Submit buttons switched off. The samples are real samples; hidden tests never
 * appear here, only their count is a number the candidate sees in the verdict.
 */
import { PaperPlaneTiltIcon, PlayIcon } from "@phosphor-icons/react";
import type { Lang } from "../../../../../lib/kelas";
import type { CProblemDraft } from "../../../../../lib/recruitment/c-problem";
import { Md } from "../../../exam/render/text";
import { Block } from "../../../livecode/LccPage";
import { LCC } from "../../../livecode/lccStrings";
import CodeBox from "./CodeBox";

import "../../../recruitment-s3-lc.css";
import "../../../recruitment-s3-lcc.css";

export default function LcPreview({
  lang,
  draft,
  points,
}: {
  lang: Lang;
  draft: CProblemDraft;
  /** What a full pass is worth: the problem's own score, or its tier's */
  points: number;
}) {
  const t = LCC[lang];
  const text = lang === "en" && draft.body.en ? draft.body.en : draft.body;
  return (
    <div className="stack lcpv" style={{ gap: 12 }}>
      <section className="lcc-card lcc-statement" aria-label={t.statement}>
        <header className="lcc-statement__head">
          <h2 className="lcc-statement__title">{draft.title.trim() || "..."}</h2>
          <span className="lcc-chip" data-tier={draft.tier}>
            {t.tier[draft.tier]}
          </span>
          <span className="lcc-chip lcc-chip--pts">{t.points(points)}</span>
        </header>
        <Md src={text.statement} />
        <h3 className="lcc-h">{t.input}</h3>
        <Md src={text.input} />
        <h3 className="lcc-h">{t.output}</h3>
        <Md src={text.output} />
        <h3 className="lcc-h">{t.samples}</h3>
        <div className="lcc-samples">
          {draft.samples.map((s, i) => (
            <div key={i} className="lcc-sample">
              <Block label={t.sampleIn(i + 1)} text={s.input} copy={t.copy} done={t.copied} />
              <Block label={t.sampleOut(i + 1)} text={s.output} copy={t.copy} done={t.copied} />
            </div>
          ))}
        </div>
      </section>
      <section className="lcc-card lcc-code" aria-label={t.file}>
        <header className="lcc-code__head">
          <span className="lcc-code__file">
            <b className="mono">{t.file}</b>
            <span className="hint">{t.toolchain}</span>
          </span>
        </header>
        <CodeBox
          lang="c"
          ariaLabel={t.file}
          rows={10}
          maxRows={16}
          readOnly
          value={draft.body.starter}
          onChange={() => undefined}
        />
        <div className="lcc-actions">
          <button type="button" className="btn btn--inverse" disabled>
            <PlayIcon size={18} aria-hidden="true" />
            {t.run}
          </button>
          <button type="button" className="btn btn--primary" disabled>
            <PaperPlaneTiltIcon size={18} aria-hidden="true" />
            {t.submit}
          </button>
        </div>
      </section>
    </div>
  );
}
