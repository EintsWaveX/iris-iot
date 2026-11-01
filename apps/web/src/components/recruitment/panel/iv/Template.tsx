/**
 * The template of Wawancara or Mengajar (mockup r4-template), copied from the
 * mockup's markup: the hint row with Download Template and Tambah Pertanyaan,
 * Parameter Penilaian, Aturan Terlambat dan Susulan, the totals strip, and the
 * list of cards grouped as the form groups them, one row open at a time.
 * Everything is a default the Ketua and the Akademik can change; it saves
 * through the settings API (audited) and the sheets read it on open. The
 * limits, crew sizes and weights that only the live template has sit in two
 * more cards in the same style, so no setting went away.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DownloadSimpleIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import Disclose from "../../../ui/Disclose";
import Dropdown from "../../../ui/Dropdown";
import IconButton from "../../../ui/IconButton";
import Pill from "../../../ui/Pill";
import { Stepper, Switch } from "../../../ui/Controls";
import type { Lang } from "../../../../lib/kelas";
import { unduhDocx, type DocxLine } from "../../../../lib/docx-min";
import { isFail, recPost, useRecSettings } from "../../../../lib/recruitment/client";
import {
  checkTemplate,
  type Bi,
  type IvParam,
  type IvQuestion,
  type IvStage,
  type IvTemplate,
} from "../../../../lib/recruitment/interview";
import { IV, STEP, bi } from "./ivStrings";
import { SK } from "./slotStrings";
import { TP } from "./templateStrings";
import "../../recruitment-r4.css";

const toast = (m: string, tone: "ok" | "warn" | "danger" | "info" = "ok") =>
  window.Toast?.show(m, tone);

/** The text of a Bi in the language being edited (the Indonesian one, or English for en and zh). */
const lg = (lang: Lang): "id" | "en" => (lang === "id" ? "id" : "en");
/** Set one language of a Bi. The other follows when it was the same text (the mockup types one text for both). */
const setBi = (b: Bi, v: string, lang: Lang): Bi => {
  const a = lg(lang);
  const o = a === "id" ? "en" : "id";
  return { ...b, [a]: v, [o]: b[o] === b[a] ? v : b[o] } as Bi;
};

/** The indicators in one input: comma separated, kept as typed until the field is left. */
function Indikator({
  ind,
  lang,
  disabled,
  onChange,
}: {
  ind: Bi[];
  lang: Lang;
  disabled: boolean;
  onChange: (next: Bi[]) => void;
}) {
  const a = lg(lang);
  const o = a === "id" ? "en" : "id";
  const joined = ind.map((x) => x[a]).join(", ");
  const [txt, setTxt] = useState(joined);
  useEffect(() => setTxt(joined), [joined]);
  return (
    <input
      className="field__input input"
      value={txt}
      disabled={disabled}
      onChange={(e) => {
        setTxt(e.target.value);
        const parts = e.target.value
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        onChange(
          parts.map((t, i) => {
            const old = ind[i];
            return { [a]: t, [o]: old && old[o] !== old[a] ? old[o] : t } as unknown as Bi;
          }),
        );
      }}
    />
  );
}

