/**
 * Bank Soal, the Live Coding tab (B7.5, mockup n7-bank): the C problems. A list with a
 * search, a tier filter and a pager, and an editor for one problem: the text, the samples
 * candidates see, the hidden tests, the limits and the Reference Solution, with a preview
 * of what a candidate sees beside the form. The editor has the same previous/next stepper
 * and question list drawer as the other parts. A problem can be Ready only after the judge
 * ran its Reference Solution on every hidden test and the outputs matched ("Cek dengan
 * Reference Solution"). Once a real seat was dealt it, the judged parts are locked and only
 * the text can change.
 */
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ListBulletsIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Confirm from "../../../../ui/Confirm";
import { Stepper } from "../../../../ui/Controls";
import Dropdown from "../../../../ui/Dropdown";
import IconButton from "../../../../ui/IconButton";
import Pager, { NOUN, usePager } from "../../../../ui/Pager";
import SegmentedControl from "../../../../ui/SegmentedControl";
import TabLine from "../../../../ui/TabLine";
import type { Lang } from "../../../../../lib/kelas";
import { useBelumSimpan } from "../../../../../lib/belum-simpan";
import { usePoll } from "../../../../../lib/hooks";
import {
  C_LIMITS,
  DEFAULT_STARTER,
  validateProblem,
  type CProblemDraft,
} from "../../../../../lib/recruitment/c-problem";
import type { ExamConfigResponse } from "../../../../../lib/recruitment/bank-api";
import { isFail, recGet, recPost } from "../../../../../lib/recruitment/client";
import { TIERS, type Tier } from "../../../../../lib/recruitment/exam-types";
import type {
  ProblemCheck,
  ProblemResponse,
  ProblemSummary,
  ProblemsResponse,
} from "../../../../../lib/recruitment/problem-api";
import Pill from "../../../../ui/Pill";
import { useRevealAdded } from "../../../ui/useRevealAdded";
import BankPicker from "./BankPicker";
import CodeBox from "./CodeBox";
import LcPreview from "./LcPreview";
import { BK } from "./bankStrings";
import { PR } from "./problemStrings";
import Skeleton from "../../../../ui/Skeleton";

import "../../../recruitment-s3-lcc.css";

type EdTab = "soal" | "tests" | "key";

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

type Open = number | "new" | null;

export default function ProblemsTab({ lang, config }: { lang: Lang; config: ExamConfigResponse }) {
  const list = usePoll<ProblemsResponse | null>(fetchList, 300_000, true, ["recbank"], 300);
  const [open, setOpen] = useState<Open>(null);
  const d = list.data;
  if (open !== null && d)
    return (
      <Editor
        key={String(open)}
        lang={lang}
        id={open === "new" ? null : open}
        config={config}
        rows={d.problems}
        onOpen={setOpen}
        onBack={() => {
          setOpen(null);
          list.refresh();
        }}
      />
    );
  if (!d) return <Skeleton height={180} />;
  return <ProblemList lang={lang} problems={d.problems} onOpen={setOpen} />;
}

/* -------------------------------------------------------------------- list */

