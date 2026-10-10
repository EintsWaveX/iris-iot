/**
 * Live updates, the page side: one WebSocket per tab to the relay's
 * /siaran room. The API names what changed after every write (topics, see
 * api/_lib/siaran.ts); each view subscribes to the topics of the data it
 * shows and fetches again when one arrives. So a change made on one device
 * shows on every other open page within a second, no refresh.
 *
 * Catching up: when the tab comes back into view, the socket reconnects
 * after a drop, the network comes back, or the laptop wakes from sleep,
 * every subscriber refetches once, since messages sent while away are not
 * replayed.
 *
 * Staying honest (2026-10-05): a socket can die without closing (Wi-Fi
 * changes, a sleeping laptop, a NAT that forgets it), and the page then
 * shows old data as if it were live. So every ping must be answered within
 * PONG_MS or the socket is dropped and replaced, and while the page has no
 * live socket it refetches everything every FALLBACK_MS and says so
 * (`useSiaranStatus`, shown by shell/LiveNotice).
 */
import { useEffect, useRef, useState } from "react";

import { catatJam, keMs, pada, periksaBatas } from "./jam";
import type { Topik } from "./siaran-topik";

export type { Topik };

type Fn = () => void;

const PING_MS = 20_000;
const PONG_MS = 8_000;
const FALLBACK_MS = 30_000;
const SAFETY_MS = 60_000;
/** A gap this long between 5 s ticks means the tab or laptop slept. */
const TIDUR_MS = 20_000;

const subs = new Map<Fn, Set<string>>();
let ws: WebSocket | null = null;
let terbuka = false;
let coba = 0;
let ulang: ReturnType<typeof setTimeout> | null = null;
let detak: ReturnType<typeof setInterval> | null = null;
let tungguPong: ReturnType<typeof setTimeout> | null = null;
let cadangan: ReturnType<typeof setInterval> | null = null;
let tertunda = new Set<string>();
let semua = false;
let jeda: ReturnType<typeof setTimeout> | null = null;
let pernahTerhubung = false;

/* ------------------------------------------------------------ status */

/** "live": a socket is open and answering. "putus": the page has
 *  subscribers but no live socket (it refetches on a timer meanwhile).
 *  "diam": nothing on this page listens. */
export type StatusSiaran = "live" | "putus" | "diam";
const pemantau = new Set<(s: StatusSiaran) => void>();
let status: StatusSiaran = "diam";

function setStatus(s: StatusSiaran) {
  if (s === status) return;
  status = s;
  // A timer refetch backs the socket up: every FALLBACK_MS while there is
  // no live socket, and a slow SAFETY_MS one while there is, in case a
  // message was lost on the way (2026-10-07).
  if (cadangan) clearInterval(cadangan);
  cadangan = null;
  if (s !== "diam") {
    cadangan = setInterval(
      () => {
        if (!document.hidden) jadwalkan("semua");
      },
      s === "putus" ? FALLBACK_MS : SAFETY_MS,
    );
  }
  for (const f of pemantau) f(s);
}

function hitungStatus() {
  setStatus(!subs.size ? "diam" : terbuka ? "live" : "putus");
}

function alamat(): string {
  const h = location.hostname;
  // The rig runs the relay with `wrangler dev` on :8788.
  if (h === "localhost" || h === "127.0.0.1") return "ws://127.0.0.1:8788/siaran";
  return "wss://iris-konsol.iris-iot-relay.workers.dev/siaran";
}

/** Runs the subscribers of what arrived, once each, after a short pause
 *  so a burst of writes (a roster import, a score table) is one refetch. */
function jadwalkan(topik: string[] | "semua") {
  if (topik === "semua") semua = true;
  else topik.forEach((t) => tertunda.add(t));
  if (jeda) return;
  jeda = setTimeout(() => {
    jeda = null;
    const t = tertunda;
    const all = semua;
    tertunda = new Set();
    semua = false;
    for (const [fn, mine] of subs) {
      if (all || [...mine].some((x) => t.has(x))) {
        try {
          fn();
        } catch {
          /* one view failing doesn't stop the others */
        }
      }
    }
  }, 300);
}

function hentiDetak() {
  if (detak) clearInterval(detak);
  detak = null;
  if (tungguPong) clearTimeout(tungguPong);
  tungguPong = null;
}

