/**
 * /grading (Phase 13): Penilaian, reachable any time from the Asisten
 * navbar, only for scores. Tabs: Nilai TP (the groups and the grader),
 * Praktikum (every session's score table this semester) and Sumber SeeLabs.
 * The tab is in the hash (#praktikum, #seelabs); ?modul= picks the TP
 * module; the grader is a history entry, so Back returns to the groups.
 * Buat Soal TP and Pengaturan TP moved to Kelola TP (/tp, 2026-10-21), which
 * the header's button opens; their old links (#soal, #pengaturan, #lms) go
 * there.
 */
import { useCallback, useEffect, useState } from "react";
import Fade from "../ui/Fade";
import TabLine from "../ui/TabLine";
import ErrorView from "../ui/ErrorView";
import { getJson, href, useMe } from "../../lib/app";
import { useMinWidth, usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { TPS } from "../tp/tpStrings";
import TpTab from "./TpTab";
import Grader from "./Grader";
import PraktikumTab from "./PraktikumTab";
import SumberSeelabs from "../console/seelabs/SumberSeelabs";
import { RB } from "../console/seelabs/robotStrings";
import type { DataKelompok, GrupDinilai } from "./types";
import { modulDariUrl, semesterKini } from "./halaman";
import "../tp/tp.css";

type Tab = "tp" | "praktikum" | "seelabs";

function tabDariHash(): Tab {
  const h = typeof location === "undefined" ? "" : location.hash.replace(/^#/, "");
  return h === "praktikum" || h === "seelabs" ? h : "tp";
}

/** An old link to a tab that moved to Kelola TP: where it lives now. */
function keKelola(lang: Lang): string | null {
  if (typeof location === "undefined") return null;
  const h = location.hash.replace(/^#/, "");
  if (h !== "soal" && h !== "pengaturan" && h !== "lms") return null;
  return href(lang, `/tp${location.search}#${h === "soal" ? "soal" : "pengaturan"}`);
}

export default function GradingPage({ lang }: { lang: Lang }) {
  const t = TPS[lang];
  const me = useMe();
  const asisten = me?.role === "asisten";
  const sm = !useMinWidth(640);
  const [tab, setTab0] = useState<Tab>(tabDariHash);
  const [modul, setModul0] = useState<number | null>(modulDariUrl);
  const [grader, setGrader] = useState<{ g: GrupDinilai; i: number } | null>(null);
  const [pindah] = useState(() => keKelola(lang));

  // The tab follows the hash, on load or followed in the page; a moved
  // tab's old link goes on to Kelola TP.
  useEffect(() => {
    if (pindah) location.replace(pindah);
  }, [pindah]);
  useEffect(() => {
    const on = () => {
      const ke = keKelola(lang);
      if (ke) location.replace(ke);
      else setTab0(tabDariHash());
    };
    on();
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [lang]);
  const setTab = (v: Tab) => {
    setTab0(v);
    history.replaceState(
      history.state,
      "",
      location.pathname + location.search + (v === "tp" ? "" : `#${v}`),
    );
  };
  const setModul = (m: number) => {
    setModul0(m);
    const u = new URL(location.href);
    u.searchParams.set("modul", String(m));
    history.replaceState(history.state, "", u);
  };

  const poll = usePoll(
    () =>
      getJson<DataKelompok>(`/api/tp/kelompok?modul=${modul ?? 1}`).then((d) => (d.ok ? d : null)),
    120_000,
    asisten && modul !== null && tab === "tp",
    ["tp", "jadwal", "roster"],
    0,
    modul,
  );
  // No module in the address: the open one, else the latest that opened,
  // else Module 1.
  const [pilihAwal, setPilihAwal] = useState(false);
  useEffect(() => {
    if (!asisten || modul !== null || pilihAwal) return;
    setPilihAwal(true);
    void getJson<DataKelompok>("/api/tp/kelompok?modul=1")
      .then((d) => {
        const ms = d.ok ? d.modul : [];
        const buka = ms.find((x) => x.keadaan === "buka");
        const lalu = [...ms].reverse().find((x) => x.keadaan === "tutup");
        setModul0(buka?.modul ?? lalu?.modul ?? 1);
      })
      .catch(() => setModul0(1));
  }, [asisten, modul, pilihAwal]);

  // The grader is a history entry: Back closes it.
  const buka = useCallback((g: GrupDinilai, i: number) => {
    setGrader({ g, i });
    history.pushState({ tpGrader: true }, "", location.href);
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const on = () => setGrader(null);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);

  if (me === undefined || pindah) return <span className="skeleton" style={{ height: 420 }} />;
  if (!asisten) return <ErrorView code={me ? 403 : 401} lang={lang} role={me?.role ?? null} />;

  const bolehSeelabs = me.hak?.full === true;
  const tabs: { v: Tab; label: string; n?: number }[] = [
    { v: "tp", label: sm ? t.tpShort : t.tabTp, n: poll.data?.hitung.perluNilaiku || undefined },
    { v: "praktikum", label: t.tabPraktikum },
  ];
  // Phase 14: the SeeLabs robot's own source tab, for the full right.
  if (bolehSeelabs) tabs.push({ v: "seelabs", label: sm ? "SeeLabs" : RB[lang].srcTitle });
  const shown: Tab = tabs.some((x) => x.v === tab) ? tab : "tp";

  if (grader && modul !== null && poll.data) {
    // The group as it is now (scores and statuses follow the live data).
    const segar =
      poll.data.slot
        .flatMap((s) => s.kelompok)
        .find(
          (g) =>
            g.nomor === grader.g.nomor && g.anggota.some((a) => a.nim === grader.g.anggota[0]?.nim),
        ) ?? (grader.g.nomor === 0 ? { ...grader.g, anggota: poll.data.tanpaKelompok } : grader.g);
    return (
      <div className="grading">
        <Grader
          lang={lang}
          modul={modul}
          grup={segar}
          awal={grader.i}
          onBack={() => history.back()}
          onChanged={poll.refresh}
        />
      </div>
    );
  }

  return (
    <div className="grading">
      <header className="page-header">
        <div className="page-header__row">
          <div className="page-header__heading">
            <span className="page-header__eyebrow">{t.semesterLabel(semesterKini())}</span>
            <h1 className="page-header__title">{t.penilaian}</h1>
          </div>
          <div className="page-header__actions">
            <span className="hint">{t.lede}</span>
            <a className="btn" href={href(lang, `/tp${modul ? `?modul=${modul}` : ""}`)}>
              {t.kelolaTp}
            </a>
          </div>
        </div>
      </header>
      <TabLine value={shown} onChange={setTab} label={t.bagian} tabs={tabs} />
      <Fade k={shown}>
        {shown === "tp" ? (
          <TpTab
            lang={lang}
            modul={modul ?? 1}
            setModul={setModul}
            data={modul === null ? null : poll.data}
            onOpen={buka}
            onFlip={poll.refresh}
          />
        ) : shown === "praktikum" ? (
          <PraktikumTab lang={lang} />
        ) : (
          <SumberSeelabs lang={lang} />
        )}
      </Fade>
    </div>
  );
}
