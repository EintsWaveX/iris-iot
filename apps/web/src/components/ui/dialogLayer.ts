/**
 * Stacking for dialogs opened over dialogs. Every dialog's overlay sat at
 * z-index 100 and its panel at 101, so a second dialog's scrim landed under
 * the first one's panel: the page behind was dimmed twice and the dialog
 * beneath not at all. Each open dialog now takes the next slot, two z-index
 * steps up, so its scrim covers everything below it.
 *
 * Popovers and menus stay at 150, above every dialog (Popover.css), so the
 * slots stop short of it.
 */
import { useLayoutEffect, useState } from "react";

const BASE = 100;
const MAX_SLOT = 23;

const open: symbol[] = [];

/** The z-index pair for a dialog: its slot among the dialogs open now. */
export function useDialogLayer(isOpen: boolean): { overlay: number; panel: number } {
  const [slot, setSlot] = useState(0);
  useLayoutEffect(() => {
    if (!isOpen) return;
    const id = Symbol("dialog");
    open.push(id);
    setSlot(Math.min(open.length - 1, MAX_SLOT));
    return () => {
      open.splice(open.indexOf(id), 1);
    };
  }, [isOpen]);
  return { overlay: BASE + slot * 2, panel: BASE + 1 + slot * 2 };
}
