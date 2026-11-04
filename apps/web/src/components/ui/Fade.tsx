/**
 * Every in-page view switch fades (Phase 9 kit). Changing `k` swaps the view:
 * the old one fades out first (120 ms, not clickable meanwhile), then the new
 * one remounts and fades in. Reduced motion, Low Detail and a page without
 * matchMedia switch at once (global motion rules).
 *
 * Usage:
 *   <Fade k={tab}>{tab === "siap" ? <Ready /> : <Overview />}</Fade>
 *
 * While the old view is going out it is the last tree rendered for the old key
 * (same instance, same state, no second fetch); updates for the new key wait
 * until it has left.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { calmMotion } from "../../lib/calm-motion";

/** How long the old view takes to leave. Matches `.fade--out` in app.css. */
const OUT_MS = 120;

export default function Fade({
  k,
  children,
  className,
}: {
  k: string | number;
  children: ReactNode;
  className?: string;
}) {
  // The key on screen. It follows `k` straight away unless a view is leaving (never in calm mode).
  const [shown, setShown] = useState<{ k: string | number }>({ k });
  const last = useRef<ReactNode>(children);
  const leaving = shown.k !== k && !calmMotion();
  if (!leaving) last.current = children;

  useEffect(() => {
    if (shown.k === k) return;
    if (calmMotion()) {
      setShown({ k });
      return;
    }
    const id = window.setTimeout(() => setShown({ k }), OUT_MS);
    return () => window.clearTimeout(id);
  }, [k, shown.k]);

  const cls = ["fade", leaving && "fade--out", className].filter(Boolean).join(" ");
  return (
    <div key={leaving ? shown.k : k} className={cls} aria-hidden={leaving ? true : undefined}>
      {leaving ? last.current : children}
    </div>
  );
}
