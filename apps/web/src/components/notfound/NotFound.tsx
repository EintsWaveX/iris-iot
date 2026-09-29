/**
 * The 404 page (Phase 8): "lost in orbit". Vercel serves one 404.html for
 * every missing path, so the language comes from the URL (/en/... is
 * English) and the way back is role-aware once /me answers.
 */
import { useEffect, useState } from "react";
import { href, useMe } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import "./NotFound.css";

const T = {
  id: {
    eyebrow: "Halaman tidak ditemukan",
    title: "Tersesat di orbit.",
    body: "Alamat ini tidak mengarah ke mana pun. Mungkin tautannya lama, atau ada salah ketik.",
    home: "Ke beranda",
    modules: "Lihat modul",
    dash: "Dasbor",
    console: "Konsol",
  },
  en: {
    eyebrow: "Page not found",
    title: "Lost in orbit.",
    body: "This address does not lead anywhere. The link may be old, or there may be a typo.",
    home: "Go home",
    modules: "Browse modules",
    dash: "Dashboard",
    console: "Console",
  },
};

export default function NotFound() {
  const [lang, setLang] = useState<Lang>("id");
  const me = useMe();
  useEffect(() => {
    if (/^\/en(\/|$)/.test(location.pathname)) {
      setLang("en");
      document.documentElement.lang = "en";
    }
  }, []);
  const t = T[lang];
  return (
    <section className="nf">
      <div className="nf__orbit" aria-hidden="true">
        <span className="nf__digits">404</span>
        <span className="nf__ring" />
        <span className="nf__ring nf__ring--2" />
        <span className="nf__moon" />
      </div>
      <p className="eyebrow eyebrow--accent">{t.eyebrow}</p>
      <h1 className="nf__title">{t.title}</h1>
      <p className="nf__body">{t.body}</p>
      <div className="nf__actions">
        <a className="btn btn--primary btn--lg" href={href(lang, "/")}>
          {t.home}
        </a>
        {me?.role === "praktikan" && (
          <a className="btn btn--ghost btn--lg" href={href(lang, "/dashboard")}>
            {t.dash}
          </a>
        )}
        {me?.role === "asisten" && (
          <a className="btn btn--ghost btn--lg" href={href(lang, "/session")}>
            {t.console}
          </a>
        )}
        <a className="btn btn--ghost btn--lg" href={href(lang, "/modules")}>
          {t.modules}
        </a>
      </div>
    </section>
  );
}
