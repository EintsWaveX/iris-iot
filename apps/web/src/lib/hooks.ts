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
 *
 * A failed call is retried after 2 s, then 4 s, 8 s (never later than the
 * normal interval), so one cold start does not leave a page on its
 * skeleton for a whole 20 s poll. A call still in flight is never doubled.
 */
export function usePoll<T>(fn: () => Promise<T>, ms: number, enabled = true): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [errors, setErrors] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const inFlight = useRef(false);
  const failures = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (retry.current !== null) clearTimeout(retry.current);
    };
  }, []);

  const again = useRef(false);

  const run = useCallback(async () => {
    // A refresh asked for mid-call (say, right after a save) runs once the
    // current call lands, so it never returns data from before the save.
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    again.current = false;
    if (retry.current !== null) clearTimeout(retry.current);
    retry.current = null;
    try {
      const d = await fnRef.current();
      if (!alive.current) return;
      failures.current = 0;
      setData(d);
      setErrors(0);
      setUpdatedAt(Date.now());
    } catch {
      if (!alive.current) return;
      failures.current += 1;
      setErrors((e) => e + 1);
      if (document.visibilityState === "visible") {
        const wait = Math.min(ms, 2000 * 2 ** (failures.current - 1));
        retry.current = setTimeout(() => void run(), wait);
      }
    } finally {
      inFlight.current = false;
      if (again.current && alive.current) void run();
    }
  }, [ms]);

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
      if (retry.current !== null) clearTimeout(retry.current);
      retry.current = null;
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
    const m = document.cookie.match(new RegExp(`(?:^|; )${LANG_PREF_KEY}=(id|en|zh)`));
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

/** Forget the saved choice, so the class type decides again. */
export function clearLangPref(): void {
  try {
    localStorage.removeItem(LANG_PREF_KEY);
  } catch {
    /* ignore */
  }
  document.cookie = `${LANG_PREF_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
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

/** True while the viewport is at least `px` wide. Starts true on both the
 *  server and the first client render (reading the window here made a
 *  narrow screen's first render differ from the server HTML, a hydration
 *  mismatch); the effect below applies the real width right after. */
/** `clientOnly`: the island is mounted with client:only, so the first render
 *  may read the real width. Otherwise it starts `true` to match the server
 *  HTML, and a narrow screen swaps layouts right after hydration. */
export function useMinWidth(px: number, clientOnly = false): boolean {
  const q = `(min-width: ${px}px)`;
  const [ok, setOk] = useState(() =>
    clientOnly && typeof window !== "undefined" ? window.matchMedia(q).matches : true,
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
