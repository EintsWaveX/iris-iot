/**
 * /tp (2026-10-21): Kelola TP, taken out of Penilaian so Penilaian holds only
 * scores. Tabs: Buat Soal TP (each module's question bank, its final set and
 * the paper; for the jadwal and kode rights), Pengaturan TP (who counts in
 * TP, the default window, the cross-check) and Pengumuman (notices to
 * Praktikan, 2026-10-21). The tab is in the hash (#soal, #pengumuman,
 * #pengaturan); ?modul= picks Buat Soal TP's module. Penilaian's header opens
 * it, and Penilaian's old #soal, #pengaturan and #lms links land here.
 */
import { useEffect, useState } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import Fade from "../ui/Fade";
import TabLine from "../ui/TabLine";
import ErrorView from "../ui/ErrorView";
import { href, useMe } from "../../lib/app";
import { useMinWidth } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { TPS } from "../tp/tpStrings";
import SoalTab from "./SoalTab";
import PengaturanTab from "./PengaturanTab";
import KabarTab from "./KabarTab";
import { KS } from "./kabarStrings";
import { modulDariUrl, semesterKini } from "./halaman";
import "../tp/tp.css";

type Tab = "soal" | "pengaturan" | "pengumuman";

function tabDariHash(): Tab | null {
  const h = typeof location === "undefined" ? "" : location.hash.replace(/^#/, "");
  return h === "soal" || h === "pengaturan" || h === "pengumuman" ? h : null;
}

export default function KelolaTpPage({ lang }: { lang: Lang }) {
  const t = TPS[lang];
  const me = useMe();
  const asisten = me?.role === "asisten";
  const sm = !useMinWidth(640);
  const [tab, setTab0] = useState<Tab | null>(tabDariHash);
  const [modul, setModul0] = useState<number>(() => modulDariUrl() ?? 1);

  useEffect(() => {
    const on = () => setTab0(tabDariHash());
    on();
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const setTab = (v: Tab) => {
    setTab0(v);
    history.replaceState(history.state, "", `${location.pathname}${location.search}#${v}`);
  };
  const setModul = (m: number) => {
    setModul0(m);
    const u = new URL(location.href);
    u.searchParams.set("modul", String(m));
    history.replaceState(history.state, "", u);
  };

  if (me === undefined) return <span className="skeleton" style={{ height: 420 }} />;
  if (!asisten) return <ErrorView code={me ? 403 : 401} lang={lang} role={me?.role ?? null} />;

  // Buat Soal TP is for the jadwal and kode rights; nobody else sees it.
  const bolehSoal = me.hak?.jadwal === true || me.hak?.kode === true;
  const tabs: { v: Tab; label: string }[] = [
    ...(bolehSoal ? [{ v: "soal" as const, label: sm ? t.tabSoalSm : t.tabSoal }] : []),
    { v: "pengaturan", label: sm ? t.tabPengaturanSm : t.tabPengaturan },
    { v: "pengumuman", label: KS[lang].tab },
  ];
  const shown: Tab = tabs.some((x) => x.v === tab) ? (tab as Tab) : tabs[0].v;

  return (
    <div className="grading">
      <header className="page-header">
        <div className="page-header__row">
          <div className="page-header__heading">
            <span className="page-header__eyebrow">{t.semesterLabel(semesterKini())}</span>
            <h1 className="page-header__title">{t.kelolaTp}</h1>
          </div>
          <div className="page-header__actions">
            <span className="hint">{t.kelolaLede}</span>
            <a className="btn btn--ghost" href={href(lang, `/grading?modul=${modul}`)}>
              <ArrowLeftIcon size={16} weight="bold" aria-hidden="true" />
              {t.penilaian}
            </a>
          </div>
        </div>
      </header>
      {tabs.length > 1 && <TabLine value={shown} onChange={setTab} label={t.bagian} tabs={tabs} />}
      <Fade k={shown}>
        {shown === "soal" ? (
          <SoalTab lang={lang} modul={modul} setModul={setModul} />
        ) : shown === "pengumuman" ? (
          <KabarTab lang={lang} modul={modul} />
        ) : (
          <PengaturanTab lang={lang} />
        )}
      </Fade>
    </div>
  );
}
