/**
 * A tab strip that shows/hides sibling panels by ID, converted from a
 * vanilla-script Astro component to a React island (Stage 4). The panels
 * themselves are NOT children of this component -- they're plain sibling
 * markup elsewhere on the page (e.g. masuk.astro's #panel-praktikan /
 * #panel-asisten) -- so this still just toggles their `hidden` attribute
 * by ID exactly as the vanilla version did, rather than owning their
 * content. Keyboard behaviour follows the WAI-ARIA tabs pattern: arrow
 * keys move focus and selection together, Home/End jump to the ends.
 *
 * Whichever panel isn't the initial `active` tab must already carry
 * `hidden` in its own markup, same as before this file existed -- this
 * component reacts to selection changes, it does not synchronise the
 * very first paint.
 *
 * Usage (unchanged from the Astro version, client:load added):
 *   <Tabs
 *     client:load
 *     id="sesi-tabs"
 *     tabs={[{id: "s1", label: "Sesi 1"}, {id: "s2", label: "Sesi 2"}]}
 *   />
 *   <div id="s1" role="tabpanel">...</div>
 *   <div id="s2" role="tabpanel" hidden>...</div>
 */
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import "./Tabs.css";

interface Tab {
  id: string;
  label: string;
}

interface Props {
  id: string;
  tabs: Tab[];
  active?: string;
}

export default function Tabs({ id, tabs, active }: Props) {
  const [selected, setSelected] = useState(active ?? tabs[0]?.id ?? "");
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = useCallback(
    (targetId: string) => {
      setSelected(targetId);
      for (const t of tabs) {
        const panel = document.getElementById(t.id);
        if (panel) panel.hidden = t.id !== targetId;
      }
    },
    [tabs],
  );

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === -1) return;
    event.preventDefault();
    buttonRefs.current[next]?.focus();
    select(tabs[next].id);
  }

  return (
    <div className="tabs" id={id} role="tablist">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            buttonRefs.current[i] = el;
          }}
          type="button"
          className="tabs__tab"
          role="tab"
          id={`${t.id}-tab`}
          aria-controls={t.id}
          aria-selected={t.id === selected}
          tabIndex={t.id === selected ? 0 : -1}
          onClick={() => select(t.id)}
          onKeyDown={(event) => onKeyDown(event, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
