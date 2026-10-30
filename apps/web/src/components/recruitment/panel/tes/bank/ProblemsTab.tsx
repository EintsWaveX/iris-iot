/**
 * Bank Soal, the Live Coding tab (B7.5, mockup n7-bank): the C problems. A list, and
 * an editor for one problem: the text, the samples candidates see, the hidden tests,
 * the limits and the Reference Solution. A problem can be Ready only after the judge
 * ran its Reference Solution on every hidden test and the outputs matched
 * ("Cek dengan Reference Solution"). Once a real seat was dealt it, the judged parts
 * are locked and only the text can change.
 */
import { LockSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Stepper } from "../../../../ui/Controls";
import SegmentedControl from "../../../../ui/SegmentedControl";
import type { Lang } from "../../../../../lib/kelas";
import { usePoll } from "../../../../../lib/hooks";
import {
  C_LIMITS,
  DEFAULT_STARTER,
  validateProblem,
  type CProblemDraft,
} from "../../../../../lib/recruitment/c-problem";
import { isFail, recGet, recPost } from "../../../../../lib/recruitment/client";
import type {
  ProblemCheck,
  ProblemResponse,
  ProblemSummary,
  ProblemsResponse,
} from "../../../../../lib/recruitment/problem-api";
import { PR } from "./problemStrings";

import "../../../recruitment-s3-lcc.css";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);

const blank = (): CProblemDraft => ({
  title: "",
  tier: "easy",
  body: { statement: "", input: "", output: "", starter: DEFAULT_STARTER },
  limits: { timeMs: C_LIMITS.timeMs.def, memKb: C_LIMITS.memKb.def },
  samples: [{ input: "", output: "" }],
  tests: [
    { input: "", output: "" },
    { input: "", output: "" },
    { input: "", output: "" },
  ],
  reference: "",
});

async function fetchList(): Promise<ProblemsResponse | null> {
  const r = await recGet<ProblemsResponse>("problems");
  if (isFail(r)) throw new Error(String(r.status || 408));
  return r;
}

