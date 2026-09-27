/**
 * A Radix-backed tooltip (P7.1): hover/focus reveals a short label, with a
 * shared delay so multiple tooltips on one page feel consistent. Meant for
 * things like a disabled console tab explaining why it's disabled, a
 * truncated chip's full value, or an icon-only button's accessible name
 * made visible on hover.
 *
 * `TooltipProvider` must wrap whichever React island renders a `Tooltip`.
 * It can't be mounted once in Base.astro the way controls.css is imported
 * once globally: Base.astro is plain Astro markup, not a React tree, so
 * there is no single React root to wrap around every page's islands.
 * Each island that uses `Tooltip` wraps its own top-level return in
 * `<TooltipProvider>` (once per island, not once per `Tooltip` inside it).
 *
 * Usage:
 *   <Tooltip label="Nonaktif sampai sesi berjalan">
 *     <button disabled>...</button>
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
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="tooltip__panel" side={side} sideOffset={6}>
          {label}
          <RadixTooltip.Arrow className="tooltip__arrow" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
