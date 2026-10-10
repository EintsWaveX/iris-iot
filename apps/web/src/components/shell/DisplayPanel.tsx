/**
 * Tampilan (Display): theme, background detail, language, the Mandarin
 * heading weight and the nav clock (Phase 9, the mockup's G1 panel). It is
 * reachable signed out too: a popover from the nav on wide screens, a
 * bottom sheet on phones. Every choice applies in place, so the panel
 * stays open while the reader tries things.
 */
import { CheckIcon, DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { dict } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import {
  setClock,
  setDetail,
  setTheme,
  setZhWeight,
  usePrefs,
  type ClockPref,
  type DetailPref,
  type ThemePref,
} from "../../lib/prefs";

import BetaBadge from "../ui/BetaBadge";

/** Fired to open the nav's Tampilan panel from anywhere on the page */
export const BUKA_TAMPILAN = "iris:tampilan";

const T = dict({
  id: {
    theme: "Tema",
    dark: "Gelap",
    light: "Terang",
    system: "Sistem",
    detail: "Detail latar",
    ldm: "Latar diam. Paling ringan, bawaan.",
    normal: "Bintang berkelip, meteor sesekali.",
    hd: "Planet, satelit, komet, aurora.",
    language: "Bahasa",
    langSub: {
      id: "Indonesia",
      en: "Inggris",
      zh: "Mandarin, aksara sederhana. Masih dikembangkan.",
    },
    clock: "Jam di navigasi",
    auto: "Otomatis",
    on: "Selalu",
    off: "Sembunyikan",
    clockHint: {
      auto: "Saat sesimu berjalan, jam pindah ke bilah sesi.",
      on: "Jam selalu ada di navigasi, juga saat sesi.",
      off: "Jam hanya tampil di bilah sesi.",
    },
  },
  en: {
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    system: "System",
    detail: "Background detail",
    ldm: "Still background. Lightest, the default.",
    normal: "Twinkling stars, a meteor now and then.",
    hd: "Planets, a satellite, comets, aurora.",
    language: "Language",
    langSub: { id: "Indonesian", en: "English", zh: "Mandarin, Simplified. Still in development." },
    clock: "Clock in the navigation",
    auto: "Automatic",
    on: "Always",
    off: "Hide",
    clockHint: {
      auto: "While your session runs, the clock moves to the session bar.",
      on: "The clock stays in the navigation, also during a session.",
      off: "The clock only shows in the session bar.",
    },
  },
  zh: {
    theme: "主题",
    dark: "深色",
    light: "浅色",
    system: "跟随系统",
    detail: "背景细节",
    ldm: "静止背景。最轻，默认。",
    normal: "星星闪烁，偶尔有流星。",
    hd: "行星、卫星、彗星、极光。",
    language: "语言",
    langSub: { id: "印尼语", en: "英语", zh: "中文，简体。仍在开发中。" },
    clock: "导航栏时钟",
    auto: "自动",
    on: "总是显示",
    off: "隐藏",
    clockHint: {
      auto: "你上课时，时钟会移到上课栏。",
      on: "时钟一直显示在导航栏，上课时也是。",
      off: "时钟只在上课栏显示。",
    },
  },
});

const LANGS: { v: Lang; l: string }[] = [
  { v: "id", l: "Bahasa Indonesia" },
  { v: "en", l: "English" },
  { v: "zh", l: "中文" },
];

export default function DisplayPanel({ lang, onLang }: { lang: Lang; onLang: (to: Lang) => void }) {
  const t = T[lang];
  const p = usePrefs();
  const themes: { v: ThemePref; l: string; Icon: typeof MoonIcon }[] = [
    { v: "dark", l: t.dark, Icon: MoonIcon },
    { v: "light", l: t.light, Icon: SunIcon },
    { v: "system", l: t.system, Icon: DesktopIcon },
  ];
  const details: { v: DetailPref; l: string; tag?: string; d: string }[] = [
    { v: "ldm", l: "Low Detail", tag: "LDM", d: t.ldm },
    { v: "normal", l: "Normal", d: t.normal },
    { v: "hd", l: "High Detail", tag: "HD", d: t.hd },
  ];
  const clocks: { v: ClockPref; l: string }[] = [
    { v: "auto", l: t.auto },
    { v: "on", l: t.on },
    { v: "off", l: t.off },
  ];
  return (
    <div className="disp">
      <div className="disp__group">
        <span className="disp__label" id="disp-theme">
          {t.theme}
        </span>
        <div className="seg seg--wide" role="radiogroup" aria-labelledby="disp-theme">
          {themes.map(({ v, l, Icon }) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={p.theme === v}
              onClick={() => setTheme(v)}
            >
              <Icon size={18} aria-hidden="true" />
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="disp__group">
        <span className="disp__label" id="disp-detail">
          {t.detail}
        </span>
        <div className="disp__opts" role="radiogroup" aria-labelledby="disp-detail">
          {details.map((d) => (
            <button
              key={d.v}
              type="button"
              role="radio"
              className="disp__opt"
              aria-checked={p.detail === d.v}
              onClick={() => setDetail(d.v)}
            >
              <span className="disp__opt-text">
                <b>
                  {d.l}
                  {d.tag && <span className="pill disp__tag">{d.tag}</span>}
                </b>
                <span className="hint">{d.d}</span>
              </span>
              {p.detail === d.v && <CheckIcon size={20} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>

      <div className="disp__group">
        <span className="disp__label" id="disp-lang">
          {t.language}
        </span>
        <div className="disp__opts" role="radiogroup" aria-labelledby="disp-lang">
          {LANGS.map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              className="disp__opt"
              aria-checked={lang === o.v}
              onClick={() => onLang(o.v)}
            >
              <span className="disp__opt-text">
                <b lang={o.v === "zh" ? "zh-Hans" : o.v}>
                  {o.l}
                  {o.v === "zh" && <BetaBadge />}
                </b>
                <span className="hint">{t.langSub[o.v]}</span>
              </span>
              {lang === o.v && <CheckIcon size={20} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>

      {lang === "zh" && (
        <div className="disp__group">
          <span className="disp__label" id="disp-zhw">
            标题粗细
          </span>
          <div className="seg seg--wide" role="radiogroup" aria-labelledby="disp-zhw">
            {(["700", "500"] as const).map((w) => (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={p.zhWeight === w}
                onClick={() => setZhWeight(w)}
              >
                {w === "700" ? "粗 700" : "细 500"}
              </button>
            ))}
          </div>
          <span className="hint">只在中文界面出现。改的是页面标题和卡片标题的字重。</span>
        </div>
      )}

      <div className="disp__group">
        <span className="disp__label" id="disp-clock">
          {t.clock}
        </span>
        <div className="seg seg--wide" role="radiogroup" aria-labelledby="disp-clock">
          {clocks.map((c) => (
            <button
              key={c.v}
              type="button"
              role="radio"
              aria-checked={p.clock === c.v}
              onClick={() => setClock(c.v)}
            >
              {c.l}
            </button>
          ))}
        </div>
        <span className="hint">{t.clockHint[p.clock]}</span>
      </div>
    </div>
  );
}

/** The current Tampilan choices as a short list, for the Akun pages: what
 *  is set now sits beside the button that changes it (Phase 11). */
export function DisplaySummary({ lang, wide = false }: { lang: Lang; wide?: boolean }) {
  const t = T[lang];
  const p = usePrefs();
  const theme = { dark: t.dark, light: t.light, system: t.system }[p.theme];
  const detail = { ldm: "Low Detail", normal: "Normal", hd: "High Detail" }[p.detail];
  const clock = { auto: t.auto, on: t.on, off: t.off }[p.clock];
  const bahasa = LANGS.find((l) => l.v === lang)?.l ?? lang;
  const rows: [string, string][] = [
    [t.theme, theme],
    [t.detail, detail],
    [t.language, bahasa],
    [t.clock, clock],
  ];
  return (
    <dl className={wide ? "dispsum dispsum--wide" : "dispsum"}>
      {rows.map(([k, v]) => (
        <div key={k} className="dispsum__row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
