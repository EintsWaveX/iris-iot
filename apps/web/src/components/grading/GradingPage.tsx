/**
 * /grading (Phase 13): Penilaian, reachable any time from the Asisten
 * navbar. Four tabs: Tugas Pendahuluan (the groups and the grader), Soal
 * TP (each module's question bank, its final set and the LMS paper),
 * Praktikum (every session's score table this semester) and Sumber LMS
 * (the connection, for the Pencipta and Admins). The tab is in the hash
 * (#soal, #praktikum, #lms); ?modul= picks the TP module for both TP tabs;
 * the grader is a history entry, so Back returns to the groups.
 */
import { useCallback, useEffect, useState } from "react";
import Fade from "../ui/Fade";
import TabLine from "../ui/TabLine";
import ErrorView from "../ui/ErrorView";
import { getJson, useMe } from "../../lib/app";
import { useMinWidth, usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { hakPenuh } from "../../lib/hak";
import { TPS } from "../tp/tpStrings";
import TpTab from "./TpTab";
import Grader from "./Grader";
import PraktikumTab from "./PraktikumTab";
import SoalTab from "./SoalTab";
import LmsTab from "./LmsTab";
import SumberSeelabs from "../console/seelabs/SumberSeelabs";
import { RB } from "../console/seelabs/robotStrings";
import type { DataKelompok, GrupDinilai } from "./types";
import "../tp/tp.css";

type Tab = "tp" | "soal" | "praktikum" | "lms" | "seelabs";

function tabDariHash(): Tab {
  const h = typeof location === "undefined" ? "" : location.hash.replace(/^#/, "");
  return h === "soal" || h === "praktikum" || h === "lms" || h === "seelabs" ? h : "tp";
}

function modulDariUrl(): number | null {
  if (typeof location === "undefined") return null;
  const m = Number(new URLSearchParams(location.search).get("modul"));
  return Number.isInteger(m) && m >= 1 && m <= 4 ? m : null;
}

export default function GradingPage({ lang }: { lang: Lang }) {
  const t = TPS[lang];
  const me = useMe();
  const asisten = me?.role === "asisten";
  const sm = !useMinWidth(640);
  const [tab, setTab0] = useState<Tab>(tabDariHash);
  const [modul, setModul0] = useState<number | null>(modulDariUrl);
  const [grader, setGrader] = useState<{ g: GrupDinilai; i: number } | null>(null);

  useEffect(() => {
    const on = () => setTab0(tabDariHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
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

  if (me === undefined) return <span className="skeleton" style={{ height: 420 }} />;
  if (!asisten) return <ErrorView code={me ? 403 : 401} lang={lang} role={me?.role ?? null} />;

  const bolehLms = hakPenuh({ tier: me.tier ?? "asisten", badges: me.badges ?? [] });
  const tabs: { v: Tab; label: string; n?: number }[] = [
    { v: "tp", label: sm ? t.tpShort : t.tabTp, n: poll.data?.hitung.perluNilaiku || undefined },
    { v: "soal", label: sm ? t.tabSoalSm : t.tabSoal },
    { v: "praktikum", label: t.tabPraktikum },
  ];
  if (bolehLms) tabs.push({ v: "lms", label: sm ? t.tabLmsSm : t.tabLms });
  // Phase 14: the SeeLabs robot's own source tab, for the same people.
  if (bolehLms) tabs.push({ v: "seelabs", label: sm ? "SeeLabs" : RB[lang].srcTitle });
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
          <span className="hint">{t.lede}</span>
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
            refresh={poll.refresh}
            onOpen={buka}
            onLms={() => setTab("lms")}
          />
        ) : shown === "soal" ? (
          <SoalTab lang={lang} modul={modul ?? 1} setModul={setModul} />
        ) : shown === "praktikum" ? (
          <PraktikumTab lang={lang} />
        ) : shown === "lms" ? (
          <LmsTab lang={lang} />
        ) : (
          <SumberSeelabs lang={lang} />
        )}
      </Fade>
    </div>
  );
}

function semesterKini(): string {
  const d = new Date(Date.now() + 7 * 3_600_000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return m >= 8 ? `${y}-ganjil` : m === 1 ? `${y - 1}-ganjil` : `${y}-genap`;
}
