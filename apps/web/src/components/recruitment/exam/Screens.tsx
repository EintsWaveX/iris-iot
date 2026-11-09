/**
 * The screens around the questions on /recruitment/test (prompt 10, mockups
 * r3-checkin, r3-keadaan): the room that is not open yet (inside the
 * recruitment shell, so it keeps the navbar), the lobby between check-in and
 * the parts and between two parts, the Live Coding stand-in, and the end.
 * The end lists what was handed in, never a score.
 */
import {
  ArrowLeftIcon,
  ArrowsInIcon,
  ArrowsOutIcon,
  ClockIcon,
  FloppyDiskIcon,
  MonitorIcon,
  SealCheckIcon,
  TimerIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import type { PartKey } from "../../../lib/recruitment/exam-types";
import type { Lang } from "../../../lib/kelas";
import type { RoomPublic } from "../../../lib/recruitment/room-relay";
import type { SeatPhase } from "../../../lib/recruitment/seat-state";
import type { TestView } from "../../../lib/recruitment/seat-types";
import { tanggalWib } from "../../../lib/recruitment/gates";
import RecNav from "../RecNav";
import { href } from "../../../lib/app";
import { tgl } from "../shared";
import { CheckRow, Gate, type Motion } from "./parts";
import { TS } from "./testStrings";

const jam = (ms: number) => tanggalWib(new Date(ms)).jam;

/** A message with a way back to the recruitment page */
export function Notice({
  lang,
  motion,
  title,
  body,
  action,
}: {
  lang: Lang;
  motion: Motion;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const t = TS[lang];
  return (
    <Gate motion={motion} eyebrow={t.eyebrow} title={title}>
      <p className="lede">{body}</p>
      <div className="row r3gate__acts">
        {action}
        <a className="btn btn--ghost" href={href(lang, "/recruitment")}>
          {t.back}
        </a>
      </div>
    </Gate>
  );
}

/** Not open yet: the recruitment shell, the evening, and a line that the page opens on its own */
export function NotOpen({ lang, tv }: { lang: Lang; tv: TestView }) {
  const t = TS[lang].notYet;
  const i = tv.info;
  const s = i?.startsAt ? new Date(i.startsAt) : null;
  return (
    <>
      <RecNav lang={lang} path={typeof location === "undefined" ? "/" : location.pathname} />
      <main id="main" className="page-wide page-main">
        <div className="page page--regular rec-page">
          <div className="pagehead rec-head">
            <span className="eyebrow rec-eyebrow">{TS[lang].eyebrow}</span>
            <h1 className="r3h1">{t.title}</h1>
          </div>
          <div className="panel r3notyet">
            {i && s ? (
              <div className="rec-sum">
                <span className="hint">{t.date}</span>
                <b>{tgl(tanggalWib(s).tanggal, lang)}</b>
                <span className="hint">{t.time}</span>
                <b>
                  {tanggalWib(s).jam}
                  {i.endsAt && ` ${t.to} ${jam(Date.parse(i.endsAt))}`} WIB
                </b>
                <span className="hint">{t.room}</span>
                <b>{i.title}</b>
              </div>
            ) : (
              <p className="empty-note empty-note--sm">{t.noRoom}</p>
            )}
            <p className="hint">{t.hint}</p>
          </div>
        </div>
      </main>
    </>
  );
}

/** Between check-in and the parts, and between two parts */
export function Lobby({
  lang,
  tv,
  phase,
  motion,
}: {
  lang: Lang;
  tv: TestView;
  phase: SeatPhase;
  motion: Motion;
}) {
  const t = TS[lang];
  const l = t.lobby;
  const plan = tv.plan;
  const doneKey: PartKey | null = phase.k === "wait" ? phase.part : null;
  const di = doneKey ? plan.findIndex((p) => p.key === doneKey) : -1;
  const elsewhere = new Set(tv.closedElsewhere);
  // The next part this seat still has to do: the part after the one that ended, skipping those it did in another room.
  const next = plan.slice(di + 1).find((p) => !elsewhere.has(p.key as never)) ?? null;
  const tot = plan.reduce((a, p) => a + p.minutes, 0);
  // The last part ended and none is left for this seat: say so, instead of "waiting for the pengawas to start".
  const allDone = doneKey !== null && next === null;
  const when = tv.info?.startsAt ? new Date(tv.info.startsAt) : null;
  return (
    <div className="r3gate r3lobby" data-m={motion}>
      <div className="r3lobby__in">
        <div className="r3lobby__l">
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow rec-eyebrow">{elsewhere.size ? l.susulan : t.eyebrow}</span>
            <h1 className="r3title">
              {doneKey ? l.done(t.part[doneKey].l) : elsewhere.size ? l.susulanTitle : l.checkedIn}
            </h1>
            <div className="r3wait">
              <i className="r3wait__dot" aria-hidden="true" />
              <b>{allDone ? l.allDone : l.waiting}</b>
              {next && (
                <span className="hint">
                  · {l.next} {t.part[next.key].l}, {t.minutes(next.minutes)}
                </span>
              )}
            </div>
          </div>
          {elsewhere.size > 0 && <p className="lede">{l.susulanBody}</p>}
          <div className="r3seat" aria-label={l.seat}>
            <span className="r3seat__c">
              <UserIcon size={16} aria-hidden="true" />
              {tv.me.nama}
            </span>
            {tv.info?.title && (
              <span className="r3seat__c">
                <MonitorIcon size={16} aria-hidden="true" />
                {tv.info.title}
              </span>
            )}
            {when && (
              <span className="r3seat__c">
                <ClockIcon size={16} aria-hidden="true" />
                {tgl(tanggalWib(when).tanggal, lang)}
              </span>
            )}
          </div>
        </div>
        <div className="r3lobby__r">
          <div className="panel r3tl">
            <div className="panel__head">
              <h2 className="panel__title">{l.tonight}</h2>
              <span className="hint">{l.tonightHint(tot)}</span>
            </div>
            <ol className="r3tl__bar">
              {plan.map((p, i) => (
                <li
                  key={p.key}
                  style={{ flexGrow: p.minutes }}
                  data-st={
                    elsewhere.has(p.key as never) || i <= di
                      ? "done"
                      : next && p.key === next.key
                        ? "next"
                        : "later"
                  }
                >
                  <i />
                  <b>{t.part[p.key].l}</b>
                  <span className="hint num">
                    {p.minutes} {t.minShort} · {t.questions(p.count ?? 0)}
                  </span>
                </li>
              ))}
            </ol>
            <ul className="r3rules r3rules--grid">
              {[ArrowsOutIcon, FloppyDiskIcon, TimerIcon].map((Ic, i) => (
                <li key={i}>
                  <span className="r3rules__ic">
                    <Ic />
                  </span>
                  <span>{l.rule[i]}</span>
                </li>
              ))}
            </ul>
            {!doneKey && <span className="hint">{l.lcBoard}</span>}
          </div>
          {elsewhere.size > 0 && (
            <div className="panel">
              <ul className="r3chks">
                {plan.map((p) =>
                  elsewhere.has(p.key as never) ? (
                    <CheckRow key={p.key} st="ok" title={t.part[p.key].l} sub={l.doneElsewhere} />
                  ) : (
                    <CheckRow
                      key={p.key}
                      st="todo"
                      title={t.part[p.key].l}
                      sub={l.tonightOnly(p.minutes)}
                    />
                  ),
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Finished({ lang, tv, motion }: { lang: Lang; tv: TestView; motion: Motion }) {
  const t = TS[lang];
  const f = t.fin;
  const room: RoomPublic | null = tv.room;
  const seat = tv.seat;
  const first = tv.me.nama.split(/\s+/)[0] ?? tv.me.nama;
  // The test is over: there has to be a way off this screen (2026-11-07, "no back? or close?")
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    on();
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const line = (k: PartKey): { ok: boolean; sub: string } => {
    if (k === "livecode") {
      const r = room?.runs.livecode;
      return { ok: !!r, sub: r ? f.lc : f.skipped };
    }
    const handed = seat?.done[k];
    if (handed != null) return { ok: true, sub: f.handed(jam(handed)) };
    const r = room?.runs[k];
    if (seat?.started[k] !== undefined && r?.endedAt != null)
      return { ok: true, sub: f.timeUp(jam(r.endedAt)) };
    if (seat?.started[k] !== undefined) return { ok: true, sub: f.lc };
    return { ok: false, sub: f.skipped };
  };
  return (
    <div className="r3gate" data-m={motion}>
      <div className="panel panel--raised r3gate__card r3fin">
        <span className="r3over__ic" data-tone="ok">
          <SealCheckIcon />
        </span>
        <div className="stack" style={{ gap: 4 }}>
          <h1 className="r3h1">{f.title}</h1>
          <p className="lede">{f.body(first)}</p>
        </div>
        <ul className="r3chks">
          {tv.plan.map((p) => {
            const x = line(p.key);
            return (
              <CheckRow key={p.key} st={x.ok ? "ok" : "todo"} title={t.part[p.key].l} sub={x.sub} />
            );
          })}
        </ul>
        <div className="rec-note">
          <b>{f.next}</b>
          <span>{f.nextBody}</span>
        </div>
        <span className="hint">{f.board}</span>
        <div className="row r3fin__acts" style={{ flexWrap: "wrap", gap: 10 }}>
          {fs && (
            <button
              type="button"
              className="btn btn--inverse btn--lg"
              onClick={() => void document.exitFullscreen?.()}
            >
              <ArrowsInIcon size={22} aria-hidden="true" />
              <span className="btn__label">{f.exitFs}</span>
            </button>
          )}
          <a className="btn btn--primary btn--lg" href={href(lang, "/recruitment")}>
            <ArrowLeftIcon size={22} aria-hidden="true" />
            <span className="btn__label">{f.back}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
