/**
 * A right-hand slide-over (P8.7), for the console's server panel. Built on
 * Radix Dialog like Dialog.tsx (focus trap, Esc, focus return), but docked
 * to the right edge with a draggable left edge:
 *
 * - drag the edge, or focus it and use Left/Right, to resize; double click
 *   resets; the width is remembered per `storeKey` (localStorage, guarded)
 * - below 1024px it is 80% wide, below 640px full screen, and not resizable
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import "./Drawer.css";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  storeKey: string;
  defaultWidth?: number;
  minWidth?: number;
  closeLabel: string;
  resizeLabel: string;
}

function readWidth(key: string, dflt: number): number {
  try {
    const v = Number(localStorage.getItem(`iris-drawer-${key}`));
    return Number.isFinite(v) && v > 0 ? v : dflt;
  } catch {
    return dflt;
  }
}

export default function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  storeKey,
  defaultWidth = 440,
  minWidth = 360,
  closeLabel,
  resizeLabel,
}: Props) {
  const [width, setWidth] = useState(defaultWidth);
  const openedFrom = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) openedFrom.current = document.activeElement as HTMLElement | null;
  wasOpen.current = open;

  useEffect(() => setWidth(readWidth(storeKey, defaultWidth)), [storeKey, defaultWidth]);

  const save = (w: number) => {
    const max = Math.max(minWidth, window.innerWidth - 240);
    const next = Math.round(Math.min(max, Math.max(minWidth, w)));
    setWidth(next);
    try {
      localStorage.setItem(`iris-drawer-${storeKey}`, String(next));
    } catch {
      /* ignore */
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const move = (ev: globalThis.PointerEvent) => save(window.innerWidth - ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowLeft") save(width + 24);
    else if (e.key === "ArrowRight") save(width - 24);
    else return;
    e.preventDefault();
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="drawer__overlay" />
        <RadixDialog.Content
          className="drawer"
          style={{ "--drawer-w": `${width}px` } as CSSProperties}
          onCloseAutoFocus={(e) => {
            if (openedFrom.current) {
              e.preventDefault();
              openedFrom.current.focus();
            }
          }}
        >
          <button
            type="button"
            className="drawer__grip"
            aria-label={resizeLabel}
            title={resizeLabel}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            onDoubleClick={() => save(defaultWidth)}
          />
          <header className="drawer__head">
            <div className="drawer__titles">
              <RadixDialog.Title className="drawer__title">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="drawer__lede">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close className="btn btn--ghost btn--icon" aria-label={closeLabel}>
              ×
            </RadixDialog.Close>
          </header>
          <div className="drawer__body">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
