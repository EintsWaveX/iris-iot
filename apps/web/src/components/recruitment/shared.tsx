/**
 * Open Recruitment, the small pieces every area uses (prompt 03): full dates
 * and times in WIB, an event's colour, the countdown, the status badge, the
 * shared page head and the card shell.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import BackButton from "../ui/BackButton";
import Pill from "../ui/Pill";
import { href } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { PALETTE_KEYS, eventColor, type PaletteKey } from "../../lib/recruitment/calendar";
import type { CandidateStatus, RecEvent } from "../../lib/recruitment/types";
import { REC } from "./recruitmentStrings";
import "./recruitment.css";
import "./recruitment-s2.css";

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
  pink: "#f472b6",
};

/** Subject to Change: the dates of the stages after Wawancara are not fixed yet (coordinator, 28 Oct 2026). */
const STC_STAGES = ["tubes", "mengajar", "penerimaan"];
export const isStc = (e: Pick<RecEvent, "stage">): boolean =>
  !!e.stage && STC_STAGES.includes(e.stage);

/** The STC tag beside an event's name. */
export function Stc({ tip }: { tip: string }) {
  return (
    <span className="rec-stc" title={tip}>
      STC
    </span>
  );
}

/** An event's colour as a CSS value. */
export function warna(e: Pick<RecEvent, "kind" | "color">): string {
  const k = eventColor(e);
  return (PALETTE_KEYS as readonly string[]).includes(k) ? PAL[k as PaletteKey] : k;
}

export function warnaJenis(kind: RecEvent["kind"]): string {
  return warna({ kind, color: null });
}

export const cs = (c: string) => ({ "--c": c }) as CSSProperties;

export { tgl, jamAcara, rentangAcara, kapanAcara, useHariIni, wibMs, Countdown } from "./waktu";

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
