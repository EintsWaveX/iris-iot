/**
 * The toast host. Phase 8: mounted once, globally, from Base.astro (it used
 * to be on four pages only, so a toast raised on a module page or the
 * landing page silently went nowhere), and toasts can now carry one action,
 * normally "Urungkan" / "Undo" for a change that already applied.
 *
 * Anything on the page, including plain scripts that know nothing about
 * React, raises one with:
 *
 *   window.Toast?.show("Modul 3 dibuka.", "ok", {
 *     action: { label: "Urungkan", onClick: () => undo() },
 *   });
 *
 * A toast with an action stays up longer (7 s) and pauses while hovered or
 * focused, so there is time to reach the button.
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon, XIcon } from "@phosphor-icons/react";
import "./Toast.css";

type Tone = "info" | "ok" | "warn" | "danger";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  shown: boolean;
  action?: ToastAction;
  ms: number;
}

let nextId = 0;

const ICON = {
  info: InfoIcon,
  ok: CheckCircleIcon,
  warn: WarningIcon,
  danger: XCircleIcon,
};

export default function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  function hide(id: number) {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, shown: false } : x)));
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 400);
  }

  function arm(id: number, ms: number) {
    const old = timers.current.get(id);
    if (old) clearTimeout(old);
    timers.current.set(
      id,
      setTimeout(() => hide(id), ms),
    );
  }

  useEffect(() => {
    function show(
      message: string,
      tone: Tone = "info",
      opts?: { action?: ToastAction; duration?: number },
    ) {
      const id = nextId++;
      const ms = opts?.duration ?? (opts?.action ? 7000 : 4000);
      setToasts((prev) => [
        ...prev.slice(-3),
        { id, message, tone, shown: false, action: opts?.action, ms },
      ]);
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, shown: true } : t))),
        ),
      );
      arm(id, ms);
    }
    window.Toast = { show };
    const map = timers.current;
    return () => {
      delete window.Toast;
      map.forEach((t) => clearTimeout(t));
    };
  }, []);

  return (
    <div className="toast-host" id="toast-host" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div
            key={t.id}
            className="toast"
            data-tone={t.tone}
            data-shown={t.shown ? "yes" : undefined}
            onMouseEnter={() => {
              const x = timers.current.get(t.id);
              if (x) clearTimeout(x);
            }}
            onMouseLeave={() => arm(t.id, 2500)}
            onFocus={() => {
              const x = timers.current.get(t.id);
              if (x) clearTimeout(x);
            }}
          >
            <Icon className="toast__icon" size={18} aria-hidden="true" />
            <p className="toast__msg">{t.message}</p>
            {t.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  t.action?.onClick();
                  hide(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              className="toast__close"
              aria-label={document.documentElement.lang !== "id" ? "Close" : "Tutup"}
              onClick={() => hide(t.id)}
            >
              <XIcon size={16} aria-hidden="true" />
            </button>
            <span
              className="toast__timer"
              style={{ animationDuration: `${t.ms}ms` }}
              aria-hidden="true"
            />
          </div>
        );
      })}
    </div>
  );
}
