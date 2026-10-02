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

export interface Prefs {
  theme: ThemePref;
  detail: DetailPref;
  clock: ClockPref;
  zhWeight: ZhWeight;
}

export function readPrefs(): Prefs {
  const theme = read("iris-theme");
  const detail = window.CosmosRouter?.getDetail() ?? read("iris-detail");
  const clock = read("iris-clock");
  return {
    theme: theme === "light" || theme === "system" ? theme : "dark",
    detail: detail === "normal" || detail === "hd" ? detail : "ldm",
    clock: clock === "on" || clock === "off" ? clock : "auto",
    zhWeight: read("iris-zh-weight") === "500" ? "500" : "700",
  };
}

export const setTheme = (v: ThemePref) => write("iris-theme", v);
export const setShortcuts = (on: boolean) => write("iris-keys", on ? "on" : "off");

/** Keyboard shortcuts are on unless the reader turned them off. */
export function shortcutsOn(): boolean {
  return read("iris-keys") !== "off";
}
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
    detail: "ldm",
    clock: "auto",
    zhWeight: "700",
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
