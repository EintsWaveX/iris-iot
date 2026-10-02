/**
 * The module's step switcher (Brief, Persiapan, Kode, Live). Toggles sibling
 * panels by id like Tabs.tsx, but reads as a progress track (Phase 8): four
 * segments that fill as you move forward, a check on the steps behind you,
 * and big previous / next buttons.
 *
 * - arrow keys clamp at the ends (Home/End jump), Tab reaches the current one
 * - the current step is mirrored into ?step= with replaceState, so a step is
 *   bookmarkable and an assistant can send the whole room to the same one
 * - each change dispatches `iris:step` (detail: the step id), so other
 *   islands on the page (the code workspace's docked pin panel) can react
 *
 * Panels other than the first must carry `hidden` in their own markup.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CaretLeftIcon, CaretRightIcon, CheckIcon } from "@phosphor-icons/react";
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

export const STEP_EVENT = "iris:step";

function readStepFromUrl(steps: Step[]): string | null {
  const requested = new URLSearchParams(window.location.search).get("step");
  return requested && steps.some((s) => s.id === requested) ? requested : null;
}

export default function ModuleCarousel({ id, steps, prevLabel, nextLabel }: Props) {
  const [selected, setSelected] = useState(steps[0]?.id ?? "");
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

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
      window.dispatchEvent(new CustomEvent(STEP_EVENT, { detail: targetId }));
    },
    [steps],
  );

  useEffect(() => {
    const fromUrl = readStepFromUrl(steps);
    if (fromUrl && fromUrl !== steps[0]?.id) select(fromUrl, false);
    const onGo = (e: Event) => {
      const target = (e as CustomEvent<string>).detail;
      if (steps.some((s) => s.id === target) && target !== selectedRef.current)
        select(target, true);
    };
    window.addEventListener("iris:go-step", onGo);
    return () => window.removeEventListener("iris:go-step", onGo);
    // Mount only: re-reading the URL later would fight the user's own clicks.
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
    <div className="stepper" id={id}>
      <button
        type="button"
        className="stepper__arrow"
        disabled={index <= 0}
        aria-label={prevLabel}
        onClick={() => index > 0 && select(steps[index - 1].id, true)}
      >
        <CaretLeftIcon size={20} aria-hidden="true" />
      </button>

      <div className="stepper__track" role="tablist">
        {steps.map((s, i) => {
          const state = i < index ? "done" : i === index ? "now" : "todo";
          return (
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
              data-state={state}
              className="stepper__step"
              onClick={() => select(s.id, true)}
              onKeyDown={(event) => onKeyDown(event, i)}
            >
              <span className="stepper__bar" aria-hidden="true">
                <span />
              </span>
              <span className="stepper__label">
                <span className="stepper__num" aria-hidden="true">
                  {state === "done" ? <CheckIcon size={13} weight="bold" /> : i + 1}
                </span>
                <span className="stepper__text">{s.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="stepper__arrow stepper__arrow--next"
        disabled={index >= steps.length - 1}
        aria-label={nextLabel}
        onClick={() => index < steps.length - 1 && select(steps[index + 1].id, true)}
      >
        <span className="stepper__next-label">
          {index < steps.length - 1 ? steps[index + 1]?.label : ""}
        </span>
        <CaretRightIcon size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
