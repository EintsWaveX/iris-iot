/**
 * The Praktikan's account: name, NIM and group, then Praktikummu, one card
 * per module with when they did it, whether the score was sent, their
 * feedback and the way back to its summary and journal. Display settings
 * live in the nav's Tampilan panel; this page links there instead of
 * repeating it. No password: Praktikan sign in with their NIM only.
 */
import { CaretRightIcon, SignOutIcon } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import BackButton from "../ui/BackButton";
import Pill from "../ui/Pill";
import { BUKA_TAMPILAN, DisplaySummary } from "../shell/DisplayPanel";
import {
  getJson,
  href,
  KELOMPOK_NAMA,
  MODUL_NAMA,
  meChanged,
  postJson,
  dict,
  tanggalPanjang,
  type Me,
  useSessionNow,
} from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import { useAliranAtauTopik } from "../../lib/aliran-ruang";
import type { Lang } from "../../lib/kelas";
import { kelompokLabel, modulLabel, slotLabel } from "../../lib/labels";

const T = dict({
  id: {
    back: "Kembali ke Dasbor",
    eyebrow: "Akun",
    prak: "Praktikummu",
    prakSub: "Tiap modul yang kamu ikuti, nilainya setelah dikirim asisten, dan jurnalnya.",
    notYet: "Belum diikuti",
    notYetSub:
      "Modulnya bisa kamu baca sekarang. Jurnalnya terbuka setelah kamu mengikuti sesinya.",
    read: "Baca Modul",
    running: "Sedang berjalan",
    done: "Selesai",
    scoreSent: (n: number) => `Rata rata nilai ${n}`,
    scoreWait: "Nilai belum dikirim asisten",
    fbDone: "Umpan balik terkirim",
    fbAsk: "Beri Umpan Balik",
    summary: "Ringkasan Sesi",
    journal: "Jurnal",
    display: "Tampilan",
    displaySub: "Tema, detail latar, bahasa dan jam di navigasi diatur dari panel Tampilan.",
    displayGo: "Buka Tampilan",
    outSub: "Jawabanmu tetap tersimpan. Kamu bisa masuk lagi dengan NIM.",
    out: "Keluar",
  },
  en: {
    back: "Back to the Dashboard",
    eyebrow: "Account",
    prak: "Your Practicums",
    prakSub: "Each module you did, its score once your assistant sends it, and its journal.",
    notYet: "Not taken yet",
    notYetSub: "You can read the module now. Its journal opens after you attend the session.",
    read: "Read the Module",
    running: "Running now",
    done: "Done",
    scoreSent: (n: number) => `Average score ${n}`,
    scoreWait: "Score not sent yet",
    fbDone: "Feedback sent",
    fbAsk: "Give Feedback",
    summary: "Session Summary",
    journal: "Journal",
    display: "Display",
    displaySub:
      "Theme, background detail, language and the nav clock are set in the Display panel.",
    displayGo: "Open Display",
    outSub: "Your answers stay saved. You can sign in again with your NIM.",
    out: "Sign Out",
  },
  zh: {
    back: "回到仪表盘",
    eyebrow: "账号",
    prak: "你的实验",
    prakSub: "你做过的每个模块、助教发送后的成绩，以及它的实验报告。",
    notYet: "还没参加",
    notYetSub: "现在就可以阅读这个模块。参加那节课之后，实验报告才会打开。",
    read: "阅读模块",
    running: "正在进行",
    done: "已完成",
    scoreSent: (n: number) => `平均成绩 ${n}`,
    scoreWait: "助教还没发送成绩",
    fbDone: "已提交反馈",
    fbAsk: "提交反馈",
    summary: "课堂总结",
    journal: "实验报告",
    display: "显示",
    displaySub: "主题、背景细节、语言和导航栏时钟都在“显示”面板里设置。",
    displayGo: "打开显示设置",
    outSub: "你的答案会保留。可以再用学号登录。",
    out: "退出登录",
  },
});

interface Praktikum {
  sesiId: number;
  modul: number;
  tanggal: string;
  slot: number | null;
  status: string;
  sudahUmpanBalik: boolean;
  terkirim: boolean;
  rataRata: number | null;
}

