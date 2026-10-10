/** Shapes and small helpers the Server page's parts share (Phase 9 Stage 5). */
import { jamMenit, localeOf, postJson, tanggalPanjang } from "../../lib/app";
import { hariIniWib } from "../../lib/jadwal";
import { tri } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import type { Heartbeat, Perintah } from "../console/types";
import { S, pesan } from "./strings";
import type { BundelTerbit, Pasang } from "../../lib/server-shared";
import { useAliran, type StatusAliran } from "../../lib/aliran-ruang";

export interface Denyut extends Heartbeat {
  memori: number | null;
  disk: number | null;
  /** Network in + out, bytes per second (Phase 9, 0021). */
  jaringan?: number | null;
}

/** A Pi heartbeat as the `pi` room carries it (api/agent, Phase 12) */
export interface DenyutAliran {
  serverId: number;
  denyut: Denyut & { pada: string };
  kondisi?: Record<string, unknown> | null;
  kondisiPada?: string | null;
}

/** Hears every Pi's heartbeat as it lands, for the Server pages */
export function useDenyutLangsung(on: boolean, fn: (d: DenyutAliran) => void): StatusAliran {
  return useAliran({ ruang: "pi", aktif: on }, ["denyut"], (m) => {
    const d = m.d as DenyutAliran | null;
    if (d && typeof d.serverId === "number" && d.denyut) fn(d);
  });
}

/** A server row with this beat (and its "Pi right now" numbers) in it */
export function denganDenyut<T extends { id: number; denyutTerakhir?: unknown }>(
  row: T,
  d: DenyutAliran,
): T {
  if (row.id !== d.serverId) return row;
  return {
    ...row,
    denyutTerakhir: d.denyut,
    ...(d.kondisi ? { kondisi: d.kondisi, kondisiPada: d.kondisiPada ?? null } : {}),
  };
}

export interface ServerRow {
  id: number;
  nama: string;
  kode: string;
  alamatLan: string | null;
  lokasi?: string | null;
  catatan?: string | null;
  agenVersi?: string | null;
  infoSistem?: Record<string, unknown> | null;
  infoSistemPada?: string | null;
  kondisi?: Record<string, unknown> | null;
  kondisiPada?: string | null;
  riwayatSejak?: string | null;
  terdaftar: boolean;
  /** The newest enrolment (a new token's enrolment moves it). */
  terdaftarPada?: string | null;
  denyutTerakhir: Denyut | null;
  batasLuringDetik: number;
}

export interface Detail {
  server: ServerRow;
  denyutTerakhir: Denyut | null;
  batasLuringDetik: number;
  perintah: Perintah[];
  /** Each diagnostic's newest finished run (per service for diag.log). */
  terakhir: Perintah[];
  /** The newest finished Ready checks, newest first. */
  siapRiwayat: Perintah[];
  /** The running session's module, or null when none runs. */
  sesiModul: number | null;
  situsIot: string | null;
  bundelTerbit: BundelTerbit | null;
  /** The one-line install's reports under the current token (2026-10-08). */
  pasang: Pasang | null;
}

export interface Riwayat {
  rentang: string;
  seri: Denyut[];
  reboot: { pada: string }[];
  gap: { dari: string; sampai: string; detik: number }[];
  ketersediaan: number;
  timelineLayanan: { layanan: string; status: string; dari: string; sampai: string }[];
}

/** What the signed-in Asisten may do here. */
export interface Bisa {
  /** Control the Pi (services, hotspot, commands). */
  server: boolean;
  /** The Full view, settings, clearing logs, registering a Pi. */
  full: boolean;
  /** Konsol Pi: every Asisten may ask or join (2026-10-05). */
  konsol: boolean;
  /** Opens and joins without an approver: the Pencipta, the Inti, DEV. */
  istimewa: boolean;
  pencipta: boolean;
  /** Cutting off someone else's console: the Pencipta, the Inti or DEV. */
  putus: boolean;
  badges: string[];
  admin: boolean;
  nim: string;
}

export const WARN_CPU = 85;
export const WARN_TEMP = 70;

export function isOnline(d: Heartbeat | null | undefined, batas: number): boolean {
  return !!d && Date.now() - new Date(d.pada).getTime() < batas * 1000;
}

/** A service state as a tone. Accepts the agent's words and systemd's. */
export function svcTone(st: string | undefined): "ok" | "off" | "bad" | "wait" {
  if (st === "aktif" || st === "active") return "ok";
  if (st === "galat" || st === "failed") return "bad";
  if (st === "transisi" || st === "activating" || st === "deactivating") return "wait";
  return "off";
}

/**
 * Whether a heartbeat newer than the Full report shows any service in
 * another state than the report does. Only a newer heartbeat counts, so a
 * report that finished after it is never asked for twice. `unit` maps the
 * heartbeat's service names to the report's systemd units.
 */
export function rinciUsang(
  hb: Heartbeat | null | undefined,
  layanan: { unit: string; keadaan: string }[],
  laporanPada: string,
  unit: Record<string, string>,
): boolean {
  if (!hb?.layanan || !(Date.parse(hb.pada) > Date.parse(laporanPada))) return false;
  return Object.entries(hb.layanan).some(([k, st]) => {
    const x = layanan.find((y) => y.unit === unit[k]);
    return !!x && !!st && svcTone(x.keadaan) !== svcTone(st);
  });
}

