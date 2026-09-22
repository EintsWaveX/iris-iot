/**
 * The four-step module carousel's step switcher: Brief, Setup, Code, Go
 * live. Modelled on Tabs.tsx's own shape (toggles sibling panels by ID
 * rather than owning their content) but purpose built rather than reused,
 * because a carousel differs from a generic tab strip in three ways this
 * component leans on:
 *
 *   - previous/next controls and a step-dot row, not a pill strip
 *   - arrow keys clamp at the ends instead of wrapping (Home/End still jump)
 *   - the current step is mirrored into the URL as ?step=<id> via
 *     history.replaceState (no navigation, no Astro view-transition retrigger)
 *     so a step is bookmarkable and an assistant can send the whole room to
 *     the same URL, per the Stage 7 plan's "deep-linkable" requirement
 *
 * Whichever panel isn't the first step must already carry `hidden` in its
 * own markup, same convention as Tabs.tsx -- this only reacts to selection
 * changes, it does not synchronise the very first paint.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import "./ModuleCarousel.css";

interface Step {
  id: string;
  label: string;
}

interface Props {
  id: string;
  steps: Step[];
  prevLabel: string;
  nextLabel: string;
}

function readStepFromUrl(steps: Step[]): string | null {
  const requested = new URLSearchParams(window.location.search).get("step");
  return requested && steps.some((s) => s.id === requested) ? requested : null;
}

export default function ModuleCarousel({ id, steps, prevLabel, nextLabel }: Props) {
  const [selected, setSelected] = useState(steps[0]?.id ?? "");
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = useCallback(
    (targetId: string, syncUrl: boolean) => {
      setSelected(targetId);
      for (const s of steps) {
        const panel = document.getElementById(s.id);
        if (panel) panel.hidden = s.id !== targetId;
      }
      if (syncUrl) {
        const url = new URL(window.location.href);
        url.searchParams.set("step", targetId);
        window.history.replaceState(window.history.state, "", url);
      }
    },
    [steps],
  );

  // Deep-link support: a URL loaded with ?step=code opens on that step
  // rather than always resetting to the first one.
  // Runs once on mount only: re-running on every `select`/`steps` identity
  // change would fight a user's own step clicks by re-reading a URL that
  // hasn't changed since the initial navigation.
  useEffect(() => {
    const fromUrl = readStepFromUrl(steps);
    if (fromUrl && fromUrl !== steps[0]?.id) select(fromUrl, false);
  }, []);

  const index = steps.findIndex((s) => s.id === selected);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, i: number) {
    let next = -1;
    if (event.key === "ArrowRight") next = Math.min(i + 1, steps.length - 1);
    else if (event.key === "ArrowLeft") next = Math.max(i - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = steps.length - 1;
    if (next === -1 || next === i) return;
    event.preventDefault();
    buttonRefs.current[next]?.focus();
    select(steps[next].id, true);
  }

  return (
    <div className="carousel-steps" id={id}>
      <button
        type="button"
        className="carousel-steps__arrow"
        disabled={index <= 0}
        aria-label={prevLabel}
        onClick={() => index > 0 && select(steps[index - 1].id, true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>

      <div className="carousel-steps__dots" role="tablist">
        {steps.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${s.id}-tab`}
            aria-controls={s.id}
            aria-selected={s.id === selected}
            tabIndex={s.id === selected ? 0 : -1}
            data-step-id={s.id}
            className="carousel-steps__dot"
            onClick={() => select(s.id, true)}
            onKeyDown={(event) => onKeyDown(event, i)}
          >
            <span className="carousel-steps__dot-mark" aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="carousel-steps__arrow"
        disabled={index >= steps.length - 1}
        aria-label={nextLabel}
        onClick={() => index < steps.length - 1 && select(steps[index + 1].id, true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
