/**
 * The session strip (Phase 9): the clock and the time left, both as
 * HH:MM:SS, then "N of M minutes" with a bar. The Asisten session bar and
 * the Praktikan mini bar both carry it, and the nav clock hides while it
 * shows ("auto" in Tampilan). `compact` drops the bar below 1100px;
 * `garis` drops it everywhere (Phase 21: the Praktikan row draws the time
 * gone as its own underline).
 */
import type { CSSProperties } from "react";
import { dict, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import "./SessionStrip.css";

const T = dict({
  id: {
    jam: "Jam",
    sisa: "Sisa",
    dari: (a: number, b: number) => `${a} dari ${b} menit`,
    label: "Waktu sesi",
  },
  en: {
    jam: "Time",
    sisa: "Left",
    dari: (a: number, b: number) => `${a} of ${b} minutes`,
    label: "Session time",
  },
  zh: {
    jam: "时间",
    sisa: "剩余",
    dari: (a: number, b: number) => `${a} / ${b} 分钟`,
    label: "上课时间",
  },
});

/** Seconds as HH:MM:SS (never negative). */
export function hms(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** Seconds left of a session that started at `mulaiPada` and runs `durasi` minutes. */
export function sisaDetik(mulaiPada: string | null, durasi: number, now = Date.now()): number {
  const t = mulaiPada ? new Date(mulaiPada).getTime() : NaN;
  if (Number.isNaN(t)) return durasi * 60;
  return Math.max(0, durasi * 60 - (now - t) / 1000);
}

/** The wall clock in Jakarta time, HH:MM:SS. */
function jamJakarta(now: number): string {
  return new Date(now).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  });
}

export default function SessionStrip({
  lang,
  mulaiPada,
  durasi,
  compact,
  hue,
  garis,
}: {
  lang: Lang;
  mulaiPada: string | null;
  durasi: number;
  compact?: boolean;
  hue?: string;
  garis?: boolean;
}) {
  const t = T[lang];
  const now = useTick(1000);
  const left = sisaDetik(mulaiPada, durasi, now);
  const gone = Math.min(durasi, Math.floor((durasi * 60 - left) / 60));
  const pct = durasi ? Math.round((gone / durasi) * 100) : 0;
  return (
    <span
      className={compact ? "strip strip--compact" : "strip"}
      role="timer"
      aria-label={t.label}
      style={hue ? ({ "--meter-hue": hue } as CSSProperties) : undefined}
    >
      <span className="strip__i strip__jam">
        <small>{t.jam}</small>
        <b className="mono">{jamJakarta(now)}</b>
      </span>
      <span className="strip__dot strip__jam-dot" aria-hidden="true">
        ·
      </span>
      <span className="strip__i strip__left" data-low={left < 30 * 60 ? "yes" : undefined}>
        <small>{t.sisa}</small>
        <b className="mono">{hms(left)}</b>
      </span>
      {!garis && (
        <span className="strip__dot strip__prog-dot" aria-hidden="true">
          ·
        </span>
      )}
      {!garis && (
        <span className="strip__prog">
          <span
            className="meter"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ "--meter": pct } as CSSProperties}
          />
          <span className="hint num">{t.dari(gone, durasi)}</span>
        </span>
      )}
    </span>
  );
}
