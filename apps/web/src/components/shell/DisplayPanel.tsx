/**
 * Tampilan (Display): theme, background detail, language, the Mandarin
 * heading weight and the nav clock (Phase 9, the mockup's G1 panel). It is
 * reachable signed out too: a popover from the nav on wide screens, a
 * bottom sheet on phones. Every choice applies in place, so the panel
 * stays open while the reader tries things.
 */
import { CheckIcon, DesktopIcon, MoonIcon, SunHorizonIcon, SunIcon } from "@phosphor-icons/react";
import { dict } from "../../lib/app";
import { ZH_ENABLED, type Lang } from "../../lib/kelas";
import {
  setBgBlur,
  setClock,
  setDetail,
  setSound,
  setTheme,
  setZhWeight,
  usePrefs,
  type ClockPref,
  type DetailPref,
  type ThemePref,
  setLangit,
  type LangitPref,
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
    matahari: "Matahari",
    langit: "Langit",
    malam: "Malam",
    senja: "Senja",
    siang: "Siang",
    fajar: "Fajar",
    matahariNow: (r: string, s: string) =>
      `Langit mengikuti matahari di atas lab (Bandung): fajar sekitar ${r}, senja sekitar ${s}.`,
    detail: "Detail latar",
    detailAuto: "Normal, atau Low Detail kalau perangkatmu terasa berat. Bawaan.",
    autoNow: "Sekarang:",
    ldm: "Latar diam. Paling ringan.",
    normal: "Bintang berkelip, meteor sesekali.",
    hd: "Planet, satelit, komet, aurora.",
    bgBlur: "Blur latar",
    bgBlurHint: "Hanya saat kamu sudah masuk. Bawaannya 60%. Geser ke 0% kalau mau latar jelas.",
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
    sound: "Suara",
    soundOn: "Nyala",
    soundOff: "Mati",
    soundHint: "Bunyi kecil saat amplop dibuka. Hanya jalan setelah kamu sendiri yang membukanya.",
    speed: "Tes kecepatan",
    speedGo: "Mulai tes di halaman ini",
    speedHint:
      "Mengukur FPS halaman ini sekitar 1 menit, lalu menunjukkan efek mana yang paling berat. Halaman dimuat ulang dan tesnya jalan sendiri. Tutup tesnya untuk kembali.",
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
    matahari: "Sun",
    langit: "Sky",
    malam: "Night",
    senja: "Dusk",
    siang: "Day",
    fajar: "Dawn",
    matahariNow: (r: string, s: string) =>
      `The sky follows the sun over the lab (Bandung): dawn around ${r}, dusk around ${s}.`,
    detail: "Background detail",
    detailAuto: "Normal, or Low Detail if your device feels heavy. The default.",
    autoNow: "Right now:",
    ldm: "Still background. Lightest.",
    normal: "Twinkling stars, a meteor now and then.",
    hd: "Planets, a satellite, comets, aurora.",
    bgBlur: "Background blur",
    bgBlurHint:
      "Only while you are signed in. The default is 60%. Slide to 0% for a sharp background.",
    language: "Language",
    langSub: { id: "Indonesian", en: "English", zh: "Mandarin, Simplified. Still in development." },
    clock: "Clock in the navigation",
    auto: "Automatic",
    on: "Always",
    off: "Hide",
    sound: "Sound",
    soundOn: "On",
    soundOff: "Off",
    soundHint: "A small chime when an envelope opens. It only plays after you open it yourself.",
    speed: "Speed test",
    speedGo: "Run the test on this page",
    speedHint:
      "Measures this page's frame rate for about a minute, then shows which effect costs the most. The page reloads and the test starts by itself. Close the test to come back.",
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
    matahari: "日光",
    langit: "天空",
    malam: "夜晚",
    senja: "黄昏",
    siang: "白天",
    fajar: "黎明",
    matahariNow: (r: string, s: string) =>
      `天空跟随实验室（万隆）上空的太阳：约 ${r} 日出，约 ${s} 日落。`,
    detail: "背景细节",
    detailAuto: "普通；如果设备较卡则自动降为低细节。默认。",
    autoNow: "当前：",
    ldm: "静止背景。最轻。",
    normal: "星星闪烁，偶尔有流星。",
    hd: "行星、卫星、彗星、极光。",
    bgBlur: "背景模糊",
    bgBlurHint: "仅在登录后生效。默认 60%。拖到 0% 即为清晰背景。",
    language: "语言",
    langSub: { id: "印尼语", en: "英语", zh: "中文，简体。仍在开发中。" },
    clock: "导航栏时钟",
    auto: "自动",
    on: "总是显示",
    off: "隐藏",
    sound: "声音",
    soundOn: "开",
    soundOff: "关",
    soundHint: "打开信封时的轻柔提示音。只有你自己打开信封时才会响。",
    speed: "速度测试",
    speedGo: "在此页面运行测试",
    speedHint:
      "测量本页约一分钟的帧率，并显示哪种效果最耗资源。页面会重新加载，测试自动开始。关闭测试即可返回。",
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
  ...(ZH_ENABLED ? [{ v: "zh" as Lang, l: "中文" }] : []),
];

