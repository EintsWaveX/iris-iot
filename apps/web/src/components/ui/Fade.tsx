/**
 * Every in-page view switch fades in (Phase 9 kit). Changing `k` remounts
 * the children, which replays the fade. Reduced motion skips it (global
 * motion rules).
 *
 * Usage:
 *   <Fade k={tab}>{tab === "siap" ? <Ready /> : <Overview />}</Fade>
 */
import type { ReactNode } from "react";

export default function Fade({
  k,
  children,
  className,
}: {
  k: string | number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div key={k} className={className ? `fade ${className}` : "fade"}>
      {children}
    </div>
  );
}
