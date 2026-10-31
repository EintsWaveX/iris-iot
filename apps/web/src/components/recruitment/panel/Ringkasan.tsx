/**
 * The panel's Ringkasan (mockup r1-panel, rebuilt 28 Oct 2026): one job,
 * "what is my next step". The big card names the step for the person's
 * division at the stage the calendar is in and opens the part that does it;
 * under it the candidate funnel (counted from the candidate list, only for
 * those who may see it) and today's events with the next deadline.
 */
import { useState } from "react";
import { ArrowRightIcon, CaretRightIcon, CheckIcon } from "@phosphor-icons/react";
import type { Lang } from "../../../lib/kelas";
import { href } from "../../../lib/app";
import { lite } from "../../../lib/recruitment/banner";
import {
  eventHadir,
  eventLive,
  gateClosesAt,
  gateOpen,
  nextPublicEvent,
} from "../../../lib/recruitment/gates";
import { berkasCounts, funnelOf } from "../../../lib/recruitment/funnel";
import {
  eventOf,
  nextSteps,
  roleOf,
  whereNow,
  type Step,
  type StepKey,
} from "../../../lib/recruitment/next-step";
import { bukaBagian, type PanelTab } from "../../../lib/recruitment/panel-tab";
import {
  STAGES,
  type CandidateRow,
  type CommitteeDivision,
  type RecEvent,
  type RecRights,
  type StageKey,
} from "../../../lib/recruitment/types";
import { Baris } from "../calendar/RecCalendar";
import { judulAcara } from "../judul";
import AttendanceDrawer from "../qr/AttendanceDrawer";
import { S2 } from "../s2Strings";
import { Countdown, Kartu, kapanAcara, tgl, wibMs } from "../shared";
import { NS, stepText, type StepVars } from "./nextStrings";
import { PN } from "./panelStrings";
import "../recruitment-b1.css";

/** The event a step is about, so its text carries a real date. */
function tanggalLangkah(key: StepKey, events: readonly RecEvent[], where: StageKey | "daftar") {
  const e = (stage: StageKey, kind: RecEvent["kind"]) => eventOf(events, stage, kind);
  const pick: Partial<Record<StepKey, RecEvent | null>> = {
    prepReview: e("berkas", "review"),
    backupFirstMeet: e("first_meet", "meeting"),
    prepFirstMeet: e("first_meet", "meeting"),
    attendFirstMeet: e("first_meet", "meeting"),
    prepTesNights: e("tes_tulis", "test"),
    followNight: e("tes_tulis", "test"),
    plenoTulis: e("tes_tulis", "pleno"),
    buildBank: e("tes_tulis", "pleno"),
    lockBank: e("tes_tulis", "pleno"),
    lockCuttingBerkas: e("berkas", "cutting"),
    lockCuttingTulis: e("tes_tulis", "cutting"),
    announceTulis: e("tes_tulis", "announcement"),
    makeupTulis: e("tes_tulis", "makeup"),
    openPilihJadwal: e("berkas", "announcement"),
    sendEnvelope: e(where === "tes_tulis" ? "tes_tulis" : "berkas", "announcement"),
  };
  return pick[key] ?? null;
}

