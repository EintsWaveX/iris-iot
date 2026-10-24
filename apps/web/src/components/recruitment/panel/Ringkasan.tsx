/**
 * The panel's Ringkasan (prompt 03, mockup r1-panel): three cards of equal
 * height. The funnel (applicants and where they stand, from the candidate
 * list, only for a Panitia member who may see it), today's events with the
 * next deadline and a countdown, and a short to-do list that follows the
 * person's rights.
 */
import { useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import type { Lang } from "../../../lib/kelas";
import {
  eventHadir,
  eventLive,
  gateClosesAt,
  gateOpen,
  nextPublicEvent,
} from "../../../lib/recruitment/gates";
import { bukaBagian, type PanelTab } from "../../../lib/recruitment/panel-tab";
import type { CandidateRow, RecEvent, RecRights } from "../../../lib/recruitment/types";
import { Baris } from "../calendar/RecCalendar";
import { Countdown, Kartu, kapanAcara, tgl, wibMs } from "../shared";
import { PN } from "./panelStrings";
import { href } from "../../../lib/app";
import AttendanceDrawer from "../qr/AttendanceDrawer";
import { S2 } from "../s2Strings";
import { lite } from "../../../lib/recruitment/banner";
import { judulAcara } from "../judul";

export default function Ringkasan({
  lang,
  events,
  hariIni,
  rights,
  candidates,
  seats,
}: {
  lang: Lang;
  events: RecEvent[];
  hariIni: string;
  rights: RecRights | null;
  candidates: CandidateRow[] | null;
  seats: number | null;
}) {
  const t = PN[lang].sum;
  const now = new Date();
  const [hadirDi, setHadirDi] = useState<number | null>(null);
  const total = candidates?.length ?? 0;
  const hitung = (s: CandidateRow["status"]) =>
    (candidates ?? []).filter((c) => c.status === s).length;
  const menunggu = hitung("applied");
  const rows: [string, number, string][] = [
    [t.applicants, total, "var(--accent)"],
    [t.verified, hitung("approved"), "var(--teal)"],
    [t.waiting, menunggu, "var(--yellow)"],
    [t.fix, hitung("revision"), "var(--red)"],
  ];
  const skala = Math.max(100, total);

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

  // A gathering running now can be attended: the QR screen and the Kehadiran drawer.
  const hidup = hariIniList.find((e) => eventHadir(e) && eventLive(e, now)) ?? null;
  const tugas: { text: string; tab: PanelTab | null }[] = [];
  if (rights?.approve)
    tugas.push({ text: menunggu ? t.waitingTask(menunggu) : t.allChecked, tab: "kandidat" });
  if (rights && (rights.board || rights.seatKetua) && seats !== null)
    tugas.push({ text: t.seats(seats), tab: "panitia" });
  // "Next" on the calendar is the first event still to start, not one already running.
  const mendatang = events
    .filter((e) => e.startsOn > hariIni)
    .sort((a, b) =>
      a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : a.sort - b.sort,
    )[0];
  if (rights?.calendar && mendatang)
    tugas.push({
      text: t.nextEvent(judulAcara(mendatang, lang), tgl(mendatang.startsOn, lang)),
      tab: "kalender",
    });
  if (!tugas.length) tugas.push({ text: t.none, tab: null });

  return (
    <div className="rec-sum3">
      {candidates ? (
        <Kartu
          title={t.applicants}
          className="rec-funnel"
          aside={<span className="hint">{t.aim}</span>}
        >
          <div className="rec-funnel__big">
            <b className="num">{total}</b>
          </div>
          <ul className="rec-funnel__rows">
            {rows.map(([l, n, c]) => (
              <li key={l}>
                <span>{l}</span>
                <span className="rec-funnel__bar">
                  <i style={{ width: `${(n / skala) * 100}%`, ["--c" as string]: c }} />
                </span>
                <b className="num">{n}</b>
              </li>
            ))}
          </ul>
        </Kartu>
      ) : (
        <Kartu title={t.applicants} className="rec-funnel">
          <span className="hint">{t.noRight}</span>
        </Kartu>
      )}
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
      <Kartu title={t.tasks} className="rec-todo">
        <ul className="rec-todo__list">
          {tugas.map((x) => (
            <li key={x.text}>
              {x.tab ? (
                <button type="button" onClick={() => bukaBagian(x.tab as PanelTab)}>
                  <span>{x.text}</span>
                  <CaretRightIcon size={16} aria-hidden="true" />
                </button>
              ) : (
                <span className="rec-todo__plain">{x.text}</span>
              )}
            </li>
          ))}
        </ul>
      </Kartu>
      {hadirDi !== null && hidup && hidup.id === hadirDi && (
        <AttendanceDrawer lang={lang} event={lite(hidup)} onClose={() => setHadirDi(null)} />
      )}
    </div>
  );
}
