/**
 * The Praktikan's account (Phase 9 Stage 7g, mockup p-account): name, NIM
 * and group, then the Display panel (theme, background detail, language)
 * and the practicums they have done, each opening its History, and Sign
 * Out. No password: Praktikan sign in with their NIM only.
 */
import type { CSSProperties } from "react";
import { ArrowRightIcon, SignOutIcon } from "@phosphor-icons/react";
import BackButton from "../ui/BackButton";
import Pill from "../ui/Pill";
import DisplayPanel from "../shell/DisplayPanel";
import {
  getJson,
  href,
  KELOMPOK_NAMA,
  MODUL_NAMA,
  meChanged,
  postJson,
  dict,
  type Me,
} from "../../lib/app";
import { saveLangPref, usePoll } from "../../lib/hooks";
import { pathForLang, type Lang } from "../../lib/kelas";
import { kelompokLabel, modulLabel } from "../../lib/labels";

const T = dict({
  id: {
    back: "Kembali ke Dasbor",
    eyebrow: "Akun",
    display: "Tampilan",
    prak: "Praktikummu",
    none: "Praktikum yang kamu ikuti akan muncul di sini.",
    open: (m: string) => `Buka riwayat ${m}`,
    out: "Keluar",
  },
  en: {
    back: "Back to the Dashboard",
    eyebrow: "Account",
    display: "Display",
    prak: "Your Practicums",
    none: "The practicums you join show up here.",
    open: (m: string) => `Open the ${m} history`,
    out: "Sign Out",
  },
  zh: {
    back: "回到仪表盘",
    eyebrow: "账号",
    display: "显示",
    prak: "你的实验",
    none: "你参加的实验会显示在这里。",
    open: (m: string) => `打开${m}的记录`,
    out: "退出登录",
  },
});

interface Praktikum {
  sesiId: number;
  modul: number;
  status: string;
}

export default function PraktikanAccount({ lang, me }: { lang: Lang; me: Me }) {
  const t = T[lang];
  const poll = usePoll(
    () => getJson<{ ok: boolean; praktikum: Praktikum[] }>("/api/session/mine"),
    120_000,
    true,
    ["sesi", "nilai", "jurnal"],
  );
  const list = poll.data?.ok ? poll.data.praktikum : null;
  const modul = list ? [...new Set(list.map((p) => p.modul))].sort() : [];
  const k = me.kelompok ?? 0;

  function switchLang(to: Lang) {
    if (to === lang) return;
    saveLangPref(to);
    location.assign(pathForLang(location.pathname, to));
  }

  async function keluar() {
    try {
      await postJson("/api/auth/logout");
    } finally {
      meChanged();
      location.assign(href(lang, "/"));
    }
  }

  return (
    <div className="stack stack--lg pacct">
      <BackButton lang={lang} href={href(lang, "/dashboard")} label={t.back} />
      <header className="page-header">
        <span className="page-header__eyebrow">{t.eyebrow}</span>
        <h1 className="page-header__title">{me.nama}</h1>
        <span className="row">
          <Pill mono>{me.nim}</Pill>
          {k > 0 && (
            <Pill group={k}>
              {kelompokLabel(k, lang)}
              {KELOMPOK_NAMA[k] ? ` · ${KELOMPOK_NAMA[k]}` : ""}
            </Pill>
          )}
        </span>
      </header>
      <div className="pacct__grid">
        <section className="panel">
          <h2 className="panel__title">{t.display}</h2>
          <DisplayPanel lang={lang} onLang={switchLang} />
        </section>
        <section className="panel">
          <h2 className="panel__title">{t.prak}</h2>
          {list === null ? (
            <span className="skeleton" style={{ height: 120 }} />
          ) : modul.length === 0 ? (
            <p className="hint">{t.none}</p>
          ) : (
            <div className="stack stack--sm">
              {modul.map((m) => (
                <div
                  className="pracrow"
                  key={m}
                  style={{ "--m": `var(--mod-${m})` } as CSSProperties}
                >
                  <Pill modul={m}>{modulLabel(m, lang)}</Pill>
                  <span className="grow">{MODUL_NAMA[m]}</span>
                  <a
                    className="iconbtn iconbtn--sm"
                    href={href(lang, `/modules/${m}`)}
                    aria-label={t.open(modulLabel(m, lang))}
                  >
                    <ArrowRightIcon size={18} aria-hidden="true" />
                  </a>
                </div>
              ))}
            </div>
          )}
          {/* Full width, right under the practicum list (mockup p-account). */}
          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={() => void keluar()}
          >
            <SignOutIcon size={18} aria-hidden="true" />
            {t.out}
          </button>
        </section>
      </div>
    </div>
  );
}
