/**
 * Phase 8 shared React hooks: one poll loop, the motion tier, the reader's
 * language, and a min-width media query. Islands use these instead of each
 * re-implementing setInterval, matchMedia and localStorage handling.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LANG_PREF_KEY, isLang, resolveLang, type Kelas, type Lang } from "./kelas.js";

/* ------------------------------------------------------------- usePoll */

export interface PollState<T> {
  data: T | null;
  /** Consecutive failures; the offline banner shows from 2 upward. */
  errors: number;
  /** When the last successful fetch landed (ms since epoch), for "updated N s ago". */
  updatedAt: number | null;
  refresh: () => void;
}

/**
 * Calls `fn` now and then every `ms` while the tab is visible (hidden tabs
 * stop, like src/scripts/polling.ts), and while `enabled`. A thrown or
 * rejected call counts as an error and keeps the last good data.
 */
export function usePoll<T>(fn: () => Promise<T>, ms: number, enabled = true): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [errors, setErrors] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    try {
      const d = await fnRef.current();
      setData(d);
      setErrors(0);
      setUpdatedAt(Date.now());
    } catch {
      setErrors((e) => e + 1);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer !== null) return;
      void run();
      timer = setInterval(() => void run(), ms);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ms, enabled, run]);

  return { data, errors, updatedAt, refresh: () => void run() };
}

/** "diperbarui 4 dtk lalu" style age in whole seconds, re-rendering each second. */
export function useAgeSeconds(since: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return since === null ? null : Math.max(0, Math.round((now - since) / 1000));
}

/* ------------------------------------------------------- useMotionTier */

/**
 * The effective motion tier (0 static, 1 CSS motion, 2 full), from the
 * html[data-motion-tier] attribute motion-tier.ts maintains, and 0 whenever
 * the reader asked for reduced motion. New animations run at tier 1 or up.
 */
export function useMotionTier(): 0 | 1 | 2 {
  const read = (): 0 | 1 | 2 => {
    if (typeof document === "undefined") return 1;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return 0;
    const t = Number(document.documentElement.dataset.motionTier ?? "1");
    return t === 0 || t === 2 ? t : 1;
  };
  const [tier, setTier] = useState<0 | 1 | 2>(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setTier(read()));
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion-tier"],
    });
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMq = () => setTier(read());
    mq?.addEventListener?.("change", onMq);
    return () => {
      mo.disconnect();
      mq?.removeEventListener?.("change", onMq);
    };
  }, []);
  return tier;
}

/* ------------------------------------------------------------- useLang */

/** The reader's own saved language choice, if any (localStorage, then cookie). */
export function readLangPref(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_PREF_KEY);
    if (isLang(v)) return v;
  } catch {
    /* storage blocked: fall through to the cookie */
  }
  if (typeof document !== "undefined") {
    const m = document.cookie.match(new RegExp(`(?:^|; )${LANG_PREF_KEY}=(id|en)`));
    if (m && isLang(m[1])) return m[1];
  }
  return null;
}

/** Save the reader's language choice in both places (the cookie lets the
 *  server-rendered redirect honour it on the next visit). */
export function saveLangPref(lang: Lang): void {
  try {
    localStorage.setItem(LANG_PREF_KEY, lang);
  } catch {
    /* ignore */
  }
  document.cookie = `${LANG_PREF_KEY}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/** Page language: the route's own (`/en/...`) wins for rendering; this hook
 *  gives islands the effective choice for anything the route does not fix. */
export function useLang(routeLang: Lang, kelas?: Kelas | null): Lang {
  const [lang, setLang] = useState<Lang>(routeLang);
  useEffect(() => {
    setLang(routeLang ?? resolveLang(readLangPref(), kelas ?? null));
  }, [routeLang, kelas]);
  return lang;
}

/* ---------------------------------------------------------- useMinWidth */

/** True while the viewport is at least `px` wide. */
export function useMinWidth(px: number): boolean {
  const q = `(min-width: ${px}px)`;
  const [ok, setOk] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia(q).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setOk(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return ok;
}