function ProblemList({
  lang,
  problems,
  onOpen,
}: {
  lang: Lang;
  problems: ProblemSummary[];
  onOpen: (o: Open) => void;
}) {
  const t = PR[lang];
  const b = BK[lang];
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<"all" | Tier>("all");
  const list = useMemo(
    () =>
      problems.filter(
        (p) =>
          (tier === "all" || p.tier === tier) &&
          (!q.trim() || p.title.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [problems, tier, q],
  );
  const pg = usePager(list, { id: "bank-livecode", size: 20, reset: [tier, q] });
  return (
    <section className="stack" style={{ gap: 12 }}>
      <div className="panel__head">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="panel__title">{t.title}</h2>
          <span className="hint">{t.lede}</span>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => onOpen("new")}>
          <PlusIcon size={18} aria-hidden="true" />
          {t.add}
        </button>
      </div>
      {problems.length === 0 ? (
        <section className="panel">
          <p className="hint" style={{ margin: 0 }}>
            {t.empty}
          </p>
        </section>
      ) : (
        <>
          <div className="row rec-tools">
            <div className="rec-search">
              <MagnifyingGlassIcon className="ic" size={18} aria-hidden="true" />
              <input
                className="field__input"
                placeholder={t.searchTitle}
                aria-label={b.searchAria}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div style={{ width: 200 }}>
              <Dropdown
                id="lc-bank-tier"
                label={t.fTier}
                hideLabel
                value={tier}
                options={[
                  { value: "all", label: t.allTiers },
                  ...TIERS.map((k) => ({ value: k, label: t.tier[k] })),
                ]}
                onChange={(v) => setTier(v as "all" | Tier)}
              />
            </div>
            <span className="grow" />
            <span className="hint num">{b.count(list.length)}</span>
          </div>
          {list.length === 0 ? (
            <p className="empty-note">{b.emptyFilter}</p>
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
                    {pg.rows.map((p) => (
                      <Row key={p.id} p={p} lang={lang} onOpen={() => onOpen(p.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <Pager pg={pg} noun={NOUN[lang].soal} lang={lang} />
        </>
      )}
    </section>
  );
}

function Row({ p, lang, onOpen }: { p: ProblemSummary; lang: Lang; onOpen: () => void }) {
  const t = PR[lang];
  const key = p.checkOk === true ? t.keyOk : p.checkOk === false ? t.keyBad : t.keyNo;
  return (
    <tr
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      style={{ cursor: "pointer" }}
    >
      <td>
        <span className="bkprob__t">
          <b>{p.title}</b>
          {p.sample && <Pill tone="violet">{t.builtin}</Pill>}
          {p.shown && (
            <LockSimpleIcon
              size={16}
              className="bkprob__lock"
              aria-label={t.lockedTitle}
              role="img"
            />
          )}
        </span>
      </td>
      <td>
        <span className="lcc-chip" data-tier={p.tier}>
          {t.tier[p.tier]}
        </span>
      </td>
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

function Editor({
  lang,
  id,
  config,
  rows,
  onOpen,
  onBack,
}: {
  lang: Lang;
  id: number | null;
  config: ExamConfigResponse;
  /** Every problem in list order: the arrows and the number step through them, the drawer picks from them */
  rows: ProblemSummary[];
  onOpen: (id: number) => void;
  onBack: () => void;
}) {
  const t = PR[lang];
  const b = BK[lang];
  const [draft, setDraft] = useState<CProblemDraft>(blank);
  const [orig, setOrig] = useState(() => JSON.stringify(blank()));
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
  const [tab, setTab] = useState<EdTab>("soal");
  const [pickOpen, setPickOpen] = useState(false);
  const [leaveDlg, setLeaveDlg] = useState(false);
  const goTo = useRef<number | null>(null);
  const sampleNew = useRevealAdded(draft.samples.length);
  const testNew = useRevealAdded(draft.tests.length);
  const loaded = useRef(false);

  const dirty = JSON.stringify(draft) !== orig;
  useBelumSimpan(dirty);

  const order = useMemo(() => rows.map((r) => r.id), [rows]);
  const at = id === null ? -1 : order.indexOf(id);
  /** Walk to another problem; with edits in this one, ask first. */
  const visit = (next: number) => {
    if (next === id) return;
    if (dirty) {
      goTo.current = next;
      setLeaveDlg(true);
    } else onOpen(next);
  };

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
      if (initial) {
        setDraft(r.problem.draft);
        setOrig(JSON.stringify(r.problem.draft));
      }
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
  const tierPts = config.config.livecode.points[draft.tier];
  const points = draft.body.points ?? tierPts;

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
    setOrig(JSON.stringify(draft));
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
    // A problem that was new has its id now: open it so the stepper and the drawer know it
    if (id === null) onOpen(saved);
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

  const ioBlock = (key: "samples" | "tests") => (
    <section
      className="panel stack"
      style={{ gap: 12 }}
      ref={(key === "samples" ? sampleNew : testNew).ref}
    >
      <div className="panel__head">
        <div className="stack" style={{ gap: 2 }}>
          <h4 className="panel__title">{key === "samples" ? t.fSamples : t.fTests}</h4>
          <span className="hint">{key === "samples" ? t.samplesHint : t.testsHint}</span>
        </div>
        <button
          type="button"
          className="btn btn--inverse btn--sm"
          disabled={lock || draft[key].length >= C_LIMITS[key].max}
          onClick={() => {
            (key === "samples" ? sampleNew : testNew).ask();
            set({ [key]: [...draft[key], { input: "", output: "" }] } as Partial<CProblemDraft>);
          }}
        >
          <PlusIcon size={16} aria-hidden="true" />
          {key === "samples" ? t.addSample : t.addTest}
        </button>
      </div>
      {draft[key].map((x, i) => (
        <div key={i} className="stack stack--sm" data-item="">
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
                className="textarea mono bkio"
                rows={2}
                spellCheck={false}
                disabled={lock}
                value={x.input}
                onChange={(e) => ioEdit(key, i, { input: e.target.value })}
              />
            </label>
            <label className="stack stack--sm" style={{ flex: 1, minWidth: 0 }}>
              <span className="hint">{t.outLabel}</span>
              <textarea
                className="textarea mono bkio"
                rows={2}
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
  );

  const verified = meta.checkOk === true;
  const keyTone = verified ? "ok" : meta.checkOk === false ? "danger" : "warn";
  const keyWord = verified ? t.keyOk : meta.checkOk === false ? t.keyBad : t.keyNo;
  const keyHint = verified ? t.keyOkHint : meta.checkOk === false ? t.keyBadHint : t.keyNoHint;
  /** The step of the four the problem is at: 1 and 2 are the writing, 3 the check, 4 Ready */
  const filled =
    draft.title.trim() !== "" &&
    draft.body.statement.trim() !== "" &&
    draft.tests.every((x) => x.output.trim() !== "");
  const step = !filled ? 1 : !draft.reference.trim() ? 2 : !verified ? 3 : 4;

  return (
    <section className="stack" style={{ gap: 16 }} data-editing="yes">
      <div className="row r3ed__head">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            goTo.current = null;
            if (dirty) setLeaveDlg(true);
            else onBack();
          }}
        >
          <ArrowLeftIcon size={16} aria-hidden="true" /> {t.back}
        </button>
        {at >= 0 && order.length > 1 && (
          <div className="r3ed__nav">
            <Stepper
              value={at + 1}
              min={1}
              max={order.length}
              label={b.navLabel}
              lessLabel={b.navPrev}
              moreLabel={b.navNext}
              fmt={(n) => `${n} / ${order.length}`}
              onChange={(n) => {
                const next = order[n - 1];
                if (next !== undefined) visit(next);
              }}
            />
            <IconButton
              icon={ListBulletsIcon}
              label={b.navList}
              onClick={() => setPickOpen(true)}
            />
          </div>
        )}
        <span className="grow" />
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {meta.id !== null && !lock && (
            <button type="button" className="btn btn--ghost" onClick={() => setAsk(true)}>
              <TrashIcon size={18} aria-hidden="true" />
              {t.delete}
            </button>
          )}
          <button
            type="button"
            className="btn btn--inverse"
            disabled={busy || !dirty}
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
            disabled={busy || !verified || dirty}
            title={verified && !dirty ? undefined : t.needCheck}
            onClick={() => void save(true)}
          >
            {t.saveReady}
          </button>
        </div>
      </div>

      <div className="lcstate" data-tone={keyTone} role="status">
        {verified ? (
          <CheckCircleIcon size={20} weight="fill" aria-hidden="true" />
        ) : (
          <WarningCircleIcon size={20} weight="fill" aria-hidden="true" />
        )}
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="lcstate__line">
            <b>{keyWord}</b>
            <span className="hint">
              {t.status[meta.status]} · v{meta.version || 1}
            </span>
          </span>
          <span className="hint">
            {keyHint} {verified && !dirty ? "" : t.readyOff}
          </span>
        </div>
        {tab !== "key" && (
          <button type="button" className="btn btn--inverse btn--sm" onClick={() => setTab("key")}>
            {t.stepsOpen}
          </button>
        )}
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

      <div className="r3bed">
        <div className="stack r3bed__form" style={{ padding: 0, gap: 16 }}>
          <TabLine
            label={t.title}
            value={tab}
            onChange={setTab}
            tabs={[
              { v: "soal" as EdTab, label: t.tabSoal },
              { v: "tests" as EdTab, label: t.tabTests },
              { v: "key" as EdTab, label: t.tabKey },
            ]}
          />

          {tab === "soal" && (
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
                  onValueChange={(v) => !lock && v && set({ tier: v as Tier })}
                  options={TIERS.map((k) => ({ value: k, label: t.tier[k] }))}
                />
              </div>
              <div className="stack stack--sm">
                <span className="label-caps">{t.fPoints}</span>
                <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <Stepper
                    value={points}
                    min={50}
                    max={4000}
                    step={50}
                    label={t.fPoints}
                    fmt={(n) => `${n} ${b.ptsUnit}`}
                    disabled={lock}
                    lessLabel="-"
                    moreLabel="+"
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        body: { ...d.body, points: v === tierPts ? undefined : v },
                      }))
                    }
                  />
                  {draft.body.points !== undefined && !lock && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() =>
                        setDraft((d) => ({ ...d, body: { ...d.body, points: undefined } }))
                      }
                    >
                      {t.pointsReset}
                    </button>
                  )}
                </div>
                <span className="hint">{t.fPointsHint(tierPts)}</span>
              </div>
              {(["statement", "input", "output"] as const).map((k) => (
                <label key={k} className="stack stack--sm">
                  <span className="label-caps">
                    {k === "statement" ? t.fStatement : k === "input" ? t.fInput : t.fOutput}
                  </span>
                  <textarea
                    className="textarea"
                    rows={k === "statement" ? 7 : 3}
                    value={draft.body[k]}
                    onChange={(e) => set({ body: { ...draft.body, [k]: e.target.value } })}
                  />
                </label>
              ))}
              <div className="stack stack--sm">
                <span className="label-caps">{t.fStarter}</span>
                <CodeBox
                  lang="c"
                  ariaLabel={t.fStarter}
                  rows={10}
                  readOnly={false}
                  value={draft.body.starter}
                  onChange={(v) => set({ body: { ...draft.body, starter: v } })}
                />
              </div>
              <div className="stack stack--sm">
                <span className="label-caps">{t.limitsHead}</span>
                <div className="row" style={{ gap: 24, flexWrap: "wrap" }}>
                  <label className="stack stack--sm">
                    <span className="hint">{t.fTime}</span>
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
                    <span className="hint">{t.fMem}</span>
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
              </div>
            </section>
          )}

          {tab === "tests" && (
            <div className="stack" style={{ gap: 16 }}>
              {ioBlock("samples")}
              {ioBlock("tests")}
            </div>
          )}

          {tab === "key" && (
            <div className="stack" style={{ gap: 16 }}>
              <section className="panel stack" style={{ gap: 10 }}>
                <b>{t.stepsHead}</b>
                <ol className="lcsteps">
                  {t.steps.map((text, i) => (
                    <li key={i} data-st={i + 1 < step ? "done" : i + 1 === step ? "now" : "next"}>
                      <span className="lcsteps__n">
                        {i + 1 < step ? <CheckCircleIcon size={18} weight="fill" /> : i + 1}
                      </span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ol>
                <span className="hint">{t.stepsNote}</span>
              </section>
              <section className="panel stack" style={{ gap: 12 }}>
                <div className="stack" style={{ gap: 2 }}>
                  <h4 className="panel__title">{t.fReference}</h4>
                  <span className="hint">{t.fReferenceHint}</span>
                </div>
                <CodeBox
                  lang="c"
                  ariaLabel={t.fReference}
                  rows={14}
                  maxRows={32}
                  readOnly={lock}
                  value={draft.reference}
                  onChange={(v) => set({ reference: v })}
                />
                <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy || lock || waiting}
                    onClick={() => void runCheck()}
                  >
                    {waiting ? t.checking : t.runCheck}
                  </button>
                  <span className="hint">{t.check}</span>
                </div>
                <CheckResult lang={lang} check={check} ok={meta.checkOk} />
              </section>
            </div>
          )}
        </div>

        <aside className="r3bed__prev">
          <div className="stack" style={{ gap: 0 }}>
            <span className="eyebrow">{b.preview}</span>
            <b>{b.previewSub}</b>
          </div>
          <LcPreview lang={lang} draft={draft} points={points} />
        </aside>
      </div>

      <BankPicker
        lang={lang}
        open={pickOpen}
        onOpenChange={setPickOpen}
        rows={rows.map((r) => ({
          id: r.id,
          title: r.title,
          meta: t.tier[r.tier],
          state: r.status,
        }))}
        current={id}
        onPick={(next) => {
          setPickOpen(false);
          visit(next);
        }}
      />
      <Confirm
        open={leaveDlg}
        onOpenChange={setLeaveDlg}
        title={b.leaveTitle}
        body={b.leaveBody}
        confirmLabel={b.leave}
        cancelLabel={b.cancel}
        lang={lang}
        onConfirm={() => {
          const next = goTo.current;
          goTo.current = null;
          if (next !== null) onOpen(next);
          else onBack();
        }}
      />
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
    <div className="stack stack--sm">
      <p className="hint" style={{ margin: 0 }} data-ok={p === total ? "yes" : "no"}>
        {p === total ? t.checkPass(p, total) : t.checkFail(p, total)}
      </p>
      {check.verdicts.length > 0 && (
        <div className="lcverdicts" role="list" aria-label={t.checkTests}>
          {check.verdicts.map((v, i) => (
            <span key={i} role="listitem" className="lcverdicts__c" data-v={v}>
              <b>{i + 1}</b> {t.verdict[v] ?? v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
