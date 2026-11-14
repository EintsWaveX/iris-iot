/**
 * The whole Tes Tulis result of one CaAs inside the Cutting drawer (15 Nov 2026): the total, each part
 * with what it gave, every question and how it went, and the Live Coding problems. Panitia only. The CaAs
 * never sees any of it: the candidate side of the test shows no score, in any form.
 */
import { useState } from "react";
import Pill from "../../../ui/Pill";
import type { Lang } from "../../../../lib/kelas";
import type { SeatPartDetail, TesDetail } from "../../../../lib/recruitment/score-api";
import { PN } from "../tes/penilaian/penilaianStrings";
import { CW } from "./cutWhyStrings";

const DATA_V = { full: "ok", partial: "mid", wrong: "fix", blank: "none", void: "none" } as const;

function Questions({ lang, p }: { lang: Lang; p: SeatPartDetail }) {
  const t = CW[lang].tes;
  const [open, setOpen] = useState(false);
  if (p.questions.length === 0) return <p className="empty-note empty-note--sm">{t.noQ}</p>;
  return (
    <>
      <button
        type="button"
        className="rec-link"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? t.hideQ : t.showQ(p.questions.length)}
      </button>
      {open && (
        <ul className="cwd__list cwd__qs">
          {p.questions.map((q) => (
            <li key={q.q}>
              <span>
                {q.title || t.noTitle}
                <small className="hint cwd__qmeta">
                  {q.format} · {q.lang.toUpperCase()}
                  {q.bonus ? ` · ${t.bonus}` : ""}
                </small>
              </span>
              <span className="num">{t.points(q.got, q.max)}</span>
              <span className="cwd__list-v" data-v={DATA_V[q.state]}>
                {t.state[q.state]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function TesResult({ lang, tes }: { lang: Lang; tes: TesDetail | null }) {
  const t = CW[lang].tes;
  const pn = PN[lang];
  const sec = (children: React.ReactNode) => (
    <section className="cwd__sec">
      <div className="cwd__sechead">
        <h4 className="label-caps">{t.title}</h4>
        <span className="hint">{t.hint}</span>
      </div>
      {children}
    </section>
  );
  if (!tes) return sec(<p className="empty-note empty-note--sm">{t.none}</p>);
  return sec(
    <>
      <dl className="cwd__facts">
        <div className="cwd__fact">
          <dt>{t.total}</dt>
          <dd>
            <span className="num">{tes.total}</span>{" "}
            <small className="hint">{pn.outOf(tes.caps.total)}</small>{" "}
            <Pill tone={tes.final ? "ok" : "warn"}>{tes.final ? t.final : t.provisional}</Pill>
          </dd>
        </div>
        <div className="cwd__fact">
          <dt>{t.written}</dt>
          <dd>
            <span className="num">{tes.phase1}</span>{" "}
            <small className="hint">{pn.outOf(tes.caps.written)}</small>
          </dd>
        </div>
        <div className="cwd__fact">
          <dt>{t.live}</dt>
          <dd>
            {tes.live.score !== null ? (
              <>
                <span className="num">{tes.live.score}</span>{" "}
                <small className="hint">{pn.outOf(tes.live.cap)}</small>
              </>
            ) : (
              <span className="hint">-</span>
            )}
          </dd>
        </div>
      </dl>
      {tes.pending.length > 0 && <p className="hint">{t.pending}</p>}

      {tes.parts.map((p) => (
        <div key={p.part} className="stack stack--sm">
          <h5 className="cwd__sub">
            <b>{pn.part[p.part]}</b> · <span className="num">{p.score}</span>{" "}
            <small className="hint">{pn.outOf(p.cap)}</small>
          </h5>
          {p.flag && <span className="hint">{pn.flags[p.flag]}</span>}
          {p.cut !== undefined && p.was !== undefined && (
            <span className="hint">{pn.cutOf(p.cut, p.was)}</span>
          )}
          {p.questions.length > 0 && (
            <span className="hint">{t.counts(p.full, p.partial, p.wrong, p.blank, p.voided)}</span>
          )}
          <Questions lang={lang} p={p} />
        </div>
      ))}

      <div className="stack stack--sm">
        <h5 className="cwd__sub">
          <b>{t.live}</b>
          {tes.live.score !== null && (
            <>
              {" "}
              · <span className="num">{tes.live.score}</span>{" "}
              <small className="hint">{pn.outOf(tes.live.cap)}</small>
            </>
          )}
        </h5>
        {tes.live.flag && <span className="hint">{pn.flags[tes.live.flag]}</span>}
        {tes.live.cut && (
          <span className="hint">{pn.cutOf(tes.live.cut.pct, tes.live.cut.was)}</span>
        )}
        {tes.live.problems.length === 0 ? (
          <p className="empty-note empty-note--sm">{t.liveNone}</p>
        ) : (
          <ul className="cwd__list cwd__qs">
            {tes.live.problems.map((pr) => (
              <li key={pr.problemId}>
                <span>
                  {pr.title || t.noTitle}
                  <small className="hint cwd__qmeta">
                    {pr.passed !== null && pr.total !== null
                      ? t.tests(pr.passed, pr.total)
                      : t.noSubmit}
                    {pr.bonus ? ` · ${t.bonus}` : ""}
                    {pr.fails > 0 ? ` · ${t.fails(pr.fails, pr.lost)}` : ""}
                  </small>
                </span>
                <span className="num">{t.points(pr.got, pr.points)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>,
  );
}
