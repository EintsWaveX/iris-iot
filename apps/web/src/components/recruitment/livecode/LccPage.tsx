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
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  PaperPlaneTiltIcon,
  PlayIcon,
  PlugsIcon,
  QuestionIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Lang } from "../../../lib/kelas";
import { usePoll } from "../../../lib/hooks";
import type { Verdict } from "../../../lib/recruitment/c-problem";
import { isFail, recGet, recPost } from "../../../lib/recruitment/client";
import type { LccProblem, LccSelf, LccSendReply, LccSub } from "../../../lib/recruitment/lcc-api";
import type { SeatPhase } from "../../../lib/recruitment/seat-state";
import type { TestView } from "../../../lib/recruitment/seat-types";
import Dialog from "../../ui/Dialog";
import { Gate, Timer, type Motion } from "../exam/parts";
import { TS } from "../exam/testStrings";
import type { PlanPart } from "../../../lib/recruitment/seat-types";
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

  const working = phase.k === "work";
  return (
    <>
      <LccTop
        lang={lang}
        plan={tv.plan}
        left={working ? phase.left : lcc.minutes * 60_000}
        frozen={!working || phase.paused}
        label={working ? undefined : t.drawTime}
        linkDown={linkDown}
      />
      <div className="lcc" data-m={motion}>
        {working ? (
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
          <Hand lang={lang} lcc={lcc} motion={motion} />
        )}
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- the top bar */

/** The same bar as the written parts (r3top): logo, part, save chip, timer and the evening rail. */
function LccTop({
  lang,
  plan,
  left,
  frozen,
  label,
  linkDown,
}: {
  lang: Lang;
  plan: PlanPart[];
  left: number;
  frozen: boolean;
  label?: string;
  linkDown: boolean;
}) {
  const t = LCC[lang];
  const ts = TS[lang];
  const pc = Math.max(
    0,
    plan.findIndex((p) => p.key === "livecode"),
  );
  return (
    <header className="r3top" data-chips={linkDown ? "2" : "1"}>
      <div className="r3top__id">
        <img
          className="r3top__logo"
          src="/brand/iris-logo-mark.png"
          alt="IRIS"
          width="62"
          height="28"
        />
        <div className="stack" style={{ gap: 0, minWidth: 0 }}>
          <span className="eyebrow rec-eyebrow">{t.eyebrow}</span>
          <b className="r3top__part">
            <span className="r3top__long">{ts.part.livecode.l}</span>
            <span className="r3top__short">{ts.part.livecode.s}</span>{" "}
            <span className="hint">· {t.partOf(pc + 1, plan.length)}</span>
          </b>
        </div>
      </div>
      <div className="r3top__right">
        {!frozen || label === undefined ? (
          <span className="r3save" data-s="ok" role="status">
            <i className="r3save__dot" />
            {t.saved}
          </span>
        ) : null}
        <Timer left={left} frozen={frozen} lang={lang} big label={label} />
      </div>
      <ol className="n7t-rail" aria-label={ts.lobby.tonight}>
        {plan.map((p, i) => (
          <li
            key={p.key}
            style={{ flexGrow: p.minutes }}
            data-st={i < pc ? "done" : i === pc ? "now" : "next"}
            title={ts.part[p.key].l}
          />
        ))}
      </ol>
    </header>
  );
}

/* ----------------------------------------------------------------- the hand */

function Hand({ lang, lcc, motion }: { lang: Lang; lcc: LccSelf; motion: Motion }) {
  const t = LCC[lang];
  const key = `iris-lcc-up-${lcc.hand.map((p) => p.id).join("-")}`;
  const n = lcc.hand.length;
  const [up, setUp] = useState(0);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // A reload keeps the cards open: the draw itself is the server's and never changes.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(key)) setUp(n);
    } catch {
      /* private window */
    }
    const ts = timers.current;
    return () => ts.forEach(clearTimeout);
  }, [key, n]);
  const all = up >= n;
  const go = () => {
    if (busy || all) return;
    setBusy(true);
    const gap = motion === "reduce" ? 0 : motion === "ldm" ? 200 : 380;
    lcc.hand.forEach((_, i) =>
      timers.current.push(
        setTimeout(
          () => {
            setUp(i + 1);
            if (i === n - 1) {
              setBusy(false);
              try {
                sessionStorage.setItem(key, "1");
              } catch {
                /* private window */
              }
            }
          },
          250 + i * gap,
        ),
      ),
    );
  };
  return (
    <section className="lcc-draw">
      <div className="stack lcc-draw__head" style={{ gap: 8 }}>
        <ol className="r3steps lc-steps" aria-label={t.drawEyebrow}>
          {t.drawSteps.map((s, i) => (
            <li
              key={s}
              data-st={i < step ? "done" : i === step ? "now" : "next"}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="r3steps__n num">
                {i < step ? <CheckIcon weight="bold" /> : i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <h1 className="lcc-hand__title lcc-draw__title" key={step}>
          {step === 0 ? t.drawHead(n) : t.drawHeadAfter}
        </h1>
        <p className="lede">{step === 0 ? t.drawLedeNew(n) : t.drawLedeAfter}</p>
      </div>
      {step === 0 ? (
        <>
          <div className="lc-hand" role="list" aria-label={t.drawEyebrow} data-m={motion}>
            {lcc.hand.map((p, i) => (
              <div
                key={p.id}
                className="lc-card"
                data-up={i < up ? "yes" : "no"}
                data-tier={p.tier}
                style={{ "--i": i } as CSSProperties}
                role="listitem"
                aria-label={i < up ? p.title : t.drawCardClosed}
              >
                <div className="lc-card__in">
                  <div className="lc-card__back" aria-hidden="true">
                    <i className="lc-card__ring" />
                    <QuestionIcon size={36} />
                  </div>
                  <div className="lc-card__front">
                    <span className="lcc-num">{i + 1}</span>
                    <span className="lcc-chip" data-tier={p.tier}>
                      {t.tier[p.tier]}
                    </span>
                    <b>{p.title}</b>
                    <span className="hint">
                      {t.points(p.points)} · {t.testsN(p.tests)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="lc-hand__go">
            <button
              type="button"
              className={"btn btn--lg " + (all ? "btn--inverse" : "btn--primary")}
              disabled={busy || all}
              onClick={go}
            >
              {busy ? t.drawOpening : all ? t.drawDone : t.drawGo}
            </button>
          </div>
        </>
      ) : (
        <div className="lc-after">
          <ol className="lcc-card lc-tasks">
            {lcc.hand.map((p, i) => (
              <li key={p.id}>
                <span className="lcc-num">{i + 1}</span>
                <b>{p.title}</b>
                <span className="lcc-chip" data-tier={p.tier}>
                  {t.tier[p.tier]}
                </span>
                <b className="num lc-tasks__pts">{p.points}</b>
              </li>
            ))}
          </ol>
          <div className="rec-note">
            <b>{t.scoreTitle}</b>
            <span>{t.scoreBody}</span>
          </div>
          <div className="r3wait">
            <i className="r3wait__dot" aria-hidden="true" />
            <b>{t.drawWaitEditor}</b>
          </div>
        </div>
      )}
      <div className="lcc-draw__bar">
        {step > 0 ? (
          <button type="button" className="btn btn--ghost" onClick={() => setStep(0)}>
            <ArrowLeftIcon aria-hidden="true" />
            <span className="btn__label">{t.drawBack}</span>
          </button>
        ) : (
          <span className="hint">{all ? t.drawIn : t.drawNoTime}</span>
        )}
        <span style={{ flex: 1 }} />
        {step === 0 && (
          <button
            type="button"
            className="btn btn--primary"
            disabled={!all}
            onClick={() => setStep(1)}
          >
            <span className="btn__label">{t.drawSee}</span>
            <ArrowRightIcon aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- workbench */

function Workbench({
  lang,
  nim,
  lcc,
  left,
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
  // Selesai, and the bonus round offered once before it (4 Nov 2026)
  const [fin, setFin] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [finBusy, setFinBusy] = useState(false);
  const jumpToBonus = useRef(false);
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

  const canOffer =
    lcc.bonus.minLeftMs > 0 &&
    !lcc.bonus.taken &&
    lcc.bonus.count > 0 &&
    left >= lcc.bonus.minLeftMs &&
    !declined;

  // Right after the bonus round was taken, open its first problem
  useEffect(() => {
    if (!jumpToBonus.current) return;
    const i = lcc.hand.findIndex((h) => h.bonus);
    if (i < 0) return;
    jumpToBonus.current = false;
    setAt(i);
  }, [lcc.hand]);

  async function takeBonus() {
    setFinBusy(true);
    const r = await recPost<{ ok: true; count: number }>("lcc-bonus", {});
    setFinBusy(false);
    if (isFail(r)) {
      setNote({
        tone: "warn",
        text: (r.kode as string) === "bonus_telat" ? t.bonus.late : t.bonus.fail,
      });
      setDeclined(true);
      return;
    }
    jumpToBonus.current = true;
    setFin(false);
    setNote({ tone: "ok", text: t.bonus.added(r.count) });
    refresh();
  }

  async function finish() {
    setFinBusy(true);
    const r = await recPost<{ ok: true }>("lcc-done", {});
    setFinBusy(false);
    if (isFail(r)) return setNote({ tone: "warn", text: t.finishFail });
    setFin(false);
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
              data-b={h.bonus ? "yes" : undefined}
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
          <button type="button" className="btn btn--inverse btn--sm" onClick={() => setFin(true)}>
            {t.finish}
          </button>
        </div>
      </div>

      <Dialog
        open={fin && canOffer}
        onOpenChange={setFin}
        title={t.bonus.title}
        description={t.bonus.desc(lcc.bonus.count, Math.round(lcc.bonus.minLeftMs / 60_000))}
        size="sm"
        lang={lang}
        actions={
          <>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={finBusy}
              onClick={() => setDeclined(true)}
            >
              {t.bonus.no}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={finBusy}
              onClick={() => void takeBonus()}
            >
              {finBusy ? t.bonus.taking : t.bonus.yes}
            </button>
          </>
        }
      >
        <div className="r3bonus__offer" aria-hidden="true">
          <span className="r3bonus__star">
            <SparkleIcon size={28} weight="fill" />
          </span>
          <b className="r3bonus__badge">{t.bonus.badge}</b>
          <span className="r3bonus__n num">+{lcc.bonus.count}</span>
        </div>
      </Dialog>
      <Dialog
        open={fin && !canOffer}
        onOpenChange={setFin}
        title={t.finishTitle}
        description={t.finishDesc}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setFin(false)}>
              {t.finishKeep}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={finBusy}
              onClick={() => void finish()}
            >
              {t.finishGo}
            </button>
          </>
        }
      />

      <div className="lcc-grid">
        <section className="lcc-card lcc-statement" aria-label={t.statement}>
          <header className="lcc-statement__head">
            <h2 className="lcc-statement__title">{p.title}</h2>
            <span className="lcc-chip" data-tier={p.tier}>
              {t.tier[p.tier]}
            </span>
            <span className="lcc-chip lcc-chip--pts">{t.points(p.points)}</span>
            {p.bonus && (
              <span className="lcc-chip lcc-chip--bonus">
                <SparkleIcon size={14} weight="fill" aria-hidden="true" /> {t.bonus.badge}
              </span>
            )}
          </header>
          {p.bonus && <p className="lcc-bonusbar">{t.bonus.bar}</p>}
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

export function Block({
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
