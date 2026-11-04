/**
 * /recruitment/panel (prompt 03, PRD 6): the Panitia's side. The parts
 * (Ringkasan, Kalender, Kandidat, Panitia) are chosen in the recruitment
 * navbar through ?bagian=, and each person sees only what their rights
 * allow: a Panitia member gets Ringkasan, Kalender, Panitia and, with the
 * candidates right, Kandidat; another Asisten gets the Kalender read only.
 * A visitor or a Praktikan gets the error view, the same as every other
 * Asisten page.
 */
import { Suspense, lazy, useEffect, useMemo, useRef } from "react";
import ErrorView from "../../ui/ErrorView";
import { useRecOrang } from "../../../lib/recruitment/latihan-client";
import { useMinWidth } from "../../../lib/hooks";
import type { Lang } from "../../../lib/kelas";
import { addDays, daysBetween } from "../../../lib/recruitment/calendar";
import {
  useRecCalendar,
  useRecCandidates,
  useRecCommittee,
  useRecEdition,
} from "../../../lib/recruitment/client";
import { useBagian, type PanelTab } from "../../../lib/recruitment/panel-tab";
import { useRecRooms } from "../../../lib/recruitment/room-client";
import { useRecPnState } from "../../../lib/recruitment/pn-client";
import { PNW } from "./penerimaan/pnStrings";
import { IV } from "./iv/ivStrings";
import { CAL } from "../calendar/calendarStrings";
import { KepalaHalaman, tgl, useHariIni } from "../shared";
import { REC } from "../recruitmentStrings";
import { AREA, AREA_ORDER } from "./areas";
import PanelHead from "./PanelHead";
import { TUBES } from "../tubes/tubesStrings";
import Ringkasan from "./Ringkasan";
import { LatihanCard } from "../Latihan";
import TampilOprec from "./TampilOprec";
import { PN } from "./panelStrings";
import { TitleCaseContext } from "../../ui/Dropdown";
import "../recruitment-b1.css";
import "../recruitment-shell.css";

/**
 * Each part loads when it is opened (the panel was one 820 KB script, most of it
 * for parts the person never visits). Ringkasan stays in the main file because
 * it is where the panel opens.
 */
const loadKandidat = () => import("./Kandidat");
const Kandidat = lazy(loadKandidat);
const CuttingTab = lazy(() => import("./cutting/CuttingTab"));
const PlottingTab = lazy(() => import("./jadwal/PlottingTab"));
const IvTab = lazy(() => import("./iv/IvTab"));
const TubesTab = lazy(() => import("../tubes/TubesTab"));
const PenerimaanTab = lazy(() => import("./penerimaan/PenerimaanTab"));
const BankTab = lazy(() => import("./tes/bank/BankTab"));
const TesTab = lazy(() => import("./tes/ruang/TesTab"));
const KalenderTab = lazy(() => import("./KalenderTab"));
const PanitiaBoard = lazy(() => import("./PanitiaBoard"));

/** Which way a tab swap slides: toward the side the new tab sits on. */
let lastTab: PanelTab | null = null;

