/**
 * The clock in the navigation (Phase 9): the full date and the time,
 * ticking every second. The Tampilan panel sets when it shows: "auto"
 * hides it while the reader's own session runs (the session bar carries
 * the clock then), "on" always shows it, "off" never does. The date shows
 * from 1440px; under 900px the time drops its seconds.
 */
import { useEffect, useState } from "react";
import { dict, tanggalPanjang } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { usePrefs } from "../../lib/prefs";
import { jamServer } from "../../lib/jam";

const T = dict({ id: "Jam sekarang", en: "Current time", zh: "当前时间" });

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function NavClock({
  lang,
  inSession,
  className,
}: {
  lang: Lang;
  inSession: boolean;
  className?: string;
}) {
  const { clock } = usePrefs();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // The site's time, so a laptop with a wrong clock still shows the lab's.
    setNow(new Date(jamServer()));
    const id = window.setInterval(() => setNow(new Date(jamServer())), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!now || clock === "off" || (clock === "auto" && inSession)) return null;
  // Colons in every language ("02:14:26"), like the session strip.
  const time = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return (
    <span
      className={className ? `navclock ${className}` : "navclock"}
      role="timer"
      aria-label={T[lang]}
    >
      <span className="navclock__date">{tanggalPanjang(iso(now), lang)}</span>
      <span className="navclock__sep" aria-hidden="true">
        ·
      </span>
      <b className="navclock__time mono">
        <span>{time.slice(0, 5)}</span>
        <span className="navclock__sec">{time.slice(5)}</span>
      </b>
    </span>
  );
}