export default function PraktikanAccount({ lang, me }: { lang: Lang; me: Me }) {
  const t = T[lang];
  const poll = usePoll(
    () => getJson<{ ok: boolean; praktikum: Praktikum[] }>("/api/session/mine"),
    120_000,
    true,
    ["sesi", "nilai", "jurnal", "tangkapan"],
  );
  const sesiNow = useSessionNow();
  useAliranAtauTopik(
    { ruang: "sesi", sesiId: sesiNow.data?.id ?? null },
    ["jawaban"],
    ["jawaban"],
    poll.refresh,
  );
  const list = poll.data?.ok ? poll.data.praktikum : null;
  const k = me.kelompok ?? 0;

  // The latest practicum of each module (a make up session replaces the first)
  const terakhir = (m: number) =>
    (list ?? [])
      .filter((p) => p.modul === m && p.status !== "batal")
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.sesiId - a.sesiId)[0];

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
        <div className="page-header__row">
          <div className="page-header__heading">
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
          </div>
          {/* Signing out here or from the Akun menu: the answers stay saved. */}
          <div className="page-header__actions">
            <button
              type="button"
              className="btn btn--ghost"
              title={t.outSub}
              onClick={() => void keluar()}
            >
              <SignOutIcon size={16} weight="bold" aria-hidden="true" />
              {t.out}
            </button>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">{t.prak}</h2>
          <span className="hint">{t.prakSub}</span>
        </div>
        {list === null ? (
          <span className="skeleton" style={{ height: 200 }} />
        ) : (
          <div className="pacct__mods">
            {[1, 2, 3, 4].map((m) => {
              const p = terakhir(m);
              const style = { "--m": `var(--mod-${m})` } as CSSProperties;
              if (!p)
                return (
                  <article key={m} className="pacct__mod" data-ikut="no" style={style}>
                    <span className="row" style={{ gap: 8 }}>
                      <Pill modul={m}>{modulLabel(m, lang)}</Pill>
                      <Pill>{t.notYet}</Pill>
                    </span>
                    <b className="pacct__name">{MODUL_NAMA[m]}</b>
                    <span className="hint">{t.notYetSub}</span>
                    <span className="pacct__facts" />
                    <span className="pacct__acts">
                      <a className="btn btn--sm btn--ghost" href={href(lang, `/modules/${m}`)}>
                        {t.read}
                        <CaretRightIcon
                          size={16}
                          weight="bold"
                          className="btn__go"
                          aria-hidden="true"
                        />
                      </a>
                    </span>
                  </article>
                );
              const selesai = p.status === "selesai";
              return (
                <article key={m} className="pacct__mod" style={style}>
                  <span className="row" style={{ gap: 8 }}>
                    <Pill modul={m}>{modulLabel(m, lang)}</Pill>
                    <Pill tone={selesai ? "ok" : "accent"}>{selesai ? t.done : t.running}</Pill>
                  </span>
                  <b className="pacct__name">{MODUL_NAMA[m]}</b>
                  <span className="hint">
                    {tanggalPanjang(p.tanggal, lang)}
                    {p.slot ? ` · ${slotLabel(p.slot, lang)}` : ""}
                  </span>
                  <span className="pacct__facts">
                    <span data-ok={p.terkirim ? "yes" : undefined}>
                      {p.terkirim && p.rataRata !== null ? t.scoreSent(p.rataRata) : t.scoreWait}
                    </span>
                    {selesai && p.sudahUmpanBalik && <span data-ok="yes">{t.fbDone}</span>}
                  </span>
                  <span className="pacct__acts">
                    {selesai && !p.sudahUmpanBalik && (
                      <a
                        className="btn btn--sm btn--primary"
                        href={`${href(lang, "/dashboard")}?view=feedback&session=${p.sesiId}`}
                      >
                        {t.fbAsk}
                      </a>
                    )}
                    <a
                      className="btn btn--sm"
                      href={`${href(lang, "/dashboard")}?view=summary&session=${p.sesiId}`}
                    >
                      {t.summary}
                    </a>
                    <a className="btn btn--sm btn--ghost" href={href(lang, `/modules/${m}`)}>
                      {t.journal}
                      <CaretRightIcon
                        size={16}
                        weight="bold"
                        className="btn__go"
                        aria-hidden="true"
                      />
                    </a>
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel pacct__display">
        <div className="panel__head">
          <h2 className="panel__title">{t.display}</h2>
          <span className="hint">{t.displaySub}</span>
        </div>
        <DisplaySummary lang={lang} wide />
        <button
          type="button"
          className="btn"
          onClick={() => window.dispatchEvent(new Event(BUKA_TAMPILAN))}
        >
          {t.displayGo}
        </button>
      </section>
    </div>
  );
}
