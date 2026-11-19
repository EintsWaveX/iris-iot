/**
 * The clock in the navigation (Phase 9): the full date and the time,
 * ticking every second. The Tampilan panel sets when it shows: "auto"
 * hides it while the reader's own session runs (the session bar carries
 * the clock then), "on" always shows it, "off" never does. The date shows
 * from 1440px; under 900px the time drops its seconds.
 */
import { useEffect, useMemo, useState } from "react";
import { dict, tanggalPanjang } from "../../lib/app";
import { clockTime, dayKey } from "../../lib/clock-text";
import type { Lang } from "../../lib/kelas";
import { usePrefs } from "../../lib/prefs";
import { jamServer } from "../../lib/jam";

const T = dict({ id: "Jam sekarang", en: "Current time", zh: "当前时间" });

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
  const shown = clock !== "off" && !(clock === "auto" && inSession);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // Nothing to tick while the clock is hidden (off, or the session bar carries it): no timer, no renders.
    if (!shown) return;
    // The site's time, so a laptop with a wrong clock still shows the lab's.
    const setelJam = () => setNow(new Date(jamServer()));
    setelJam();
    const id = window.setInterval(() => {
      // A hidden tab is not looking; the visibilitychange below catches up the moment it is
      if (!document.hidden) setelJam();
    }, 1000);
    document.addEventListener("visibilitychange", setelJam);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", setelJam);
    };
  }, [shown]);
  // The long date changes once a day: written once per day (and per language), not once a second
  const day = now ? dayKey(now) : "";
  const date = useMemo(() => (day ? tanggalPanjang(day, lang) : ""), [day, lang]);
  if (!now || !shown) return null;
  // Colons in every language ("02:14:26"), like the session strip.
  const time = clockTime(now);
  return (
    <span
      className={className ? `navclock ${className}` : "navclock"}
      role="timer"
      aria-label={T[lang]}
    >
      <span className="navclock__date">{date}</span>
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