export default function DisplayPanel({
  lang,
  onLang,
  speedTest = false,
}: {
  lang: Lang;
  onLang: (to: Lang) => void;
  /** Show the speed-test button (the navigation's panel only: never inside an exam room) */
  speedTest?: boolean;
}) {
  const t = T[lang];
  const p = usePrefs();
  const themes: { v: ThemePref; l: string; Icon: typeof MoonIcon }[] = [
    { v: "dark", l: t.dark, Icon: MoonIcon },
    { v: "light", l: t.light, Icon: SunIcon },
    { v: "system", l: t.system, Icon: DesktopIcon },
    { v: "matahari", l: t.matahari, Icon: SunHorizonIcon },
  ];
  const sunLine = (() => {
    const times = p.theme === "matahari" ? window.IrisPrefs?.sunTimes(Date.now()) : undefined;
    if (!times) return null;
    const hm = (ms: number) =>
      new Date(ms).toLocaleTimeString(lang === "id" ? "id-ID" : lang === "zh" ? "zh-CN" : "en-GB", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
      });
    return t.matahariNow(hm(times.rise), hm(times.set));
  })();
  const levelName = { ldm: "Low Detail", normal: "Normal", hd: "High Detail" }[p.level];
  const details: { v: DetailPref; l: string; tag?: string; d: string }[] = [
    { v: "auto", l: t.auto, d: `${t.detailAuto} ${t.autoNow} ${levelName}.` },
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
        {sunLine && <p className="hint">{sunLine}</p>}
      </div>

      {(p.theme === "dark" || p.theme === "light") && (
        <div className="disp__group">
          <span className="disp__label" id="disp-langit">
            {t.langit}
          </span>
          <div className="seg seg--wide" role="radiogroup" aria-labelledby="disp-langit">
            {(p.theme === "dark"
              ? ([
                  ["", t.malam],
                  ["senja", t.senja],
                ] as const)
              : ([
                  ["", t.siang],
                  ["fajar", t.fajar],
                ] as const)
            ).map(([v, l]) => {
              const on =
                v === "" ? p.langit !== (p.theme === "dark" ? "senja" : "fajar") : p.langit === v;
              return (
                <button
                  key={v || "plain"}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setLangit(v as LangitPref)}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
        <span className="disp__label" id="disp-blur">
          {t.bgBlur}
        </span>
        <div className="disp__range">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={p.bgBlur}
            aria-labelledby="disp-blur"
            aria-valuetext={`${p.bgBlur}%`}
            onChange={(e) => setBgBlur(Number(e.target.value))}
          />
          <output className="mono" htmlFor="disp-blur">
            {p.bgBlur}%
          </output>
        </div>
        <span className="hint">{t.bgBlurHint}</span>
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

      <div className="disp__group">
        <span className="disp__label" id="disp-sound">
          {t.sound}
        </span>
        <div className="seg seg--wide" role="radiogroup" aria-labelledby="disp-sound">
          {([true, false] as const).map((on) => (
            <button
              key={String(on)}
              type="button"
              role="radio"
              aria-checked={p.sound === on}
              onClick={() => setSound(on)}
            >
              {on ? t.soundOn : t.soundOff}
            </button>
          ))}
        </div>
        <span className="hint">{t.soundHint}</span>
      </div>

      {speedTest && (
        <div className="disp__group">
          <span className="disp__label">{t.speed}</span>
          <button
            type="button"
            className="btn"
            onClick={() => window.location.assign(`${window.location.pathname}?perf=auto`)}
          >
            {t.speedGo}
          </button>
          <span className="hint">{t.speedHint}</span>
        </div>
      )}
    </div>
  );
}

/** The current Tampilan choices as a short list, for the Akun pages: what
 *  is set now sits beside the button that changes it (Phase 11). */
export function DisplaySummary({ lang, wide = false }: { lang: Lang; wide?: boolean }) {
  const t = T[lang];
  const p = usePrefs();
  const theme = { dark: t.dark, light: t.light, system: t.system, matahari: t.matahari }[p.theme];
  const names = { ldm: "Low Detail", normal: "Normal", hd: "High Detail" };
  const detail = p.detail === "auto" ? `${t.auto} (${names[p.level]})` : names[p.detail];
  const clock = { auto: t.auto, on: t.on, off: t.off }[p.clock];
  const bahasa = LANGS.find((l) => l.v === lang)?.l ?? lang;
  const rows: [string, string][] = [
    [t.theme, theme],
    [t.detail, detail],
    [t.bgBlur, `${p.bgBlur}%`],
    [t.language, bahasa],
    [t.clock, clock],
    [t.sound, p.sound ? t.soundOn : t.soundOff],
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
