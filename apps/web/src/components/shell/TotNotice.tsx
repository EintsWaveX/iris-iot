/**
 * Mode TOT banner (2026-10-05): under the nav on every Asisten page while
 * TOT is on, so nobody forgets that real Praktikan are locked out. Links to
 * Preparation's Mode TOT tab. Refreshes on the `tot` live update.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowRightIcon, ChalkboardTeacherIcon } from "@phosphor-icons/react";
import { dict, getJson, href } from "../../lib/app";
import { useSiaran } from "../../lib/siaran";
import type { Lang } from "../../lib/kelas";

/** Fired by Preparation's switch so this page's banner follows at once. */
export const TOT_BERUBAH = "iris:tot";

const T = dict({
  id: {
    h: "Mode TOT aktif",
    p: "Praktikan asli tidak bisa masuk sampai Mode TOT dimatikan.",
    go: "Buka Mode TOT",
  },
  en: {
    h: "TOT Mode is on",
    p: "Real Praktikan can't sign in until TOT Mode is switched off.",
    go: "Open TOT Mode",
  },
  zh: {
    h: "TOT 模式已开启",
    p: "在关闭 TOT 模式之前，正式学生无法登录。",
    go: "打开 TOT 模式",
  },
});

export default function TotNotice({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [on, setOn] = useState(false);
  const load = useCallback(() => {
    getJson<{ ok: boolean; aktif?: boolean }>("/api/session/tot")
      .then((d) => setOn(!!d.ok && !!d.aktif))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(TOT_BERUBAH, load);
    return () => window.removeEventListener(TOT_BERUBAH, load);
  }, [load]);
  useSiaran(["tot"], load);
  if (!on) return null;
  return (
    <div className="offline banner banner--warn" role="status">
      <ChalkboardTeacherIcon size={20} aria-hidden="true" />
      <b>{t.h}</b>
      <span className="hint">{t.p}</span>
      <a className="btn btn--ghost btn--sm" href={`${href(lang, "/session")}#tot`}>
        {t.go}
        <ArrowRightIcon size={14} aria-hidden="true" />
      </a>
    </div>
  );
}
