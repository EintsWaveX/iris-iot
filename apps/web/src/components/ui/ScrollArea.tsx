/**
 * A Radix-backed scroll region with a styled, always-reachable scrollbar
 * (P7.1) -- this is the direct fix for F4's page-level overflow (the Nilai
 * grid forcing the whole page to 963px wide at 360px) and the same pattern
 * the layout research calls for generally: a data table too wide for its
 * container should scroll INSIDE a labelled, focusable region of its own,
 * never force the page itself to overflow.
 *
 * Wraps its content in the accessible pattern the redesign's layout
 * research settled on: `role="region"` plus `tabIndex={0}` so a
 * keyboard/screen-reader user can reach and scroll it even with no visible
 * scrollbar focused, and an `aria-label` naming what's inside (WCAG 1.4.10
 * Reflow allows this exception for genuine data tables/code, which is the
 * only thing this component is for -- never wrap ordinary page content in
 * it to hide a layout bug instead of fixing it).
 *
 * `direction="horizontal"` is the common case (a wide table or a code
 * block); `"both"` is for the Nilai grid, which needs to scroll both ways
 * once its sticky header/columns are added in P7.4.
 *
 * Usage:
 *   <ScrollArea label="Nilai praktikum" direction="both">
 *     <table>...</table>
 *   </ScrollArea>
 */
import type { ReactNode } from "react";
import * as RadixScrollArea from "@radix-ui/react-scroll-area";
import "./ScrollArea.css";

interface Props {
  label: string;
  children: ReactNode;
  direction?: "horizontal" | "vertical" | "both";
  className?: string;
}

export default function ScrollArea({
  label,
  children,
  direction = "horizontal",
  className,
}: Props) {
  return (
    <RadixScrollArea.Root
      className={["scroll-area", className].filter(Boolean).join(" ")}
      type="hover"
    >
      <RadixScrollArea.Viewport
        className="scroll-area__viewport"
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </RadixScrollArea.Viewport>
      {direction !== "vertical" && (
        <RadixScrollArea.Scrollbar className="scroll-area__bar" orientation="horizontal">
          <RadixScrollArea.Thumb className="scroll-area__thumb" />
        </RadixScrollArea.Scrollbar>
      )}
      {direction !== "horizontal" && (
        <RadixScrollArea.Scrollbar className="scroll-area__bar" orientation="vertical">
          <RadixScrollArea.Thumb className="scroll-area__thumb" />
        </RadixScrollArea.Scrollbar>
      )}
      <RadixScrollArea.Corner className="scroll-area__corner" />
    </RadixScrollArea.Root>
  );
}
