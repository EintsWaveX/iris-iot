/**
 * What the server measures about itself (real-time upgrade, Phase 0): per route how many requests, how many
 * failed, how long they took (a histogram, so p50/p95/p99 survive without keeping every sample), and how
 * many database queries each one ran and how long those took. Plus the event-loop delay of the process and
 * the open sockets of every live hub that registers itself.
 *
 * It is all in memory and cheap enough to stay on. The numbers are read through `/api/sehat?metrik=1` with
 * the header `x-metrik: <IRIS_METRIK_TOKEN>`; without that env var the endpoint stays closed, so route names
 * and timings are never public.
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { timingSafeEqual } from "node:crypto";
import type { Lingkup } from "../src/lib/lingkup-query.js";

/** Upper edges of the latency buckets, ms. A request lands in the first bucket it fits. */
export const TEPI_MS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, Infinity] as const;

/** Most routes kept apart; anything past this is counted under "lain", so a scan of random paths cannot grow memory. */
export const RUTE_MAKS = 400;

export { catatQuery, dalamLingkup, type Lingkup } from "../src/lib/lingkup-query.js";

export interface Entri {
  n: number;
  galat: number;
  jumlahMs: number;
  maks: number;
  tepi: number[];
  dbN: number;
  dbMs: number;
}

const rute = new Map<string, Entri>();
let sejak = Date.now();
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();

const soket = new Map<string, () => number>();

/** A hub registers how to count its open sockets, shown in /api/sehat. */
export function daftarkanSoket(nama: string, hitung: () => number): void {
  soket.set(nama, hitung);
}

export function jumlahSoket(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [nama, hitung] of soket) {
    try {
      out[nama] = hitung();
    } catch {
      out[nama] = -1;
    }
  }
  return out;
}

/** The event-loop delay seen since the last reset, ms. */
export function jedaLoop(): { p50: number; p99: number; maks: number } {
  const ms = (ns: number) => Math.round(ns / 1e4) / 100;
  return { p50: ms(loop.percentile(50)), p99: ms(loop.percentile(99)), maks: ms(loop.max) };
}

/** `GET /api/session/42?aksi=now` → `GET /api/session/:n?aksi=now`. Ids and numbers collapse, queries never leak. */
export function kunciRute(metode: string, url: string): string {
  const [jalur = "", kueri = ""] = url.split("?");
  if (jalur !== "/api" && !jalur.startsWith("/api/")) {
    return jalur.startsWith("/f/") ? `${metode} /f/:id` : `${metode} halaman`;
  }
  const bersih = jalur
    .replace(/\/\d+(?=\/|$)/g, "/:n")
    .replace(/\/[A-Za-z0-9_-]{22}(?=\/|$)/g, "/:id");
  const aksi = new URLSearchParams(kueri).get("aksi");
  return `${metode} ${bersih}${aksi ? `?aksi=${aksi.slice(0, 40).replace(/[^A-Za-z0-9_:-]/g, "")}` : ""}`;
}

function entriBaru(): Entri {
  return { n: 0, galat: 0, jumlahMs: 0, maks: 0, tepi: TEPI_MS.map(() => 0), dbN: 0, dbMs: 0 };
}

/** Records one finished request. */
export function catat(kunci: string, status: number, ms: number, lingkup: Lingkup): void {
  let e = rute.get(kunci);
  if (!e) {
    if (rute.size >= RUTE_MAKS) {
      kunci = "lain";
      e = rute.get(kunci);
    }
    if (!e) {
      e = entriBaru();
      rute.set(kunci, e);
    }
  }
  e.n += 1;
  if (status >= 500) e.galat += 1;
  e.jumlahMs += ms;
  if (ms > e.maks) e.maks = ms;
  const i = TEPI_MS.findIndex((t) => ms <= t);
  e.tepi[i] += 1;
  e.dbN += lingkup.n;
  e.dbMs += lingkup.ms;
}

