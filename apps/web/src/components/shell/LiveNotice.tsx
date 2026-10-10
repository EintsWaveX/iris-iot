/**
 * Says so when this page's live updates stop (2026-10-05): a tab whose
 * socket died kept showing Mode TOT as on after it was switched off
 * elsewhere. While the banner shows, lib/siaran.ts refetches the page's
 * data every 30 s and keeps reconnecting; it goes away once live again.
 * A short grace period keeps it from flashing on every page load.
 */
import { useEffect, useState } from "react";
import { ArrowsClockwiseIcon, CloudSlashIcon } from "@phosphor-icons/react";
import { dict } from "../../lib/app";
import { segarkanSemua, useSiaranStatus } from "../../lib/siaran";
import type { Lang } from "../../lib/kelas";

const T = dict({
  id: {
    h: "Halaman ini tidak live",
    p: "Menyambung ulang. Sementara itu datanya diambil ulang tiap 30 detik.",
    go: "Ambil Ulang",
    back: "Live lagi, data sudah terbaru.",
  },
  en: {
    h: "This page isn't live",
    p: "Reconnecting. Meanwhile its data is fetched again every 30 seconds.",
    go: "Refresh Now",
    back: "Live again, the data is up to date.",
  },
  zh: {
    h: "此页面未实时更新",
    p: "正在重新连接。在此期间每 30 秒重新获取一次数据。",
    go: "立即刷新",
    back: "已恢复实时，数据已是最新。",
  },
});

const TENGGANG_MS = 4000;

export default function LiveNotice({ lang }: { lang: Lang }) {
  const t = T[lang];
  const status = useSiaranStatus();
  const [tampil, setTampil] = useState(false);

  useEffect(() => {
    if (status !== "putus") {
      if (tampil && status === "live") window.Toast?.show(t.back, "ok");
      setTampil(false);
      return;
    }
    const id = setTimeout(() => {
      if (!document.hidden) setTampil(true);
    }, TENGGANG_MS);
    return () => clearTimeout(id);
  }, [status]);

  if (!tampil) return null;
  return (
    <div className="offline banner banner--warn" role="status" data-live="putus">
      <CloudSlashIcon size={20} aria-hidden="true" />
      <b>{t.h}</b>
      <span className="hint">{t.p}</span>
      <button type="button" className="btn btn--ghost btn--sm" onClick={segarkanSemua}>
        <ArrowsClockwiseIcon size={14} aria-hidden="true" />
        {t.go}
      </button>
    </div>
  );
}

const L = dict({
  id: { live: "Langsung", putus: "Menyambung Ulang" },
  en: { live: "Live", putus: "Reconnecting" },
  zh: { live: "实时", putus: "正在重新连接" },
});

/** The nav's small live status (Phase 12): a steady dot while live, the
 *  warning dot while reconnecting, nothing on a page that listens to nothing */
export function LiveStatus({ lang }: { lang: Lang }) {
  const t = L[lang];
  const status = useSiaranStatus();
  if (status === "diam") return null;
  const live = status === "live";
  return (
    <span className="appnav__langsung" role="status" data-live={live ? "yes" : "no"}>
      <span
        className={live ? "appnav__live-dot" : "appnav__live-dot appnav__live-dot--warn"}
        aria-hidden="true"
      />
      <span className="appnav__langsung-teks">{live ? t.live : t.putus}</span>
    </span>
  );
}
