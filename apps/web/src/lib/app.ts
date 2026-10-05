/**
 * Phase 8 client plumbing shared by every island: typed fetch helpers, the
 * signed-in person (/api/auth/me, fetched once per page and shared), the
 * running session banner (/api/session/now, polled), the bilingual string
 * helper, and the module names in both languages.
 */
import { laluLabel } from "./labels.js";
import type { HakKey, HakNilai, Tier } from "./hak.js";
import { useEffect, useState } from "react";
import type { Kelas, Lang } from "./kelas.js";
import { usePoll } from "./hooks.js";

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
  hak?: Record<HakKey, HakNilai>;
}

let mePromise: Promise<Me | null> | null = null;
export const ME_CHANGED = "iris:me-changed";

export function loadMe(force = false): Promise<Me | null> {
  if (!mePromise || force) {
    mePromise = getJson<{ ok: boolean } & Partial<Me>>("/api/auth/me")
      .then((d) => (d.ok ? (d as Me) : null))
      .catch(() => null);
  }
  return mePromise;
}

/** Call after login or logout so every island re-reads who is signed in. */
export function meChanged(): void {
  mePromise = null;
  window.dispatchEvent(new Event(ME_CHANGED));
}

/** `undefined` while loading, `null` when signed out. */
export function useMe(): Me | null | undefined {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const run = (force: boolean) =>
      void loadMe(force).then((m) => {
        if (alive) setMe(m);
      });
    run(false);
    const on = () => run(true);
    window.addEventListener(ME_CHANGED, on);
    return () => {
      alive = false;
      window.removeEventListener(ME_CHANGED, on);
    };
  }, []);
  return me;
}

/* --------------------------------------------------------- session now */

export interface SesiNow {
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
  /** Asisten only: true when they teach this session (slot seat, opener,
   *  a held group or an accepted volunteer place). */
  mengajar?: boolean | null;
  /** Asisten only: the four digits a Praktikan types to sign in. */
  kodeMasuk?: string;
}

export function useSessionNow(ms = 20_000, enabled = true) {
  return usePoll(
    () => getJson<{ ok: boolean; sesi: SesiNow | null }>("/api/session/now").then((d) => d.sesi),
    ms,
    enabled,
    ["sesi"],
  );
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

/** The schematic bundled with the site; Module 4 (the hunt) has none, as
 * its content entry's empty `skema` says. */
export function skemaBawaan(modul: number): string | null {
  return modul === 4 ? null : `/schematics/Module ${modul}.png`;
}

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

/** Re-render every `ms` (for clocks and "N s ago" labels). */
export function useTick(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