export const TONE_PILL = {
  ok: "pill--ok",
  off: "pill--danger",
  bad: "pill--danger",
  wait: "pill--warn",
} as const;

export const BERJALAN = (p: Perintah) => p.status === "menunggu" || p.status === "terkirim";

export function terakhirDari(d: Detail, aksi: string, layanan?: string): Perintah | undefined {
  const cocok = (p: Perintah) =>
    p.aksi === aksi && (layanan === undefined || (p.argumen?.layanan ?? "") === layanan);
  // The page's own command list is newer than `terakhir` when a result just
  // landed; take whichever finished run has the higher id.
  const a = d.perintah.find((p) => cocok(p) && (p.status === "selesai" || p.status === "gagal"));
  const b = d.terakhir.find(cocok);
  if (!a) return b;
  if (!b) return a;
  return a.id > b.id ? a : b;
}

export function sedangBerjalan(d: Detail, aksi: string, layanan?: string): boolean {
  return d.perintah.some(
    (p) =>
      p.aksi === aksi &&
      BERJALAN(p) &&
      (layanan === undefined || (p.argumen?.layanan ?? "") === layanan),
  );
}

/** Queues one agent command and says so. Resolves true when queued. */
export async function kirim(
  serverId: number,
  aksi: string,
  argumen: Record<string, string>,
  lang: Lang,
  toast: string | false = S[lang].sent,
): Promise<boolean> {
  const t = S[lang];
  try {
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/action", {
      tipe: "kirim",
      serverId,
      aksi,
      argumen,
    });
    if (!r.ok) window.Toast?.show(pesan(t, r.kode), "danger");
    else if (toast) window.Toast?.show(toast, "ok");
    return r.ok;
  } catch {
    window.Toast?.show(t.notSent, "danger");
    return false;
  }
}

export function angka(v: number, lang: Lang, dp = 0): string {
  return v.toLocaleString(localeOf(lang), {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/** Bytes per second as KB/s or MB/s. */
export function laju(bps: number, lang: Lang): string {
  if (bps >= 1024 * 1024) return `${angka(bps / 1024 / 1024, lang, 1)} MB/s`;
  return `${angka(bps / 1024, lang, bps < 10 * 1024 ? 1 : 0)} KB/s`;
}

export function ukuran(b: number, lang: Lang): string {
  if (b >= 1000 * 1024 ** 2) return `${angka(b / 1024 ** 3, lang, 1)} GB`;
  if (b >= 1000 * 1024) return `${angka(b / 1024 ** 2, lang, b < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${angka(b / 1024, lang, 0)} KB`;
}

/** "Hari ini 12:20", "Kemarin 09:10", "Rabu 15:05" within the week, else
 *  "Kamis, 24 September 2026 · 12:20" (mockup v-ready history). */
export function waktuPendek(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const tgl = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);
  const hari = Math.round((Date.parse(hariIniWib()) - Date.parse(tgl)) / 86_400_000);
  const jam = jamMenit(d, lang);
  if (hari === 0) return `${tri(lang, "Hari ini", "Today", "今天")} ${jam}`;
  if (hari === 1) return `${tri(lang, "Kemarin", "Yesterday", "昨天")} ${jam}`;
  if (hari > 1 && hari < 7) {
    const wd = d.toLocaleDateString(localeOf(lang), { weekday: "long", timeZone: "Asia/Jakarta" });
    return `${wd} ${jam}`;
  }
  return `${tanggalPanjang(tgl, lang)} · ${jam}`;
}

export function unduhTeks(nama: string, isi: string) {
  const url = URL.createObjectURL(new Blob([isi], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One History row, from the series' reboots, offline gaps and service
 *  changes, newest first. */
export interface Kejadian {
  pada: string;
  teks: string;
  tone: "ok" | "warn" | "danger";
}

export function kejadianDari(h: Riwayat | null, lang: Lang): Kejadian[] {
  if (!h) return [];
  const t = S[lang];
  const out: Kejadian[] = [
    ...h.reboot.map((r) => ({ pada: r.pada, teks: t.evReboot, tone: "warn" as const })),
    ...h.gap.map((g) => ({
      pada: g.sampai,
      teks: t.evGap(Math.max(1, Math.round(g.detik / 60))),
      tone: "warn" as const,
    })),
    // A span's start is when the service changed into that state; the first
    // span of each service is only "it was already like this", so skip it.
    ...h.timelineLayanan
      .filter((x, i, all) => all.findIndex((y) => y.layanan === x.layanan) !== i)
      .map((x) => {
        const tone = svcTone(x.status);
        return {
          pada: x.dari,
          teks: t.evSvc(t.svc[x.layanan] ?? x.layanan, t.evSt[tone]),
          tone:
            tone === "ok"
              ? ("ok" as const)
              : tone === "wait"
                ? ("warn" as const)
                : ("danger" as const),
        };
      }),
  ];
  return out.sort((a, b) => (a.pada < b.pada ? 1 : -1));
}
