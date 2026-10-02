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
 */
import type { ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
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

export default function Tooltip({ label, children, side = "top" }: Props) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={100}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
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
