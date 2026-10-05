/**
 * Live updates, the page side: one WebSocket per tab to the relay's
 * /siaran room. The API names what changed after every write (topics, see
 * api/_lib/siaran.ts); each view subscribes to the topics of the data it
 * shows and fetches again when one arrives. So a change made on one device
 * shows on every other open page within a second, no refresh.
 *
 * Catching up: when the tab comes back into view, or the socket reconnects
 * after a drop, every subscriber refetches once, since messages sent while
 * away are not replayed.
 */
import { useEffect, useRef } from "react";

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
  | "kode";

type Fn = () => void;

const subs = new Map<Fn, Set<string>>();
let ws: WebSocket | null = null;
let coba = 0;
let ulang: ReturnType<typeof setTimeout> | null = null;
let detak: ReturnType<typeof setInterval> | null = null;
let tertunda = new Set<string>();
let semua = false;
let jeda: ReturnType<typeof setTimeout> | null = null;
let pernahTerhubung = false;

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

function sambung() {
  if (ws || !subs.size || typeof WebSocket === "undefined") return;
  if (document.hidden) return;
  let s: WebSocket;
  try {
    s = new WebSocket(alamat());
  } catch {
    return jadwalUlang();
  }
  ws = s;
  s.onopen = () => {
    coba = 0;
    // Anything sent while this tab wasn't listening: fetch everything once.
    if (pernahTerhubung) jadwalkan("semua");
    pernahTerhubung = true;
    detak = setInterval(() => s.readyState === WebSocket.OPEN && s.send("ping"), 25_000);
  };
  s.onmessage = (e) => {
    if (typeof e.data !== "string" || e.data === "pong") return;
    try {
      const t = (JSON.parse(e.data) as { t?: unknown }).t;
      if (Array.isArray(t)) jadwalkan(t.filter((x): x is string => typeof x === "string"));
    } catch {
      /* not ours */
    }
  };
  s.onclose = () => {
    if (ws === s) ws = null;
    if (detak) clearInterval(detak);
    detak = null;
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
  if (detak) clearInterval(detak);
  detak = null;
  s?.close();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    // Back in view: catch up, and reconnect if the socket went away.
    if (subs.size) jadwalkan("semua");
    coba = 0;
    sambung();
  });
}

/** Calls `fn` whenever one of `topik` changes anywhere. Returns a stop. */
export function dengar(topik: readonly Topik[], fn: Fn): () => void {
  subs.set(fn, new Set(topik));
  sambung();
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
