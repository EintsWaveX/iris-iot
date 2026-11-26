/**
 * The motion tier, mirrored onto window.Motion (packages/kosmik/js/motion.core.js's tier axis) and
 * html[data-motion-tier], which the CSS and the GSAP, count-up and stagger paths read.
 *
 *   0  nothing moves: Low Detail, or reduced motion
 *   1  Normal
 *   2  High Detail
 *
 * It follows the detail level in force and nothing else. It used to run a 400 ms canvas probe that timed 180
 * drawImage calls and decided the tier from that; that probe could not see what actually makes a phone slow
 * (compositing, blur, repaint), it cost ~100 ms of main thread inside the page load, and it pinned capable
 * desktops at tier 0 for a week once. The level is now the reader's choice, or Otomatis (public/theme-init.js),
 * and a device that really is slow is found by watching real frames on the real page (scripts/auto-detail.ts).
 */

type Tier = 0 | 1 | 2;

function tierNow(): Tier {
  if (window.Motion?.isReduced?.()) return 0;
  const detail = document.documentElement.dataset.detail;
  if (detail === "ldm") return 0;
  if (detail === "hd") return 2;
  return 1;
}

function applyTier(): void {
  const tier = tierNow();
  document.documentElement.dataset.motionTier = String(tier);
  window.Motion?.setTier?.(tier);
}

applyTier();

window.Motion?.onReducedChange?.(applyTier);

// reapply(): recompute after the detail level changes (a choice in Tampilan, or the speed watcher)
window.IrisMotionTier = { reapply: applyTier };

// data-motion-tier on <html> does not reliably survive a ClientRouter swap, the same reason cosmos-router.js
// re-applies its state on every astro:page-load.
document.addEventListener("astro:page-load", applyTier);
