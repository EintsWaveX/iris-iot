import type { KeyboardEvent } from "react";

/**
 * Keyboard support for a hand-rolled `role="tablist"` (the ARIA tabs
 * pattern): ArrowLeft/ArrowRight move between tabs and wrap, Home/End jump
 * to the ends. Used by the strips that render one panel from React state and
 * so can't sit on `ui/Tabs.tsx` (which toggles sibling `hidden` panels).
 * Pair it with a roving `tabIndex` (`0` on the selected tab, `-1` on the
 * rest) so Tab enters the strip once and leaves it once.
 *
 * Returns the index to move to, or null when the key isn't one of ours.
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** onKeyDown for the tablist element itself: selects and focuses the target. */
export function onTablistKeyDown(
  event: KeyboardEvent<HTMLElement>,
  ids: readonly string[],
  activeId: string,
  select: (id: string) => void,
): void {
  const next = nextTabIndex(event.key, ids.indexOf(activeId), ids.length);
  if (next === null) return;
  event.preventDefault();
  select(ids[next]);
  event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
}
