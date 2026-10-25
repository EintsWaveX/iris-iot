/**
 * The small pieces the test page shares (prompt 10): the part timer, the
 * save and relay chips, tonight's parts as a list and as a bar, a check row,
 * and the full page message card. Classes are r3*, keyframes rec-s3-*.
 */
import {
  ArrowsOutIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleIcon,
  PauseIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { PartKey } from "../../../lib/recruitment/exam-types";
import type { Lang } from "../../../lib/kelas";
import { hms, tone } from "../../../lib/recruitment/seat-state";
import type { PlanPart } from "../../../lib/recruitment/seat-types";
import type { SaveState } from "../../../lib/recruitment/seat-answers";
import { TS } from "./testStrings";

export type Motion = "full" | "ldm" | "reduce";

/** The part timer: HH:MM:SS, gold under 2 minutes, red under 30 s, grey and still while paused */
export function Timer({
  left,
  frozen,
  big,
  lang,
  label,
}: {
  left: number;
  frozen?: boolean;
  big?: boolean;
  lang: Lang;
  label?: string;
}) {
  const t = TS[lang].run;
  return (
    <span
      className={"r3timer" + (big ? " r3timer--big" : "")}
      role="timer"
      aria-live="off"
      data-tone={frozen ? "" : tone(left)}
      data-frozen={frozen ? "yes" : "no"}
    >
      <small>{label ?? (frozen ? t.paused : t.timeLeft)}</small>
      <b className="num">{hms(left)}</b>
    </span>
  );
}

export function SaveChip({ s, lang }: { s: SaveState; lang: Lang }) {
  const t = TS[lang].run;
  const text = { ok: t.saved, ing: t.saving, wait: t.unsent, closed: t.closed }[s];
  return (
    <span className="r3save" data-s={s} role="status">
      <i className="r3save__dot" />
      {text}
    </span>
  );
}

export function LiveChip({ lang }: { lang: Lang }) {
  const t = TS[lang].run;
  return (
    <span className="r3conn" role="img" aria-label={t.liveDown} title={t.liveDownTip}>
      <i />
      <span className="r3conn__t">{t.liveDown}</span>
    </span>
  );
}

/** Tonight's parts in a list with the current one marked (the runner's rail) */
export function PartsMini({
  plan,
  cur,
  lang,
}: {
  plan: PlanPart[];
  cur: PartKey | null;
  lang: Lang;
}) {
  const t = TS[lang];
  const ci = plan.findIndex((p) => p.key === cur);
  return (
    <ol className="r3parts">
      {plan.map((p, i) => (
        <li key={p.key} data-st={i < ci ? "done" : i === ci ? "now" : "next"}>
          <i />
          <span className="grow">{t.part[p.key].l}</span>
          <span className="hint num">
            {p.minutes} {t.minShort}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function CheckRow({
  st,
  title,
  sub,
}: {
  st: "ok" | "warn" | "wait" | "todo";
  title: string;
  sub?: string;
}) {
  return (
    <li className="r3chk" data-st={st}>
      <span className="r3chk__ic">
        {st === "wait" ? (
          <i className="r3spin" aria-hidden="true" />
        ) : st === "warn" ? (
          <WarningIcon weight="bold" />
        ) : st === "ok" ? (
          <CheckIcon weight="bold" />
        ) : (
          <CircleIcon />
        )}
      </span>
      <span className="stack" style={{ gap: 0, minWidth: 0 }}>
        <b>{title}</b>
        {sub && <span className="hint">{sub}</span>}
      </span>
    </li>
  );
}

export type IconTone = "accent" | "warn" | "ok";
export function BigIcon({
  kind,
  tone: tn = "accent",
}: {
  kind: "pause" | "screen" | "ok";
  tone?: IconTone;
}) {
  return (
    <span className="r3over__ic" data-tone={tn}>
      {kind === "pause" ? (
        <PauseIcon />
      ) : kind === "screen" ? (
        <ArrowsOutIcon />
      ) : (
        <CheckCircleIcon />
      )}
    </span>
  );
}

/** A full page card: a gate, a message, an error */
export function Gate({
  motion,
  eyebrow,
  title,
  children,
  wide,
}: {
  motion: Motion;
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={"r3gate" + (wide ? " r3lobby" : "")} data-m={motion}>
      <div className="panel panel--raised r3gate__card">
        <div className="stack" style={{ gap: 4 }}>
          {eyebrow && <span className="eyebrow rec-eyebrow">{eyebrow}</span>}
          <h1 className="r3h1">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