/** Sends a ping and drops the socket if nothing comes back in time. */
function ping(s: WebSocket) {
  if (s.readyState !== WebSocket.OPEN || tungguPong) return;
  try {
    s.send("ping");
  } catch {
    return buang(s);
  }
  tungguPong = setTimeout(() => {
    tungguPong = null;
    buang(s);
  }, PONG_MS);
}

/** Gives up on a socket that stopped answering: it may never fire onclose,
 *  so it is forgotten here and a new one is tried. */
function buang(s: WebSocket) {
  if (ws !== s) return;
  ws = null;
  terbuka = false;
  hentiDetak();
  hitungStatus();
  try {
    s.close();
  } catch {
    /* already gone */
  }
  jadwalUlang();
}

function sambung() {
  if (ws || !subs.size || typeof WebSocket === "undefined") return;
  if (document.hidden) return;
  let s: WebSocket;
  try {
    s = new WebSocket(alamat());
  } catch {
    hitungStatus();
    return jadwalUlang();
  }
  ws = s;
  s.onopen = () => {
    if (ws !== s) return;
    coba = 0;
    terbuka = true;
    hitungStatus();
    // Anything sent while this tab wasn't listening: fetch everything once.
    if (pernahTerhubung) jadwalkan("semua");
    pernahTerhubung = true;
    detak = setInterval(() => ping(s), PING_MS);
  };
  s.onmessage = (e) => {
    if (ws !== s) return;
    // Any frame proves the socket is alive.
    if (tungguPong) clearTimeout(tungguPong);
    tungguPong = null;
    if (typeof e.data !== "string" || e.data === "pong") return;
    try {
      const t = (JSON.parse(e.data) as { t?: unknown }).t;
      if (Array.isArray(t)) {
        const ts = t.filter((x): x is string => typeof x === "string");
        if (!sudahDigema(ts)) jadwalkan(ts);
      }
    } catch {
      /* not ours */
    }
  };
  s.onclose = () => {
    if (ws !== s) return;
    ws = null;
    terbuka = false;
    hentiDetak();
    hitungStatus();
    jadwalUlang();
  };
}

function jadwalUlang() {
  if (ulang || !subs.size) return;
  // 1, 2, 4 ... up to 30 seconds between tries.
  const ms = Math.min(30_000, 1000 * 2 ** coba++);
  ulang = setTimeout(() => {
    ulang = null;
    sambung();
  }, ms);
}

function putus() {
  if (ulang) clearTimeout(ulang);
  ulang = null;
  const s = ws;
  ws = null;
  terbuka = false;
  hentiDetak();
  s?.close();
  hitungStatus();
}

/** Catch up now and make sure a live socket exists: reconnect at once if
 *  there is none, and test the one there is. */
function bangun() {
  periksaBatas();
  if (!subs.size) return;
  jadwalkan("semua");
  coba = 0;
  if (ws && terbuka) return ping(ws);
  if (!ws) {
    if (ulang) clearTimeout(ulang);
    ulang = null;
    sambung();
  }
}

/* ------------------------------------------------------------ echo */

/* A write's answer names its topics (`x-siaran`, api/_lib/siaran.ts), so the
 * tab that made it, and this browser's other tabs, refresh at once without
 * waiting on the relay, and still do when the relay is down (2026-10-07).
 * The relay's copy of the same write, arriving a moment later, is then
 * skipped once so the panels don't fetch twice. */
const GEMA_MS = 5000;
const digema = new Map<string, number[]>();

function kunciGema(t: readonly string[]): string {
  return [...new Set(t)].sort().join(",");
}

function catatGema(t: readonly string[]) {
  const k = kunciGema(t);
  digema.set(k, [...(digema.get(k) ?? []), Date.now() + GEMA_MS]);
}

/** True (and forgotten) when this message is the relay's copy of a write
 *  this browser already refreshed for. */
function sudahDigema(t: readonly string[]): boolean {
  const k = kunciGema(t);
  const kini = Date.now();
  const sisa = (digema.get(k) ?? []).filter((x) => x > kini);
  const ada = sisa.length > 0;
  if (ada) sisa.shift();
  if (sisa.length) digema.set(k, sisa);
  else digema.delete(k);
  return ada;
}

function gema(t: string[]) {
  if (!t.length) return;
  catatGema(t);
  jadwalkan(t);
}

