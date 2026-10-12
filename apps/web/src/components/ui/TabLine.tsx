/**
 * The underline tab line (Phase 9 kit, mockup TabLine), controlled by its
 * caller. One row that never wraps: when the tabs are wider than the
 * screen the row scrolls sideways, a fade marks the side with more tabs,
 * and the open tab is scrolled into view. Arrow keys, Home and End move
 * between tabs (roving tabindex).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./Tabs.css";

export interface TabItem<V extends string> {
  v: V;
  label: ReactNode;
  /** A count shown after the label. */
  n?: number;
  /** Tints the tab by its state: all set, needs a look, something wrong. */
  tone?: "ok" | "warn" | "bad";
}

interface Props<V extends string> {
  tabs: TabItem<V>[];
  value: V;
  onChange: (v: V) => void;
  /** The tablist's accessible name. */
  label: string;
  className?: string;
  /** The boxed segmented look (mockup Tabs) instead of the underline. It
   * fills its row in equal parts and SegFit wraps it when labels can't fit. */
  seg?: boolean;
}

/** Edge fade state for a horizontally scrolling row. */
export function useEdgeFade<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [edge, setEdge] = useState<"start" | "end" | "both" | "none">("none");
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setEdge(atStart && atEnd ? "none" : atStart ? "end" : atEnd ? "start" : "both");
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);
  return { ref, edge, update };
}

/** Scroll a row sideways so `item` is fully visible, without moving the page. */
export function scrollRowTo(row: HTMLElement | null, item: HTMLElement | null) {
  if (!row || !item) return;
  const r = row.getBoundingClientRect();
  const o = item.getBoundingClientRect();
  if (o.left < r.left + 8) row.scrollBy({ left: o.left - r.left - 24, behavior: "smooth" });
  else if (o.right > r.right - 8)
    row.scrollBy({ left: o.right - r.right + 24, behavior: "smooth" });
}

export default function TabLine<V extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
  seg,
}: Props<V>) {
  const { ref, edge, update } = useEdgeFade<HTMLDivElement>();

  useEffect(() => {
    const row = ref.current;
    scrollRowTo(row, row?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null);
    update();
  }, [value, tabs.length, ref, update]);

  const move = (i: number) => {
    const next = tabs[(i + tabs.length) % tabs.length];
    onChange(next.v);
    requestAnimationFrame(() =>
      ref.current?.querySelector<HTMLElement>(`[data-tab="${next.v}"]`)?.focus(),
    );
  };

  const buttons = tabs.map((t, i) => (
    <button
      key={t.v}
      type="button"
      role="tab"
      data-tab={t.v}
      data-tone={t.tone}
      aria-selected={value === t.v}
      tabIndex={value === t.v ? 0 : -1}
      className={seg ? undefined : "tabs__tab"}
      onClick={() => onChange(t.v)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") move(i + 1);
        else if (e.key === "ArrowLeft") move(i - 1);
        else if (e.key === "Home") move(0);
        else if (e.key === "End") move(tabs.length - 1);
        else return;
        e.preventDefault();
      }}
    >
      {t.label}
      {t.n != null && <span className="tabs__count">{t.n}</span>}
    </button>
  ));

  if (seg)
    return (
      <div
        ref={ref}
        className={`seg${className ? ` ${className}` : ""}`}
        role="tablist"
        aria-label={label}
      >
        {buttons}
      </div>
    );
  return (
    <div className={`tabs-scroll${className ? ` ${className}` : ""}`} data-edge={edge}>
      <div ref={ref} className="tabs" role="tablist" aria-label={label}>
        {buttons}
      </div>
    </div>
  );
}
