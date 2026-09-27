/**
 * A tab strip that shows/hides sibling panels by ID. The panels themselves
 * are NOT children of this component -- they're plain sibling markup
 * elsewhere on the page (e.g. the login dialog's #panel-praktikan /
 * #panel-asisten, or a module's live-view tab panels) -- so this toggles
 * their `hidden` attribute by ID rather than owning their content.
 *
 * Whichever panel isn't the initial `active` tab must already carry
 * `hidden` in its own markup -- this component reacts to selection
 * changes, it does not synchronise the very first paint.
 *
 * P7.1: rewritten on top of @radix-ui/react-tabs's Root/List/Trigger
 * (no <Tabs.Content> -- the panels living outside this component doesn't
 * fit Radix's content-ownership model, so only the tablist/trigger half is
 * used). This is a pure internals swap: the external API and the
 * sibling-panel-toggling behaviour are unchanged, but keyboard handling
 * (arrow keys, Home/End, roving tabindex) and ARIA wiring now come from
 * Radix instead of the hand-rolled version this replaced, so every caller
 * needs no changes. Also adds the P7.1 tab-strip decision: a single row
 * that scrolls instead of wrapping, with a `mask-image` edge fade shown
 * only on the side that has more content, and the active tab scrolled into
 * view on selection -- this is what fixes F10 (tabs wrapping into three
 * rows on mobile) wherever a caller adopts this component.
 *
 * Usage (unchanged):
 *   <Tabs
 *     client:load
 *     id="sesi-tabs"
 *     tabs={[{id: "s1", label: "Sesi 1"}, {id: "s2", label: "Sesi 2"}]}
 *   />
 *   <div id="s1" role="tabpanel">...</div>
 *   <div id="s2" role="tabpanel" hidden>...</div>
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
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
  const listRef = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState<"start" | "end" | "both" | "none">("none");

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

  const updateEdgeFade = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    if (atStart && atEnd) setEdge("none");
    else if (atStart) setEdge("end");
    else if (atEnd) setEdge("start");
    else setEdge("both");
  }, []);

  useEffect(() => {
    updateEdgeFade();
    const el = listRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateEdgeFade, { passive: true });
    const ro = new ResizeObserver(updateEdgeFade);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateEdgeFade);
      ro.disconnect();
    };
  }, [updateEdgeFade]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('.tabs__tab[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);

  return (
    <RadixTabs.Root id={id} className="tabs-root" value={selected} onValueChange={select}>
      <div className="tabs-scroll" data-edge={edge}>
        <RadixTabs.List ref={listRef} className="tabs" aria-label={id}>
          {tabs.map((t) => (
            <RadixTabs.Trigger key={t.id} value={t.id} className="tabs__tab">
              {t.label}
            </RadixTabs.Trigger>
          ))}
        </RadixTabs.List>
      </div>
    </RadixTabs.Root>
  );
}
