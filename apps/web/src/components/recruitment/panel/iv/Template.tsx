/**
 * The template of Wawancara or Mengajar (mockup r4-template): the parameters
 * and their levels, the crew sizes, the minutes and the case rules, the
 * verdict thresholds and, for the interview, the question cards. Everything is
 * a default the Ketua and the Akademik can change; it saves through the
 * settings API (audited) and the sheets read it on open.
 */
import { useEffect, useMemo, useState } from "react";
import Dropdown from "../../../ui/Dropdown";
import { Checkbox, Stepper } from "../../../ui/Controls";
import Pill from "../../../ui/Pill";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost, useRecSettings } from "../../../../lib/recruitment/client";
import {
  checkTemplate,
  type IvParam,
  type IvQuestion,
  type IvStage,
  type IvTemplate,
} from "../../../../lib/recruitment/interview";
import { IV, STEP } from "./ivStrings";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);

export default function Template({ lang, stage }: { lang: Lang; stage: IvStage }) {
  const w = IV(lang);
  const t = w.tpl;
  const set = useRecSettings(true);
  const view = set.data?.settings.find((s) => s.key === stage) ?? null;
  const saved = useMemo(() => (view ? (view.value as IvTemplate) : null), [view]);
  const [d, setD] = useState<IvTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (saved) setD(structuredClone(saved));
  }, [saved]);
  if (!view || !d || !saved) return <span className="skeleton" style={{ height: 320 }} />;
  const can = view.canEdit;
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const valid = checkTemplate(d) !== null;
  const patch = (x: Partial<IvTemplate>) => setD({ ...d, ...x });
  const setParam = (i: number, x: Partial<IvParam>) =>
    patch({ params: d.params.map((p, j) => (j === i ? { ...p, ...x } : p)) });
  const setQ = (i: number, x: Partial<IvQuestion>) =>
    patch({ questions: d.questions.map((q, j) => (j === i ? { ...q, ...x } : q)) });

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
    while (d.params.some((p) => p.key === `param${n}`)) n++;
    patch({
      params: [
        ...d.params,
        {
          key: `param${n}`,
          label: { id: "Parameter baru", en: "New parameter" },
          ind: [],
          eg: { id: "Contoh kesimpulan.", en: "An example conclusion." },
          min: d.params[0]?.min ?? 1,
          max: d.params[0]?.max ?? 5,
          weight: 1,
        },
      ],
    });
  };
  const tambahQ = () => {
    if (!d.groups.length || !d.params.length) return;
    let n = d.questions.length + 1;
    while (d.questions.some((q) => q.id === `q${n}`)) n++;
    patch({
      questions: [
        ...d.questions,
        {
          id: `q${n}`,
          g: d.groups[0].key,
          m: 1,
          p: d.params[0].key,
          t: { id: "Pertanyaan baru", en: "New question" },
          h: null,
          only: null,
        },
      ],
    });
  };

  const num = (
    label: string,
    v: number,
    onChange: (n: number) => void,
    min: number,
    max: number,
  ) => (
    <label className="stack stack--sm">
      <span className="hint">{label}</span>
      <Stepper
        value={v}
        onChange={onChange}
        min={min}
        max={max}
        label={label}
        disabled={!can}
        {...STEP(lang)}
      />
    </label>
  );

  return (
    <div className="stack r4tpl">
      <div className="row row--between" style={{ gap: 12, flexWrap: "wrap" }}>
        <span className="hint">{can ? t.lede : t.readOnly}</span>
        <Pill tone="warn">{t.stc}</Pill>
      </div>

      <section className="card stack">
        <h3 className="card__title">{t.crew}</h3>
        <div className="r4rule__g">
          {num(t.per[d.mode], d.per, (n) => patch({ per: n }), 1, 8)}
          {num(t.pjOut, d.pjOut, (n) => patch({ pjOut: n }), 0, 6)}
          {num(t.pjIn, d.pjIn, (n) => patch({ pjIn: n }), 0, 10)}
          {num(t.minutes, d.minutes, (n) => patch({ minutes: n }), 1, 600)}
          {num(t.maxMinutes, d.maxMinutes, (n) => patch({ maxMinutes: n }), 1, 600)}
          {d.mode === "panel" && num(t.gap, d.gap, (n) => patch({ gap: n }), 0, 60)}
          {num(t.late, d.late, (n) => patch({ late: n }), 0, 120)}
          {num(t.excuse, d.excuse, (n) => patch({ excuse: n }), 0, 1440)}
        </div>
      </section>

      <section className="card stack">
        <h3 className="card__title">{t.cut}</h3>
        <div className="r4rule__g">
          {num(t.cutLolos, d.cut[0], (n) => patch({ cut: [n, Math.min(d.cut[1], n)] }), 0, 100)}
          {num(
            t.cutRagu,
            d.cut[1],
            (n) => patch({ cut: [d.cut[0], Math.min(n, d.cut[0])] }),
            0,
            100,
          )}
          {num(t.wide, d.wide, (n) => patch({ wide: n }), 1, 100)}
        </div>
        <Checkbox
          checked={d.hideLevels}
          onChange={(v) => patch({ hideLevels: v })}
          label={t.hideLevels}
          hint={t.hideLevelsHint}
          disabled={!can}
        />
      </section>

      <section className="card stack">
        <div className="row row--between">
          <h3 className="card__title">{t.params}</h3>
          {can && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={tambahParam}
              disabled={d.params.length >= 12}
            >
              {t.addParam}
            </button>
          )}
        </div>
        {d.params.map((p, i) => (
          <div key={p.key} className="r4tpl__row">
            <div className="r4rule__g">
              <label className="stack stack--sm">
                <span className="hint">{t.paramName}</span>
                <input
                  className="input"
                  value={p.label.id}
                  disabled={!can}
                  onChange={(e) => setParam(i, { label: { ...p.label, id: e.target.value } })}
                />
              </label>
              <label className="stack stack--sm">
                <span className="hint">{t.paramNameEn}</span>
                <input
                  className="input"
                  value={p.label.en}
                  disabled={!can}
                  onChange={(e) => setParam(i, { label: { ...p.label, en: e.target.value } })}
                />
              </label>
              {num(t.weight, p.weight, (n) => setParam(i, { weight: n }), 1, 10)}
            </div>
            <div className="r4rule__g">
              <label className="stack stack--sm">
                <span className="hint">{t.eg}</span>
                <input
                  className="input"
                  value={p.eg.id}
                  disabled={!can}
                  onChange={(e) => setParam(i, { eg: { ...p.eg, id: e.target.value } })}
                />
              </label>
              <label className="stack stack--sm">
                <span className="hint">{t.egEn}</span>
                <input
                  className="input"
                  value={p.eg.en}
                  disabled={!can}
                  onChange={(e) => setParam(i, { eg: { ...p.eg, en: e.target.value } })}
                />
              </label>
            </div>
            {can && (
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                {p.example && (
                  <Pill tone="warn" title={t.exampleTip}>
                    {t.example}
                  </Pill>
                )}
                <span className="grow" />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={d.params.length <= 1}
                  onClick={() =>
                    patch({
                      params: d.params.filter((_, j) => j !== i),
                      questions: d.questions.filter((q) => q.p !== p.key),
                    })
                  }
                >
                  {t.removeParam}
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      {d.groups.length > 0 && (
        <section className="card stack">
          <div className="row row--between">
            <h3 className="card__title">
              {t.questions} <span className="hint num">({d.questions.length})</span>
            </h3>
            {can && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={tambahQ}
                disabled={d.questions.length >= 120}
              >
                {t.addQuestion}
              </button>
            )}
          </div>
          <div className="r4tpl__qs">
            {d.questions.map((q, i) => (
              <div key={q.id} className="r4tpl__q">
                <span className="hint num">{i + 1}</span>
                <input
                  className="input"
                  aria-label={t.qText}
                  value={q.t.id}
                  disabled={!can}
                  onChange={(e) => setQ(i, { t: { ...q.t, id: e.target.value } })}
                />
                <input
                  className="input"
                  aria-label={t.qTextEn}
                  value={q.t.en}
                  disabled={!can}
                  onChange={(e) => setQ(i, { t: { ...q.t, en: e.target.value } })}
                />
                <Dropdown
                  id={`iv-qg-${q.id}`}
                  label={t.qGroup}
                  hideLabel
                  value={q.g}
                  disabled={!can}
                  onChange={(v) => setQ(i, { g: v })}
                  options={d.groups.map((g) => ({
                    value: g.key,
                    label: lang === "id" ? g.label.id : g.label.en,
                  }))}
                />
                <Dropdown
                  id={`iv-qp-${q.id}`}
                  label={t.qParam}
                  hideLabel
                  value={q.p}
                  disabled={!can}
                  onChange={(v) => setQ(i, { p: v })}
                  options={d.params.map((p) => ({
                    value: p.key,
                    label: lang === "id" ? p.label.id : p.label.en,
                  }))}
                />
                <Dropdown
                  id={`iv-qo-${q.id}`}
                  label={t.qOnly}
                  hideLabel
                  value={q.only ?? ""}
                  disabled={!can}
                  onChange={(v) => setQ(i, { only: v === "fm" || v === "lab" ? v : null })}
                  options={[
                    { value: "", label: t.qOnlyNone },
                    { value: "fm", label: "First Meet" },
                    { value: "lab", label: "Lab" },
                  ]}
                />
                <Stepper
                  value={q.m}
                  onChange={(n) => setQ(i, { m: n })}
                  min={0}
                  max={60}
                  step={0.5}
                  label={t.qMin}
                  disabled={!can}
                  {...STEP(lang)}
                />
                {can && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => patch({ questions: d.questions.filter((_, j) => j !== i) })}
                  >
                    {t.removeQuestion}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
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
        </div>
      )}
    </div>
  );
}
