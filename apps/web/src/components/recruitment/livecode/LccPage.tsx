/**
 * Live Coding in C on /recruitment/test (B7.4, mockups r3-putar and r3-lc).
 * While the room is in the spin the seat sees the hand it was dealt; once the
 * Live Coding timer runs it gets the workbench: the problem rail, the
 * statement with its samples, the editor, Run Sample and Submit, and the
 * judge's verdict for every test. The code lives on this laptop (localStorage)
 * and goes to the judge with every Run Sample or Submit; the server keeps the
 * hand, the submissions and the score (EXAM-ENGINE 9).
 */
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopyIcon,
  PaperPlaneTiltIcon,
  PlayIcon,
  PlugsIcon,
} from "@phosphor-icons/react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "../../../lib/kelas";
import { usePoll } from "../../../lib/hooks";
import type { Verdict } from "../../../lib/recruitment/c-problem";
import { isFail, recGet, recPost } from "../../../lib/recruitment/client";
import type { LccProblem, LccSelf, LccSendReply, LccSub } from "../../../lib/recruitment/lcc-api";
import type { SeatPhase } from "../../../lib/recruitment/seat-state";
import type { TestView } from "../../../lib/recruitment/seat-types";
import { Gate, Timer, type Motion } from "../exam/parts";
import { Md } from "../exam/render/text";
import { Notice } from "../exam/Screens";
import { LCC } from "./lccStrings";

import "../recruitment-s3-lc.css";
import "../recruitment-s3-lcc.css";

const CodeEditor = lazy(() => import("./CodeEditor"));

type Fetched = { lcc: LccSelf } | { err: string };

async function fetchLcc(): Promise<Fetched> {
  const r = await recGet<LccSelf & { ok: true }>("lcc");
  if (!isFail(r)) return { lcc: r };
  if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
  return { err: r.kode };
}

const keyOf = (nim: string, id: number) => `lcc:${nim}:${id}`;
const readDraft = (nim: string, p: LccProblem) => {
  try {
    return localStorage.getItem(keyOf(nim, p.id)) ?? p.starter;
  } catch {
    return p.starter;
  }
};
const writeDraft = (nim: string, id: number, code: string) => {
  try {
    localStorage.setItem(keyOf(nim, id), code);
  } catch {
    /* a full or blocked store only costs the local copy */
  }
};

const busy = (s: LccSub | null) => !!s && (s.status === "antre" || s.status === "diambil");

