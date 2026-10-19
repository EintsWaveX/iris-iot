/**
 * /lab-profile (Phase 23): the editor for the Lab Profile on Home, for the
 * "profil" right (ADC, DEV, Admins and whoever an Admin grants it). Three
 * tabs in Home's own order: Divisi, Foto Bersama, Acara. Every text needs
 * ID, EN and ZH before it saves; every save reaches open Homes at once.
 */
import { useEffect, useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import Fade from "../ui/Fade";
import TabLine from "../ui/TabLine";
import ErrorView from "../ui/ErrorView";
import { getJson, href, postJson, useMe } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { useSegar } from "../../lib/siaran";
import type { ProfilData } from "../../lib/profil";
import { E } from "./editorStrings";
import { toast } from "./fields";
import DivisiTab from "./DivisiTab";
import BersamaTab from "./BersamaTab";
import AcaraTab from "./AcaraTab";
import "../home/profil/profil.css";
import "./editor.css";

export type TabProfil = "divisi" | "bersama" | "acara";
const TABS: TabProfil[] = ["divisi", "bersama", "acara"];

function tabDariUrl(): TabProfil {
  if (typeof location === "undefined") return "divisi";
  const v = new URLSearchParams(location.search).get("tab");
  return (TABS as string[]).includes(v ?? "") ? (v as TabProfil) : "divisi";
}

/** A write's answer: { ok } or { ok: false, kode, ... }. */
export interface Hasil {
  ok: boolean;
  kode?: string;
  id?: number;
}

/** Posts one write; says Saved, or a plain failure for anything unexpected. */
export async function tulis(
  lang: Lang,
  aksi: string,
  body: Record<string, unknown>,
  diam = false,
): Promise<Hasil> {
  try {
    const r = await postJson<Hasil>(`/api/profil/${aksi}`, body);
    if (r.ok && !diam) toast(E[lang].tersimpan);
    return r;
  } catch {
    toast(E[lang].gagal, "danger");
    return { ok: false, kode: "jaringan" };
  }
}

export default function ProfilEditor({ lang }: { lang: Lang }) {
  const t = E[lang];
  const me = useMe();
  const [tab, setTab0] = useState<TabProfil>(tabDariUrl);
  const [data, setData] = useState<ProfilData | null | undefined>(undefined);
  const [n, setN] = useState(0);
  const segar = useSegar(["profil"], me?.role === "asisten");
  const boleh = me?.role === "asisten" && me.hak?.profil === true;

  useEffect(() => {
    if (!boleh) return;
    let hidup = true;
    getJson<ProfilData>(`/api/profil/baca?v=${Date.now()}`)
      .then((d) => hidup && setData(d.ok ? d : null))
      .catch(() => hidup && setData((x) => x ?? null));
    return () => {
      hidup = false;
    };
  }, [boleh, segar, n]);

  const setTab = (v: TabProfil) => {
    setTab0(v);
    const u = new URL(location.href);
    u.searchParams.set("tab", v);
    u.searchParams.delete("jenis");
    history.replaceState(history.state, "", u.pathname + u.search);
  };
  const muat = () => setN((x) => x + 1);

  if (me === undefined) return <span className="skeleton" style={{ height: 420 }} />;
  if (!boleh) return <ErrorView code={me ? 403 : 401} lang={lang} role={me?.role ?? null} />;

  return (
    <div className="pl-editor">
      <header className="page-header">
        <div className="page-header__row">
          <div className="page-header__heading">
            <span className="page-header__eyebrow">{t.eyebrow}</span>
            <h1 className="page-header__title">{t.judul}</h1>
            <p className="page-header__subtitle">{t.sub}</p>
          </div>
          <div className="page-header__actions">
            <a className="btn btn--ghost" href={href(lang, "/")}>
              <span className="btn__label">{t.lihat}</span>
              <CaretRightIcon size={16} weight="bold" aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>
      <TabLine
        value={tab}
        onChange={setTab}
        label={t.bagian}
        tabs={TABS.map((v) => ({ v, label: t.tab[v] }))}
      />
      {data === undefined ? (
        <span className="skeleton" style={{ height: 480 }} />
      ) : data === null ? (
        <ErrorView code={500} lang={lang} role="asisten" />
      ) : (
        <Fade k={tab}>
          {tab === "divisi" ? (
            <DivisiTab lang={lang} data={data} muat={muat} />
          ) : tab === "bersama" ? (
            <BersamaTab lang={lang} data={data} muat={muat} />
          ) : (
            <AcaraTab lang={lang} data={data} muat={muat} />
          )}
        </Fade>
      )}
    </div>
  );
}
