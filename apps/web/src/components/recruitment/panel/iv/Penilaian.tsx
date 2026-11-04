/**
 * Penilaian of Wawancara and Mengajar (mockup r4-nilai), copied from the
 * mockup's markup: the tally, the search, filter and sort bar, the table with
 * the chips per examiner and the spread strip, the Rincian of the five
 * parameters, and Rata-Rata per Penguji. A narrow screen gets cards. An
 * examiner without the right sees only their own sheets (Lembarku).
 */
import Pager, { NOUN, Paged, usePager } from "../../../ui/Pager";
import { Fragment, useEffect, useState } from "react";
import { CaretDownIcon, CaretUpIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import Dropdown from "../../../ui/Dropdown";
import IconButton from "../../../ui/IconButton";
import Pill from "../../../ui/Pill";
import SegmentedControl from "../../../ui/SegmentedControl";
import Tooltip from "../../../ui/Tooltip";
import { localeOf, useTick } from "../../../../lib/app";
import type { Lang } from "../../../../lib/kelas";
import { unduhXlsx } from "../../../../lib/xlsx";
import {
  useIvNilai,
  type IvLembarkuResponse,
  type IvNilaiResponse,
  type IvNilaiRow,
} from "../../../../lib/recruitment/iv-client";
import type { IvStage, Verdict } from "../../../../lib/recruitment/interview";
import { IV, bi } from "./ivStrings";
import { PN } from "./penilaianStrings";
import { SK } from "./slotStrings";
import "../../recruitment-r4.css";

const TONE = { lolos: "ok", ragu: "warn", cut: "danger" } as const;
type Filter = "semua" | "selisih" | "ragu" | "belum" | "absen";
type Sort = "rata" | "sebar" | "slot";

const dayLong = (iso: string | number, lang: Lang) =>
  new Intl.DateTimeFormat(localeOf(lang), {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
const dayShort = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(localeOf(lang), { timeZone: "Asia/Jakarta", weekday: "long" }).format(
    new Date(iso),
  );
const hm = (iso: string | number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

const f1 = (v: number | null, lang: Lang) =>
  v === null
    ? "-"
    : v.toLocaleString(localeOf(lang), { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** The screen is narrower than the table needs: the mockup swaps the table for cards below 1100 px. */
function useNarrow(px: number): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px - 1}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [px]);
  return narrow;
}

const absent = (r: IvNilaiRow) => r.sheets.length === 0 && !!r.case?.status;
const slotAt = (r: IvNilaiRow) => (r.startsAt ? Date.parse(r.startsAt) : Infinity);

function Verd({ r, lang }: { r: IvNilaiRow; lang: Lang }) {
  const w = IV(lang).nilai;
  if (r.case?.status)
    return (
      <Pill tone={r.case.status === "gugur" ? "danger" : "warn"}>{w.case[r.case.status]}</Pill>
    );
  if (!r.verdict) return <span className="hint">-</span>;
  return <Pill tone={TONE[r.verdict]}>{w.verdict[r.verdict]}</Pill>;
}

/** The sheets as a strip on the real 0 to 100 scale: the range between the examiners, one dot each, the mean as a bar. */
function Dots({ r, wide, lang }: { r: IvNilaiRow; wide?: boolean; lang: Lang }) {
  const p = PN[lang];
  if (!r.sheets.length) return <span className="hint">{absent(r) ? p.absentShort : "-"}</span>;
  const lo = Math.min(...r.sheets.map((x) => x.score));
  const hi = Math.max(...r.sheets.map((x) => x.score));
  const m = r.mean ?? 0;
  return (
    <span
      className="r4dots"
      data-wide={wide ? "yes" : undefined}
      role="img"
      aria-label={p.dotsAria(
        r.sheets.map((x) => `${x.by} ${x.score}`).join(", "),
        f1(r.mean, lang),
      )}
    >
      <i className="r4dots__rng" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
      {r.sheets.map((x) => (
        <Tooltip key={x.by} label={`${x.by} ${x.score}`}>
          <i className="r4dots__d" style={{ left: `${x.score}%` }} />
        </Tooltip>
      ))}
      <i className="r4dots__m" style={{ left: `${m}%` }} />
    </span>
  );
}

function Spread({ r, lang }: { r: IvNilaiRow; lang: Lang }) {
  const p = PN[lang];
  if (r.spread === null) return <span className="hint">{r.sheets.length ? p.oneSheet : "-"}</span>;
  return (
    <span className="r4sp num" data-t={r.wide ? "danger" : r.spread >= 12 ? "warn" : undefined}>
      {r.spread}
    </span>
  );
}

function Chips({ r, me, lang }: { r: IvNilaiRow; me: string | null; lang: Lang }) {
  const p = PN[lang];
  const at = (by: string) => {
    const x = r.detail.find((d) => d.by === by);
    return x?.at ? `${dayShort(x.at, lang)} ${hm(x.at)}` : "";
  };
  return (
    <span className="r4sc">
      {r.sheets.map((x) => (
        <Tooltip key={x.by} label={p.chipTip(x.by, at(x.by))}>
          <span className="r4sc__c" data-me={x.by === me ? "yes" : undefined}>
            <b>{x.by}</b>
            <span className="num">{x.score}</span>
          </span>
        </Tooltip>
      ))}
      {!absent(r) && r.waiting.length > 0 && r.sheets.length < r.expected && (
        <span className="r4sc__c" data-wait="yes">
          <b>{r.waiting[0]}</b>
          <span>{p.notYet}</span>
        </span>
      )}
    </span>
  );
}

/** The five parameters against each examiner, the gap per parameter, the one they disagree on most. */
function Rincian({
  r,
  d,
  me,
  lang,
}: {
  r: IvNilaiRow;
  d: IvNilaiResponse;
  me: string | null;
  lang: Lang;
}) {
  const p = PN[lang];
  const sh = r.detail;
  const spanOf = (key: string, min: number, max: number) => {
    if (sh.length < 2 || sh.some((x) => x.levels[key] == null)) return 0;
    const v = sh.map((x) => (x.levels[key] - min) / (max - min));
    return Math.max(...v) - Math.min(...v);
  };
  const worst = d.params.reduce(
    (a, x) => (spanOf(x.key, x.min, x.max) > spanOf(a.key, a.min, a.max) ? x : a),
    d.params[0],
  );
  const worstOn = sh.length > 1 && spanOf(worst.key, worst.min, worst.max) > 0;
  return (
    <div className="r4bd">
      <div className="scrollx">
        <table className="rec-table r4bd__t">
          <thead>
            <tr>
              <th>{p.bd.param}</th>
              {sh.map((x) => (
                <th key={x.by} className="num">
                  <span className={`acode${x.by === me ? " acode--me" : ""}`}>{x.by}</span>
                </th>
              ))}
              <th className="num">{p.bd.gap}</th>
              <th>{p.bd.concl}</th>
            </tr>
          </thead>
          <tbody>
            {d.params.map((x) => {
              const all = sh.length > 1 && sh.every((y) => y.levels[x.key] != null);
              return (
                <tr key={x.key} data-worst={worstOn && x === worst ? "yes" : undefined}>
                  <td>{bi(x.label, lang)}</td>
                  {sh.map((y) => (
                    <td key={y.by} className="num">
                      {y.levels[x.key] == null ? "-" : y.levels[x.key]}
                      <span className="hint">/{x.max}</span>
                    </td>
                  ))}
                  <td className="num">
                    {all
                      ? Math.max(...sh.map((y) => y.levels[x.key])) -
                        Math.min(...sh.map((y) => y.levels[x.key]))
                      : "-"}
                  </td>
                  <td className="hint">{r.concl[x.key] || "-"}</td>
                </tr>
              );
            })}
            <tr className="r4bd__tot">
              <td>
                <b>{p.bd.total}</b>
              </td>
              {r.sheets.map((x) => (
                <td key={x.by} className="num">
                  <b>{x.score}</b>
                </td>
              ))}
              <td className="num">
                <b>{r.spread === null ? "-" : r.spread}</b>
              </td>
              <td>
                <Verd r={r} lang={lang} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {worstOn && <span className="hint">{p.bd.worst(bi(worst.label, lang))}</span>}
      {r.ba.trim() && (
        <div className="rec-note">
          <span>{r.ba}</span>
        </div>
      )}
    </div>
  );
}

/** Rata-Rata per Penguji: who grades looser or stricter than the line of every sheet. */
function PerExaminer({ d, me, lang }: { d: IvNilaiResponse; me: string | null; lang: Lang }) {
  const p = PN[lang];
  if (!d.penguji.length || d.avg === null) return null;
  const all =
    d.penguji.reduce((a, x) => a + x.avg * x.n, 0) / d.penguji.reduce((a, x) => a + x.n, 0);
  const rows = [...d.penguji].sort((a, b) => b.avg - a.avg);
  const span = 12;
  return (
    <section className="panel r4per">
      <div className="panel__head">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="panel__title">{p.per.title}</h2>
          <span className="hint">{p.per.hint(f1(all, lang))}</span>
        </div>
      </div>
      <ul className="r4per__list">
        {rows.map((r) => {
          const diff = r.avg - all;
          return (
            <li key={r.by}>
              <Tooltip label={p.per.tip(r.by, r.n)}>
                <span className={`acode${r.by === me ? " acode--me" : ""}`}>{r.by}</span>
              </Tooltip>
              <span className="r4per__bar" aria-hidden="true">
                <i
                  data-side={diff >= 0 ? "up" : "down"}
                  style={{ width: `${Math.min(50, (Math.abs(diff) / span) * 50)}%` }}
                />
              </span>
              <b className="num">{f1(r.avg, lang)}</b>
              <span className="hint num">
                {Math.abs(diff) < 0.05 ? "" : diff > 0 ? "+" : "-"}
                {f1(Math.abs(diff), lang)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Lembarku: an examiner without the Penilaian right sees only the sheets they sent. */
function Lembarku({ d, lang }: { d: IvLembarkuResponse; lang: Lang }) {
  const p = PN[lang].mine;
  const w = IV(lang).nilai;
  const pg = usePager(d.rows, { id: "lembarku", size: 20 });
  return (
    <div className="stack">
      <div className="rec-note">
        <b>{p.title}</b>
        <span>{p.body}</span>
      </div>
      {d.rows.length === 0 ? (
        <p className="empty-note">{p.empty}</p>
      ) : (
        <div className="panel rec-tablecard">
          <div className="scrollx">
            <table className="rec-table r4tab">
              <thead>
                <tr>
                  <th>{p.cols.cand}</th>
                  <th>{p.cols.slot}</th>
                  <th className="num">{p.cols.sheet}</th>
                  <th>{p.cols.verdict}</th>
                  <th>{p.cols.partner}</th>
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.nama}</b>
                    </td>
                    <td className="hint">
                      {r.room}
                      {r.startsAt ? ` · ${hm(r.startsAt)}` : ""}
                    </td>
                    <td className="num">
                      <b>{r.score}</b>
                    </td>
                    <td>
                      {r.verdict ? (
                        <Pill tone={TONE[r.verdict as Verdict]}>{w.verdict[r.verdict]}</Pill>
                      ) : (
                        <span className="hint">-</span>
                      )}
                    </td>
                    <td className="hint">
                      {r.others.length ? p.sent(r.others.join(", ")) : p.none}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pager pg={pg} noun={NOUN[lang].baris} lang={lang} />
    </div>
  );
}

export default function Penilaian({ lang, stage }: { lang: Lang; stage: IvStage }) {
  const p = PN[lang];
  const w = IV(lang).nilai;
  const nilai = useIvNilai(stage);
  const now = useTick(30_000);
  const narrow = useNarrow(1100);
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>("semua");
  const [sort, setSort] = useState<Sort>("rata");
  const [openK, setOpenK] = useState<number | null>(null);
  const d = nilai.data;
  if (!d) return <span className="skeleton" style={{ height: 240 }} />;
  if ("mine" in d) return <Lembarku d={d} lang={lang} />;
  if (!d.rows.length) return <p className="empty-note">{w.none}</p>;

  const me = d.me;
  const rows = d.rows;
  const isAbsent = rows.filter(absent);
  const wideRows = rows.filter((r) => r.wide);
  const ragu = rows.filter((r) => r.verdict === "ragu");
  const missing = rows.filter((r) => !absent(r) && r.sheets.length < r.expected);
  const sheetsIn = rows.reduce((a, r) => a + r.sheets.length, 0);
  const sheetsWant = rows.reduce((a, r) => a + (absent(r) ? 0 : r.expected), 0);
  const rank = [...rows].sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1)).map((r) => r.id);
  const ql = q.trim().toLowerCase();
  const pass = (r: IvNilaiRow) =>
    (!ql || r.nama.toLowerCase().includes(ql)) &&
    (f === "semua" ||
      (f === "selisih"
        ? r.wide
        : f === "belum"
          ? missing.includes(r)
          : f === "ragu"
            ? ragu.includes(r)
            : absent(r)));
  const list = rows
    .filter(pass)
    .sort((a, b) =>
      sort === "rata"
        ? (b.mean ?? -1) - (a.mean ?? -1)
        : sort === "sebar"
          ? (b.spread ?? -1) - (a.spread ?? -1)
          : slotAt(a) - slotAt(b) || (a.booth ?? 0) - (b.booth ?? 0),
    );
  const showTes = stage === "wawancara";
  const sx = stage === "wawancara" ? null : p.stage[stage];
  const showCtx = !!sx?.ctx;
  const toggle = (id: number) => setOpenK(openK === id ? null : id);
  const where = (r: IvNilaiRow) =>
    r.room && r.startsAt ? `${r.room} · ${dayShort(r.startsAt, lang)} ${hm(r.startsAt)}` : "";

  const unduh = () =>
    void unduhXlsx(
      `penilaian-${stage}`,
      [
        "#",
        p.cols.cand,
        "NIM",
        "Slot",
        p.cols.sheets,
        p.cols.mean,
        p.cols.gap,
        p.cols.verdict,
        ...(showTes ? [p.cols.tes] : []),
      ],
      list.map((r) => [
        absent(r) ? "" : rank.indexOf(r.id) + 1,
        r.nama,
        r.nim,
        where(r),
        r.sheets.map((x) => `${x.by} ${x.score}`).join(", "),
        r.mean === null ? "" : Math.round(r.mean * 10) / 10,
        r.spread,
        r.case?.status ? w.case[r.case.status] : r.verdict ? w.verdict[r.verdict] : "",
        ...(showTes ? [r.total] : []),
      ]),
      "Penilaian",
    );

  const tally = (
    <div className="panel r2tally r4tally">
      <div className="r2tally__nums">
        <span>
          <b className="num">
            {sheetsIn}
            <small>/{sheetsWant}</small>
          </b>
          <span className="hint">{p.tally.sheetsIn}</span>
        </span>
        <span>
          <b className="num" data-t="no">
            {wideRows.length}
          </b>
          <span className="hint">{p.tally.wide(d.wide)}</span>
        </span>
        <span>
          <b className="num">{ragu.length}</b>
          <span className="hint">{p.tally.ragu}</span>
        </span>
        <span>
          <b className="num">{missing.length}</b>
          <span className="hint">{p.tally.waiting}</span>
        </span>
        <span>
          <b className="num">{isAbsent.length}</b>
          <span className="hint">{sx ? sx.absent : p.tally.absent}</span>
        </span>
      </div>
      <span className="hint">{sx ? sx.hint : p.tally.hint}</span>
    </div>
  );

  const tools = (
    <div className="row rec-tools">
      <div className="rec-search">
        <MagnifyingGlassIcon className="ic" size={18} aria-hidden="true" />
        <input
          className="field__input input"
          placeholder={p.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={p.searchAria}
        />
      </div>
      <div style={{ width: 250 }}>
        <Dropdown
          id="iv-nilai-f"
          label={p.filterLabel}
          hideLabel
          value={f}
          onChange={(v) => setF(v as Filter)}
          options={[
            { value: "semua", label: p.filters.all },
            { value: "selisih", label: p.filters.wide(wideRows.length) },
            { value: "ragu", label: p.filters.ragu(ragu.length) },
            { value: "belum", label: p.filters.waiting(missing.length) },
            { value: "absen", label: p.filters.absent(isAbsent.length) },
          ]}
        />
      </div>
      <SegmentedControl
        aria-label={p.sortLabel}
        value={sort}
        onValueChange={(v) => setSort(v as Sort)}
        options={[
          { value: "rata", label: p.sorts.rata },
          { value: "sebar", label: p.sorts.sebar },
          { value: "slot", label: sx ? sx.sortLast : p.sorts.slot },
        ]}
      />
      <span className="grow" />
      <span className="hint num">{p.count(list.length, rows.length)}</span>
      <button type="button" className="btn btn--inverse btn--sm" onClick={unduh}>
        <span className="btn__label">{p.xlsx}</span>
      </button>
    </div>
  );

  const table = (
    <Paged
      items={list}
      id={`wawancara-${stage}`}
      size={20}
      reset={[ql, f, sort, stage]}
      noun={NOUN[lang].caas}
      lang={lang}
    >
      {(rowsP) =>
        narrow ? (
          <ul className="r4clist">
            {rowsP.map((r) => (
              <li
                key={r.id}
                className="panel r4crow"
                data-open={openK === r.id ? "yes" : undefined}
              >
                <button
                  type="button"
                  className="r4crow__b"
                  aria-expanded={openK === r.id}
                  onClick={() => toggle(r.id)}
                >
                  <span className="num hint r4crow__r">
                    {absent(r) ? "" : rank.indexOf(r.id) + 1}
                  </span>
                  <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <b>{r.nama}</b>
                    <span className="hint">{where(r)}</span>
                  </span>
                  <span className="r4crow__m">
                    <b className="num">{f1(r.mean, lang)}</b>
                    <Spread r={r} lang={lang} />
                  </span>
                </button>
                <Dots r={r} wide lang={lang} />
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <Chips r={r} me={me} lang={lang} />
                  <Verd r={r} lang={lang} />
                </div>
                {openK === r.id && r.detail.length > 0 && (
                  <Rincian r={r} d={d} me={me} lang={lang} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="panel rec-tablecard">
            <div className="scrollx">
              <table className="rec-table r4tab">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>{p.cols.cand}</th>
                    <th>{p.cols.sheets}</th>
                    <th className="num">{p.cols.mean}</th>
                    <th>{p.cols.spread}</th>
                    <th className="num">{p.cols.gap}</th>
                    <th>{p.cols.verdict}</th>
                    {showTes && <th className="num">{p.cols.tes}</th>}
                    {showCtx && <th className="num">{sx?.ctx}</th>}
                    <th>
                      <span className="sr">{p.cols.details}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rowsP.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        data-open={openK === r.id ? "yes" : undefined}
                        data-wide={r.wide ? "yes" : undefined}
                      >
                        <td className="num hint">{absent(r) ? "" : rank.indexOf(r.id) + 1}</td>
                        <td>
                          <span className="stack" style={{ gap: 0 }}>
                            <b>{r.nama}</b>
                            <span className="hint">{where(r)}</span>
                          </span>
                        </td>
                        <td>
                          {absent(r) ? (
                            <Pill>{p.absentBadge}</Pill>
                          ) : (
                            <Chips r={r} me={me} lang={lang} />
                          )}
                        </td>
                        <td className="num">
                          <b className="r4avg">{f1(r.mean, lang)}</b>
                        </td>
                        <td>
                          <Dots r={r} lang={lang} />
                        </td>
                        <td className="num">
                          <Spread r={r} lang={lang} />
                        </td>
                        <td>
                          <Verd r={r} lang={lang} />
                        </td>
                        {showTes && <td className="num hint">{r.total ?? "-"}</td>}
                        {showCtx && (
                          <td className="num">
                            <span className="hint num" title={sx?.ctxTip}>
                              {f1(r.ctx?.[0] ?? null, lang)} ·{" "}
                              {r.ctx?.[1] == null ? "-" : Math.round(r.ctx[1])}
                            </span>
                          </td>
                        )}
                        <td>
                          {r.detail.length > 0 && (
                            <IconButton
                              sm
                              icon={openK === r.id ? CaretUpIcon : CaretDownIcon}
                              label={
                                openK === r.id ? p.hideDetails : p.detailsOf(r.nama.split(" ")[0])
                              }
                              pressed={openK === r.id}
                              onClick={() => toggle(r.id)}
                            />
                          )}
                        </td>
                      </tr>
                      {openK === r.id && (
                        <tr className="r4tab__bd">
                          <td colSpan={showTes || showCtx ? 9 : 8}>
                            <Rincian r={r} d={d} me={me} lang={lang} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    </Paged>
  );

  return (
    <div className="stack">
      <div className="row row--between" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="hint">{p.topLine(dayLong(now, lang), hm(now), p.cuttingOf[stage])}</span>
        {stage === "wawancara" ? (
          <span title={SK[lang].proposalTip}>
            <Pill tone="warn">{SK[lang].proposal}</Pill>
          </span>
        ) : (
          d.example && (
            <span title={p.sampleTip}>
              <Pill tone="warn">{p.sample}</Pill>
            </span>
          )
        )}
      </div>
      {tally}
      <div className="r4nilai">
        <div className="stack" style={{ minWidth: 0 }}>
          {tools}
          {list.length ? table : <p className="empty-note">{p.empty}</p>}
        </div>
        <PerExaminer d={d} me={me} lang={lang} />
      </div>
    </div>
  );
}
