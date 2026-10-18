/**
 * Phase 8 client plumbing shared by every island: typed fetch helpers, the
 * signed-in person (/api/auth/me, fetched once per page and shared), the
 * running session banner (/api/session/now, polled), the bilingual string
 * helper, and the module names in both languages.
 */
import { laluLabel } from "./labels.js";
import type { HakKey, HakNilai, PresetPeran, Tier } from "./hak.js";
import { sebagaiPeran } from "./lihat-peran.js";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Kelas, Lang } from "./kelas.js";
import { usePollBersama } from "./hooks.js";
import { dengar, useBatas } from "./siaran.js";
import { akhirSesiPada } from "./jadwal.js";
import { adaBelumSimpan, saatBersih } from "./belum-simpan.js";

/* ------------------------------------------------------------ fetching */

export class HttpError extends Error {}

/** The HTTP codes the shared error view (ui/ErrorView.tsx) knows. */
export type ErrorCode = 400 | 401 | 403 | 404 | 408 | 409 | 413 | 429 | 500 | 503;
const KODE_DIKENAL = new Set([400, 401, 403, 404, 408, 409, 413, 429, 500, 503]);

/** Which error view a failed request deserves: its own status when the view
 *  knows it, 408 when it timed out or the network dropped, else 500. */
export function kodeGalat(e: unknown): ErrorCode {
  if (e instanceof HttpError) {
    const n = Number(e.message);
    return (KODE_DIKENAL.has(n) ? n : 500) as ErrorCode;
  }
  if (e instanceof DOMException && e.name === "AbortError") return 408;
  if (e instanceof TypeError) return 408;
  return 500;
}

/** A request that hangs (a cold function waiting on the database, a dead
 *  Wi-Fi link) fails after this long instead of holding a skeleton or a
 *  spinner on screen forever; pollers then retry. */
const FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T = Record<string, unknown>>(url: string): Promise<T> {
  const r = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new HttpError(`${r.status}`);
  return (await r.json()) as T;
}

export async function postJson<T = Record<string, unknown>>(
  url: string,
  body: unknown = {},
): Promise<T> {
  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new HttpError(`${r.status}`);
  return (await r.json()) as T;
}

/* ------------------------------------------------------------------ me */

export interface Me {
  ok: true;
  role: "asisten" | "praktikan";
  nim: string;
  nama: string;
  kelompok?: number | null;
  kode?: string;
  perluAturSandi?: boolean;
  divisi?: { id: string; en: string };
  /** Asisten only (Phase 9): see lib/hak.ts. */
  tier?: Tier;
  badges?: string[];
  /** The division's code (ASO, ADS, ...); null for the Inti. */
  kodeDivisi?: string | null;
  hak?: Record<HakKey, HakNilai>;
  /** Set while an Admin previews a role (lib/lihat-peran.ts): the rights
   *  above are the preset's, not theirs. */
  lihatPeran?: PresetPeran;
}

let mePromise: Promise<Me | null> | null = null;
export const ME_CHANGED = "iris:me-changed";

export function loadMe(force = false): Promise<Me | null> {
  if (!mePromise || force) {
    mePromise = getJson<{ ok: boolean } & Partial<Me>>("/api/auth/me")
      .then((d) => (d.ok ? sebagaiPeran(d as Me) : null))
      .catch(() => null);
  }
  return mePromise;
}

/** Call after login or logout so every island re-reads who is signed in. */
export function meChanged(): void {
  mePromise = null;
  window.dispatchEvent(new Event(ME_CHANGED));
  // Other tabs share the cookie: tell them now, not at their next 20 s check
  // (2026-10-07: an Asisten tab kept its pages after a Praktikan signed in
  // in another tab of the same laptop).
  try {
    const ch = new BroadcastChannel(AKUN);
    ch.postMessage(TAB);
    ch.close();
  } catch {
    /* no BroadcastChannel: the periodic check still catches it */
  }
}

const AKUN = "iris-akun";
const TAB = Math.random().toString(36).slice(2);

/** Runs `fn` when another tab of this browser signs in or out. */
export function dengarAkunLain(fn: () => void): () => void {
  try {
    const ch = new BroadcastChannel(AKUN);
    ch.onmessage = (e) => e.data !== TAB && fn();
    return () => ch.close();
  } catch {
    return () => {};
  }
}

/* Rights change live (2026-10-07): a `tim` broadcast (an Admin changed
 * someone's rights, tier or badges) reloads /api/auth/me, and every useMe
 * on the page takes the new rights in place. Losing a right while an editor
 * holds unsaved edits waits, with a notice, until they are saved or
 * discarded (lib/belum-simpan.ts), so a tab doesn't vanish mid-edit. */
