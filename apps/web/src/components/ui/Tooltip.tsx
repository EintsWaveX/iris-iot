/**
 * A Radix-backed tooltip (P7.1): hover/focus reveals a short label. Phase 9
 * gives every icon-only button one (IconButton.tsx), so a tooltip now
 * brings its own provider and works in any island without setup. An outer
 * `TooltipProvider` is still honoured: it shares the delay across one
 * island's tooltips, so moving between them skips the wait.
 *
 * The panel portals to <body> above dialogs, drawers and toasts, flips to
 * the other side when there is no room, and never leaves the viewport.
 *
 * Usage:
 *   <Tooltip label="Nonaktif sampai sesi berjalan">
 *     <button aria-disabled="true">...</button>
 *   </Tooltip>
 *
 * A trigger that also opens a popover or menu (2026-10-07): the tooltip
 * closes on press, stays shut while the popover is open and when focus
 * comes back to the button as it closes, and leaves the button's
 * data-state to the popover (the tooltip's "closed" used to win, so the
 * open button drew as closed).
 */
import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { useFullscreenEl } from "./fullscreen";
import "./Tooltip.css";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={100}>
      {children}
    </RadixTooltip.Provider>
  );
}

interface Props {
  label: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

/** Passes the tooltip trigger's props on, minus its data-state. */
function TanpaState({
  children,
  ref,
  "data-state": _state,
  ...rest
}: {
  children: ReactNode;
  ref?: Ref<HTMLElement>;
  "data-state"?: string;
  [k: string]: unknown;
}) {
  if (!isValidElement(children)) return <>{children}</>;
  const el = children as ReactElement<{ ref?: Ref<HTMLElement> }>;
  const own = el.props.ref;
  return cloneElement(el, {
    ...rest,
    ref: (node: HTMLElement | null) => {
      for (const r of [ref, own]) {
        if (typeof r === "function") r(node);
        else if (r) (r as { current: HTMLElement | null }).current = node;
      }
    },
  });
}

export default function Tooltip({ label, children, side = "top" }: Props) {
  const fs = useFullscreenEl();
  const [open, setOpen] = useState(false);
  const el = useRef<HTMLElement | null>(null);
  const diam = useRef(0);
  useEffect(() => {
    const t = el.current;
    if (!t || !t.hasAttribute("aria-expanded")) return;
    const mo = new MutationObserver(() => {
      if (t.getAttribute("aria-expanded") === "true") setOpen(false);
      else diam.current = Date.now() + 600;
    });
    mo.observe(t, { attributes: true, attributeFilter: ["aria-expanded"] });
    return () => mo.disconnect();
  }, []);
  const ubah = (o: boolean) => {
    if (o && (el.current?.getAttribute("aria-expanded") === "true" || Date.now() < diam.current))
      return;
    setOpen(o);
  };
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={100}>
      <RadixTooltip.Root open={open} onOpenChange={ubah}>
        <RadixTooltip.Trigger asChild onPointerDown={() => setOpen(false)}>
          <TanpaState ref={el}>{children}</TanpaState>
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal container={fs ?? undefined}>
          <RadixTooltip.Content
            className="tooltip__panel"
            side={side}
            sideOffset={8}
            collisionPadding={8}
          >
            {label}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
