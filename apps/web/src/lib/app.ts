/**
 * Phase 8 client plumbing shared by every island: typed fetch helpers, the
 * signed-in person (/api/auth/me, fetched once per page and shared), the
 * running session banner (/api/session/now, polled), the bilingual string
 * helper, and the module names in both languages.
 */
import { useEffect, useState } from "react";
import type { Kelas, Lang } from "./kelas.js";
import { usePoll } from "./hooks.js";

/* ------------------------------------------------------------ fetching */

export class HttpError extends Error {}

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
  mintaBantuanPada: string | null;
  /** Praktikan only: false when their sign-in belongs to an earlier session. */
  milikSaya?: boolean | null;
}

export function useSessionNow(ms = 20_000, enabled = true) {
  return usePoll(
    () => getJson<{ ok: boolean; sesi: SesiNow | null }>("/api/session/now").then((d) => d.sesi),
    ms,
    enabled,
  );
}

/* --------------------------------------------------------------- i18n */

/** Declare one string table per island: `const T = dict({ id: {...}, en: {...}, zh: {...} })`.
 *  The English and Mandarin halves are checked against the Indonesian one's
 *  shape. Mandarin is optional until Stage 8 and falls back to English. */
export function dict<T>(d: { id: T; en: T; zh?: T }): Record<Lang, T> {
  return { id: d.id, en: d.en, zh: d.zh ?? d.en };
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

export const MODUL_SINGKAT: Record<number, string> = {
  1: "BLE",
  2: "WebSocket",
  3: "MQTT",
  4: "LoRa",
};

export const KELOMPOK_NAMA: Record<number, string> = {
  1: "Vela",
  2: "Lyra",
  3: "Cygnus",
  4: "Orion",
  5: "Carina",
};

/** A group's display name: the name typed in the roster when it is a real
 *  one, else the group's star name. A roster line with no label saves as
 *  "Kelompok N", which counts as no name. */
export function namaKelompok(nomor: number, nama?: string | null): string {
  const n = (nama ?? "").trim();
  if (n && n.toLowerCase() !== `kelompok ${nomor}` && n.toLowerCase() !== `group ${nomor}`)
    return n;
  return KELOMPOK_NAMA[nomor] ?? `Kelompok ${nomor}`;
}

/* ------------------------------------------------------------ time */

export function menitBerjalan(mulaiPada: string | null, now = Date.now()): number {
  if (!mulaiPada) return 0;
  const t = new Date(mulaiPada).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 60000));
}

export function jamMenit(iso: string | Date, lang: Lang): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString(localeOf(lang), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/** "2 mnt lalu" / "2 min ago" from an ISO time. */
export function sejak(iso: string | null, lang: Lang, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return lang !== "id" ? `${s} s ago` : `${s} dtk lalu`;
  const m = Math.round(s / 60);
  if (m < 60) return lang !== "id" ? `${m} min ago` : `${m} mnt lalu`;
  const h = Math.round(m / 60);
  return lang !== "id" ? `${h} h ago` : `${h} jam lalu`;
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
