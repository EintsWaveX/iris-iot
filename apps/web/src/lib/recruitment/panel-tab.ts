/**
 * Which part of /recruitment/panel is open (prompt 03). The recruitment
 * navbar and the panel both read and write it: the part is the `bagian`
 * query value (?bagian=kalender), changed in place with replaceState and a
 * window event, so switching parts never reloads the page. A link to another
 * part from any other page is just that address.
 */
import { useEffect, useState } from "react";

export const PANEL_TABS = [
  "ringkasan",
  "kalender",
  "kandidat",
  "cutting",
  "plotting",
  "tes",
  "bank",
  "panitia",
] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

export const PANEL_TAB_EVENT = "rec:bagian";

export function isPanelTab(v: unknown): v is PanelTab {
  return typeof v === "string" && (PANEL_TABS as readonly string[]).includes(v);
}

/** The part named in the address, or null. */
export function bacaBagian(
  search: string = typeof location === "undefined" ? "" : location.search,
) {
  const v = new URLSearchParams(search).get("bagian");
  return isPanelTab(v) ? v : null;
}

/** Opens a part without leaving the page. */
export function bukaBagian(tab: PanelTab): void {
  const u = new URL(location.href);
  u.searchParams.set("bagian", tab);
  history.replaceState(history.state, "", u);
  window.dispatchEvent(new Event(PANEL_TAB_EVENT));
}

/** The open part, kept in step with the address. */
export function useBagian(): PanelTab | null {
  const [tab, setTab] = useState<PanelTab | null>(null);
  useEffect(() => {
    const on = () => setTab(bacaBagian());
    on();
    window.addEventListener(PANEL_TAB_EVENT, on);
    window.addEventListener("popstate", on);
    return () => {
      window.removeEventListener(PANEL_TAB_EVENT, on);
      window.removeEventListener("popstate", on);
    };
  }, []);
  return tab;
}

/** The address of a part, for a link. `prefix` is "" or "/en", "/zh". */
export const alamatBagian = (prefix: string, tab: PanelTab) =>
  `${prefix}/recruitment/panel?bagian=${tab}`;
