/**
 * True when nothing should be held back for an exit animation: reduced motion
 * asked for, Low Detail (motion tier 0), or no browser to ask (tests, the
 * server). Code that keeps something on screen while it fades out checks this
 * first and simply removes it when it is true.
 */
export function calmMotion(): boolean {
  return (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.dataset.motionTier === "0"
  );
}
