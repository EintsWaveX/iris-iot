/**
 * React counterpart of Chip.astro / Badge.astro (P8.7): islands cannot use
 * Astro components, and SessionConsole, ServerCenter and ReportsView each
 * grew their own ad-hoc chip classes because of it. One pill, four jobs:
 *
 * - a code or identifier in its own case: `<Pill mono>`
 * - state: `tone` ok | warn | danger | accent | gold | violet | teal | solid,
 *   and the schedule sheet markers fit (red) and a24 (yellow)
 * - a group's or module's own hue: `group={3}` / `modul={2}`
 * - a toggle chip (filters): `pressed` + `onClick` renders a real button
 *
 * Phase 9: every badge is upper case (CSS), except codes and toggle chips.
 */
import type { CSSProperties, ReactNode } from "react";
import "./Pill.css";

type Tone =
  "ok" | "warn" | "danger" | "accent" | "gold" | "violet" | "teal" | "solid" | "fit" | "a24";

interface Props {
  children: ReactNode;
  tone?: Tone;
  group?: number;
  modul?: number;
  mono?: boolean;
  lg?: boolean;
  title?: string;
  className?: string;
  /** Present => renders a <button aria-pressed>. */
  pressed?: boolean;
  onClick?: () => void;
}

export default function Pill({
  children,
  tone,
  group,
  modul,
  mono,
  lg,
  title,
  className,
  pressed,
  onClick,
}: Props) {
  const cls = [
    "pill",
    tone && `pill--${tone}`,
    (group || modul) && "pill--group",
    mono && "pill--mono",
    lg && "pill--lg",
    onClick && "pill--button",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const hue = group ? `var(--group-${group})` : modul ? `var(--mod-${modul})` : undefined;
  const style = hue ? ({ "--pill-hue": hue } as CSSProperties) : undefined;
  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        style={style}
        aria-label={title}
        aria-pressed={pressed}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
  return (
    <span className={cls} style={style} aria-label={title}>
      {children}
    </span>
  );
}
