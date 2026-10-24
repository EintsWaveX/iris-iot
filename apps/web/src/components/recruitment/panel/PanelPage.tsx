/**
 * /recruitment/panel (prompt 03, PRD 6): the Panitia's side. The parts
 * (Ringkasan, Kalender, Kandidat, Panitia) are chosen in the recruitment
 * navbar through ?bagian=, and each person sees only what their rights
 * allow: a Panitia member gets Ringkasan, Kalender, Panitia and, with the
 * candidates right, Kandidat; another Asisten gets the Kalender read only.
 * A visitor or a Praktikan gets the error view, the same as every other
 * Asisten page.
 */
import { useMemo } from "react";
import ErrorView from "../../ui/ErrorView";
import Fade from "../../ui/Fade";
import Pill from "../../ui/Pill";
import { useMe } from "../../../lib/app";
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
import { CAL } from "../calendar/calendarStrings";
import { KepalaHalaman, tgl, useHariIni } from "../shared";
import Kandidat from "./Kandidat";
import CuttingTab from "./cutting/CuttingTab";
import PlottingTab from "./jadwal/PlottingTab";
import TesTab from "./tes/ruang/TesTab";
import KalenderTab from "./KalenderTab";
import PanitiaBoard from "./PanitiaBoard";
import Ringkasan from "./Ringkasan";
import { PN } from "./panelStrings";

export default function PanelPage({ lang }: { lang: Lang }) {
  const t = PN[lang];
  const me = useMe();
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
            ...(adaRuang ? (["tes"] as const) : []),
            "panitia",
          ]
        : ["kalender", ...(adaRuang ? (["tes"] as const) : [])],
    [panitia, lihatKandidat, rights?.cuttingPropose, rights?.plotting, adaRuang],
  );
  const tab: PanelTab = bagian && tabs.includes(bagian) ? bagian : tabs[0];

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
    <div className="rec-page">
      <KepalaHalaman
        lang={lang}
        title={panitia ? t.title : CAL[lang].title}
        badge={seat ? <Pill lg>{t.division[seat.division]}</Pill> : undefined}
        lede={hariKe ? t.day(hariKe, tgl(hariIni, lang)) : t.dayPlain(tgl(hariIni, lang))}
      />
      <Fade k={tab}>
        {tab === "ringkasan" ? (
          <Ringkasan
            lang={lang}
            events={events}
            hariIni={hariIni}
            rights={rights}
            candidates={cand.data?.candidates ?? null}
            seats={kom.data ? kom.data.seats.length : null}
          />
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
        ) : tab === "tes" ? (
          <TesTab lang={lang} />
        ) : (
          <PanitiaBoard lang={lang} rights={rights} />
        )}
      </Fade>
    </div>
  );
}
