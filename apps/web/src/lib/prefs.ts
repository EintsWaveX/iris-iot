/**
 * The reader's display choices (Phase 9 Tampilan panel), kept in
 * localStorage so they work signed out and apply before the first paint
 * (public/theme-init.js reads the same keys):
 *
 *   iris-theme      dark | light | system   (dark by default)
 *   iris-detail     ldm | normal | hd       (cosmos-router.js owns it)
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

export type ThemePref = "dark" | "light" | "system";
export type DetailPref = "ldm" | "normal" | "hd";
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
  bgBlur: number;
  detail: DetailPref;
  clock: ClockPref;
  zhWeight: ZhWeight;
  sound: boolean;
}

export function readPrefs(): Prefs {
  const theme = read("iris-theme");
  const detail = window.CosmosRouter?.getDetail() ?? read("iris-detail");
  const clock = read("iris-clock");
  return {
    theme: theme === "light" || theme === "system" ? theme : "dark",
    detail: detail === "ldm" || detail === "hd" ? detail : "normal",
    clock: clock === "on" || clock === "off" ? clock : "auto",
    zhWeight: read("iris-zh-weight") === "500" ? "500" : "700",
    sound: read("iris-sound") !== "off",
    bgBlur: parseBgBlur(read("iris-bg-blur")),
  };
}

export const setTheme = (v: ThemePref) => write("iris-theme", v);
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
    detail: "normal",
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
