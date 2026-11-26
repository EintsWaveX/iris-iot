/**
 * The reader's display choices (Phase 9 Tampilan panel), kept in
 * localStorage so they work signed out and apply before the first paint
 * (public/theme-init.js reads the same keys):
 *
 *   iris-theme      dark | light | system | matahari   (dark by default; matahari follows the sun over the lab)
 *   iris-langit     "" | senja | fajar   Gelap held at dusk, or Terang held at dawn ("" = Malam / Siang)
 *   iris-detail     auto | ldm | normal | hd   (auto by default; cosmos-router.js owns it)
 *   iris-auto-ldm   a time: the speed watcher demoted Otomatis to Low Detail then (14 days)
 *   iris-zh-weight  700 | 500               Mandarin headings only
 *   iris-clock      auto | on | off         the clock in the navigation
 *   iris-keys       on | off                keyboard shortcuts (the "?" sheet)
 *   iris-keyhints   on | off                shortcut keys shown on buttons (off)
 *   iris-sound      on | off                sound, for now the envelope's chime (on)
 *   iris-bg-blur    0 to 100                how much the painted background blurs while signed in (60)
 *
 * A change fires "iris-prefs" on window so open islands follow along.
 */
import { useEffect, useState } from "react";

export type ThemePref = "dark" | "light" | "system" | "matahari";
/** The sky inside a theme: Gelap is Malam or Senja, Terang is Siang or Fajar (iris-langit). "" = the plain sky. */
export type LangitPref = "" | "senja" | "fajar";
/** What the reader chose. Otomatis resolves to the level in force: Normal, or Low Detail on a weak or slow device. */
export type DetailPref = "auto" | "ldm" | "normal" | "hd";
export type DetailLevel = "ldm" | "normal" | "hd";
export type ClockPref = "auto" | "on" | "off";
export type ZhWeight = "700" | "500";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice still applies to this page */
  }
  window.IrisPrefs?.apply();
  window.dispatchEvent(new Event("iris-prefs"));
}

/** The painted background's blur while signed in, in percent. 60 unless the reader chose otherwise. */
export const BG_BLUR_DEFAULT = 60;

export function parseBgBlur(v: string | null): number {
  if (v === null || v.trim() === "") return BG_BLUR_DEFAULT;
  const n = Number(v);
  if (!Number.isFinite(n)) return BG_BLUR_DEFAULT;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export interface Prefs {
  theme: ThemePref;
  langit: LangitPref;
  bgBlur: number;
  /** The choice, which can be Otomatis */
  detail: DetailPref;
  /** The level in force (what Otomatis resolved to, if that is the choice) */
  level: DetailLevel;
  clock: ClockPref;
  zhWeight: ZhWeight;
  sound: boolean;
}

export function readPrefs(): Prefs {
  const theme = read("iris-theme");
  const detail = window.CosmosRouter?.getChoice() ?? read("iris-detail");
  const level = window.CosmosRouter?.getDetail() ?? document.documentElement.dataset.detail;
  const clock = read("iris-clock");
  return {
    theme: theme === "light" || theme === "system" || theme === "matahari" ? theme : "dark",
    langit: ((v) => (v === "senja" || v === "fajar" ? v : ""))(read("iris-langit")),
    detail: detail === "ldm" || detail === "normal" || detail === "hd" ? detail : "auto",
    level: level === "ldm" || level === "hd" ? level : "normal",
    clock: clock === "on" || clock === "off" ? clock : "auto",
    zhWeight: read("iris-zh-weight") === "500" ? "500" : "700",
    sound: read("iris-sound") !== "off",
    bgBlur: parseBgBlur(read("iris-bg-blur")),
  };
}

export const setTheme = (v: ThemePref) => write("iris-theme", v);
export const setLangit = (v: LangitPref) => write("iris-langit", v);
export const setShortcuts = (on: boolean) => write("iris-keys", on ? "on" : "off");

/** Keyboard shortcuts are on unless the reader turned them off. */
export function shortcutsOn(): boolean {
  return read("iris-keys") !== "off";
}
export const setKeyHints = (on: boolean) => write("iris-keyhints", on ? "on" : "off");

/** Shortcut keys on buttons (`data-key`) are hidden unless asked for. */
export function keyHintsOn(): boolean {
  return read("iris-keyhints") === "on";
}
export const setSound = (on: boolean) => write("iris-sound", on ? "on" : "off");

/** Sound is on unless the reader turned it off (the envelope's speaker button writes the same key). */
export function soundOn(): boolean {
  return read("iris-sound") !== "off";
}
export const setBgBlur = (n: number) => write("iris-bg-blur", String(parseBgBlur(String(n))));
export const setClock = (v: ClockPref) => write("iris-clock", v);
export const setZhWeight = (v: ZhWeight) => write("iris-zh-weight", v);
export function setDetail(v: DetailPref) {
  if (window.CosmosRouter) window.CosmosRouter.setDetail(v);
  else write("iris-detail", v);
  window.dispatchEvent(new Event("iris-prefs"));
}

/** The current choices, re-read whenever any of them changes. */
export function usePrefs(): Prefs {
  const [p, setP] = useState<Prefs>({
    theme: "dark",
    langit: "",
    detail: "auto",
    level: "normal",
    clock: "auto",
    zhWeight: "700",
    sound: true,
    bgBlur: BG_BLUR_DEFAULT,
  });
  useEffect(() => {
    const on = () => setP(readPrefs());
    on();
    window.addEventListener("iris-prefs", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("iris-prefs", on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return p;
}
