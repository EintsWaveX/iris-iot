/**
 * One part, as the candidate works it (prompt 10, mockup r3-soal,
 * EXAM-ENGINE 3, 5.2, 5.5, 5.6): a top bar with the part, the save state, the
 * references and the timer; the navigator (a rail from 820 px, a strip on a
 * phone); one question at a time; Kumpulkan with what is left. Answers go to
 * the API on every change through the AnswerSaver, which keeps what the
 * server has not taken in localStorage. Time is the server's: the caller
 * hands in `left`, counted from jamServer(), and this file arms one timer for
 * the seat's own end so the last autosave leaves at that instant.
 *
 * The overlays (Dijeda, the full screen cover, Waktu habis) sit over the
 * blurred, inert test; blur applies instantly.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeftIcon, BookOpenIcon } from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import type { PartKey, Phase1Part, Value } from "../../../lib/recruitment/exam-types";
import type { Lang } from "../../../lib/kelas";
import { pada, jamServer } from "../../../lib/jam";
import { AnswerSaver, isAnswered, type SaveState } from "../../../lib/recruitment/seat-answers";
import type { PartView, TestView } from "../../../lib/recruitment/seat-types";
import { QuestionCard } from "./render";
import RefDrawer from "./RefDrawer";
import { BigIcon, LiveChip, PartsMini, SaveChip, Timer, type Motion } from "./parts";
import { TAB, sendAnswer, submitPart, toast } from "./seatApi";
import { TS } from "./testStrings";

const flagKey = (seat: number, part: string) => `iris-rec-flag:${seat}:${part}`;

function loadFlags(seat: number, part: string): Set<number> {
  try {
    const raw = localStorage.getItem(flagKey(seat, part));
    return new Set(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

export default function Runner({
  lang,
  tv,
  part,
  left,
  paused,
  timeUp,
  cover,
  twoTabs,
  linkDown,
  motion,
  reportProgress,
  onTwoTabs,
  onRefresh,
  onEnterFullscreen,
}: {
  lang: Lang;
  tv: TestView;
  part: PartView;
  left: number;
  paused: boolean;
  /** The seat's own time just ran out: the card shows over the blurred test */
  timeUp: boolean;
  /** The full screen cover is up */
  cover: boolean;
  twoTabs: boolean;
  linkDown: boolean;
  motion: Motion;
  reportProgress: (p: { part: PartKey; answered: number; total: number }) => void;
  onTwoTabs: () => void;
  onRefresh: () => void;
  onEnterFullscreen: () => void;
}) {
  const t = TS[lang];
  const seat = tv.seat!;
  const key: Phase1Part = part.key;
  const items = part.items;
  const [cur, setCur] = useState(0);
  const [vals, setVals] = useState<Record<number, Value>>(() => {
    const v: Record<number, Value> = {};
    for (const [q, a] of Object.entries(part.answers)) v[Number(q)] = a.value;
    return v;
  });
  const [flags, setFlags] = useState(() => loadFlags(seat.id, key));
  const [save, setSave] = useState<SaveState>("ok");
  const [refOpen, setRefOpen] = useState(false);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  // The part's entrance plays once, when it starts; moving between questions has its own slide.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setEntering(false), 900);
    return () => clearTimeout(id);
  }, []);
  const card = useRef<HTMLDivElement | null>(null);

  // One saver for this part of this seat; revs start from what the server holds.
  const saver = useMemo(() => {
    const revs: Record<number, number> = {};
    for (const [q, a] of Object.entries(part.answers)) revs[Number(q)] = a.rev;
    return new AnswerSaver({
      seat: seat.id,
      part: key,
      tab: TAB,
      send: sendAnswer,
      storage: typeof localStorage === "undefined" ? null : localStorage,
      revs,
      onState: setSave,
      onWarn: onTwoTabs,
    });
    // The saver belongs to the part; a refetch of the same part keeps it.
  }, [seat.id, key]);
  useEffect(() => {
    saver.resume();
    const flush = () => {
      if (document.visibilityState === "hidden") void saver.flush();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush as never);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush as never);
      saver.dispose();
    };
  }, [saver]);

  // The seat's own end: the last autosave leaves at that instant, without waiting for a message.
  useEffect(() => {
    if (paused || timeUp) return;
    return pada(jamServer() + left, () => void saver.flush());
  }, [paused, timeUp, left, saver]);

  const voided = useMemo(() => new Set(items.filter((i) => i.voided).map((i) => i.q)), [items]);
  const answered = useMemo(
    () => new Set(items.filter((i) => !i.voided && isAnswered(vals[i.q])).map((i) => i.q)),
    [items, vals],
  );
  const counted = items.length - voided.size;

  useEffect(() => {
    reportProgress({ part: key, answered: answered.size, total: counted });
  }, [answered.size, counted, key, reportProgress]);

  const setV = useCallback(
    (q: number, v: Value) => {
      setVals((o) => ({ ...o, [q]: v }));
      saver.set(q, v);
    },
    [saver],
  );
  const flip = (q: number) =>
    setFlags((f) => {
      const n = new Set(f);
      if (n.has(q)) n.delete(q);
      else n.add(q);
      try {
        localStorage.setItem(flagKey(seat.id, key), JSON.stringify([...n]));
      } catch {
        /* a flag is a convenience */
      }
      return n;
    });

  const go = (i: number) => {
    if (i < 0 || i >= items.length || i === cur) return;
    const dir = i > cur ? 10 : -10;
    setCur(i);
    if (card.current && motion !== "reduce")
      card.current.animate(
        [
          { opacity: 0, transform: `translateX(${dir}px)` },
          { opacity: 1, transform: "none" },
        ],
        { duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
      );
  };

  async function handIn() {
    setBusy(true);
    await saver.flush();
    const r = await submitPart(key);
    setBusy(false);
    if (!r.ok) {
      toast(t.reason[r.kode ?? ""] ?? t.handIn.fail, "warn");
      return false;
    }
    toast(t.handIn.done(t.part[key].l));
    setAsk(false);
    onRefresh();
    return true;
  }

  const it = items[cur];
  const blur = paused || timeUp || cover;
  const unans = items.map((x) => x.q).filter((q) => !answered.has(q) && !voided.has(q));
  const flaggedList = items
    .map((x, i) => (flags.has(x.q) && !voided.has(x.q) ? i : -1))
    .filter((i) => i >= 0);
  const pi = tv.plan.findIndex((p) => p.key === key);
  const timer = <Timer left={left} frozen={paused} lang={lang} big />;

  const cells = (strip: boolean) => (
    <div
      className={"r3cells" + (strip ? " r3cells--strip" : "")}
      role="list"
      aria-label={t.run.nav}
    >
      {items.map((x, i) => (
        <button
          key={x.q}
          type="button"
          role="listitem"
          className="r3cell num"
          aria-current={i === cur ? "true" : undefined}
          data-a={answered.has(x.q) ? "yes" : "no"}
          data-f={flags.has(x.q) ? "yes" : "no"}
          data-v={voided.has(x.q) ? "yes" : "no"}
          style={{ "--i": Math.min(i, 14) } as CSSProperties}
          aria-label={t.run.cellLabel(i + 1, voided.has(x.q), answered.has(x.q), flags.has(x.q))}
          onClick={() => go(i)}
        >
          {i + 1}
          {flags.has(x.q) && <i className="r3cell__f" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );

  if (!it)
    return (
      <div className="r3t" data-m={motion}>
        <p className="lede r3empty">{t.run.noQuestions}</p>
      </div>
    );

  return (
    <div
      className="r3t"
      data-m={motion}
      data-blur={blur ? "yes" : "no"}
      data-enter={entering ? "yes" : undefined}
    >
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
              <span className="r3top__long">{t.part[key].l}</span>
              <span className="r3top__short">{t.part[key].s}</span>{" "}
              <span className="hint">· {t.run.partOf(pi + 1, tv.plan.length)}</span>
            </b>
          </div>
        </div>
        <div className="r3top__right">
          {linkDown && <LiveChip lang={lang} />}
          <SaveChip s={save} lang={lang} />
          <button
            type="button"
            className="btn btn--ghost r3top__refs"
            onClick={() => setRefOpen(true)}
          >
            <BookOpenIcon aria-hidden="true" />
            <span>{t.run.refs}</span>
          </button>
          {timer}
        </div>
      </header>
      {linkDown && (
        <div className="r3connbar" role="status">
          <i aria-hidden="true" />
          <span>{t.run.liveDownBar}</span>
        </div>
      )}
      {twoTabs && (
        <div className="r3banner" role="alert">
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <b>{t.over.twoTabs}</b>
            <span className="hint">{t.over.twoTabsBody}</span>
          </div>
        </div>
      )}
      <div className="r3t__body" inert={blur}>
        <aside className="r3rail">
          <div className="stack stack--sm">
            <div className="row row--between">
              <h2 className="r3h3">{t.run.questions}</h2>
              <span className="hint num">{t.run.answeredOf(answered.size, counted)}</span>
            </div>
            {cells(false)}
            <div className="r3legend hint">
              <span>
                <i className="r3lg" data-a="yes" />
                {t.run.legend[0]}
              </span>
              <span>
                <i className="r3lg" />
                {t.run.legend[1]}
              </span>
              <span>
                <i className="r3lg" data-f="yes" />
                {t.run.legend[2]}
              </span>
            </div>
          </div>
          <div className="stack stack--sm">
            <h2 className="r3h3">{TS[lang].lobby.tonight}</h2>
            <PartsMini plan={tv.plan} cur={key} lang={lang} />
          </div>
          <button type="button" className="btn btn--inverse" onClick={() => setAsk(true)}>
            {t.run.handIn(t.part[key].l)}
          </button>
        </aside>
        <main className="r3main">
          <div className="r3strip">{cells(true)}</div>
          <div ref={card}>
            <QuestionCard
              key={it.q}
              view={it.view}
              codeLang={it.lang === "any" ? "text" : it.lang}
              index={cur}
              total={items.length}
              value={vals[it.q] ?? null}
              onChange={(v) => setV(it.q, v)}
              lang={lang}
              flagged={flags.has(it.q)}
              onFlag={() => flip(it.q)}
              voided={it.voided}
              disabled={blur}
            />
          </div>
          <nav className="r3nav" aria-label={t.run.moveNav}>
            <button
              type="button"
              className="btn btn--ghost r3nav__prev"
              aria-label={t.run.prev}
              disabled={cur === 0}
              onClick={() => go(cur - 1)}
            >
              <ArrowLeftIcon aria-hidden="true" />
              <span className="r3nav__t">{t.run.prev}</span>
            </button>
            <button
              type="button"
              className="btn btn--inverse btn--sm r3nav__hand"
              onClick={() => setAsk(true)}
            >
              {t.run.handInShort}
            </button>
            {cur < items.length - 1 ? (
              <button type="button" className="btn btn--primary" onClick={() => go(cur + 1)}>
                {t.run.nextQ}
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => setAsk(true)}>
                {t.run.review}
              </button>
            )}
          </nav>
        </main>
      </div>

      {paused && !timeUp && !cover && (
        <div className="r3over r3over--pause" role="status">
          <div className="r3over__card">
            <BigIcon kind="pause" />
            <h2 className="r3h2">{t.over.pausedTitle}</h2>
            <p className="lede">{t.over.pausedBody}</p>
            <Timer left={left} frozen big lang={lang} />
          </div>
        </div>
      )}
      {cover && !timeUp && (
        <div className="r3over r3over--cover" role="alertdialog" aria-labelledby="r3cov-h">
          <div className="r3over__card">
            <BigIcon kind="screen" tone="warn" />
            <h2 className="r3h2" id="r3cov-h">
              {t.over.coverTitle}
            </h2>
            <p className="lede">{t.over.coverBody}</p>
            <Timer left={left} frozen={paused} big lang={lang} />
            <button type="button" className="btn btn--primary btn--lg" onClick={onEnterFullscreen}>
              {t.over.coverTitle}
            </button>
            <span className="hint">{t.over.coverNote}</span>
          </div>
        </div>
      )}
      {timeUp && (
        <div className="r3over r3over--up" role="status">
          <div className="r3over__card">
            <BigIcon kind="ok" tone="ok" />
            <h2 className="r3h2">{t.over.upTitle}</h2>
            <p className="lede">{t.over.upBody}</p>
          </div>
        </div>
      )}

      <RefDrawer
        lang={lang}
        open={refOpen && !timeUp}
        onClose={() => setRefOpen(false)}
        part={key}
        refs={part.refs}
        question={it.q}
      />
      <Dialog
        open={ask && !timeUp}
        onOpenChange={setAsk}
        title={t.handIn.title(t.part[key].l)}
        description={t.handIn.desc}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setAsk(false)}>
              {t.handIn.keep}
            </button>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={handIn}>
              {t.handIn.go}
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="r3tally">
            <span>
              <b className="num">{answered.size}</b>
              {t.handIn.answered}
            </span>
            <span>
              <b className="num">{unans.length}</b>
              {t.handIn.not}
            </span>
            <span>
              <b className="num">{flaggedList.length}</b>
              {t.handIn.flagged}
            </span>
          </div>
          {unans.length > 0 && (
            <div className="stack stack--sm">
              <span className="hint">{t.handIn.unansweredOpen}</span>
              <div className="rec-chips">
                {unans.map((q) => {
                  const i = items.findIndex((x) => x.q === q);
                  return (
                    <button
                      key={q}
                      type="button"
                      className="r3chipbtn"
                      onClick={() => {
                        setAsk(false);
                        go(i);
                      }}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {flaggedList.length > 0 && (
            <div className="stack stack--sm">
              <span className="hint">{t.handIn.flaggedOpen}</span>
              <div className="rec-chips">
                {flaggedList.map((i) => (
                  <button
                    key={i}
                    type="button"
                    className="r3chipbtn"
                    onClick={() => {
                      setAsk(false);
                      go(i);
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