export default function Template({ lang, stage }: { lang: Lang; stage: IvStage }) {
  const w = IV(lang);
  const t = w.tpl;
  const p = TP[lang];
  const set = useRecSettings(true);
  const view = set.data?.settings.find((s) => s.key === stage) ?? null;
  const saved = useMemo(() => (view ? (view.value as IvTemplate) : null), [view]);
  const [d, setD] = useState<IvTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [ed, setEd] = useState<number | null>(null);
  useEffect(() => {
    if (saved) setD(structuredClone(saved));
  }, [saved]);
  if (!view || !d || !saved) return <span className="skeleton" style={{ height: 320 }} />;
  const can = view.canEdit;
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const valid = checkTemplate(d) !== null;
  const patch = (x: Partial<IvTemplate>) => setD({ ...d, ...x });
  const setParam = (i: number, x: Partial<IvParam>) =>
    patch({ params: d.params.map((q, j) => (j === i ? { ...q, ...x } : q)) });
  const setQ = (i: number, x: Partial<IvQuestion>) =>
    patch({ questions: d.questions.map((q, j) => (j === i ? { ...q, ...x } : q)) });
  const undoable = (msg: string, before: IvTemplate) =>
    window.Toast?.show(msg, "info", {
      action: { label: p.undo, onClick: () => setD(before) },
    });

  const simpan = async () => {
    const clean = checkTemplate(d);
    if (!clean) return toast(t.invalid, "warn");
    setBusy(true);
    const r = await recPost<{ ok: true }>("setting-save", { key: stage, value: clean });
    setBusy(false);
    if (isFail(r)) return toast(w.err[r.kode] ?? r.kode, "danger");
    toast(t.saved);
    set.refresh();
  };
  const pulihkan = async () => {
    setBusy(true);
    const r = await recPost<{ ok: true }>("setting-reset", { key: stage });
    setBusy(false);
    if (isFail(r)) return toast(w.err[r.kode] ?? r.kode, "danger");
    toast(t.resetDone);
    set.refresh();
  };
  const tambahParam = () => {
    let n = d.params.length + 1;
    while (d.params.some((x) => x.key === `param${n}`)) n++;
    patch({
      params: [
        ...d.params,
        {
          key: `param${n}`,
          label: { id: TP.id.newParam, en: TP.en.newParam },
          ind: [{ id: TP.id.newInd, en: TP.en.newInd }],
          eg: { id: "", en: "" },
          min: d.params[0]?.min ?? 1,
          max: d.params[0]?.max ?? 5,
          weight: 1,
        },
      ],
    });
  };
  const hapusParam = (i: number) => {
    if (d.params.length < 2) return;
    const key = d.params[i].key;
    const before = d;
    setD({
      ...d,
      params: d.params.filter((_, j) => j !== i),
      questions: d.questions.filter((q) => q.p !== key),
    });
    undoable(p.removedParam, before);
  };
  const tambahQ = () => {
    if (!d.groups.length || !d.params.length) return;
    let n = d.questions.length + 1;
    while (d.questions.some((q) => q.id === `q${n}`)) n++;
    const last = d.groups[d.groups.length - 1];
    patch({
      questions: [
        ...d.questions,
        {
          id: `q${n}`,
          g: last.key,
          m: 1,
          p: d.params[0].key,
          t: { id: TP.id.newQ, en: TP.en.newQ },
          h: null,
          only: null,
        },
      ],
    });
    setEd(d.questions.length);
  };
  const hapusQ = (i: number) => {
    const before = d;
    patch({ questions: d.questions.filter((_, j) => j !== i) });
    setEd(null);
    undoable(p.removedQuestion, before);
  };
  const geser = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= d.questions.length) return;
    const a = d.questions.slice();
    [a[i], a[j]] = [a[j], a[i]];
    patch({ questions: a });
    setEd((e) => (e === i ? j : e === j ? i : e));
  };

  const unduh = () => {
    const out: DocxLine[] = [
      { kind: "title", text: p.docTitle(w.title[stage]) },
      { kind: "heading", text: p.docParams },
      ...d.params.flatMap((x, i): DocxLine[] => [
        { kind: "text", text: `${i + 1}. ${bi(x.label, lang)}` },
        ...x.ind.map((y): DocxLine => ({ kind: "note", text: `- ${bi(y, lang)}` })),
      ]),
      { kind: "heading", text: p.docQuestions },
    ];
    let last: string | null = null;
    d.questions.forEach((q, i) => {
      if (q.g !== last) {
        last = q.g;
        const g = d.groups.find((x) => x.key === q.g);
        out.push({ kind: "heading", text: g ? bi(g.label, lang) : p.other });
      }
      const par = d.params.find((x) => x.key === q.p);
      out.push({
        kind: "text",
        text: `${i + 1}. ${bi(q.t, lang)}${q.m ? ` (${p.docMinutes(q.m)})` : ""}${
          par ? ` [${bi(par.label, lang)}]` : ""
        }${q.only ? ` (${p.q.special})` : ""}`,
      });
      if (q.h) out.push({ kind: "note", text: bi(q.h, lang) });
    });
    unduhDocx(`template-${stage}`, out);
  };

  const stepper = (
    name: string,
    hint: string,
    v: number,
    onChange: (n: number) => void,
    min: number,
    max: number,
    step = 1,
  ) => (
    <label className="r6set">
      <span className="stack" style={{ gap: 2, minWidth: 0 }}>
        <b>{name}</b>
        <span className="hint">{hint}</span>
      </span>
      <Stepper
        value={v}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        label={name}
        disabled={!can}
        {...STEP(lang)}
      />
    </label>
  );

  const total = d.questions.reduce((a, x) => a + (x.only ? 0 : x.m), 0);
  const over = total > d.minutes;
  let lastG: string | null = null;

  return (
    <div className="stack">
      <div className="row row--between" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="hint">{can ? p.top : t.readOnly}</span>
        <span className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={unduh}>
            <DownloadSimpleIcon size={18} aria-hidden="true" />
            <span className="btn__label">{p.download}</span>
          </button>
          {can && d.groups.length > 0 && (
            <button
              type="button"
              className="btn btn--inverse btn--sm"
              onClick={tambahQ}
              disabled={d.questions.length >= 120}
            >
              <PlusIcon size={18} aria-hidden="true" />
              <span className="btn__label">{p.addQuestion}</span>
            </button>
          )}
        </span>
      </div>

      <section className="panel r4tpl__sum">
        <div className="panel__head">
          <div className="stack" style={{ gap: 2 }}>
            <h3 className="panel__title">{p.params.title}</h3>
            <span className="hint">{p.params.hint}</span>
          </div>
          {can && (
            <button
              type="button"
              className="btn btn--inverse btn--sm"
              onClick={tambahParam}
              disabled={d.params.length >= 12}
            >
              <PlusIcon size={18} aria-hidden="true" />
              <span className="btn__label">{p.params.add}</span>
            </button>
          )}
        </div>
        <ul className="r4ptl">
          {d.params.map((x, i) => (
            <li key={x.key}>
              <label className="stack stack--sm">
                <span className="hint">{p.params.name}</span>
                <input
                  className="field__input input"
                  value={x.label[lg(lang)]}
                  disabled={!can}
                  onChange={(e) => setParam(i, { label: setBi(x.label, e.target.value, lang) })}
                />
              </label>
              <label className="stack stack--sm">
                <span className="hint">{p.params.ind}</span>
                <Indikator
                  ind={x.ind}
                  lang={lang}
                  disabled={!can}
                  onChange={(next) => setParam(i, { ind: next })}
                />
              </label>
              {can && (
                <IconButton
                  sm
                  kind="danger"
                  icon={TrashIcon}
                  label={d.params.length < 2 ? p.params.one : p.params.del}
                  disabled={d.params.length < 2}
                  onClick={() => hapusParam(i)}
                />
              )}
            </li>
          ))}
        </ul>
        <Disclose
          head={
            <b>
              {p.weight.name} · {p.eg.name}
            </b>
          }
        >
          <ul className="r4ptl">
            {d.params.map((x, i) => (
              <li key={x.key}>
                <span className="stack" style={{ gap: 2 }}>
                  <b>{bi(x.label, lang)}</b>
                  {x.example && (
                    <Pill tone="warn" title={t.exampleTip}>
                      {t.example}
                    </Pill>
                  )}
                </span>
                <label className="stack stack--sm">
                  <span className="hint">{p.eg.name}</span>
                  <input
                    className="field__input input"
                    value={x.eg[lg(lang)]}
                    disabled={!can}
                    onChange={(e) => setParam(i, { eg: setBi(x.eg, e.target.value, lang) })}
                  />
                </label>
                <Stepper
                  value={x.weight}
                  onChange={(n) => setParam(i, { weight: n })}
                  min={1}
                  max={10}
                  label={p.weight.name}
                  disabled={!can}
                  {...STEP(lang)}
                />
              </li>
            ))}
          </ul>
        </Disclose>
      </section>

      <section className="panel r4tpl__sum">
        <div className="panel__head">
          <div className="stack" style={{ gap: 2 }}>
            <h3 className="panel__title">{p.rules.title}</h3>
            <span className="hint">{p.rules.hint}</span>
          </div>
        </div>
        <div className="r6sets">
          {stepper(p.late.name, p.late.hint, d.late, (n) => patch({ late: n }), 0, 120)}
          {stepper(p.excuse.name, p.excuse.hint, d.excuse, (n) => patch({ excuse: n }), 0, 1440)}
          {stepper(
            p.makeupDays.name,
            p.makeupDays.hint,
            d.makeupDays,
            (n) => patch({ makeupDays: n }),
            0,
            14,
          )}
          {stepper(
            p.makeupHour.name,
            p.makeupHour.hint,
            d.makeupHour,
            (n) => patch({ makeupHour: n }),
            0,
            23,
          )}
        </div>
      </section>

      <section className="panel r4tpl__sum">
        <div className="panel__head">
          <div className="stack" style={{ gap: 2 }}>
            <h3 className="panel__title">{p.limits.title}</h3>
            <span className="hint">{p.limits.hint}</span>
          </div>
        </div>
        <div className="r6sets">
          {stepper(
            p.cutLolos.name,
            p.cutLolos.hint,
            d.cut[0],
            (n) => patch({ cut: [n, Math.min(d.cut[1], n)] }),
            0,
            100,
          )}
          {stepper(
            p.cutRagu.name,
            p.cutRagu.hint,
            d.cut[1],
            (n) => patch({ cut: [d.cut[0], Math.min(n, d.cut[0])] }),
            0,
            100,
          )}
          {stepper(p.wide.name, p.wide.hint, d.wide, (n) => patch({ wide: n }), 1, 100)}
          <div className="r6set">
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{p.hide.name}</b>
              <span className="hint">{p.hide.hint}</span>
            </span>
            <Switch
              on={d.hideLevels}
              onChange={(v) => patch({ hideLevels: v })}
              label={p.hide.name}
              disabled={!can}
            />
          </div>
          {stepper(p.minutes.name, p.minutes.hint, d.minutes, (n) => patch({ minutes: n }), 1, 600)}
          {stepper(
            p.maxMinutes.name,
            p.maxMinutes.hint,
            d.maxMinutes,
            (n) => patch({ maxMinutes: n }),
            1,
            600,
          )}
          {d.mode === "panel" &&
            stepper(p.gap.name, p.gap.hint, d.gap, (n) => patch({ gap: n }), 0, 60)}
          {stepper(p.crewPer[d.mode], p.crewHint, d.per, (n) => patch({ per: n }), 1, 8)}
          {stepper(p.pjOut, p.crewHint, d.pjOut, (n) => patch({ pjOut: n }), 0, 6)}
          {stepper(p.pjIn, p.crewHint, d.pjIn, (n) => patch({ pjIn: n }), 0, 10)}
        </div>
      </section>

      {d.groups.length > 0 && (
        <>
          <section className="panel r4tpl__sum">
            <div className="r2tally__nums">
              <span>
                <b className="num">{d.questions.length}</b>
                <span className="hint">{p.sum.cards}</span>
              </span>
              <span>
                <b className="num" data-t={over ? "no" : undefined}>
                  {Math.round(total)}
                  <small>/{d.minutes}</small>
                </b>
                <span className="hint">{p.sum.planned}</span>
              </span>
              <span>
                <b className="num">{d.questions.filter((x) => x.only).length}</b>
                <span className="hint">{p.sum.special}</span>
              </span>
            </div>
            <span className="r4rail__bar">
              <i
                style={{ width: `${Math.min(100, (total / Math.max(1, d.minutes)) * 100)}%` }}
                data-over={over ? "yes" : undefined}
              />
            </span>
            <span className="hint">{p.sum.hint(p.dur(d.minutes), p.dur(d.maxMinutes))}</span>
          </section>

          <div className="panel" style={{ padding: 0 }}>
            <ol className="r4tpl">
              {d.questions.map((x, i) => {
                const g = x.g !== lastG;
                lastG = x.g;
                const grp = d.groups.find((y) => y.key === x.g);
                const par = d.params.find((y) => y.key === x.p);
                return (
                  <li key={x.id} style={{ display: "contents" }}>
                    {g && <div className="r4tpl__g">{grp ? bi(grp.label, lang) : p.other}</div>}
                    <div className="r4tpl__r" data-open={ed === i ? "yes" : undefined}>
                      <div className="r4tpl__row">
                        <span className="num hint">{i + 1}</span>
                        <span className="r4tpl__t">{bi(x.t, lang)}</span>
                        {x.only && <Pill tone="warn">{p.q.special}</Pill>}
                        <span className="hint num">{x.m ? `${x.m}′` : "-"}</span>
                        <span className="hint r4tpl__p">{par ? bi(par.label, lang) : ""}</span>
                        <span className="r4tpl__a">
                          {can && (
                            <>
                              <IconButton
                                sm
                                icon={ArrowUpIcon}
                                label={p.up}
                                disabled={i === 0}
                                onClick={() => geser(i, -1)}
                              />
                              <IconButton
                                sm
                                icon={ArrowDownIcon}
                                label={p.down}
                                disabled={i === d.questions.length - 1}
                                onClick={() => geser(i, 1)}
                              />
                            </>
                          )}
                          <IconButton
                            sm
                            icon={PencilSimpleIcon}
                            label={p.edit}
                            pressed={ed === i}
                            onClick={() => setEd(ed === i ? null : i)}
                          />
                        </span>
                      </div>
                      {ed === i && (
                        <div className="r4tpl__ed">
                          <label className="stack stack--sm">
                            <span className="hint">{p.q.text}</span>
                            <input
                              className="field__input input"
                              value={x.t[lg(lang)]}
                              disabled={!can}
                              onChange={(e) => setQ(i, { t: setBi(x.t, e.target.value, lang) })}
                            />
                          </label>
                          <label className="stack stack--sm">
                            <span className="hint">{p.q.hint}</span>
                            <input
                              className="field__input input"
                              value={x.h ? x.h[lg(lang)] : ""}
                              placeholder={p.q.hintPh}
                              disabled={!can}
                              onChange={(e) =>
                                setQ(i, {
                                  h: e.target.value
                                    ? setBi(x.h ?? { id: "", en: "" }, e.target.value, lang)
                                    : null,
                                })
                              }
                            />
                          </label>
                          <div
                            className="row"
                            style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}
                          >
                            <label className="stack stack--sm">
                              <span className="hint">{p.q.minutes}</span>
                              <Stepper
                                value={x.m}
                                onChange={(n) => setQ(i, { m: n })}
                                min={0}
                                max={60}
                                step={0.5}
                                label={p.q.minutes}
                                disabled={!can}
                                {...STEP(lang)}
                              />
                            </label>
                            <label className="stack stack--sm">
                              <span className="hint">{p.q.group}</span>
                              <div style={{ width: 200 }}>
                                <Dropdown
                                  id={`iv-qg-${x.id}`}
                                  label={p.q.group}
                                  hideLabel
                                  value={x.g}
                                  disabled={!can}
                                  onChange={(v) => setQ(i, { g: v })}
                                  options={d.groups.map((y) => ({
                                    value: y.key,
                                    label: bi(y.label, lang),
                                  }))}
                                />
                              </div>
                            </label>
                            <label className="stack stack--sm">
                              <span className="hint">{p.q.param}</span>
                              <div style={{ width: 220 }}>
                                <Dropdown
                                  id={`iv-qp-${x.id}`}
                                  label={p.q.param}
                                  hideLabel
                                  value={x.p}
                                  disabled={!can}
                                  onChange={(v) => setQ(i, { p: v })}
                                  options={d.params.map((y) => ({
                                    value: y.key,
                                    label: bi(y.label, lang),
                                  }))}
                                />
                              </div>
                            </label>
                            <label className="stack stack--sm">
                              <span className="hint">{p.q.shown}</span>
                              <div style={{ width: 260 }}>
                                <Dropdown
                                  id={`iv-qo-${x.id}`}
                                  label={p.q.shown}
                                  hideLabel
                                  value={x.only ?? ""}
                                  disabled={!can}
                                  onChange={(v) =>
                                    setQ(i, { only: v === "fm" || v === "lab" ? v : null })
                                  }
                                  options={[
                                    { value: "", label: p.q.all },
                                    { value: "fm", label: p.q.fm },
                                    { value: "lab", label: p.q.lab },
                                  ]}
                                />
                              </div>
                            </label>
                            <span className="grow" />
                            {can && (
                              <button
                                type="button"
                                className="btn btn--danger-soft btn--sm"
                                onClick={() => hapusQ(i)}
                              >
                                <TrashIcon size={18} aria-hidden="true" />
                                <span className="btn__label">{p.q.del}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}

      {can && (
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !dirty}
            onClick={() => void simpan()}
          >
            {t.save}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy || (!view.custom && !dirty)}
            onClick={() => (dirty ? setD(structuredClone(saved)) : void pulihkan())}
          >
            {dirty ? w.kasus.cancel : t.reset}
          </button>
          {dirty && <span className="hint">{valid ? t.changed : t.invalid}</span>}
          {stage === "wawancara" && (
            <span title={SK[lang].proposalTip}>
              <Pill tone="warn">{t.stc}</Pill>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
