/**
 * Exit presence: something that comes and goes (a notice, a banner, a row of detail) should fade out, not
 * vanish. `usePresence(wanted)` keeps it rendered for the length of the exit fade after it stops being
 * wanted, then lets go. Put `className` on the element itself, not on a wrapper, so layout stays as it was:
 *
 *   const p = usePresence(offline);
 *   if (!p.shown) return null;
 *   return <div className={`notice ${p.className}`}>...</div>;
 *
 * The entrance is `.fade` (260 ms, opacity and 6 px, ease-out-expo) and the exit `.fade--out` (120 ms),
 * both in styles/app.css. Reduced motion and Low Detail skip the exit (calm-motion.ts): it goes at once.
 * Wanted again mid-fade, it simply stays: the timer is cancelled and the fade class drops back to the entrance.
 */
import { useEffect, useState } from "react";
import { calmMotion } from "../../lib/calm-motion";

/** How long the exit fade holds the element. Matches `.fade--out` in app.css. */
export const EXIT_MS = 120;

export function usePresence(wanted: boolean, exitMs: number = EXIT_MS) {
  // True once it has been on screen, until the exit fade is over.
  const [held, setHeld] = useState(wanted);

  useEffect(() => {
    if (wanted) {
      setHeld(true);
      return;
    }
    if (!held) return;
    if (calmMotion()) {
      setHeld(false);
      return;
    }
    const id = window.setTimeout(() => setHeld(false), exitMs);
    return () => window.clearTimeout(id);
  }, [wanted, held, exitMs]);

  const leaving = !wanted && held && !calmMotion();
  return {
    shown: wanted || leaving,
    leaving,
    className: leaving ? "fade fade--out" : "fade",
  };
}
