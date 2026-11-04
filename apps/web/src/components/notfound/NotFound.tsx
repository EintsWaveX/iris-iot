/**
 * The 404 page. Vercel serves one 404.html for every missing path, so the
 * language comes from the URL (/en/ is English, /zh/ Mandarin) and the way
 * back is role-aware once /me answers. Phase 9: the shared ErrorView.
 */
import { CaretRightIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import ErrorView from "../ui/ErrorView";
import { href, useMe, dict } from "../../lib/app";
import { useTampil } from "../../lib/proyektor";
import { langOfPath, type Lang } from "../../lib/kelas";
import "./NotFound.css";

const T = dict({
  id: {
    home: "Ke Beranda",
    modules: "Lihat Modul",
    dash: "Ke Dasbor",
    console: "Ke Konsol",
    rec: "Ke Rekrutmen",
  },
  en: {
    home: "Go Home",
    modules: "Browse Modules",
    dash: "Go to Dashboard",
    console: "Go to Console",
    rec: "Back to Recruitment",
  },
  zh: {
    home: "回到首页",
    modules: "浏览模块",
    dash: "前往面板",
    console: "前往控制台",
    rec: "返回招募",
  },
});

export default function NotFound() {
  const [lang, setLang] = useState<Lang>("id");
  // A missing address under /recruitment: the way back is the recruitment page, not the practicum.
  const [oprec, setOprec] = useState(false);
  const me = useTampil(useMe());
  useEffect(() => {
    const l = langOfPath(location.pathname);
    setLang(l);
    setOprec(/^\/(?:(?:en|zh)\/)?recruitment(?:\/|$)/.test(location.pathname));
    if (l !== "id") document.documentElement.lang = l === "zh" ? "zh-Hans" : l;
  }, []);
  const t = T[lang];
  return (
    <div className="nf">
      <ErrorView
        code={404}
        lang={lang}
        role={me?.role ?? null}
        actions={
          <>
            {oprec && (
              <a className="btn btn--primary" href={href(lang, "/recruitment")}>
                {t.rec}
              </a>
            )}
            <a className={oprec ? "btn btn--ghost" : "btn btn--primary"} href={href(lang, "/")}>
              {t.home}
            </a>
            {!oprec && me?.role === "praktikan" && (
              <a className="btn" href={href(lang, "/dashboard")}>
                {t.dash}
              </a>
            )}
            {!oprec && me?.role === "asisten" && (
              <a className="btn" href={href(lang, "/session")}>
                {t.console}
              </a>
            )}
            {!oprec && (
              <a className="btn btn--ghost" href={href(lang, "/modules")}>
                {t.modules}
                <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
              </a>
            )}
          </>
        }
      />
    </div>
  );
}
