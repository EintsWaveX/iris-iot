/**
 * /lms (Phase 15, Beta): IRIS runs the Telkom LMS's practicum classes from
 * one menu. Eight tabs across the whole width (four by two on phones):
 * Ringkasan, Kelas, Tugas, Nilai, Pengumuman, Kalender, Isi Kelas and
 * Sambungan, which is Penilaian's old Sumber LMS. The tab is in the hash
 * (#kelas … #sambung). Every Asisten reads; the Pencipta, Admins and the
 * ASO division change things (the API refuses anyone else). Isi Kelas shows
 * only to the lms right and Sambungan only to the full right.
 */
import { useEffect, useState } from "react";
import Fade from "../ui/Fade";
import TabLine from "../ui/TabLine";
import ErrorView from "../ui/ErrorView";
import Pill from "../ui/Pill";
import { useMe } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { LS } from "./lmsStrings";
import RingkasTab from "./RingkasTab";
import KelasTab from "./KelasTab";
import TugasTab from "./TugasTab";
import NilaiTab from "./NilaiTab";
import UmumTab from "./UmumTab";
import KalenderTab from "./KalenderTab";
import IsiTab from "./IsiTab";
import LmsTab from "../grading/LmsTab";
import "../tp/tp.css";
import "../console/seelabs/robot.css";
import "./lms.css";
import { EyeIcon } from "@phosphor-icons/react";

export type TabLms =
  "ringkas" | "kelas" | "tugas" | "nilai" | "umum" | "kalender" | "isi" | "sambung";
const TABS: TabLms[] = ["ringkas", "kelas", "tugas", "nilai", "umum", "kalender", "isi", "sambung"];

function tabDariHash(): TabLms {
  const h0 = typeof location === "undefined" ? "" : location.hash.replace(/^#/, "");
  // Materials became Isi Kelas (Phase 16): old links still land there.
  const h = h0 === "materi" ? "isi" : h0;
  return (TABS as string[]).includes(h) ? (h as TabLms) : "ringkas";
}

function modulDariUrl(): number | null {
  if (typeof location === "undefined") return null;
  const m = Number(new URLSearchParams(location.search).get("kelola"));
  return Number.isInteger(m) && m >= 1 && m <= 4 ? m : null;
}

/** The read-only note for Asisten who may look but not change. */
export function BacaSaja({ lang, boleh }: { lang: Lang; boleh: boolean | undefined }) {
  if (boleh !== false) return null;
  return (
    <div className="banner">
      <EyeIcon size={20} aria-hidden="true" />
      <span>{LS[lang].bacaSaja}</span>
    </div>
  );
}

export default function LmsPage({ lang }: { lang: Lang }) {
  const t = LS[lang];
  const me = useMe();
  const [tab, setTab0] = useState<TabLms>(tabDariHash);
  // Penilaian's TP banner opens a module's assignments here (?kelola=N).
  const [kelolaAwal, setKelolaAwal] = useState<number | null>(modulDariUrl);
  useEffect(() => {
    const on = () => setTab0(tabDariHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const setTab = (v: TabLms) => {
    setTab0(v);
    const u = new URL(location.href);
    u.searchParams.delete("kelola");
    u.hash = v === "ringkas" ? "" : v;
    history.replaceState(history.state, "", u.pathname + u.search + u.hash);
  };

  if (me === undefined) return <span className="skeleton" style={{ height: 420 }} />;
  if (me?.role !== "asisten")
    return <ErrorView code={me ? 403 : 401} lang={lang} role={me?.role ?? null} />;

  const ada = TABS.filter(
    (v) => (v !== "isi" || me.hak?.lms === true) && (v !== "sambung" || me.hak?.full === true),
  );
  const shown: TabLms = ada.includes(tab) ? tab : "ringkas";
  const ke = (v: TabLms) => setTab(v);
  return (
    <div className="lms">
      <header className="page-header">
        <div className="page-header__row">
          <div className="page-header__heading">
            <span className="page-header__eyebrow">{t.lede}</span>
            <h1 className="page-header__title lms__title">
              {t.judul}
              <Pill tone="warn" className="beta-badge">
                Beta
              </Pill>
            </h1>
          </div>
        </div>
      </header>
      <div className="banner banner--warn lms__beta">
        <span className="stack stack--sm">
          <b>{t.betaH}</b>
          <span>{t.betaBody}</span>
        </span>
      </div>
      <TabLine
        className="lms-tabs"
        value={shown}
        onChange={setTab}
        label={t.bagian}
        tabs={ada.map((v) => ({ v, label: t.tab[v] }))}
      />
      <Fade k={shown}>
        {shown === "ringkas" ? (
          <RingkasTab lang={lang} ke={ke} />
        ) : shown === "kelas" ? (
          <KelasTab lang={lang} ke={ke} />
        ) : shown === "tugas" ? (
          <TugasTab lang={lang} ke={ke} />
        ) : shown === "nilai" ? (
          <NilaiTab lang={lang} ke={ke} />
        ) : shown === "umum" ? (
          <UmumTab lang={lang} ke={ke} />
        ) : shown === "kalender" ? (
          <KalenderTab lang={lang} ke={ke} />
        ) : shown === "isi" ? (
          <IsiTab lang={lang} ke={ke} />
        ) : (
          <LmsTab lang={lang} kelolaAwal={kelolaAwal} onKelolaDibuka={() => setKelolaAwal(null)} />
        )}
      </Fade>
    </div>
  );
}
