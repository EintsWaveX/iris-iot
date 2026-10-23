/**
 * Open Recruitment, the small pieces every area uses (prompt 03): full dates
 * and times in WIB, an event's colour, the countdown, the status badge, the
 * shared page head and the card shell.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import BackButton from "../ui/BackButton";
import Pill from "../ui/Pill";
import { href, tanggalPanjang, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { PALETTE_KEYS, eventColor, type PaletteKey } from "../../lib/recruitment/calendar";
import { tanggalWib } from "../../lib/recruitment/gates";
import type { CandidateStatus, EventLite, RecEvent } from "../../lib/recruitment/types";
import { REC } from "./recruitmentStrings";
import "./recruitment.css";

/** The kosmik colour each palette key stands for. */
const PAL: Record<PaletteKey, string> = {
  violet: "var(--violet)",
  blue: "var(--accent)",
  teal: "var(--teal)",
  // --ok is teal in the dark theme; the lime pair keeps green apart from teal.
  green: "var(--group-6)",
  amber: "var(--yellow)",
  orange: "var(--orange)",
  rose: "var(--red)",
  slate: "var(--text-muted)",
};

/** An event's colour as a CSS value. */
export function warna(e: Pick<RecEvent, "kind" | "color">): string {
  const k = eventColor(e);
  return (PALETTE_KEYS as readonly string[]).includes(k) ? PAL[k as PaletteKey] : k;
}

export function warnaJenis(kind: RecEvent["kind"]): string {
  return warna({ kind, color: null });
}

export const cs = (c: string) => ({ "--c": c }) as CSSProperties;

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

const STATUS_TONE: Record<CandidateStatus, "ok" | "warn" | "danger" | undefined> = {
  applied: "warn",
  revision: "danger",
  approved: "ok",
  withdrawn: undefined,
  out: undefined,
  accepted: "ok",
};

export function StatusPill({
  status,
  lang,
  lg,
}: {
  status: CandidateStatus;
  lang: Lang;
  lg?: boolean;
}) {
  return (
    <Pill tone={STATUS_TONE[status]} lg={lg}>
      {REC[lang].status[status]}
    </Pill>
  );
}

/** A panel with the kit's own head. */
export function Kartu({
  title,
  aside,
  className = "",
  children,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      {(title || aside) && (
        <div className="panel__head">
          {title && <h2 className="panel__title">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** The page head every recruitment page opens with. */
export function KepalaHalaman({
  lang,
  title,
  badge,
  lede,
}: {
  lang: Lang;
  title: string;
  badge?: ReactNode;
  lede?: ReactNode;
}) {
  return (
    <header className="page-header rec-head">
      {/* The way back for everyone, signed out too (2026-10-23): the account
          menu's "Buka IRIS Praktikum" only exists once signed in. */}
      <p className="page-header__context">
        <BackButton lang={lang} href={href(lang, "/")} label={REC[lang].backPraktikum} />
      </p>
      <div className="page-header__heading">
        <span className="page-header__eyebrow rec-eyebrow">{REC[lang].eyebrow}</span>
        <div className="row rec-head__row">
          <h1 className="page-header__title">{title}</h1>
          {badge}
        </div>
        {lede && <span className="hint">{lede}</span>}
      </div>
    </header>
  );
}

/** Mounts after the first client render, so a server render never guesses at the clock. */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
