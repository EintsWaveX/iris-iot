/**
 * The element in full screen, if any (2026-10-06). The browser shows only
 * that element and what is inside it, so a dialog, tooltip, menu or toast
 * portalled to <body> vanishes while Konsol Pi is full screen. Layers
 * portal here instead whenever something is full screen.
 */
import { useEffect, useState } from "react";

export function useFullscreenEl(): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const on = () => setEl((document.fullscreenElement as HTMLElement | null) ?? null);
    on();
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  return el;
}
