/**
 * Small P8.7 display primitives that several islands share:
 *
 * - StateView: one empty / forbidden / error / offline block with an icon,
 *   title, body and optional actions (replaces the ad-hoc "Memuat…" and
 *   forbidden headings scattered across the islands)
 * - Skeleton: shimmer placeholder while data loads
 * - CountUp: a number that tweens to its new value (motion tier 1+ only)
 * - ProgressRing: a small conic ring with a centred label ("6/12")
 * - RatingPicker: five big tappable faces, a real radio group
 * - OfflineBanner / UpdatedAgo: poll health, from usePoll's state
 */
import {
  SmileyBlankIcon,
  SmileyIcon,
  SmileyMehIcon,
  SmileySadIcon,
  SmileyWinkIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAgeSeconds, useMotionTier } from "../../lib/hooks";
import "./Display.css";

/* ------------------------------------------------------------ StateView */

type Tone = "accent" | "danger" | "warn";

export function StateView({
  icon,
  title,
  body,
  actions,
  tone = "accent",
}: {
  icon: ReactNode;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div
      className={`state-view state-view--${tone}`}
      role={tone === "danger" ? "alert" : undefined}
    >
      <div className="state-view__icon" aria-hidden="true">
        {icon}
      </div>
      <h2 className="state-view__title">{title}</h2>
      {body && <p className="state-view__body">{body}</p>}
      {actions && <div className="state-view__actions">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------- Skeleton */

export function Skeleton({
  width,
  height = 16,
  radius,
}: {
  width?: string | number;
  height?: string | number;
  radius?: string;
}) {
  return (
    <span className="skeleton" aria-hidden="true" style={{ width, height, borderRadius: radius }} />
  );
}

/* -------------------------------------------------------------- CountUp */

export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const tier = useMotionTier();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (tier === 0) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, tier]);
  return <span className="num">{shown}</span>;
}

/* --------------------------------------------------------- ProgressRing */

export function ProgressRing({
  value,
  max,
  label,
  color = "var(--accent)",
  size = "md",
}: {
  value: number;
  max: number;
  label?: string;
  color?: string;
  size?: "md" | "lg";
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const text = label ?? `${value}/${max}`;
  return (
    <span
      className={`ring ring--${size}`}
      role="img"
      aria-label={text}
      style={{ "--ring-p": pct, "--ring-c": color } as CSSProperties}
    >
      <span className="ring__label">{text}</span>
    </span>
  );
}

/* --------------------------------------------------------- RatingPicker */

const FACES = [SmileySadIcon, SmileyMehIcon, SmileyBlankIcon, SmileyIcon, SmileyWinkIcon];

export function RatingPicker({
  value,
  onChange,
  labels,
  groupLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  /** Five labels, worst to best. */
  labels: [string, string, string, string, string];
  groupLabel: string;
}) {
  return (
    <div className="rating" role="radiogroup" aria-label={groupLabel}>
      {labels.map((l, i) => {
        const Face = FACES[i];
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={value === i + 1}
            className="rating__face"
            onClick={() => onChange(i + 1)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp")
                onChange(Math.min(5, (value || 0) + 1));
              else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
                onChange(Math.max(1, (value || 2) - 1));
              else return;
              e.preventDefault();
            }}
            tabIndex={value === i + 1 || (!value && i === 0) ? 0 : -1}
          >
            <Face size={32} weight={value === i + 1 ? "fill" : "regular"} aria-hidden="true" />
            <span>{l}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------ poll health indicators */

export function UpdatedAgo({
  since,
  template,
}: {
  since: number | null;
  template: (s: number) => string;
}) {
  const age = useAgeSeconds(since);
  if (age === null) return null;
  return <span className="updated-ago">{template(age)}</span>;
}

export function OfflineBanner({
  errors,
  text,
  retry,
  retryLabel,
}: {
  errors: number;
  text: string;
  retry: () => void;
  retryLabel: string;
}) {
  if (errors < 2) return null;
  return (
    <div className="offline-banner" role="status">
      <span>{text}</span>
      <button type="button" className="btn btn--ghost" onClick={retry}>
        {retryLabel}
      </button>
    </div>
  );
}
