/**
 * React counterpart of Chip.astro / Badge.astro (P8.7): islands cannot use
 * Astro components, and SessionConsole, ServerCenter and ReportsView each
 * grew their own ad-hoc chip classes because of it. One pill, four jobs:
 *
 * - neutral mono label ("MODUL 2", "M2", a count): `<Pill mono>`
 * - state: `tone` ok | warn | danger | accent | gold
 * - a group's own hue: `group={3}` (uses --group-3)
 * - a toggle chip (filters): `pressed` + `onClick` renders a real button
 */
import type { CSSProperties, ReactNode } from "react";
import "./Pill.css";

type Tone = "ok" | "warn" | "danger" | "accent" | "gold";

interface Props {
  children: ReactNode;
  tone?: Tone;
  group?: number;
  mono?: boolean;
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
  mono,
  title,
  className,
  pressed,
  onClick,
}: Props) {
  const cls = [
    "pill",
    tone && `pill--${tone}`,
    group && "pill--group",
    mono && "pill--mono",
    onClick && "pill--button",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const style = group ? ({ "--pill-hue": `var(--group-${group})` } as CSSProperties) : undefined;
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
