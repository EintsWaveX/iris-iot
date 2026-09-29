/**
 * User-resizable side-by-side panes (P8.7), over react-resizable-panels v4:
 * the console board | inspector | activity, the code step's pin panel and
 * the live room's flow | readings | layers.
 *
 * - drag a handle, or focus it and use the arrow keys; double click resets
 * - `[` / `]` on a focused handle collapse the pane before / after it when
 *   that pane is `collapsible`
 * - sizes are remembered per `id` (localStorage, guarded in try/catch)
 * - below `stackBelow` px (1024 by default) the panes simply stack; the
 *   caller decides what becomes a sheet at that width
 */
import { Fragment, useMemo, type KeyboardEvent, type ReactNode } from "react";
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { useMinWidth } from "../../lib/hooks";
import "./ResizablePanes.css";

export interface Pane {
  id: string;
  content: ReactNode;
  /** Percent of the group. */
  defaultSize: number;
  minSize: number;
  maxSize?: number;
  collapsible?: boolean;
  label: string;
}

const safeStorage = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage blocked: sizes just are not remembered */
    }
  },
};

interface Props {
  id: string;
  panes: Pane[];
  stackBelow?: number;
  handleLabel: string;
  className?: string;
}

export default function ResizablePanes({
  id,
  panes,
  stackBelow = 1024,
  handleLabel,
  className,
}: Props) {
  const wide = useMinWidth(stackBelow);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `iris-panes-${id}`,
    storage: safeStorage,
    panelIds: panes.map((p) => p.id),
  });
  const refs = [usePanelRef(), usePanelRef(), usePanelRef(), usePanelRef()];
  const initial = useMemo(
    () => Object.fromEntries(panes.map((p) => [p.id, p.defaultSize])),
    [panes],
  );

  if (!wide) {
    return (
      <div className={["panes panes--stacked", className].filter(Boolean).join(" ")}>
        {panes.map((p) => (
          <section key={p.id} className="panes__pane" aria-label={p.label}>
            {p.content}
          </section>
        ))}
      </div>
    );
  }

  const onKey = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "[" && e.key !== "]") return;
    const target = e.key === "[" ? i : i + 1;
    const ref = refs[target]?.current;
    if (!ref || !panes[target]?.collapsible) return;
    e.preventDefault();
    if (ref.isCollapsed()) ref.expand();
    else ref.collapse();
  };

  return (
    <Group
      id={`iris-panes-${id}`}
      orientation="horizontal"
      className={["panes", className].filter(Boolean).join(" ")}
      defaultLayout={defaultLayout ?? initial}
      onLayoutChanged={onLayoutChanged}
    >
      {panes.map((p, i) => (
        <Fragment key={p.id}>
          <Panel
            id={p.id}
            panelRef={refs[i]}
            defaultSize={`${p.defaultSize}`}
            minSize={`${p.minSize}`}
            maxSize={p.maxSize === undefined ? undefined : `${p.maxSize}`}
            collapsible={p.collapsible}
            className="panes__pane"
          >
            <section aria-label={p.label} className="panes__inner">
              {p.content}
            </section>
          </Panel>
          {i < panes.length - 1 && (
            <Separator
              className="panes__handle"
              aria-label={handleLabel}
              title={handleLabel}
              onKeyDown={onKey(i)}
            />
          )}
        </Fragment>
      ))}
    </Group>
  );
}
