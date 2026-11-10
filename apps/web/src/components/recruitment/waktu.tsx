/**
 * Open Recruitment's dates, windows and countdown: the part of shared.tsx
 * with no stylesheet of its own, so the Home banner can use it without
 * pulling in the panel's CSS (recruitment-s2.css). shared.tsx re-exports all
 * of it, so every other caller is unchanged.
 */
import { useTick, tanggalPanjang } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { tanggalWib } from "../../lib/recruitment/gates";
import type { EventLite } from "../../lib/recruitment/types";
import { REC } from "./recruitmentStrings";

/** "Selasa, 27 Oktober 2026" */
export const tgl = (iso: string, lang: Lang) => tanggalPanjang(iso, lang);

type Waktu = Pick<EventLite, "dayStart" | "dayEnd">;
type Rentang = Pick<EventLite, "startsOn" | "endsOn">;

/** The daily window, or "All day". */
export function jamAcara(e: Waktu, lang: Lang): string {
  const t = REC[lang].time;
  if (!e.dayStart) return t.allDay;
  return e.dayEnd ? t.hours(e.dayStart, e.dayEnd) : t.from(e.dayStart);
}

/** One date, or "from to" in full. */
export function rentangAcara(e: Rentang, lang: Lang): string {
  return e.startsOn === e.endsOn
    ? tgl(e.startsOn, lang)
    : REC[lang].time.range(tgl(e.startsOn, lang), tgl(e.endsOn, lang));
}

/** The date, plus the window when there is one. */
export function kapanAcara(e: Rentang & Waktu, lang: Lang): string {
  return e.dayStart ? `${rentangAcara(e, lang)} · ${jamAcara(e, lang)}` : rentangAcara(e, lang);
}

/** WIB today as "YYYY-MM-DD", ticking over midnight. */
export function useHariIni(): string {
  const now = useTick(30_000);
  return tanggalWib(new Date(now)).tanggal;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** The instant a WIB date and time is, as ms. */
export const wibMs = (tanggal: string, jam = "00:00") => Date.parse(`${tanggal}T${jam}:00+07:00`);

/** Days big, then HH:MM:SS; ticks every second only while it is on screen. */
export function Countdown({ ke, label, lang }: { ke: number; label: string; lang: Lang }) {
  const now = useTick(1000);
  const s = Math.max(0, Math.floor((ke - now) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  const t = REC[lang].count;
  return (
    <span className="rec-count" role="timer" aria-label={label}>
      {d > 0 && (
        <span className="rec-count__d">
          <b className="num">{d}</b>
          <small>{d === 1 ? t.day : t.days}</small>
        </span>
      )}
      <b className="num rec-count__hms">{`${p2(h)}:${p2(m)}:${p2(x)}`}</b>
    </span>
  );
}