/** The latency below which `p` of the requests fell, read from the histogram (the bucket's upper edge). */
export function persentil(tepi: readonly number[], p: number): number {
  const total = tepi.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  const target = Math.ceil((p / 100) * total);
  let kumulatif = 0;
  for (let i = 0; i < tepi.length; i++) {
    kumulatif += tepi[i];
    if (kumulatif >= target) return Number.isFinite(TEPI_MS[i]) ? TEPI_MS[i] : -1;
  }
  return -1;
}

const bulat = (x: number) => Math.round(x * 10) / 10;

/** What one process measured, as plain data (several workers send theirs to be merged, server/klaster). */
export interface Mentah {
  sejakDetik: number;
  jedaLoopMs: { p50: number; p99: number; maks: number };
  soket: Record<string, number>;
  rute: Array<[string, Entri]>;
}

export function mentah(): Mentah {
  return {
    sejakDetik: Math.round((Date.now() - sejak) / 1000),
    jedaLoopMs: jedaLoop(),
    soket: jumlahSoket(),
    rute: [...rute.entries()].map(([k, e]) => [k, { ...e, tepi: [...e.tepi] }]),
  };
}

/** The routes that took the most time in total first; `-1` as a percentile means "over 5 s". Several processes' numbers add up. */
export function ringkasDari(daftar: readonly Mentah[], teratas = 60) {
  const gabung = new Map<string, Entri>();
  const soketJumlah: Record<string, number> = {};
  let loopGabung = { p50: 0, p99: 0, maks: 0 };
  let tertua = 0;
  for (const m of daftar) {
    tertua = Math.max(tertua, m.sejakDetik);
    loopGabung = {
      p50: Math.max(loopGabung.p50, m.jedaLoopMs.p50),
      p99: Math.max(loopGabung.p99, m.jedaLoopMs.p99),
      maks: Math.max(loopGabung.maks, m.jedaLoopMs.maks),
    };
    for (const [nama, n] of Object.entries(m.soket))
      soketJumlah[nama] = (soketJumlah[nama] ?? 0) + n;
    for (const [k, e] of m.rute) {
      const g = gabung.get(k) ?? entriBaru();
      g.n += e.n;
      g.galat += e.galat;
      g.jumlahMs += e.jumlahMs;
      g.maks = Math.max(g.maks, e.maks);
      g.dbN += e.dbN;
      g.dbMs += e.dbMs;
      e.tepi.forEach((v, i) => (g.tepi[i] += v));
      gabung.set(k, g);
    }
  }
  const baris = [...gabung.entries()].map(([k, e]) => ({
    rute: k,
    n: e.n,
    galat: e.galat,
    p50: persentil(e.tepi, 50),
    p95: persentil(e.tepi, 95),
    p99: persentil(e.tepi, 99),
    maks: bulat(e.maks),
    rataMs: bulat(e.jumlahMs / e.n),
    totalMs: Math.round(e.jumlahMs),
    queryRata: bulat(e.dbN / e.n),
    dbMsRata: bulat(e.dbMs / e.n),
  }));
  baris.sort((a, b) => b.totalMs - a.totalMs);
  return {
    sejakDetik: tertua,
    jedaLoopMs: loopGabung,
    soket: soketJumlah,
    rute: baris.slice(0, teratas),
    ruteTotal: baris.length,
  };
}

/** This process's routes, the most expensive first. */
export function ringkas(teratas = 60) {
  return ringkasDari([mentah()], teratas);
}

/** Clears the counters (a fresh window for a load test). */
export function ulang(): void {
  rute.clear();
  loop.reset();
  sejak = Date.now();
}

/** True when `token` is the configured metrics token. Closed (false) when none is configured. */
export function bolehLihat(
  token: string | undefined,
  dikonfigurasi = process.env.IRIS_METRIK_TOKEN,
): boolean {
  if (!dikonfigurasi || dikonfigurasi.length < 16 || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(dikonfigurasi);
  return a.length === b.length && timingSafeEqual(a, b);
}
