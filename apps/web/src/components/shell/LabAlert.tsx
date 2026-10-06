/**
 * Alerts on every Asisten page (2026-10-05), from /api/session/waspada:
 *
 * - the Pi stops sending heartbeats while a session that needs it runs
 *   (every Asisten sees this one);
 * - a burst of server errors (AMBANG_GALAT in api/_lib/galat.ts), for
 *   those with the Server right, who can act on it.
 *
 * Checked every 30 s while a session runs, every 2 min otherwise. When the
 * tab is in the background and the browser allows it, a system
 * notification goes out too; the banner offers to turn those on.
 */
import { useEffect, useRef, useState } from "react";
import {
  ArrowRightIcon,
  BellRingingIcon,
  PlugsIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { dict, getJson, href, type Me } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";

interface Waspada {
  ok: boolean;
  galat: {
    jumlah: number;
    menit: number;
    ambang: number;
    terakhir: { id: number; pada: string; pesan: string } | null;
  };
  pi: { luring: boolean; umurDetik: number | null; serverId?: number | null } | null;
  sesi: { id: number; modul: number } | null;
}

const T = dict({
  id: {
    piH: "Pi tidak mengirim detak",
    piP: (m: string) => `Sesi sedang berjalan, tapi Pi diam sejak ${m}. Cek daya dan Wi-Fi Pi.`,
    piNever: "belum pernah",
    piGo: "Buka Server",
    errH: (n: number, m: number) => `${n} galat server dalam ${m} menit terakhir`,
    errGo: "Lihat Galat",
    notif: "Beri Tahu Saya",
    hide: "Sembunyikan",
    ago: (m: number) =>
      m < 1
        ? "kurang dari semenit lalu"
        : m < 90
          ? `${m} menit lalu`
          : `${Math.round(m / 60)} jam lalu`,
    nPi: "IRIS: Pi tidak mengirim detak",
    nErr: "IRIS: galat server bertambah",
  },
  en: {
    piH: "The Pi stopped sending heartbeats",
    piP: (m: string) =>
      `A session is running, but the Pi has been silent since ${m}. Check its power and Wi-Fi.`,
    piNever: "never",
    piGo: "Open Server",
    errH: (n: number, m: number) => `${n} server errors in the last ${m} minutes`,
    errGo: "See Errors",
    notif: "Notify Me",
    hide: "Hide",
    ago: (m: number) =>
      m < 1
        ? "under a minute ago"
        : m < 90
          ? `${m} minutes ago`
          : `${Math.round(m / 60)} hours ago`,
    nPi: "IRIS: the Pi stopped sending heartbeats",
    nErr: "IRIS: server errors are piling up",
  },
  zh: {
    piH: "Pi 停止发送心跳",
    piP: (m: string) => `课程正在进行，但 Pi 自${m}起没有动静。检查 Pi 的电源和 Wi-Fi。`,
    piNever: "从未",
    piGo: "打开服务器",
    errH: (n: number, m: number) => `最近 ${m} 分钟内有 ${n} 个服务器错误`,
    errGo: "查看错误",
    notif: "通知我",
    hide: "隐藏",
    ago: (m: number) =>
      m < 1 ? "不到一分钟前" : m < 90 ? `${m} 分钟前` : `${Math.round(m / 60)} 小时前`,
    nPi: "IRIS：Pi 停止发送心跳",
    nErr: "IRIS：服务器错误在增加",
  },
});

const KUNCI_SEMBUNYI = "iris-galat-disembunyikan";

function bacaSembunyi(): number {
  try {
    return Number(localStorage.getItem(KUNCI_SEMBUNYI) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function beriTahu(judul: string, isi: string, tag: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!document.hidden) return;
    new Notification(judul, { body: isi, tag, icon: "/favicon.svg" });
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

export default function LabAlert({
  lang,
  me,
  sesiBerjalan,
}: {
  lang: Lang;
  me: Me;
  sesiBerjalan: boolean;
}) {
  const t = T[lang];
  const bisaServer = me.hak?.server === true;
  const w = usePoll(
    () => getJson<Waspada>("/api/session/waspada"),
    sesiBerjalan ? 30_000 : 120_000,
    true,
    ["sesi", "server"],
  ).data;
  const [sembunyi, setSembunyi] = useState(0);
  const [izin, setIzin] = useState<NotificationPermission | "none">("none");
  useEffect(() => {
    setSembunyi(bacaSembunyi());
    setIzin(typeof Notification === "undefined" ? "none" : Notification.permission);
  }, []);

  const piLuring = !!w?.ok && !!w.pi?.luring;
  const g = w?.ok ? w.galat : null;
  const lonjakan =
    bisaServer && !!g && g.jumlah >= g.ambang && !!g.terakhir && g.terakhir.id > sembunyi;

  // A system notification once per new problem, while the tab is hidden.
  const sudah = useRef({ pi: false, galat: 0 });
  useEffect(() => {
    if (piLuring && !sudah.current.pi) beriTahu(t.nPi, t.piH, "iris-pi");
    sudah.current.pi = piLuring;
  }, [piLuring]);
  useEffect(() => {
    if (lonjakan && g?.terakhir && g.terakhir.id > sudah.current.galat) {
      beriTahu(t.nErr, g.terakhir.pesan, "iris-galat");
      sudah.current.galat = g.terakhir.id;
    }
  }, [lonjakan, g?.terakhir?.id]);

  if (!piLuring && !lonjakan) return null;

  const tombolIzin =
    izin === "default" ? (
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() =>
          void Notification.requestPermission()
            .then(setIzin)
            .catch(() => {})
        }
      >
        <BellRingingIcon size={14} aria-hidden="true" />
        {t.notif}
      </button>
    ) : null;

  const umur = w?.pi?.umurDetik;
  return (
    <>
      {piLuring && (
        <div className="offline banner banner--danger" role="alert">
          <PlugsIcon size={20} aria-hidden="true" />
          <b>{t.piH}</b>
          <span className="hint">
            {t.piP(umur == null ? t.piNever : t.ago(Math.floor(umur / 60)))}
          </span>
          {tombolIzin}
          <a
            className="btn btn--ghost btn--sm"
            href={
              w?.pi?.serverId
                ? `${href(lang, "/servers")}?id=${w.pi.serverId}#siap`
                : href(lang, "/servers")
            }
          >
            {t.piGo}
            <ArrowRightIcon size={14} aria-hidden="true" />
          </a>
        </div>
      )}
      {lonjakan && g && (
        <div className="offline banner banner--warn" role="status">
          <WarningIcon size={20} aria-hidden="true" />
          <b>{t.errH(g.jumlah, g.menit)}</b>
          <span className="hint truncate">{g.terakhir?.pesan}</span>
          {!piLuring && tombolIzin}
          <a
            className="btn btn--ghost btn--sm"
            href={`${href(lang, "/reports")}?audit=galat#audit`}
          >
            {t.errGo}
            <ArrowRightIcon size={14} aria-hidden="true" />
          </a>
          <button
            type="button"
            className="iconbtn"
            aria-label={t.hide}
            onClick={() => {
              const id = g.terakhir?.id ?? 0;
              setSembunyi(id);
              try {
                localStorage.setItem(KUNCI_SEMBUNYI, String(id));
              } catch {
                /* hidden for this page only */
              }
            }}
          >
            <XIcon size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