export default function Ringkasan({
  lang,
  events,
  hariIni,
  rights,
  candidates,
  seats,
  division,
  tabs,
}: {
  lang: Lang;
  events: RecEvent[];
  hariIni: string;
  rights: RecRights | null;
  candidates: CandidateRow[] | null;
  seats: number | null;
  /** The viewer's seat, null when they have none (hakPenuh) */
  division: CommitteeDivision | null;
  /** The parts this person has */
  tabs: readonly PanelTab[];
}) {
  const t = PN[lang].sum;
  const n = NS[lang === "id" ? "id" : "en"];
  const now = new Date();
  const [hadirDi, setHadirDi] = useState<number | null>(null);

  const hitung = candidates ? berkasCounts(candidates) : null;
  const where = whereNow(events, now);
  const role = roleOf(division, rights?.seatKetua === true);
  const { now: langkah, others } = nextSteps(where, role, tabs);

  const vars = (key: StepKey): StepVars => {
    const ev = tanggalLangkah(key, events, where.stage);
    const waiting = hitung?.waiting ?? 0;
    const count: Partial<Record<StepKey, number>> = {
      checkWaiting: waiting,
      followReview: waiting + (hitung?.fix ?? 0),
      tellFix: hitung?.fix ?? 0,
      watchApplicants: hitung?.total ?? 0,
      seatPanitia: seats ?? 0,
    };
    return {
      n: count[key] ?? 0,
      total: hitung?.total ?? 0,
      aim: 100,
      d: ev ? tgl(ev.startsOn, lang) : "",
    };
  };

  const hariIniList = events.filter((e) => e.startsOn <= hariIni && hariIni <= e.endsOn);
  const tutup = gateOpen(events, "daftar", now) ? gateClosesAt(events, "daftar", now) : null;
  const lanjut = nextPublicEvent(events, now);
  const deadline = tutup
    ? {
        title: t.closes,
        when:
          tgl(new Date(Date.parse(tutup) - 60_000).toISOString().slice(0, 10), lang) +
          " · 23:59 WIB",
        ke: Date.parse(tutup),
      }
    : lanjut
      ? {
          title: judulAcara(lanjut, lang),
          when: kapanAcara(lanjut, lang),
          ke: wibMs(lanjut.startsOn, lanjut.dayStart ?? "00:00"),
        }
      : null;
  const hidup = hariIniList.find((e) => eventHadir(e) && eventLive(e, now)) ?? null;

  const funnel = candidates ? funnelOf(candidates) : null;
  const stageNow: StageKey = where.stage === "daftar" ? "berkas" : where.stage;
  const stageIdx = STAGES.indexOf(stageNow);
  const cur = funnel?.[stageIdx];

  const Baris2 = ({ s, i }: { s: Step; i: number }) => {
    const isi = (
      <>
        <span className="b1-steps__n">
          {s.state === "done" ? <CheckIcon size={14} weight="bold" aria-hidden="true" /> : i + 1}
        </span>
        <span className="b1-steps__t">{stepText(lang, s.key, vars(s.key))}</span>
        {s.tab && <CaretRightIcon size={16} aria-hidden="true" />}
      </>
    );
    return (
      <li data-st={s.state}>
        {s.tab ? (
          <button type="button" onClick={() => bukaBagian(s.tab as PanelTab)}>
            {isi}
          </button>
        ) : (
          <div>{isi}</div>
        )}
      </li>
    );
  };

  return (
    <div className="b1-sum">
      <section className="panel b1-next" data-stage={stageNow} aria-labelledby="b1-next-t">
        <span className="eyebrow">
          {n.title} · {n.stages[stageNow]}
        </span>
        <h2 id="b1-next-t" className="b1-next__t">
          {stepText(lang, langkah.key, vars(langkah.key))}
        </h2>
        {others.length > 0 && (
          <ol className="b1-steps" aria-label={n.others}>
            {others.map((s, i) => (
              <Baris2 key={s.key} s={s} i={i + 1} />
            ))}
          </ol>
        )}
        <div className="b1-next__foot">
          {langkah.tab ? (
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => bukaBagian(langkah.tab as PanelTab)}
            >
              <span className="btn__label">{n.open(n.tabs[langkah.tab])}</span>
              <ArrowRightIcon size={18} aria-hidden="true" />
            </button>
          ) : (
            <span className="hint">{n.noScreen}</span>
          )}
        </div>
      </section>

      <Kartu title={n.funnel} className="b1-fun">
        {funnel && cur ? (
          <>
            <ol className="b1-fun__rail">
              {funnel.map((f, i) => {
                const st = i < stageIdx ? "done" : i === stageIdx ? "cur" : "next";
                const v = st === "done" ? f.through : st === "cur" ? f.here : null;
                const base = Math.max(1, f.reached);
                return (
                  <li key={f.stage} data-st={st}>
                    <b className="b1-fun__n num">{v === null ? "-" : v}</b>
                    <span className="b1-fun__bar">
                      <i
                        style={{ width: `${v === null ? 0 : Math.min(100, (v / base) * 100)}%` }}
                      />
                    </span>
                    <span className="b1-fun__l">{n.stages[f.stage]}</span>
                    <span className="hint b1-fun__s">
                      {v === null ? n.notYet : st === "cur" ? n.here : n.reached(f.reached)}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="b1-fun__det">
              <div className="stack stack--sm">
                <span className="eyebrow">{n.stageNow}</span>
                <b className="b1-fun__big">
                  <span className="num">{cur.here}</span>{" "}
                  <span className="hint">
                    {where.stage === "daftar" ? t.aim : `/ ${cur.reached}`}
                  </span>
                </b>
              </div>
              {stageNow === "berkas" && hitung && (
                <ul className="rec-funnel__rows">
                  {(
                    [
                      [t.applicants, hitung.total, "var(--accent)"],
                      [t.verified, hitung.verified, "var(--ok)"],
                      [t.waiting, hitung.waiting, "var(--warn)"],
                      [t.fix, hitung.fix, "var(--danger)"],
                    ] as [string, number, string][]
                  ).map(([l, k, c]) => (
                    <li key={l}>
                      <span>{l}</span>
                      <span className="rec-funnel__bar">
                        <i
                          style={{
                            width: `${(k / Math.max(100, hitung.total)) * 100}%`,
                            ["--c" as string]: c,
                          }}
                        />
                      </span>
                      <b className="num">{k}</b>
                    </li>
                  ))}
                </ul>
              )}
              {stageNow !== "berkas" && cur.out > 0 && (
                <span className="hint">
                  {cur.out} {n.cut}
                </span>
              )}
            </div>
          </>
        ) : (
          <span className="hint">{t.noRight}</span>
        )}
      </Kartu>

      <Kartu
        title={t.today}
        className="rec-today"
        aside={<span className="hint">{tgl(hariIni, lang)}</span>}
      >
        {hariIniList.length ? (
          <ul className="rkal__list">
            {hariIniList.map((e) => (
              <Baris key={e.id} e={e} lang={lang} hariIni={hariIni} />
            ))}
          </ul>
        ) : (
          <span className="hint">{t.noToday}</span>
        )}
        {rights?.attendance && hidup && (
          <div className="row r2today">
            <a
              className="btn btn--primary btn--sm"
              href={href(lang, "/recruitment/qr")}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="btn__label">{S2[lang].attend.todayQr}</span>
            </a>
            <button type="button" className="btn btn--sm" onClick={() => setHadirDi(hidup.id)}>
              <span className="btn__label">{S2[lang].attend.todayAttend}</span>
            </button>
          </div>
        )}
        {deadline && (
          <div className="rec-today__next">
            <span className="eyebrow">{t.nextDeadline}</span>
            <b>{deadline.title}</b>
            <span className="hint">{deadline.when}</span>
            {deadline.ke > Date.now() && (
              <Countdown ke={deadline.ke} label={deadline.title} lang={lang} />
            )}
          </div>
        )}
      </Kartu>
      {hadirDi !== null && hidup && hidup.id === hadirDi && (
        <AttendanceDrawer lang={lang} event={lite(hidup)} onClose={() => setHadirDi(null)} />
      )}
    </div>
  );
}
