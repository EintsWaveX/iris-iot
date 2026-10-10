/**
 * Phase 8 shared React hooks: one poll loop, the motion tier, the reader's
 * language, and a min-width media query. Islands use these instead of each
 * re-implementing setInterval, matchMedia and localStorage handling.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LANG_PREF_KEY, isLang, resolveLang, type Kelas, type Lang } from "./kelas.js";
import { dengar, useSiaran, type Topik } from "./siaran.js";

/* ------------------------------------------------------------- usePoll */

export interface PollState<T> {
  data: T | null;
  /** Consecutive failures; the offline banner shows from 2 upward. */
  errors: number;
  /** When the last successful fetch landed (ms since epoch), for "updated N s ago". */
  updatedAt: number | null;
  /** The last failure was a refusal (401/403: signed out, or another account
   *  in this browser now), not a lost connection. IdentityWatch explains
   *  those, so "connection lost" banners stay quiet (2026-10-07). */
  ditolak: boolean;
  refresh: () => void;
  /** Changes the data in place, from a stream message (Phase 12) */
  ubah: (f: (d: T) => T) => void;
}

/**
 * Calls `fn` now and then every `ms` while the tab is visible (hidden tabs
 * stop, like src/scripts/polling.ts), and while `enabled`. A thrown or
 * rejected call counts as an error and keeps the last good data.
 *
 * A failed call is retried after 2 s, then 4 s, 8 s (never later than the
 * normal interval), so one cold start does not leave a page on its
 * skeleton for a whole 20 s poll. A call still in flight is never doubled.
 *
 * `topik`: also fetch at once when another device changes that data
 * (live updates, lib/siaran.ts), instead of waiting for the next tick.
 * `jarak`: at most one such fetch per this many ms (a public view that
 * listens to a busy topic), the last change always fetched.
 */
export function usePoll<T>(
  fn: () => Promise<T>,
  ms: number,
  enabled = true,
  topik: readonly Topik[] = [],
  jarak = 0,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [errors, setErrors] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [ditolak, setDitolak] = useState(false);
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
      setDitolak(false);
      setUpdatedAt(Date.now());
    } catch (e) {
      if (!alive.current) return;
      // getJson throws HttpError("<status>").
      setDitolak(e instanceof Error && (e.message === "401" || e.message === "403"));
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

  useSiaran(topik, () => void run(), enabled, jarak);

  return {
    data,
    errors,
    updatedAt,
    ditolak,
    refresh: () => void run(),
    ubah: (f) => setData((d) => (d === null ? d : f(d))),
  };
}

/* ------------------------------------------------------- usePollBersama */

interface KeadaanPoll<T> {
  data: T | null;
  errors: number;
  updatedAt: number | null;
  ditolak: boolean;
}

interface Bersama<T> {
  keadaan: KeadaanPoll<T>;
  fn: () => Promise<T>;
  /** Each mounted view's listener, and whether it wants the data now */
  pendengar: Map<(k: KeadaanPoll<T>) => void, boolean>;
  timer: ReturnType<typeof setInterval> | null;
  retry: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  again: boolean;
  failures: number;
  lepasTopik: (() => void) | null;
  ms: number;
}

const BERSAMA = new Map<string, Bersama<unknown>>();

function siarkanKeadaan<T>(b: Bersama<T>) {
  for (const f of b.pendengar.keys()) f(b.keadaan);
}

function adaYangMau<T>(b: Bersama<T>): boolean {
  for (const mau of b.pendengar.values()) if (mau) return true;
  return false;
}

