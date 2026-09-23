/**
 * A toast host, converted from a vanilla-script Astro component to a real
 * React island (Stage 4): the queue of visible toasts is genuine UI state
 * now, not DOM nodes built and torn down by hand.
 *
 * Include exactly once per page, with client:load. Anything on the page --
 * including plain inline scripts that know nothing about React -- can
 * still call window.Toast.show(message, tone) to raise a notice, the
 * pattern apps/modul4/src/ui-notify.js established. That imperative bridge is
 * installed in an effect on mount and torn down on unmount, since this
 * component isn't transition:persist and unmounts/remounts on every
 * client-side navigation.
 */
import { useEffect, useState } from "react";
import "./Toast.css";

type Tone = "info" | "ok" | "warn" | "danger";

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  shown: boolean;
}

let nextId = 0;

export default function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    function show(message: string, tone: Tone = "info") {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, tone, shown: false }]);

      // Two rAFs: the element needs one committed frame at its initial
      // (hidden) state before the "shown" flag can transition from it.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, shown: true } : t)));
        });
      });

      window.setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, shown: false } : t)));
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 400);
      }, 4000);
    }

    window.Toast = { show };
    return () => {
      delete window.Toast;
    };
  }, []);

  return (
    <div className="toast-host" id="toast-host" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <p key={t.id} className="toast" data-tone={t.tone} data-shown={t.shown ? "yes" : undefined}>
          {t.message}
        </p>
      ))}
    </div>
  );
}
