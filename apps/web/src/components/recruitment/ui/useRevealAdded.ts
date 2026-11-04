/**
 * After a "Tambah ..." button adds a row to the end of a list, take the reader
 * to it: scroll the new row into view and put the cursor in its first field, so
 * nobody hunts for what the button just made. Mark each row with `data-item`,
 * hang `ref` on the list, and call `ask()` in the button's click handler.
 */
import { useCallback, useEffect, useRef } from "react";

export function useRevealAdded(count: number) {
  const root = useRef<HTMLElement | null>(null);
  const asked = useRef(false);
  const before = useRef(count);

  useEffect(() => {
    if (asked.current && count > before.current) {
      asked.current = false;
      const rows = root.current?.querySelectorAll<HTMLElement>("[data-item]");
      const row = rows && rows.length ? rows[rows.length - 1] : null;
      if (row) {
        const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        row.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
        row
          .querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled])")
          ?.focus({ preventScroll: true });
      }
    }
    before.current = count;
  }, [count]);

  const ref = useCallback((el: HTMLElement | null) => {
    root.current = el;
  }, []);
  const ask = useCallback(() => {
    asked.current = true;
  }, []);
  return { ref, ask };
}