// A plain table, not dict(): this runs before dict's registry exists.
const HAK_TAHAN: Record<Lang, string> = {
  id: "Hak aksesmu baru saja berubah. Simpan atau buang perubahanmu, lalu halaman ini menyesuaikan.",
  en: "Your access rights just changed. Save or discard your edits, and this page adjusts.",
  zh: "你的访问权限刚刚变更。保存或放弃你的修改后，此页面会随之调整。",
};

let pemakaiHak = 0;
let lepasHak: (() => void) | null = null;
let lepasBersih: (() => void) | null = null;

function terapkanMe(m: Me | null) {
  mePromise = Promise.resolve(m);
  window.dispatchEvent(new Event(ME_CHANGED));
}

/** True when `baru` lost something `lama` had: a right, or the role. */
function hakBerkurang(lama: Me | null, baru: Me | null): boolean {
  if (!lama) return false;
  if (!baru || baru.role !== lama.role || baru.nim !== lama.nim) return true;
  const a = (lama.hak ?? {}) as Record<string, unknown>;
  const b = (baru.hak ?? {}) as Record<string, unknown>;
  return Object.keys(a).some((k) => !!a[k] && b[k] !== a[k]);
}

async function segarkanHak() {
  const lama = await (mePromise ?? Promise.resolve(null));
  let baru: Me | null;
  try {
    const d = await getJson<{ ok: boolean } & Partial<Me>>("/api/auth/me");
    baru = d.ok ? sebagaiPeran(d as Me) : null;
  } catch {
    return; // a lost connection isn't a sign-out; the next change retries
  }
  if (JSON.stringify(baru) === JSON.stringify(lama)) return;
  // A different person or a sign-out is IdentityWatch's to explain.
  if (!baru || baru.nim !== lama?.nim) return;
  if (hakBerkurang(lama, baru) && adaBelumSimpan()) {
    if (!lepasBersih) {
      window.Toast?.show(HAK_TAHAN[pageLang()], "warn");
      lepasBersih = saatBersih(() => {
        lepasBersih?.();
        lepasBersih = null;
        void segarkanHak();
      });
    }
    return;
  }
  terapkanMe(baru);
}

function ikutHak(): () => void {
  if (pemakaiHak++ === 0) lepasHak = dengar(["tim"], () => void segarkanHak());
  return () => {
    if (--pemakaiHak > 0) return;
    lepasHak?.();
    lepasHak = null;
  };
}

/** `undefined` while loading, `null` when signed out. */
export function useMe(): Me | null | undefined {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const run = () =>
      void loadMe().then((m) => {
        if (alive) setMe(m);
      });
    run();
    // meChanged() and a rights change both reset the shared promise first,
    // so every island on the page shares one fetch.
    window.addEventListener(ME_CHANGED, run);
    return () => {
      alive = false;
      window.removeEventListener(ME_CHANGED, run);
    };
  }, []);
  const asisten = me?.role === "asisten";
  useEffect(() => (asisten ? ikutHak() : undefined), [asisten]);
  return me;
}

/* --------------------------------------------------------- session now */

export interface SesiNow {
  /** The session's id (its stream room); absent from older answers */
  id?: number;
  modul: number;
  tanggal: string;
  mulai: string;
  mulaiPada: string | null;
  slot: number | null;
  butuhAp: boolean;
  pengumuman: string | null;
  pengumumanPada: string | null;
  kelas: Kelas;
  /** Phase 9: this session's own length (30 to 150) and group count. */
  durasiMenit?: number;
  jumlahKelompok?: number;
  jenis?: "reguler" | "susulan" | "tot";
  mintaBantuanPada: string | null;
  /** Praktikan only: false when their sign-in belongs to an earlier session. */
  milikSaya?: boolean | null;
  /** Praktikan only: the group an Asisten moved them to this session. */
  dipindahKe?: number | null;
  /** Praktikan not signed in to this session: true when it is theirs to
   *  join (on its roster), false when it belongs to another slot. */
  bisaIkut?: boolean;
  /** Praktikan not signed in to this session: they chose to look around. */
  lihatSaja?: boolean;
  /** Asisten only: true when they teach this session (slot seat, opener,
   *  a held group or an accepted volunteer place). */
  mengajar?: boolean | null;
  /** Asisten only: the four digits a Praktikan types to sign in. */
  kodeMasuk?: string;
  /** Asisten only: how many groups have a hand up. */
  tangan?: number;
}

export function useSessionNow(enabled = true) {
  // Every view on a page shares this one (AppNav, the module steps, Live).
  const poll = usePollBersama(
    "sesi-now",
    () => getJson<{ ok: boolean; sesi: SesiNow | null }>("/api/session/now").then((d) => d.sesi),
    60_000,
    enabled,
    ["sesi"],
  );
  // The session's time runs out without a write: every view hears it then.
  useBatas(poll.data ? akhirSesiPada(poll.data) : null, ["sesi", "jadwal", "laporan"]);
  return poll;
}

