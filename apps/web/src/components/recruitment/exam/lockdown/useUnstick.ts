/**
 * Watches the exam page for a click lock nobody owns and clears it (10 Nov 2026). See
 * lib/recruitment/unstick.ts for the why and the rule. Checks once a second while mounted; clearing
 * is reported once to the audit log (`galat_klien`) so we learn whether it ever fires.
 */
import { useEffect } from "react";
import { laporKlien } from "../../../../scripts/lapor-galat";
import { OPEN_MODAL_SELECTOR, nextUnstick } from "../../../../lib/recruitment/unstick";

const CHECK_MS = 1000;

export function useUnstick(): void {
  useEffect(() => {
    let streak = 0;
    const id = setInterval(() => {
      const r = nextUnstick(streak, {
        bodyPointerEvents: document.body.style.pointerEvents,
        modalsOpen: document.querySelectorAll(OPEN_MODAL_SELECTOR).length,
      });
      streak = r.streak;
      if (!r.clear) return;
      document.body.style.pointerEvents = "";
      laporKlien("exam: cleared an orphaned body pointer-events lock");
    }, CHECK_MS);
    return () => clearInterval(id);
  }, []);
}
