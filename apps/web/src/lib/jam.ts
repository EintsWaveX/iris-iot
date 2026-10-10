/**
 * The site's clock on the page (Phase 12). Much of what a page shows turns
 * over at a known moment rather than on a write: a session's time runs out,
 * a Pi passes its silence limit, an Asisten goes offline, a request expires.
 * The page already holds those moments as server timestamps, so it arms a
 * timer for each and acts at that instant, with no relay and no timer poll.
 *
 * Server time: every API answer carries a `Date` header (whole seconds).
 * Each answer bounds the gap between the laptop's clock and the server's
 * from both sides; the bounds of many answers narrow it down, so a laptop
 * whose clock is minutes off still fires on time.
 */
import { useEffect, useState } from "react";

// ---------- Server Time ----------
// ---------- Server Time ----------
// ---------- Server Time ----------

/** The gap (server minus laptop, ms) lies between these */
let bawah = -Infinity;
let atas = Infinity;

/** Server minus laptop, in ms (0 until an answer came) */
export function selisihJam(): number {
  if (!Number.isFinite(bawah) || !Number.isFinite(atas)) return 0;
  return Math.round((bawah + atas) / 2);
}

/** Now, by the server's clock */
export function jamServer(): number {
  return Date.now() + selisihJam();
}

/**
 * One answer's `Date` header, with the laptop's time before the request and
 * after the answer. The header is the server's second, floored, taken
 * somewhere between the two.
 */
export function catatJam(tanggal: string | null, kirim: number, terima: number): void {
  const d = tanggal ? Date.parse(tanggal) : NaN;
  if (!Number.isFinite(d) || terima < kirim || terima - kirim > 10_000) return;
  const lo = d - terima;
  const hi = d + 1000 - kirim;
  // A clock that jumped (sleep, a manual change): start over from this one
  if (lo > atas || hi < bawah) {
    bawah = lo;
    atas = hi;
    return;
  }
  bawah = Math.max(bawah, lo);
  atas = Math.min(atas, hi);
}

/** Forget what was measured (tests) */
export function aturUlangJam(): void {
  bawah = -Infinity;
  atas = Infinity;
}

// ---------- Deadlines ----------
// ---------- Deadlines ----------
// ---------- Deadlines ----------

interface Batas {
  /** Server time, ms */
  at: number;
  fn: () => void;
}

const antre = new Set<Batas>();
let pemicu: ReturnType<typeof setTimeout> | null = null;
/** setTimeout tops out near 24.8 days; a long wait is re-armed hourly */
const TUNGGU_MAKS = 3600_000;

function pasang() {
  if (pemicu) clearTimeout(pemicu);
  pemicu = null;
  if (!antre.size) return;
  let awal = Infinity;
  for (const b of antre) awal = Math.min(awal, b.at);
  const tunggu = Math.min(TUNGGU_MAKS, Math.max(0, awal - jamServer()));
  pemicu = setTimeout(jalankan, tunggu);
}

function jalankan() {
  pemicu = null;
  const kini = jamServer();
  for (const b of [...antre]) {
    if (b.at > kini) continue;
    antre.delete(b);
    try {
      b.fn();
    } catch {
      /* one failing doesn't stop the others */
    }
  }
  pasang();
}

/** Runs `fn` once at server time `at` (ms). Returns a cancel. A moment
 *  already past is ignored. */
export function pada(at: number, fn: () => void): () => void {
  if (!Number.isFinite(at) || at <= jamServer()) return () => {};
  const b: Batas = { at, fn };
  antre.add(b);
  pasang();
  return () => {
    antre.delete(b);
    pasang();
  };
}

/** A sleeping laptop's timers fire late; this catches up at once */
export function periksaBatas(): void {
  if (antre.size) jalankan();
}

/** An ISO time, ms number or nothing, as ms (NaN when it isn't one) */
export function keMs(t: string | number | Date | null | undefined): number {
  if (t === null || t === undefined) return NaN;
  if (typeof t === "number") return t;
  return typeof t === "string" ? Date.parse(t) : t.getTime();
}

/**
 * React: whether server time has passed `at`, re-rendering at that very
 * moment (not on the next tick of a timer).
 */
export function useLewat(at: string | number | Date | null | undefined): boolean {
  const ms = keMs(at);
  const [, ulang] = useState(0);
  const lewat = Number.isFinite(ms) && jamServer() >= ms;
  useEffect(() => {
    if (!Number.isFinite(ms) || lewat) return;
    return pada(ms, () => ulang((n) => n + 1));
  }, [ms, lewat]);
  return lewat;
}

/**
 * React: the minutes since midnight in WIB, turning over exactly on the
 * minute (the day strip, start windows).
 */
export function useMenitWib(): number {
  const baca = () => {
    const d = new Date(jamServer() + 7 * 3600_000);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };
  const [m, setM] = useState(baca);
  useEffect(() => {
    let batal = () => {};
    const ikut = () => {
      setM(baca());
      const kini = jamServer();
      batal = pada(kini - (kini % 60_000) + 60_000, ikut);
    };
    ikut();
    return () => batal();
  }, []);
  return m;
}