/* --------------------------------------------------------------- i18n */

/** Declare one string table per island: `const T = dict({ id: {...}, en: {...}, zh: {...} })`.
 *  The English and Mandarin halves are checked against the Indonesian one's
 *  shape, and since Stage 8 every table must carry its Mandarin half (a
 *  missing one fails the type check). Each table is also kept in a list so
 *  the zh check test can read them all. */
const TABLES: { id: unknown; en: unknown; zh: unknown }[] = [];

export function dict<T>(d: { id: T; en: T; zh: T }): Record<Lang, T> {
  TABLES.push(d);
  return { id: d.id, en: d.en, zh: d.zh };
}

/** Every table dict() has built so far in this process (for tests). */
export function dictTables(): readonly { id: unknown; en: unknown; zh: unknown }[] {
  return TABLES;
}

export function pageLang(): Lang {
  if (typeof document === "undefined") return "id";
  const l = document.documentElement.lang;
  return l === "en" ? "en" : l.startsWith("zh") ? "zh" : "id";
}

/** The Intl locale for dates and numbers in each interface language. */
export function localeOf(lang: Lang): string {
  return lang === "en" ? "en-GB" : lang === "zh" ? "zh-CN" : "id-ID";
}

/** A date written out in full: "Kamis, 1 Oktober 2026", "Thursday 1 October
 *  2026", "2026年10月1日星期四". Takes an ISO date ("2026-10-01"). */
export function tanggalPanjang(iso: string, lang: Lang): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(localeOf(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Prefix a path for the page language ("/dashboard" -> "/en/dashboard"). */
export function href(lang: Lang, path: string): string {
  if (lang === "id") return path;
  return path === "/" ? `/${lang}/` : `/${lang}${path}`;
}

/* ------------------------------------------------------------- modules */

export const MODUL_NAMA: Record<number, string> = {
  1: "Bluetooth Low Energy",
  2: "WebSocket",
  3: "MQTT",
  4: "LoRa",
};

export { skemaBawaan } from "./skema-bawaan";

export const MODUL_SINGKAT: Record<number, string> = {
  1: "BLE",
  2: "WebSocket",
  3: "MQTT",
  4: "LoRa",
};

export { KELOMPOK_NAMA, namaKelompok } from "./kelompok-nama";

/* ------------------------------------------------------------ time */

export function menitBerjalan(mulaiPada: string | null, now = Date.now()): number {
  if (!mulaiPada) return 0;
  const t = new Date(mulaiPada).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 60000));
}

/** Turns the Indonesian locale's "15.02" (and "15.02.09") into "15:02":
 *  times keep their colon in every language (Stage 8). */
export function titikDua(s: string): string {
  return s.replace(
    /\b(\d{1,2})\.(\d{2})(?:\.(\d{2}))?\b/g,
    (_, h: string, m: string, d?: string) => (d ? `${h}:${m}:${d}` : `${h}:${m}`),
  );
}

/** "13:30" in Jakarta time. Every language keeps the colon (Stage 8): the
 *  Indonesian locale would print "13.30". */
export function jamMenit(iso: string | Date, _lang?: Lang): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

/** "2 menit lalu" / "2 minutes ago" from an ISO time (labels.ts). */
export function sejak(iso: string | null, lang: Lang, now = Date.now()): string {
  if (!iso) return "";
  return laluLabel((now - new Date(iso).getTime()) / 1000, lang);
}

/* One shared second for every "ago" label on the page (one timer, not one
   per label); the snapshot is the whole second, so it is stable. It fires
   just past each whole second of the clock, so every countdown on the page
   turns together and on the second itself. */
const detikPendengar = new Set<() => void>();
let detikTimer: ReturnType<typeof setTimeout> | undefined;
function detikBerikut() {
  detikTimer = setTimeout(
    () => {
      detikPendengar.forEach((f) => f());
      detikBerikut();
    },
    1000 - (Date.now() % 1000) + 5,
  );
}
function ikutDetik(cb: () => void) {
  detikPendengar.add(cb);
  if (!detikTimer) detikBerikut();
  return () => {
    detikPendengar.delete(cb);
    if (!detikPendengar.size && detikTimer) {
      clearTimeout(detikTimer);
      detikTimer = undefined;
    }
  };
}
const detikKini = () => Math.floor(Date.now() / 1000) * 1000;

/** Now, to the second, re-rendering each second with every other user. */
export function useDetik(): number {
  return useSyncExternalStore(ikutDetik, detikKini, detikKini);
}

/** Re-render every `ms` (for clocks and "N s ago" labels). */
export function useTick(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
