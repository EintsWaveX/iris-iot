/**
 * A Radix-backed popover (P7.1): a trigger plus a floating panel positioned
 * relative to it, auto-flipping to stay on screen. Used by DateRangePicker
 * for its calendar flyout, and available for any future trigger+flyout
 * need (a hint, a small inline menu) without hand-rolling positioning the
 * way Dropdown.tsx's own popover engine had to for its more complex
 * requirements (portal-vs-backdrop-filter, mobile bottom sheet). This is
 * the plain case; Dropdown.tsx stays the answer for anything that also
 * needs to behave like a form control (see Tabs.tsx/P7.1 notes on Select).
 *
 * Usage:
 *   <Popover trigger={<button>Buka</button>}>
 *     <p>Isi popover</p>
 *   </Popover>
 */
import type { ReactNode } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import "./Popover.css";
import { useDialogHost } from "./dialogHost";
import { enterPressesMain } from "./enterKey";

interface Props {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  /** Added to the panel's class (e.g. popover__panel--menu, a short list) */
  className?: string;
}

export default function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = "start",
  className,
}: Props) {
  const dialogHost = useDialogHost();
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      {dialogHost.marker}
      <RadixPopover.Portal container={dialogHost.host}>
        <RadixPopover.Content
          className={className ? `popover__panel ${className}` : "popover__panel"}
          // Enter presses the button marked data-enter (a small form's Save).
          onKeyDown={(e) => enterPressesMain(e, e.currentTarget, "[data-enter-foot]")}
          align={align}
          sideOffset={8}
          collisionPadding={16}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