if (typeof window !== "undefined" && typeof window.fetch === "function") {
  let kanal: BroadcastChannel | null = null;
  try {
    kanal = new BroadcastChannel("iris-siaran");
    kanal.onmessage = (e) => {
      if (Array.isArray(e.data)) gema(e.data.filter((x): x is string => typeof x === "string"));
    };
  } catch {
    /* no BroadcastChannel: other tabs hear the relay */
  }
  const asli = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const kirim = Date.now();
    const r = await asli(...args);
    // Every same-site answer tells the server's time (lib/jam.ts).
    if (r.url.startsWith(location.origin)) catatJam(r.headers.get("date"), kirim, Date.now());
    const h = r.headers.get("x-siaran");
    if (h) {
      const t = h.split(",").filter((x) => /^[a-z]{2,16}$/.test(x));
      gema(t);
      try {
        kanal?.postMessage(t);
      } catch {
        /* closed */
      }
    }
    return r;
  };
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) bangun();
  });
  window.addEventListener("online", bangun);
  // Restored from the back/forward cache: the page is as old as it looks.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) bangun();
  });
  // A laptop lid closed in a visible tab fires no visibilitychange; a
  // long gap between ticks gives the sleep away.
  let tik = Date.now();
  setInterval(() => {
    const kini = Date.now();
    if (kini - tik > TIDUR_MS && !document.hidden) bangun();
    tik = kini;
  }, 5000);
}

/** Calls `fn` whenever one of `topik` changes anywhere. Returns a stop. */
export function dengar(topik: readonly Topik[], fn: Fn): () => void {
  subs.set(fn, new Set(topik));
  sambung();
  hitungStatus();
  return () => {
    subs.delete(fn);
    if (!subs.size) putus();
  };
}

/** React: refetch on the given topics. `fn` may change every render.
 *  `jarak`: at most one call per this many ms, the last change kept. */
export function useSiaran(topik: readonly Topik[], fn: Fn, enabled = true, jarak = 0): void {
  const ref = useRef(fn);
  ref.current = fn;
  const key = topik.join(",");
  useEffect(() => {
    if (!enabled || !key) return;
    let terakhir = 0;
    let tunda: ReturnType<typeof setTimeout> | null = null;
    const panggil = () => {
      terakhir = Date.now();
      ref.current();
    };
    const lepas = dengar(key.split(",") as Topik[], () => {
      const sisa = terakhir + jarak - Date.now();
      if (sisa <= 0) return panggil();
      if (!tunda)
        tunda = setTimeout(() => {
          tunda = null;
          panggil();
        }, sisa);
    });
    return () => {
      lepas();
      if (tunda) clearTimeout(tunda);
    };
  }, [key, enabled, jarak]);
}

/** React: a number that goes up whenever one of `topik` changes. Put it in
 *  a loading effect's dependencies to fetch again on a change. */
export function useSegar(topik: readonly Topik[], enabled = true): number {
  const [n, setN] = useState(0);
  useSiaran(topik, () => setN((x) => x + 1), enabled);
  return n;
}

/* ------------------------------------------------------------ deadlines */

/* What turns over at a known moment rather than on a write (a session's
 * end, a Pi's silence limit, a request's expiry) is announced on the page
 * itself at that moment, as if the relay had said it (Phase 12). A second
 * of grace lets the server agree when the views ask again. */
const BATAS_TENGGANG_MS = 1000;

/** Runs the subscribers of `topik` at server time `at`. Returns a cancel. */
export function batasPada(at: string | number | Date, topik: readonly Topik[]): () => void {
  const ms = keMs(at);
  if (!Number.isFinite(ms) || !topik.length) return () => {};
  return pada(ms + BATAS_TENGGANG_MS, () => jadwalkan([...topik]));
}

/** React: refetch the views of `topik` when server time reaches `at`. */
export function useBatas(
  at: string | number | Date | null | undefined,
  topik: readonly Topik[],
): void {
  const ms = keMs(at);
  const key = topik.join(",");
  useEffect(() => {
    if (!Number.isFinite(ms) || !key) return;
    return batasPada(ms, key.split(",") as Topik[]);
  }, [ms, key]);
}

/** React: whether this page's live updates are working right now. */
export function useSiaranStatus(): StatusSiaran {
  const [s, setS] = useState<StatusSiaran>(status);
  useEffect(() => {
    setS(status);
    pemantau.add(setS);
    return () => {
      pemantau.delete(setS);
    };
  }, []);
  return s;
}

/** Fetch everything this page shows again, now (the indicator's button). */
export function segarkanSemua(): void {
  bangun();
}
