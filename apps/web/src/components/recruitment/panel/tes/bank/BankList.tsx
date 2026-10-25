/**
 * One part of the bank (mockup r3-bank): the pool cards per language, then
 * the list of its questions with a search and a format filter. A table from
 * 820 px wide, a list of rows below. A withdrawn question's title is struck
 * through; a default one carries the Bawaan badge until a person edits it.
 */
import { useMemo, useState } from "react";
import Dropdown from "../../../../ui/Dropdown";
import Pill from "../../../../ui/Pill";
import { useMinWidth } from "../../../../../lib/hooks";
import type { Lang } from "../../../../../lib/kelas";
import type { QuestionSummary } from "../../../../../lib/recruitment/bank-api";
import type { PoolCount } from "../../../../../lib/recruitment/bank-rules";
import { FORMATS, type Format, type Phase1Part } from "../../../../../lib/recruitment/exam-types";
import { BK } from "./bankStrings";

const LANG_ORDER = ["cpp", "py", "any"];

export function PoolCard({ lang, p }: { lang: Lang; p: PoolCount }) {
  const t = BK[lang];
  const short = p.ready < p.shown;
  return (
    <div className="r3pool" data-short={short ? "yes" : "no"}>
      <div className="row row--between">
        <b>{t.langs[p.lang]}</b>
        <span className="num">
          <b>{p.ready}</b> {t.ofReadyRest(p.pool)}
        </span>
      </div>
      <div
        className="r3pool__bar"
        role="img"
        aria-label={`${t.ofReady(p.ready, p.pool)}. ${t.needTip(p.shown)}`}
      >
        <i style={{ transform: `scaleX(${Math.min(1, p.ready / Math.max(1, p.pool))})` }} />
        <span
          className="r3pool__min"
          style={{ left: `${(100 * p.shown) / Math.max(1, p.pool)}%` }}
          title={t.needTip(p.shown)}
        />
      </div>
      <span className="hint">
        {short ? t.poolShort(p.shown - p.ready) : t.poolEnough(p.shown)} ·{" "}
        {t.poolCounts(p.draft, p.seed, p.voided)}
      </span>
    </div>
  );
}

function Status({ lang, r }: { lang: Lang; r: QuestionSummary }) {
  const t = BK[lang];
  return r.voided ? (
    <Pill tone="danger">{t.voided}</Pill>
  ) : r.status === "ready" ? (
    <Pill tone="ok">{t.ready}</Pill>
  ) : (
    <Pill>{t.draft}</Pill>
  );
}

export default function BankList({
  lang,
  part,
  rows,
  pools,
  onOpen,
}: {
  lang: Lang;
  part: Phase1Part;
  rows: QuestionSummary[];
  pools: PoolCount[];
  onOpen: (id: number) => void;
}) {
  const t = BK[lang];
  const wide = useMinWidth(820);
  const [q, setQ] = useState("");
  const [f, setF] = useState<"semua" | Format>("semua");
  const mine = useMemo(() => rows.filter((r) => r.part === part), [rows, part]);
  const list = useMemo(
    () =>
      mine.filter(
        (r) =>
          (f === "semua" || r.format === f) &&
          (!q.trim() || r.title.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [mine, f, q],
  );
  return (
    <div className="stack">
      <div className="r3pools">
        {[...pools]
          .sort((a, b) => LANG_ORDER.indexOf(a.lang) - LANG_ORDER.indexOf(b.lang))
          .map((p) => (
            <PoolCard key={p.lang} lang={lang} p={p} />
          ))}
      </div>
      <div className="row rec-tools">
        <div className="rec-search">
          <input
            className="field__input"
            id="r3-bank-q"
            placeholder={t.search}
            aria-label={t.searchAria}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div style={{ width: 230 }}>
          <Dropdown
            id="r3-bank-f"
            label={t.filterFormat}
            hideLabel
            value={f}
            options={[
              { value: "semua", label: t.allFormats },
              ...FORMATS.map((k) => ({ value: k, label: t.formats[k] })),
            ]}
            onChange={(v) => setF(v as "semua" | Format)}
          />
        </div>
        <span className="grow" />
        <span className="hint num">{t.count(list.length)}</span>
      </div>
      {!list.length ? (
        <p className="empty-note">{mine.length ? t.emptyFilter : t.emptyPart}</p>
      ) : wide ? (
        <section className="panel rec-tablecard">
          <div className="scrollx">
            <table className="rec-table r3qtab">
              <thead>
                <tr>
                  <th>{t.colTitle}</th>
                  <th>{t.colFormat}</th>
                  <th>{t.colLang}</th>
                  <th>{t.colShown}</th>
                  <th>{t.colVersion}</th>
                  <th>{t.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    data-void={r.voided ? "yes" : "no"}
                    onClick={() => onOpen(r.id)}
                    onKeyDown={(e) => e.key === "Enter" && onOpen(r.id)}
                  >
                    <td>
                      <b>{r.title}</b>
                      {r.sample && (
                        <>
                          {" "}
                          <Pill tone="violet">{t.default}</Pill>
                        </>
                      )}
                    </td>
                    <td>{t.formats[r.format]}</td>
                    <td>{t.langs[r.lang]}</td>
                    <td className="num">
                      {r.shown ? t.shownYes : <span className="hint">{t.notYet}</span>}
                    </td>
                    <td className="num hint">v{r.version}</td>
                    <td>
                      <Status lang={lang} r={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <ul className="rec-clist">
          {list.map((r) => (
            <li key={r.id}>
              <button type="button" className="rec-crow" onClick={() => onOpen(r.id)}>
                <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <b style={r.voided ? { textDecoration: "line-through" } : undefined}>{r.title}</b>
                  <span className="hint">
                    {t.formats[r.format]} · {t.langs[r.lang]}
                    {r.sample ? ` · ${t.default}` : ""}
                  </span>
                </span>
                <Status lang={lang} r={r} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
