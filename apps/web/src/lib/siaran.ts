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

export type Topik =
  | "akses"
  | "brief"
  | "jadwal"
  | "roster"
  | "tim"
  | "sesi"
  | "nilai"
  | "laporan"
  | "bayar"
  | "umpan"
  | "presentasi"
  | "server"
  | "jurnal"
  | "online"
  | "kode"
  | "tot";

type Fn = () => void;

const PING_MS = 20_000;
const PONG_MS = 8_000;
const FALLBACK_MS = 30_000;
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
  // The timer refetch runs only while there is no live socket.
  if (s === "putus" && !cadangan) {
    cadangan = setInterval(() => {
      if (!document.hidden) jadwalkan("semua");
    }, FALLBACK_MS);
  } else if (s !== "putus" && cadangan) {
    clearInterval(cadangan);
    cadangan = null;
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
      if (Array.isArray(t)) jadwalkan(t.filter((x): x is string => typeof x === "string"));
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

/** React: refetch on the given topics. `fn` may change every render. */
export function useSiaran(topik: readonly Topik[], fn: Fn, enabled = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  const key = topik.join(",");
  useEffect(() => {
    if (!enabled || !key) return;
    return dengar(key.split(",") as Topik[], () => ref.current());
  }, [key, enabled]);
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
