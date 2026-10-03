/**
 * A calm banner under the nav while the browser is offline (Phase 9, mockup
 * p-states "offline"). Code answers typed meanwhile stay on the page and
 * are sent when the connection returns (BlankFile listens for "online").
 */
import { useEffect, useState } from "react";
import { WifiSlashIcon } from "@phosphor-icons/react";
import { dict } from "../../lib/app";
import type { Lang } from "../../lib/kelas";

const T = dict({
  id: {
    h: "Kamu sedang offline",
    p: "Laptopmu menyimpan isian kode dan mengirimnya begitu tersambung lagi.",
    back: "Tersambung lagi.",
  },
  en: {
    h: "You're offline",
    p: "Your laptop keeps your code answers and sends them once you're back online.",
    back: "Back online.",
  },
  zh: {
    h: "你离线了",
    p: "你的笔记本会先存着代码答案，联网后再发出去。",
    back: "已重新联网。",
  },
});

export default function OfflineNotice({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [off, setOff] = useState(false);
  useEffect(() => {
    setOff(!navigator.onLine);
    const down = () => setOff(true);
    const up = () => {
      setOff(false);
      window.Toast?.show(t.back, "ok");
    };
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    return () => {
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
    };
  }, [t.back]);
  if (!off) return null;
  return (
    <div className="offline banner banner--warn" role="status">
      <WifiSlashIcon size={20} aria-hidden="true" />
      <b>{t.h}</b>
      <span className="hint">{t.p}</span>
    </div>
  );
}
