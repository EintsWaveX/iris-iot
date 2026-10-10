/**
 * First-visit coach marks for praktikan (Phase 8, steps redone in Phase 9):
 * three short bubbles that point at the next step card, the raise hand
 * button and the Live card. Seen once per browser (localStorage), skippable, and
 * a step whose target is not on the page is simply left out.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Lang } from "../../lib/kelas";
import { dict } from "../../lib/app";
import { DS } from "./dashStrings";

const KEY = "iris-coach-v2";

// Phase 9 (mockup p-dash tour): the next step card, the raise hand button
// and the Live card. Titles and text come from the dashboard strings.
const SEL = [".dash__next", ".minibar__help", ".dash__live-cta"];
const STEPS = Object.fromEntries(
  (Object.keys(DS) as Lang[]).map((l) => [
    l,
    DS[l].tour.map(([title, text], n) => ({ sel: SEL[n], title, text })),
  ]),
) as Record<Lang, { sel: string; title: string; text: string }[]>;

const L = dict({
  id: { next: "Lanjut", done: "Selesai", skip: "Lewati" },
  en: { next: "Next", done: "Done", skip: "Skip" },
  zh: { next: "下一个", done: "完成", skip: "跳过" },
});

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export default function CoachMarks({ lang }: { lang: Lang }) {
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const action = useRef<HTMLButtonElement>(null);
  const steps = STEPS[lang].filter(
    (s) => typeof document !== "undefined" && document.querySelector(s.sel),
  );

  useEffect(() => {
    if (seen()) return;
    // Give the mini-bar a moment to mount before measuring anything.
    const id = window.setTimeout(() => setI(0), 1200);
    return () => window.clearTimeout(id);
  }, []);

  const step = i !== null ? steps[i] : undefined;

  const measure = useCallback(() => {
    const el = step ? document.querySelector(step.sel) : null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    document.querySelector(step.sel)?.scrollIntoView({ block: "nearest" });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  // Keyboard users land on the bubble's action straight away.
  const shown = rect !== null;
  useEffect(() => {
    if (shown) action.current?.focus({ preventScroll: true });
  }, [i, shown]);

  function end() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setI(null);
  }

  if (i === null || !step || !rect) return null;
  const last = i >= steps.length - 1;
  const w = Math.min(360, window.innerWidth - 32);
  const below = rect.bottom + 14 + 150 < window.innerHeight;
  const left = Math.max(
    16,
    Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 16),
  );
  const arrow = Math.max(18, Math.min(rect.left + rect.width / 2 - left, w - 18));
  const t = L[lang];

  return createPortal(
    <div className="coach" role="dialog" aria-live="polite" aria-label={step.title}>
      <span
        className="coach__ring"
        style={{
          transform: `translate(${rect.left - 6}px, ${rect.top - 6}px)`,
          width: rect.width + 12,
          height: rect.height + 12,
        }}
      />
      <div
        className="coach__bubble sweep-edge"
        data-side={below ? "below" : "above"}
        style={{
          left,
          width: w,
          top: below ? rect.bottom + 14 : undefined,
          bottom: below ? undefined : window.innerHeight - rect.top + 14,
          ["--arrow" as string]: `${arrow}px`,
        }}
      >
        <span className="pill">
          {i + 1}/{steps.length}
        </span>
        <b className="coach__title">{step.title}</b>
        <p>{step.text}</p>
        <div className="coach__foot">
          <span className="coach__dots" aria-hidden="true">
            {steps.map((_, n) => (
              <span key={n} data-on={n === i ? "yes" : undefined} />
            ))}
          </span>
          {!last && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={end}>
              {t.skip}
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => (last ? end() : setI(i + 1))}
            ref={action}
          >
            {last ? t.done : t.next}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
