/**
 * Enter presses the main button (2026-10-06): in a dialog, drawer or form
 * popover, Enter does what the main footer button does, as on a desktop
 * app. Whatever already uses Enter keeps it: buttons, links, tabs, lists,
 * menus, switches, a textarea (Ctrl+Enter there), and any handler that
 * called preventDefault first (a dropdown picking an option, the clock's
 * drums closing their picker).
 *
 * The main button is the one marked `data-enter`, else the footer's: the
 * first one in a 1-2 footer, else the last one (Cancel comes first). A
 * disabled main button does nothing.
 */
import type { KeyboardEvent } from "react";

const OWN_ENTER =
  "button, a[href], select, [role=tab], [role=option], [role=listbox], [role=menu], [role=menuitem], [role=combobox], [role=switch], [role=checkbox], [role=radio], [contenteditable=true], input[type=file], input[type=checkbox], input[type=radio]";

export function mainButton(root: HTMLElement, footSel: string): HTMLButtonElement | null {
  const marked = root.querySelector<HTMLButtonElement>("button[data-enter]");
  if (marked) return marked;
  const foot = root.querySelector<HTMLElement>(footSel);
  if (!foot) return null;
  const all = [...foot.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => !b.closest(".dialog__alt") && b.offsetParent !== null,
  );
  if (!all.length) return null;
  return foot.classList.contains("dialog__actions--12") ? all[0] : all[all.length - 1];
}

export function enterPressesMain(
  e: KeyboardEvent<HTMLElement>,
  root: HTMLElement | null,
  footSel: string,
): void {
  if (e.key !== "Enter" || e.defaultPrevented || e.altKey || e.shiftKey) return;
  if (e.nativeEvent.isComposing || !root) return;
  const target = e.target as HTMLElement;
  if (target.tagName === "TEXTAREA" && !(e.ctrlKey || e.metaKey)) return;
  if (target !== root && target.closest(OWN_ENTER)) return;
  // A layer opened from this one (a popover, a nested dialog) answers first.
  if (!root.contains(target) && target !== root) return;
  const b = mainButton(root, footSel);
  if (!b || b.disabled || b.getAttribute("aria-disabled") === "true") return;
  e.preventDefault();
  // After React has applied what the key did to the field (a typed time
  // commits on Enter), so the button's handler sees the new value.
  setTimeout(() => {
    if (b.isConnected && !b.disabled) b.click();
  }, 0);
}