async function jalankanBersama<T>(b: Bersama<T>): Promise<void> {
  if (b.inFlight) {
    b.again = true;
    return;
  }
  if (!adaYangMau(b)) return;
  b.inFlight = true;
  b.again = false;
  if (b.retry !== null) clearTimeout(b.retry);
  b.retry = null;
  try {
    const d = await b.fn();
    b.failures = 0;
    b.keadaan = { data: d, errors: 0, updatedAt: Date.now(), ditolak: false };
    siarkanKeadaan(b);
  } catch (e) {
    b.failures += 1;
    b.keadaan = {
      ...b.keadaan,
      errors: b.keadaan.errors + 1,
      ditolak: e instanceof Error && (e.message === "401" || e.message === "403"),
    };
    siarkanKeadaan(b);
    if (document.visibilityState === "visible") {
      const wait = Math.min(b.ms, 2000 * 2 ** (b.failures - 1));
      b.retry = setTimeout(() => void jalankanBersama(b), wait);
    }
  } finally {
    b.inFlight = false;
    if (b.again && b.pendengar.size) void jalankanBersama(b);
  }
}

/** The loop runs while a view wants the data and the tab is visible */
function aturLoop<T>(b: Bersama<T>) {
  const jalan = adaYangMau(b) && document.visibilityState === "visible";
  if (jalan && b.timer === null) b.timer = setInterval(() => void jalankanBersama(b), b.ms);
  if (!jalan && b.timer !== null) {
    clearInterval(b.timer);
    b.timer = null;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    for (const b of BERSAMA.values()) {
      aturLoop(b);
      if (document.visibilityState === "visible") void jalankanBersama(b);
    }
  });
}

/**
 * usePoll for data many views on one page show (who is signed in where,
 * the running session): every view with the same `kunci` shares one fetch,
 * one timer and one topic subscription, so a change costs one request per
 * page, not one per view.
 */
export function usePollBersama<T>(
  kunci: string,
  fn: () => Promise<T>,
  ms: number,
  enabled = true,
  topik: readonly Topik[] = [],
): PollState<T> {
  const b = BERSAMA.get(kunci) as Bersama<T> | undefined;
  const [keadaan, setKeadaan] = useState<KeadaanPoll<T>>(
    () => b?.keadaan ?? { data: null, errors: 0, updatedAt: null, ditolak: false },
  );
  if (b) b.fn = fn;
  const topikKey = topik.join(",");

  useEffect(() => {
    let x = BERSAMA.get(kunci) as Bersama<T> | undefined;
    if (!x) {
      x = {
        keadaan: { data: null, errors: 0, updatedAt: null, ditolak: false },
        fn,
        pendengar: new Map(),
        timer: null,
        retry: null,
        inFlight: false,
        again: false,
        failures: 0,
        lepasTopik: null,
        ms,
      };
      BERSAMA.set(kunci, x as Bersama<unknown>);
    }
    const sb = x;
    const baru = !adaYangMau(sb);
    sb.pendengar.set(setKeadaan, enabled);
    setKeadaan(sb.keadaan);
    if (!sb.lepasTopik && topikKey)
      sb.lepasTopik = dengar(topikKey.split(",") as Topik[], () => void jalankanBersama(sb));
    aturLoop(sb);
    // The first view to want it fetches; the others get what it has.
    if (enabled && (baru || sb.keadaan.updatedAt === null)) void jalankanBersama(sb);
    return () => {
      sb.pendengar.delete(setKeadaan);
      aturLoop(sb);
      if (!sb.pendengar.size) {
        sb.lepasTopik?.();
        if (sb.retry !== null) clearTimeout(sb.retry);
        BERSAMA.delete(kunci);
      }
    };
  }, [kunci, enabled, topikKey, ms]);

  // A view that doesn't want it sees nothing, as with usePoll.
  const kosong = { data: null, errors: 0, updatedAt: null, ditolak: false };
  return {
    ...(enabled ? keadaan : kosong),
    refresh: () => {
      const x = BERSAMA.get(kunci);
      if (x) void jalankanBersama(x);
    },
    ubah: (f) => {
      const x = BERSAMA.get(kunci) as Bersama<T> | undefined;
      if (!x || x.keadaan.data === null) return;
      x.keadaan = { ...x.keadaan, data: f(x.keadaan.data) };
      siarkanKeadaan(x);
    },
  };
}

/** "diperbarui 4 detik lalu" style age in whole seconds, re-rendering each second. */
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
