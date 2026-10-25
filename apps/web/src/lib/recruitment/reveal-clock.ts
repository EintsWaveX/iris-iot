/**
 * The envelope arrives without a refresh (06 build, item 3). The page knows
 * the time a locked result will be revealed (stage and time only, never the
 * result), sets a timer to the exact moment and then asks the server again;
 * the server is the judge, so an envelope shows only when its answer lists
 * it. The countdown uses the server's clock from the last answer plus the
 * time elapsed on the device (performance.now), never Date.now: a phone set
 * ahead neither shows an envelope early nor misses the moment. If the server
 * says "not yet" (clocks differ by a hair) it asks again after a short, growing
 * pause. A reveal still days away is split into timers the browser can hold.
 *
 * Siaran also refetches on lock, unlock and open, so a change made while the
 * page is open arrives at once; this timer is only for the clock itself.
 */
import { useEffect, useRef } from "react";
import { msUntilReveal, retryDelay, wakeDelay } from "./reveal";

export function useRevealClock(
  serverNow: string | null | undefined,
  /** The reveal times still to come, ISO */
  revealAts: readonly string[],
  refresh: () => void,
): void {
  const attempt = useRef(0);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const key = revealAts.join("|");

  useEffect(() => {
    if (!revealAts.length || !serverNow) {
      attempt.current = 0;
      return;
    }
    // The effect runs as the answer lands, so no device time has elapsed since the server spoke.
    const next = Math.min(...revealAts.map((x) => Date.parse(x)));
    const rem = msUntilReveal(next, Date.parse(serverNow), 0);
    let timer: number;
    if (rem > 0) {
      attempt.current = 0;
      timer = window.setTimeout(() => refreshRef.current(), wakeDelay(rem));
    } else {
      // Past by the server's own clock but still listed as pending: ask again soon.
      timer = window.setTimeout(() => refreshRef.current(), retryDelay(attempt.current++));
    }
    return () => window.clearTimeout(timer);
  }, [key, serverNow]);
}