export default function LccPage({
  lang,
  tv,
  phase,
  motion,
  signal,
  linkDown,
}: {
  lang: Lang;
  tv: TestView;
  phase: SeatPhase;
  motion: Motion;
  /** Counts up when the relay says something changed for this seat */
  signal: number;
  linkDown: boolean;
}) {
  const t = LCC[lang];
  const poll = usePoll<Fetched>(fetchLcc, 300_000, true, ["recroom"], 300);
  const { refresh } = poll;
  const first = useRef(signal);
  useEffect(() => {
    if (signal !== first.current) refresh();
  }, [signal, refresh]);
  const kind = phase.k;
  const lastKind = useRef(kind);
  useEffect(() => {
    if (lastKind.current === kind) return;
    lastKind.current = kind;
    refresh();
  }, [kind, refresh]);

  const lcc = poll.data && "lcc" in poll.data ? poll.data.lcc : null;
  const err = poll.data && "err" in poll.data ? poll.data.err : null;

  // While anything waits at the judge, ask again every 2.5 s; the live link is only a hint
  const inflight = !!lcc && Object.values(lcc.state).some((s) => busy(s.run) || busy(s.submit));
  useEffect(() => {
    if (!inflight) return;
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [inflight, refresh]);

  if (!lcc) {
    if (err === "soal_kurang" || err === "belum_dibuka")
      return (
        <Notice
          lang={lang}
          motion={motion}
          title={t.title}
          body={err === "soal_kurang" ? t.poolShort : t.err.belum_dibuka}
        />
      );
    return poll.errors >= 2 || err ? (
      <Notice
        lang={lang}
        motion={motion}
        title={t.loadFailTitle}
        body={t.loadFailBody}
        action={
          <button type="button" className="btn btn--primary" onClick={refresh}>
            {t.retry}
          </button>
        }
      />
    ) : (
      <Gate motion={motion} title={t.load}>
        <span className="skeleton" style={{ height: 120 }} />
      </Gate>
    );
  }

  return (
    <div className="lcc" data-m={motion}>
      {phase.k === "work" ? (
        <Workbench
          lang={lang}
          nim={tv.me.nim}
          lcc={lcc}
          left={phase.left}
          paused={phase.paused}
          linkDown={linkDown}
          refresh={refresh}
        />
      ) : (
        <Hand lang={lang} lcc={lcc} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- the hand */

function Hand({ lang, lcc }: { lang: Lang; lcc: LccSelf }) {
  const t = LCC[lang];
  return (
    <section className="lcc-hand">
      <header className="lcc-hand__head">
        <span className="eyebrow rec-eyebrow">{t.drawEyebrow}</span>
        <h1 className="lcc-hand__title">{t.drawTitle}</h1>
        <p className="hint">{t.drawLede(lcc.hand.length, lcc.minutes)}</p>
      </header>
      <ol className="lcc-hand__list">
        {lcc.hand.map((p, i) => (
          <li key={p.id} className="lcc-card lcc-hand__item">
            <span className="lcc-num">{i + 1}</span>
            <b className="lcc-hand__name">{p.title}</b>
            <span className="lcc-chip" data-tier={p.tier}>
              {t.tier[p.tier]}
            </span>
            <span className="lcc-chip lcc-chip--pts">{t.points(p.points)}</span>
          </li>
        ))}
      </ol>
      <p className="hint lcc-hand__wait" role="status">
        {t.drawWait}
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------- workbench */

function Workbench({
  lang,
  nim,
  lcc,
  left,
  paused,
  linkDown,
  refresh,
}: {
  lang: Lang;
  nim: string;
  lcc: LccSelf;
  left: number;
  paused: boolean;
  linkDown: boolean;
  refresh: () => void;
}) {
  const t = LCC[lang];
  const [at, setAt] = useState(0);
  const p = lcc.hand[Math.min(at, lcc.hand.length - 1)];
  const [codes, setCodes] = useState<Record<number, string>>(() =>
    Object.fromEntries(lcc.hand.map((h) => [h.id, readDraft(nim, h)])),
  );
  const [sending, setSending] = useState<"run" | "submit" | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const st = lcc.state[p.id];
  const code = codes[p.id] ?? p.starter;
  const showLang = lang === "en" && p.en ? p.en : p.text;

  const edit = useCallback(
    (v: string) => {
      setCodes((c) => ({ ...c, [p.id]: v }));
      writeDraft(nim, p.id, v);
    },
    [nim, p.id],
  );

  async function send(kindOf: "run" | "submit") {
    setSending(kindOf);
    setNote(null);
    const r = await recPost<LccSendReply & { ok: true }>("lcc-send", {
      problemId: p.id,
      kind: kindOf,
      code,
    });
    setSending(null);
    if (isFail(r)) return setNote({ tone: "warn", text: t.err[r.kode] ?? t.err.other });
    setNote({
      tone: "ok",
      text: r.replaced ? t.replaced : kindOf === "run" ? t.sentRun : t.sentSubmit,
    });
    refresh();
  }

  // The newer of the two results is the one shown
  const shown = useMemo(() => {
    const a = st.run;
    const b = st.submit;
    if (a && b) return a.at > b.at ? a : b;
    return a ?? b;
  }, [st.run, st.submit]);

  return (
    <div className="lcc-work">
      <header className="lcc-top">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="eyebrow rec-eyebrow">{t.eyebrow}</span>
          <h1 className="lcc-top__title">{t.title}</h1>
        </div>
        <div className="row lcc-top__chips">
          <span className="r3save" data-s="ok" role="status">
            <i className="r3save__dot" />
            {t.saved}
          </span>
          <Timer left={left} frozen={paused} lang={lang} />
          {linkDown && <span className="hint">·</span>}
        </div>
      </header>

      {!lcc.judgeReady && (
        <div className="lcc-banner" role="alert">
          <PlugsIcon size={20} aria-hidden="true" />
          <div className="stack" style={{ gap: 2 }}>
            <b>{t.judgeOffTitle}</b>
            <span className="hint">{t.judgeOff}</span>
          </div>
        </div>
      )}

      <div className="lcc-rail" role="tablist" aria-label={t.problemList}>
        {lcc.hand.map((h, i) => {
          const s = lcc.state[h.id];
          const full = !!s.best && s.best.passed === s.best.total;
          const sub = busy(s.submit)
            ? t.waiting
            : s.best
              ? t.tests(s.best.passed, s.best.total)
              : t.notSent;
          return (
            <button
              key={h.id}
              type="button"
              role="tab"
              aria-selected={i === at}
              className="lcc-tab"
              data-st={full ? "full" : s.best ? "part" : "none"}
              onClick={() => setAt(i)}
            >
              <span className="lcc-num">
                {full ? <CheckIcon size={14} weight="bold" /> : i + 1}
              </span>
              <span className="lcc-tab__t">
                <b title={h.title}>{h.title}</b>
                <span className="hint">{sub}</span>
              </span>
            </button>
          );
        })}
        <div className="lcc-score" aria-label={t.scoreSoFar}>
          <span className="hint">{t.scoreSoFar}</span>
          <b className="num">{lcc.total}</b>
          <span className="hint num">{t.outOf(lcc.cap)}</span>
        </div>
      </div>

      <div className="lcc-grid">
        <section className="lcc-card lcc-statement" aria-label={t.statement}>
          <header className="lcc-statement__head">
            <h2 className="lcc-statement__title">{p.title}</h2>
            <span className="lcc-chip" data-tier={p.tier}>
              {t.tier[p.tier]}
            </span>
            <span className="lcc-chip lcc-chip--pts">{t.points(p.points)}</span>
          </header>
          <Md src={showLang.statement} />
          <h3 className="lcc-h">{t.input}</h3>
          <Md src={showLang.input} />
          <h3 className="lcc-h">{t.output}</h3>
          <Md src={showLang.output} />
          <h3 className="lcc-h">{t.samples}</h3>
          <div className="lcc-samples">
            {p.samples.map((s, i) => (
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
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setAsking(true)}
            >
              <ArrowCounterClockwiseIcon size={18} aria-hidden="true" />
              {t.reset}
            </button>
          </header>
          {asking && (
            <div className="lcc-ask" role="alertdialog" aria-label={t.reset}>
              <span>{t.resetAsk}</span>
              <span className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn--sm btn--inverse"
                  onClick={() => setAsking(false)}
                >
                  {t.resetNo}
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  onClick={() => {
                    edit(p.starter);
                    setAsking(false);
                  }}
                >
                  {t.resetYes}
                </button>
              </span>
            </div>
          )}
          <div className="lcc-code__box">
            <Suspense fallback={<span className="skeleton" style={{ height: 200 }} />}>
              <CodeEditor
                key={p.id}
                value={code}
                onChange={edit}
                ariaLabel={`${t.file}: ${p.title}`}
                still={false}
              />
            </Suspense>
          </div>
          <div className="lcc-actions">
            <button
              type="button"
              className="btn btn--inverse"
              disabled={sending !== null}
              onClick={() => void send("run")}
            >
              <PlayIcon size={18} aria-hidden="true" />
              {t.run}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={sending !== null}
              onClick={() => void send("submit")}
            >
              <PaperPlaneTiltIcon size={18} aria-hidden="true" />
              {t.submit}
            </button>
            <span className="hint lcc-actions__hint">{note ? note.text : t.runHint}</span>
          </div>
          <Result lang={lang} sub={shown} p={p} best={st.best} position={st.position} />
        </section>
      </div>
      <p className="hint lcc-foot">{t.lineHint}</p>
    </div>
  );
}

function Block({
  label,
  text,
  copy,
  done,
}: {
  label: string;
  text: string;
  copy: string;
  done: string;
}) {
  const [ok, setOk] = useState(false);
  return (
    <div className="lcc-block">
      <span className="hint">{label}</span>
      <div className="lcc-block__row">
        <pre className="lcc-pre">{text}</pre>
        <button
          type="button"
          className="iconbtn iconbtn--sm"
          aria-label={ok ? done : copy}
          title={ok ? done : copy}
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(
              () => {
                setOk(true);
                setTimeout(() => setOk(false), 1200);
              },
              () => undefined,
            );
          }}
        >
          {ok ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- result */

function Result({
  lang,
  sub,
  p,
  best,
  position,
}: {
  lang: Lang;
  sub: LccSub | null;
  p: LccProblem;
  best: { passed: number; total: number; got: number } | null;
  position: number | null;
}) {
  const t = LCC[lang];
  if (!sub) {
    return (
      <div className="lcc-result" data-tone="idle">
        <b>{t.resultTitle}</b>
        <span className="hint">{t.noResult}</span>
      </div>
    );
  }
  const title = sub.kind === "run" ? t.runResult : t.submitResult;
  const waiting = sub.status === "antre";
  const running = sub.status === "diambil";
  const failed = sub.status === "gagal";
  const ce = sub.status === "selesai" && sub.compileLog !== null;
  const all = sub.status === "selesai" && !ce && sub.passed !== null && sub.passed === sub.total;
  const tone = failed || ce ? "bad" : all ? "ok" : waiting || running ? "wait" : "part";
  return (
    <div className="lcc-result" data-tone={tone} role="status">
      <div className="lcc-result__head">
        <b>{title}</b>
        <span className="hint">
          {waiting
            ? t.queued(position)
            : running
              ? t.judging
              : failed
                ? t.failedTitle
                : ce
                  ? t.compileError
                  : all
                    ? t.allPassed
                    : t.somePassed(sub.passed ?? 0, sub.total ?? 0)}
        </span>
      </div>
      {failed && <span className="hint">{t.failedLede}</span>}
      {ce && (
        <>
          <span className="hint">{t.compileErrorLede}</span>
          <pre className="lcc-log">{sub.compileLog}</pre>
        </>
      )}
      {sub.verdicts.length > 0 && (
        <ul className="lcc-dots" aria-label={title}>
          {sub.verdicts.map((v: Verdict, i) => (
            <li
              key={i}
              className="lcc-dot"
              data-v={v === "ac" ? "ok" : "bad"}
              title={`${t.testN(i + 1)}: ${t.verdict[v]}`}
            >
              <span className="lcc-dot__i" aria-hidden="true" />
              <span className="lcc-dot__t">
                {t.testN(i + 1)} · {t.verdict[v]}
              </span>
            </li>
          ))}
        </ul>
      )}
      {best && sub.kind === "submit" && <span className="hint">{t.best(best.got, p.points)}</span>}
    </div>
  );
}
