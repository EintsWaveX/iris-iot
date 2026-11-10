/**
 * A page-wide click lock that nothing owns any more (10 Nov 2026). A modal dialog (the hand-in
 * confirm, the bonus offer, the violation warning) sets `pointer-events: none` on <body> while it is
 * open and gives it back when it closes. When two of them change in the same moment, or a dialog is
 * moved between the page and the full screen element while open, the give-back can be missed and the
 * whole exam stops taking clicks until a refresh, which also drops full screen and counts as a
 * strike. The exam page looks for that state and clears it.
 *
 * Pure: the caller reads the page and passes what it saw. A lock only counts as orphaned after it
 * was seen on `NEEDED` checks in a row with no modal open, so a dialog that is only part way through
 * opening or closing is never fought.
 */
export const UNSTICK_NEEDED = 2;

export interface PageLockSample {
  /** document.body.style.pointerEvents */
  bodyPointerEvents: string;
  /** Modal layers that are open now (a dialog, an alert dialog, a menu, a list box) */
  modalsOpen: number;
}

/** The selector for a modal layer that is open (Radix marks them data-state="open") */
export const OPEN_MODAL_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
].join(",");

/** Whether this one sample looks like a lock nobody owns */
export const looksOrphaned = (s: PageLockSample): boolean =>
  s.bodyPointerEvents === "none" && s.modalsOpen === 0;

/**
 * Folds one sample into the run of samples so far. `streak` is how many orphaned samples came in a
 * row before this one; the answer says whether to clear now and what the streak is next.
 */
export function nextUnstick(streak: number, s: PageLockSample): { clear: boolean; streak: number } {
  if (!looksOrphaned(s)) return { clear: false, streak: 0 };
  const n = streak + 1;
  return n >= UNSTICK_NEEDED ? { clear: true, streak: 0 } : { clear: false, streak: n };
}