function Swap({ k, children }: { k: PanelTab; children: React.ReactNode }) {
  const dir =
    AREA_ORDER.indexOf(k) >= (lastTab === null ? 0 : AREA_ORDER.indexOf(lastTab)) ? "f" : "b";
  useEffect(() => {
    lastTab = k;
  }, [k]);
  return (
    <div
      className="rec-swap"
      key={k}
      data-dir={dir}
      style={{ "--tc": AREA[k].c } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/** Subject to Change: the dates of the later stages are not fixed (coordinator, 28 Oct 2026). */
const STC: Record<Lang, string> = {
  id: "Subject to Change: tanggal, jam, jumlah dan menit di tab ini bisa berubah.",
  en: "Subject to Change: the dates, hours, counts and minutes on this tab may change.",
  zh: "可能会变动：此页的日期、时间、人数和分钟数可能调整。",
};

export default function PanelPage({ lang }: { lang: Lang }) {
  const t = PN[lang];
  // Kandidat is where most people go next: fetch it while the browser is idle (not on Data Saver).
  useEffect(() => {
    const net = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (net?.saveData) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (n: number) => void;
    };
    const go = () => void loadKandidat();
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(go, { timeout: 5000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(go, 3000);
    return () => window.clearTimeout(id);
  }, []);
  const me = useRecOrang();
  const asisten = me?.role === "asisten";
  const edisi = useRecEdition(asisten);
  const cal = useRecCalendar(asisten);
  const hariIni = useHariIni();
  const bagian = useBagian();
  const lebar = useMinWidth(820);
  const rights = edisi.data?.rights ?? null;
  const panitia = edisi.data?.viewer === "panitia";
  const lihatKandidat = panitia && rights?.candidates === true;
  const cand = useRecCandidates(lihatKandidat);
  const kom = useRecCommittee(panitia);
  const ruang = useRecRooms(asisten);
  const pnState = useRecPnState(panitia);
  const adaRuang = !!ruang.data && (ruang.data.rooms.length > 0 || ruang.data.canSetup);

  const tabs = useMemo<PanelTab[]>(
    () =>
      panitia
        ? [
            "ringkasan",
            "kalender",
            ...(lihatKandidat ? (["kandidat"] as const) : []),
            ...(rights?.cuttingPropose ? (["cutting"] as const) : []),
            ...(rights?.plotting ? (["plotting"] as const) : []),
            "wawancara",
            "tubes",
            "mengajar",
            "penerimaan",
            ...(adaRuang ? (["tes"] as const) : []),
            ...(rights?.bank ? (["bank"] as const) : []),
            "panitia",
          ]
        : ["kalender", "wawancara", "tubes", "mengajar", ...(adaRuang ? (["tes"] as const) : [])],
    [panitia, lihatKandidat, rights?.cuttingPropose, rights?.plotting, rights?.bank, adaRuang],
  );
  const tab: PanelTab = bagian && tabs.includes(bagian) ? bagian : tabs[0];

  // The browser tab and the history name the part that is open ("Kandidat · Panel Panitia · IRIS IoT").
  const judulDasar = useRef<string | null>(null);
  useEffect(() => {
    if (judulDasar.current === null) judulDasar.current = document.title;
    document.title = `${REC[lang].nav[tab]} · ${judulDasar.current}`;
  }, [tab, lang]);

  if (me === undefined || (asisten && (edisi.updatedAt === null || cal.updatedAt === null)))
    return <span className="skeleton" style={{ height: 520 }} />;
  if (!asisten) return <ErrorView code={me ? 403 : 401} lang={lang} role={me?.role ?? null} />;
  if (!cal.data)
    return (
      <div className="rec-page">
        <KepalaHalaman lang={lang} title={t.title} />
        <p className="hint">{CAL[lang].noEvents}</p>
      </div>
    );

  const events = cal.data.events;
  const daftar = events.filter((e) => e.gates.includes("daftar"));
  const buka = daftar.length
    ? daftar.reduce((m, e) => (e.startsOn < m ? e.startsOn : m), daftar[0].startsOn)
    : null;
  const tutup = daftar.length
    ? daftar.reduce((m, e) => (e.endsOn > m ? e.endsOn : m), daftar[0].endsOn)
    : null;
  const hariKe =
    buka && tutup && hariIni >= buka && hariIni <= addDays(tutup, 0)
      ? daysBetween(buka, hariIni) + 1
      : null;
  const seat = edisi.data?.seat ?? null;

  return (
    <TitleCaseContext.Provider value>
      <div className="rec-page" data-area={tab}>
        <PanelHead
          tab={tab}
          title={
            panitia
              ? t.title
              : tab === "wawancara" || tab === "mengajar"
                ? IV(lang).title[tab]
                : tab === "tubes"
                  ? TUBES[lang].panel.title
                  : CAL[lang].title
          }
          badge={seat ? t.division[seat.division] : undefined}
          area={REC[lang].nav[tab]}
          stc={tab === "mengajar" || tab === "penerimaan" ? STC[lang] : undefined}
          sub={hariKe ? t.day(hariKe, tgl(hariIni, lang)) : t.dayPlain(tgl(hariIni, lang))}
        >
          {panitia && edisi.data && (
            <TampilOprec
              lang={lang}
              hidden={!!edisi.data.hidden}
              canHide={!!edisi.data.canHide}
              onChanged={edisi.refresh}
            />
          )}
        </PanelHead>
        {panitia && pnState.data?.close.closed && (
          <div className="rec-note rec-note--warn" role="status">
            <b>{PNW(lang).close.banner}</b>
          </div>
        )}
        <Swap k={tab}>
          <Suspense
            fallback={
              <span
                className="skeleton"
                style={{ height: 360 }}
                role="status"
                aria-label={REC[lang].loading}
              />
            }
          >
            {tab === "ringkasan" ? (
              <div className="lat-stack">
                <Ringkasan
                  lang={lang}
                  events={events}
                  hariIni={hariIni}
                  rights={rights}
                  candidates={cand.data?.candidates ?? null}
                  seats={kom.data ? kom.data.seats.length : null}
                  division={seat ? seat.division : null}
                  tabs={tabs}
                  hariKe={hariKe}
                />
                <LatihanCard lang={lang} />
              </div>
            ) : tab === "kalender" ? (
              <KalenderTab
                lang={lang}
                events={events}
                hariIni={hariIni}
                canEdit={rights?.calendar === true}
                refresh={cal.refresh}
              />
            ) : tab === "kandidat" && rights ? (
              cand.data ? (
                <Kandidat
                  lang={lang}
                  rights={rights}
                  rows={cand.data.candidates}
                  refresh={cand.refresh}
                  wide={lebar}
                />
              ) : (
                <span className="skeleton" style={{ height: 320 }} />
              )
            ) : tab === "cutting" && rights ? (
              <CuttingTab lang={lang} events={events} hariIni={hariIni} rights={rights} />
            ) : tab === "plotting" && rights ? (
              <PlottingTab lang={lang} events={events} rights={rights} />
            ) : tab === "wawancara" || tab === "mengajar" ? (
              <IvTab
                lang={lang}
                stage={tab}
                rights={rights}
                qrShift={edisi.data?.qrShift === true}
              />
            ) : tab === "tubes" ? (
              <TubesTab lang={lang} rights={rights} />
            ) : tab === "penerimaan" ? (
              <PenerimaanTab lang={lang} />
            ) : tab === "tes" ? (
              <TesTab lang={lang} />
            ) : tab === "bank" && rights?.bank ? (
              <BankTab lang={lang} />
            ) : (
              <PanitiaBoard lang={lang} rights={rights} />
            )}
          </Suspense>
        </Swap>
      </div>
    </TitleCaseContext.Provider>
  );
}