export default function ProblemsTab({ lang }: { lang: Lang }) {
  const t = PR[lang];
  const list = usePoll<ProblemsResponse | null>(fetchList, 300_000, true, ["recbank"], 300);
  const [open, setOpen] = useState<number | "new" | null>(null);
  const d = list.data;
  if (open !== null)
    return (
      <Editor
        key={String(open)}
        lang={lang}
        id={open === "new" ? null : open}
        onBack={() => {
          setOpen(null);
          list.refresh();
        }}
      />
    );
  if (!d) return <span className="skeleton" style={{ height: 180 }} />;
  return (
    <section className="stack" style={{ gap: 12 }}>
      <div className="panel__head">
        <div className="stack" style={{ gap: 2 }}>
          <h3 className="panel__title">{t.title}</h3>
          <span className="hint">{t.lede}</span>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setOpen("new")}>
          <PlusIcon size={18} aria-hidden="true" />
          {t.add}
        </button>
      </div>
      {d.problems.length === 0 ? (
        <section className="panel">
          <p className="hint" style={{ margin: 0 }}>
            {t.empty}
          </p>
        </section>
      ) : (
        <section className="panel rec-tablecard">
          <div className="scrollx">
            <table className="rec-table">
              <thead>
                <tr>
                  <th>{t.colTitle}</th>
                  <th>{t.colTier}</th>
                  <th className="num">{t.colTests}</th>
                  <th>{t.colStatus}</th>
                  <th>{t.colKey}</th>
                </tr>
              </thead>
              <tbody>
                {d.problems.map((p) => (
                  <Row key={p.id} p={p} lang={lang} onOpen={() => setOpen(p.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}

function Row({ p, lang, onOpen }: { p: ProblemSummary; lang: Lang; onOpen: () => void }) {
  const t = PR[lang];
  const key = p.checkOk === true ? t.keyOk : p.checkOk === false ? t.keyBad : t.keyNo;
  return (
    <tr onClick={onOpen} style={{ cursor: "pointer" }}>
      <td>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onOpen}>
          <b>{p.title}</b>
        </button>{" "}
        {p.sample && <span className="pill">{t.builtin}</span>}{" "}
        {p.shown && <LockSimpleIcon size={14} aria-label={t.lockedTitle} />}
      </td>
      <td>{t.tier[p.tier]}</td>
      <td className="num">{p.tests}</td>
      <td>
        <span className="pill" data-tone={p.status === "ready" ? "ok" : undefined}>
          {t.status[p.status]}
        </span>
      </td>
      <td>
        <span
          className="pill"
          data-tone={p.checkOk === true ? "ok" : p.checkOk === false ? "danger" : "warn"}
        >
          {key}
        </span>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ editor */

function Editor({ lang, id, onBack }: { lang: Lang; id: number | null; onBack: () => void }) {
  const t = PR[lang];
  const [draft, setDraft] = useState<CProblemDraft>(blank);
  const [meta, setMeta] = useState<{
    id: number | null;
    version: number;
    shown: boolean;
    checkOk: boolean | null;
    status: "draft" | "ready";
  }>({
    id,
    version: 0,
    shown: false,
    checkOk: null,
    status: "draft",
  });
  const [check, setCheck] = useState<ProblemCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [ask, setAsk] = useState(false);
  const loaded = useRef(false);

  const apply = useCallback((r: ProblemResponse) => {
    setMeta({
      id: r.problem.id,
      version: r.problem.version,
      shown: r.problem.shown,
      checkOk: r.problem.checkOk,
      status: r.problem.status,
    });
    setCheck(r.check);
  }, []);

  const load = useCallback(
    async (initial: boolean) => {
      if (id === null) return;
      const r = await recGet<ProblemResponse>("problem", { id: String(id) });
      if (isFail(r)) return void toast(t.err[r.kode] ?? t.err.other, "danger");
      if (initial) setDraft(r.problem.draft);
      apply(r);
    },
    [id, apply, t],
  );
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load(true);
  }, [load]);

  // While the judge has the check, ask again every 2.5 s
  const waiting = check?.status === "antre" || check?.status === "diambil";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void load(false), 2500);
    return () => clearInterval(timer);
  }, [waiting, load]);

  const set = (patch: Partial<CProblemDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const lock = meta.shown;

  function explain(errs: { field: string; kode: string }[]) {
    setProblems(errs.map((e) => `${e.field}: ${t.field[e.kode] ?? e.kode}`));
  }

  async function save(ready: boolean): Promise<number | null> {
    const errs = validateProblem(draft);
    if (errs.length) {
      explain(errs);
      toast(t.err.format_salah, "danger");
      return null;
    }
    setProblems([]);
    setBusy(true);
    const r = await recPost<ProblemResponse>("problem-save", {
      id: meta.id,
      version: meta.version,
      draft,
      status: ready ? "ready" : "draft",
    });
    setBusy(false);
    if (isFail(r)) {
      const e = (r as { errors?: { field: string; kode: string }[] }).errors;
      if (e) explain(e);
      toast(t.err[r.kode] ?? t.err.other, "danger");
      return null;
    }
    apply({ ...r, check });
    toast(t.saved);
    return r.problem.id;
  }

  async function runCheck() {
    const saved = await save(false);
    if (saved === null) return;
    setBusy(true);
    const r = await recPost<{ ok: true; check: number }>("problem-check", { id: saved });
    setBusy(false);
    if (isFail(r)) return void toast(t.err[r.kode] ?? t.err.other, "danger");
    toast(t.queued);
    setCheck({
      id: r.check,
      status: "antre",
      passed: null,
      total: null,
      verdicts: [],
      compileLog: null,
      kode: null,
    });
  }

  async function remove() {
    if (meta.id === null) return onBack();
    const r = await recPost<{ ok: true }>("problem-delete", { id: meta.id });
    if (isFail(r)) return void toast(t.err[r.kode] ?? t.err.other, "danger");
    toast(t.deleted);
    onBack();
  }

  const ioEdit = (
    key: "samples" | "tests",
    i: number,
    patch: Partial<{ input: string; output: string }>,
  ) =>
    set({
      [key]: draft[key].map((x, j) => (j === i ? { ...x, ...patch } : x)),
    } as Partial<CProblemDraft>);

  return (
    <section className="stack" style={{ gap: 16 }}>
      <div className="panel__head">
        <div className="stack" style={{ gap: 2 }}>
          <h3 className="panel__title">{draft.title.trim() || t.newTitle}</h3>
          <span className="hint">
            {t.status[meta.status]} · v{meta.version || 1}
          </span>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          {t.back}
        </button>
      </div>

      {lock && (
        <div className="rec-note">
          <b>{t.lockedTitle}</b>
          <span>{t.lockedBody}</span>
        </div>
      )}
      {problems.length > 0 && (
        <div className="rec-note rec-note--warn" role="alert">
          <b>{t.problemsHead}</b>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="panel stack" style={{ gap: 12 }}>
        <label className="stack stack--sm">
          <span className="label-caps">{t.fTitle}</span>
          <input
            className="input"
            value={draft.title}
            maxLength={C_LIMITS.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <div className="stack stack--sm">
          <span className="label-caps">{t.fTier}</span>
          <SegmentedControl
            aria-label={t.fTier}
            value={draft.tier}
            onValueChange={(v) => !lock && v && set({ tier: v as "easy" | "medium" })}
            options={[
              { value: "easy", label: t.tier.easy },
              { value: "medium", label: t.tier.medium },
            ]}
          />
        </div>
        {(["statement", "input", "output"] as const).map((k) => (
          <label key={k} className="stack stack--sm">
            <span className="label-caps">
              {k === "statement" ? t.fStatement : k === "input" ? t.fInput : t.fOutput}
            </span>
            <textarea
              className="textarea"
              rows={k === "statement" ? 4 : 2}
              value={draft.body[k]}
              onChange={(e) => set({ body: { ...draft.body, [k]: e.target.value } })}
            />
          </label>
        ))}
        <label className="stack stack--sm">
          <span className="label-caps">{t.fStarter}</span>
          <textarea
            className="textarea mono"
            rows={6}
            spellCheck={false}
            value={draft.body.starter}
            onChange={(e) => set({ body: { ...draft.body, starter: e.target.value } })}
          />
        </label>
      </section>

      <section className="panel stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 24, flexWrap: "wrap" }}>
          <label className="stack stack--sm">
            <span className="label-caps">{t.fTime}</span>
            <Stepper
              value={draft.limits.timeMs}
              min={C_LIMITS.timeMs.min}
              max={C_LIMITS.timeMs.max}
              step={100}
              label={t.fTime}
              fmt={t.ms}
              disabled={lock}
              lessLabel="-"
              moreLabel="+"
              onChange={(v) => set({ limits: { ...draft.limits, timeMs: v } })}
            />
          </label>
          <label className="stack stack--sm">
            <span className="label-caps">{t.fMem}</span>
            <Stepper
              value={draft.limits.memKb}
              min={C_LIMITS.memKb.min}
              max={C_LIMITS.memKb.max}
              step={16_384}
              label={t.fMem}
              fmt={t.mb}
              disabled={lock}
              lessLabel="-"
              moreLabel="+"
              onChange={(v) => set({ limits: { ...draft.limits, memKb: v } })}
            />
          </label>
        </div>
      </section>

      {(["samples", "tests"] as const).map((key) => (
        <section key={key} className="panel stack" style={{ gap: 12 }}>
          <div className="panel__head">
            <h4 className="panel__title">{key === "samples" ? t.fSamples : t.fTests}</h4>
            <button
              type="button"
              className="btn btn--inverse btn--sm"
              disabled={lock || draft[key].length >= C_LIMITS[key].max}
              onClick={() =>
                set({ [key]: [...draft[key], { input: "", output: "" }] } as Partial<CProblemDraft>)
              }
            >
              <PlusIcon size={16} aria-hidden="true" />
              {key === "samples" ? t.addSample : t.addTest}
            </button>
          </div>
          {draft[key].map((x, i) => (
            <div key={i} className="stack stack--sm">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>{key === "samples" ? t.sampleN(i + 1) : t.testN(i + 1)}</b>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={lock || draft[key].length <= C_LIMITS[key].min}
                  onClick={() =>
                    set({ [key]: draft[key].filter((_, j) => j !== i) } as Partial<CProblemDraft>)
                  }
                >
                  <TrashIcon size={16} aria-hidden="true" />
                  {t.remove}
                </button>
              </div>
              <div className="row" style={{ gap: 12, alignItems: "stretch" }}>
                <label className="stack stack--sm" style={{ flex: 1, minWidth: 0 }}>
                  <span className="hint">{t.inLabel}</span>
                  <textarea
                    className="textarea mono"
                    rows={3}
                    spellCheck={false}
                    disabled={lock}
                    value={x.input}
                    onChange={(e) => ioEdit(key, i, { input: e.target.value })}
                  />
                </label>
                <label className="stack stack--sm" style={{ flex: 1, minWidth: 0 }}>
                  <span className="hint">{t.outLabel}</span>
                  <textarea
                    className="textarea mono"
                    rows={3}
                    spellCheck={false}
                    disabled={lock}
                    value={x.output}
                    onChange={(e) => ioEdit(key, i, { output: e.target.value })}
                  />
                </label>
              </div>
            </div>
          ))}
        </section>
      ))}

      <section className="panel stack" style={{ gap: 12 }}>
        <div className="stack" style={{ gap: 2 }}>
          <h4 className="panel__title">{t.fReference}</h4>
          <span className="hint">{t.fReferenceHint}</span>
        </div>
        <textarea
          className="textarea mono"
          rows={12}
          spellCheck={false}
          disabled={lock}
          aria-label={t.fReference}
          value={draft.reference}
          onChange={(e) => set({ reference: e.target.value })}
        />
        <CheckResult lang={lang} check={check} ok={meta.checkOk} />
      </section>

      <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn--inverse"
            disabled={busy}
            onClick={() => void save(false)}
          >
            {t.saveDraft}
          </button>
          <button
            type="button"
            className="btn btn--inverse"
            disabled={busy || lock}
            onClick={() => void runCheck()}
          >
            {t.check}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || meta.checkOk !== true}
            title={meta.checkOk === true ? undefined : t.needCheck}
            onClick={() => void save(true)}
          >
            {t.saveReady}
          </button>
        </div>
        {meta.id !== null && !lock && (
          <button type="button" className="btn btn--ghost" onClick={() => setAsk(true)}>
            <TrashIcon size={18} aria-hidden="true" />
            {t.delete}
          </button>
        )}
      </div>
      {ask && (
        <div className="rec-note rec-note--warn" role="alertdialog" aria-label={t.delete}>
          <b>{t.deleteAsk}</b>
          <span className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn--sm btn--inverse"
              onClick={() => setAsk(false)}
            >
              {t.deleteNo}
            </button>
            <button type="button" className="btn btn--sm btn--danger" onClick={() => void remove()}>
              {t.deleteYes}
            </button>
          </span>
        </div>
      )}
    </section>
  );
}

function CheckResult({
  lang,
  check,
  ok,
}: {
  lang: Lang;
  check: ProblemCheck | null;
  ok: boolean | null;
}) {
  const t = PR[lang];
  if (!check)
    return ok === true ? (
      <p className="hint" style={{ margin: 0 }}>
        {t.keyOk}
      </p>
    ) : null;
  if (check.status === "antre")
    return (
      <p className="hint" style={{ margin: 0 }}>
        {t.checkQueued}
      </p>
    );
  if (check.status === "diambil")
    return (
      <p className="hint" style={{ margin: 0 }}>
        {t.checking}
      </p>
    );
  if (check.status === "gagal")
    return (
      <p className="hint" style={{ margin: 0 }}>
        {t.checkAgent}
      </p>
    );
  if (check.compileLog !== null)
    return (
      <div className="stack stack--sm">
        <span className="hint">{t.checkCompile}</span>
        <pre className="lcc-log">{check.compileLog}</pre>
      </div>
    );
  const p = check.passed ?? 0;
  const total = check.total ?? 0;
  return (
    <p className="hint" style={{ margin: 0 }} data-ok={p === total ? "yes" : "no"}>
      {p === total ? t.checkPass(p, total) : t.checkFail(p, total)}
    </p>
  );
}
