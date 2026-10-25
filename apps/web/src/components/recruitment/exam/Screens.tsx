/**
 * The screens around the questions on /recruitment/test (prompt 10, mockups
 * r3-checkin, r3-keadaan): the room that is not open yet (inside the
 * recruitment shell, so it keeps the navbar), the lobby between check-in and
 * the parts and between two parts, the Live Coding stand-in, and the end.
 * The end lists what was handed in, never a score.
 */
import {
  ArrowsOutIcon,
  BookOpenIcon,
  FloppyDiskIcon,
  SealCheckIcon,
  TimerIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { PartKey } from "../../../lib/recruitment/exam-types";
import type { Lang } from "../../../lib/kelas";
import type { RoomPublic } from "../../../lib/recruitment/room-relay";
import type { SeatPhase } from "../../../lib/recruitment/seat-state";
import type { TestView } from "../../../lib/recruitment/seat-types";
import { tanggalWib } from "../../../lib/recruitment/gates";
import RecNav from "../RecNav";
import { href } from "../../../lib/app";
import { tgl } from "../shared";
import HotspotCard from "./HotspotCard";
import { CheckRow, Gate, Timer, type Motion } from "./parts";
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
              <p className="hint">{t.noRoom}</p>
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
  onChanged,
}: {
  lang: Lang;
  tv: TestView;
  phase: SeatPhase;
  motion: Motion;
  onChanged?: () => void;
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
  const when = tv.info?.startsAt ? new Date(tv.info.startsAt) : null;
  return (
    <div className="r3gate r3lobby" data-m={motion}>
      <div className="r3lobby__in">
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow rec-eyebrow">{elsewhere.size ? l.susulan : t.eyebrow}</span>
          <h1 className="r3title">
            {doneKey ? l.done(t.part[doneKey].l) : elsewhere.size ? l.susulanTitle : l.checkedIn}
          </h1>
          <div className="r3wait">
            <i className="r3wait__dot" aria-hidden="true" />
            <b>{l.waiting}</b>
            {next && (
              <span className="hint">
                · {l.next} {t.part[next.key].l}, {t.minutes(next.minutes)}
              </span>
            )}
          </div>
        </div>
        {elsewhere.size > 0 && <p className="lede">{l.susulanBody}</p>}
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
                  {p.minutes} {t.minShort} · {p.count ? t.questions(p.count) : t.topic}
                </span>
              </li>
            ))}
          </ol>
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
        <div className="r3lobby__grid">
          <div className="panel">
            <div className="panel__head">
              <h2 className="panel__title">{l.rules}</h2>
            </div>
            <ul className="r3rules">
              {[ArrowsOutIcon, FloppyDiskIcon, BookOpenIcon, TimerIcon].map((Ic, i) => (
                <li key={i}>
                  <span className="r3rules__ic">
                    <Ic />
                  </span>
                  <span>{l.rule[i]}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel">
            <div className="panel__head">
              <h2 className="panel__title">{l.seat}</h2>
            </div>
            <div className="rec-sum">
              <span className="hint">{l.name}</span>
              <b>{tv.me.nama}</b>
              <span className="hint">{l.room}</span>
              <b>{tv.info?.title}</b>
              {when && (
                <>
                  <span className="hint">{l.date}</span>
                  <b>{tgl(tanggalWib(when).tanggal, lang)}</b>
                </>
              )}
            </div>
            {!doneKey && <span className="hint">{l.lcBoard}</span>}
          </div>
        </div>
        {tv.seat && <HotspotCard lang={lang} saved={tv.hotspot} compact onChanged={onChanged} />}
      </div>
    </div>
  );
}

/** Live Coding's page is prompt 12's; until it lands the seat sees its clock and its phone */
export function LiveCodeStandIn({
  lang,
  tv,
  phase,
  motion,
  onChanged,
}: {
  lang: Lang;
  tv: TestView;
  phase: SeatPhase;
  motion: Motion;
  onChanged?: () => void;
}) {
  const t = TS[lang].lc;
  return (
    <div className="r3gate r3lobby" data-m={motion}>
      <div className="r3lobby__in">
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow rec-eyebrow">{TS[lang].eyebrow}</span>
          <h1 className="r3title">{phase.k === "spin" ? t.spin : t.running}</h1>
          {phase.k === "work" && (
            <div className="row">
              <Timer left={phase.left} frozen={phase.paused} big lang={lang} />
            </div>
          )}
        </div>
        <div className="panel">
          <p className="lede">{t.body}</p>
          <span className="hint">{t.pending}</span>
        </div>
        {tv.seat && <HotspotCard lang={lang} saved={tv.hotspot} onChanged={onChanged} />}
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
      </div>
    </div>
  );
}
