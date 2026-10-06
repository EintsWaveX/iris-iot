/**
 * Where a Radix popover should portal (2026-10-05): into the open dialog
 * that holds it, else the body. A modal dialog blocks wheel scrolling on
 * everything outside itself, so a popover list portalled to the body
 * inside a dialog could not be scrolled with the mouse (the time picker in
 * New Susulan). Dropdown.tsx does the same for its own popup.
 *
 * Usage: render `marker` next to the trigger, pass `host` as the Portal's
 * `container`.
 */
import { useLayoutEffect, useRef, useState } from "react";

export function useDialogHost() {
  const ref = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<HTMLElement | undefined>(undefined);
  useLayoutEffect(() => {
    // Full screen first: a full-screen element inside a dialog (the slides'
    // PDF viewer) shows only itself, so a menu portalled to the dialog vanishes.
    const fs = document.fullscreenElement as HTMLElement | null;
    const h =
      (fs?.contains(ref.current) ? fs : undefined) ??
      ref.current?.closest<HTMLElement>('[role="dialog"]') ??
      undefined;
    setHost((prev) => (prev === h ? prev : h));
  });
  return { marker: <span ref={ref} hidden />, host };
}
