/**
 * dnd-kit's DragOverlay, rendered on the page body. The overlay is
 * position: fixed at the pointer, and any ancestor with a transform, a
 * filter or `contain` would become its containing block and throw it off
 * the pointer, so it never renders inside the page's own boxes. The portal
 * keeps the React tree, so the DndContext still reaches it.
 */
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { DragOverlay } from "@dnd-kit/core";

export default function DragLayer({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(<DragOverlay>{children}</DragOverlay>, document.body);
}
