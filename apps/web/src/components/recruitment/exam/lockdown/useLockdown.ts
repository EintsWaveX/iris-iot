/**
 * The soft lockdown on the page (EXAM-ENGINE 7, prompt 10). It reports what
 * happened and blocks a few things; it never fails anyone, the Master decides.
 * The rules (merging, the 1.5 s debounce, the cap, the devtools heuristic) are
 * pure in lib/recruitment/seat-lockdown.ts; this file wires them to the
 * browser and to POST test-strike.
 *
 * Signals while a part runs for this seat: fullscreen left (the cover shows),
 * tab hidden, window out of focus, paste (blocked), devtools keys and a
 * devtools-sized window. Copy, cut, the context menu, print and select-all
 * outside a field are blocked and not counted. A strike opens when the signal
 * comes, is sent at once (keepalive, so it leaves while the tab hides) and is
 * sent again when it closes. Strikes that cannot be sent wait in memory and go
 * out with their original server time.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { jamServer } from "../../../../lib/jam";
import type { PartKey } from "../../../../lib/recruitment/exam-types";
import {
  StrikeTracker,
  devtoolsLikelyOpen,
  isDevtoolsKey,
  type Strike,
  type StrikeEvent,
} from "../../../../lib/recruitment/seat-lockdown";

const rid = () => `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const isField = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

/**
 * Live Coding opens the browser's device choosers (Web Serial, Web Bluetooth), which take focus
 * from the page. While one is open, and for a moment after, leaving the page is not a kejadian
 * (EXAM-ENGINE 7, 9.5: "device pickers exempt").
 */
const pickerGate = { until: 0 };
export function holdPicker(ms = 60_000): void {
  pickerGate.until = Date.now() + ms;
}
/** The chooser closed: a short grace for the focus to come back */
export function releasePicker(graceMs = 1500): void {
  pickerGate.until = Date.now() + graceMs;
}
const pickerOpen = () => Date.now() < pickerGate.until;

export interface Lockdown {
  /** Something is full screen (our root) */
  fullscreen: boolean;
  /** A kejadian is open: the seat is out right now */
  away: boolean;
  enter: () => Promise<boolean>;
}

export function useLockdown(o: {
  active: boolean;
  seatId: number | null;
  part: PartKey | null;
  rootRef: RefObject<HTMLElement | null>;
}): Lockdown {
  const { active, seatId, part, rootRef } = o;
  const [fullscreen, setFullscreen] = useState(false);
  const [away, setAway] = useState(false);
  const tracker = useRef(new StrikeTracker(rid));
  const queue = useRef(new Map<string, Record<string, unknown>>());
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partRef = useRef(part);
  partRef.current = part;
  // The text last copied inside the page (Live Coding allows pasting only that)
  const copied = useRef("");

  const flush = useCallback(async () => {
    retry.current = null;
    for (const [id, body] of [...queue.current]) {
      try {
        const r = await fetch("/api/recruitment/test-strike", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
        });
        // A refusal is final; only a lost connection or a server error is tried again.
        if (r.ok || (r.status >= 400 && r.status < 500)) queue.current.delete(id);
      } catch {
        /* offline: it stays queued */
      }
    }
    if (queue.current.size && !retry.current) retry.current = setTimeout(flush, 5000);
  }, []);

  const report = useCallback(
    (ev: StrikeEvent) => {
      if (!ev) return;
      const s: Strike = ev.strike;
      queue.current.set(s.id, {
        id: s.id,
        kinds: s.kinds,
        at: s.at,
        back: s.back,
        part: partRef.current ?? undefined,
      });
      setAway(tracker.current.open() !== null);
      void flush();
    },
    [flush],
  );

  const state = () => ({
    fullscreen: !!document.fullscreenElement,
    visible: document.visibilityState === "visible",
    focused: document.hasFocus(),
  });
  const settle = useCallback(() => report(tracker.current.settle(state(), jamServer())), [report]);

  /** Fullscreen needs a click; Esc is locked in Chromium so one tap does not leave it (7) */
  const enter = useCallback(async () => {
    const el = rootRef.current ?? document.documentElement;
    try {
      await el.requestFullscreen({ navigationUI: "hide" });
    } catch {
      return false;
    }
    try {
      await (
        navigator as unknown as { keyboard?: { lock?: (k: string[]) => Promise<void> } }
      ).keyboard?.lock?.(["Escape"]);
    } catch {
      /* not Chromium, or refused: Esc still works */
    }
    return true;
  }, [rootRef]);

  // The fullscreen flag follows the browser whether or not a part runs.
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    on();
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  useEffect(() => {
    if (!active || seatId === null) return;
    const t = tracker.current;
    const signal = (kind: Parameters<StrikeTracker["signal"]>[0], instant = false) => {
      // A device chooser (Live Coding's serial and Bluetooth pickers) takes focus without leaving the test
      if (!instant && kind !== "alat" && pickerOpen()) return;
      report(t.signal(kind, jamServer(), { instant }));
      // A signal that joined a strike that had just closed reopens it; if the page is fine again, close it.
      if (!instant) settle();
    };
    // A page that was reloaded or reopened ends what its earlier life left open (the absence ends when
    // this page is back), then a part that starts while the seat is not full screen starts out of bounds.
    void fetch("/api/recruitment/test-strike", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: true, part: partRef.current ?? undefined }),
      keepalive: true,
    })
      .catch(() => undefined)
      .then(() => {
        if (!document.fullscreenElement) signal("layar");
      });
    const onFs = () => {
      if (!document.fullscreenElement) signal("layar");
      else settle();
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") signal("tab");
      else settle();
    };
    // Focus leaving the window (another app, a devtools panel) blurs it without hiding the tab.
    const onBlur = () =>
      setTimeout(() => {
        if (!document.hasFocus()) signal("fokus");
      }, 0);
    const onFocus = () => settle();
    // Live Coding is written in the page, so copy and cut work there, and a paste is allowed only
    // when it is the very text last copied in this page (EXAM-ENGINE 7, ruling 2026-10-24).
    const coding = () => partRef.current === "livecode";
    const onPaste = (e: ClipboardEvent) => {
      if (coding() && isField(e.target) && copied.current) {
        const text = e.clipboardData?.getData("text/plain") ?? "";
        if (text === copied.current) return;
      }
      e.preventDefault();
      signal("tempel", true);
    };
    const onCopy = (e: Event) => {
      if (!coding()) return e.preventDefault();
      const sel = document.getSelection()?.toString() ?? "";
      if (sel) copied.current = sel;
    };
    const stop = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if (isDevtoolsKey(e)) {
        e.preventDefault();
        signal("alat", true);
        return;
      }
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === "p" || (k === "a" && !isField(e.target))))
        e.preventDefault();
    };
    const onResize = () => {
      if (document.fullscreenElement && devtoolsLikelyOpen(window)) signal("alat");
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCopy, true);
    document.addEventListener("contextmenu", stop, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCopy, true);
      document.removeEventListener("contextmenu", stop, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("online", online);
      // The part is over: whatever was open ends now, so no kejadian runs on into the lobby.
      report(t.settle({ fullscreen: true, visible: true, focused: true }, jamServer()));
    };
  }, [active, seatId, report, settle, flush]);

  useEffect(
    () => () => {
      if (retry.current) clearTimeout(retry.current);
    },
    [],
  );

  return { fullscreen, away, enter };
}
