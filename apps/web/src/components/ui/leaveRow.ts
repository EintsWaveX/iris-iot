/**
 * Plays a row out (fades it and slides it aside, 160 ms) before the caller
 * removes it from the list, so a deleted row goes out the way a new one comes
 * in. Pass the button that was pressed (or the row itself); the row is its
 * nearest `[data-item]` unless `selector` says otherwise. Resolves at once for
 * reduced motion, Low Detail, or when there is no row to animate, so callers
 * can always `await` it.
 *
 *   onClick={(e) => void leaveRow(e.currentTarget).then(() => remove(i))}
 */
import { calmMotion } from "../../lib/calm-motion";

const OUT_MS = 160;

export async function leaveRow(from: Element | null, selector = "[data-item]"): Promise<void> {
  const row = from?.closest<HTMLElement>(selector) ?? null;
  if (!row || calmMotion() || typeof row.animate !== "function") return;
  // The row is on its way out: a second press on it does nothing.
  row.style.pointerEvents = "none";
  try {
    await row.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateX(14px)" },
      ],
      { duration: OUT_MS, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
    ).finished;
  } catch {
    /* cancelled: the row goes anyway */
  }
}
