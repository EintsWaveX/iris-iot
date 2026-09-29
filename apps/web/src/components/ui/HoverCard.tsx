/**
 * A rich preview on hover or keyboard focus (P8.7): a group, a student, a
 * device. Radix HoverCard does not open on touch, which is fine here: every
 * hover card duplicates information the tap target already leads to (the
 * inspector, the device page), so it is a shortcut, never the only path.
 */
import type { ReactNode } from "react";
import * as RadixHoverCard from "@radix-ui/react-hover-card";
import "./HoverCard.css";

interface Props {
  children: ReactNode;
  card: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

export default function HoverCard({ children, card, side = "bottom" }: Props) {
  return (
    <RadixHoverCard.Root openDelay={350} closeDelay={80}>
      <RadixHoverCard.Trigger asChild>{children}</RadixHoverCard.Trigger>
      <RadixHoverCard.Portal>
        <RadixHoverCard.Content
          className="hovercard"
          side={side}
          sideOffset={8}
          collisionPadding={12}
        >
          {card}
        </RadixHoverCard.Content>
      </RadixHoverCard.Portal>
    </RadixHoverCard.Root>
  );
}
