/**
 * A right-hand slide-over (P8.7), for the console's server panel. Built on
 * Radix Dialog like Dialog.tsx (focus trap, Esc, focus return), but docked
 * to the right edge with a draggable left edge:
 *
 * - the width follows the mockup: 760px from 1024, 880px from 1440,
 *   min(720px, 92%) from 640, full screen below that
 * - drag the edge, or focus it and use Left/Right, to resize; double click
 *   resets; the width is remembered per `storeKey` (localStorage, guarded)
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
import { XIcon } from "@phosphor-icons/react";
import IconButton from "./IconButton";
import "./Drawer.css";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Footer buttons, by the dialog footer rule (Cancel, then main). */
  foot?: ReactNode;
  storeKey: string;
  minWidth?: number;
  closeLabel: string;
  resizeLabel: string;
}

/** A width the person dragged to, or null for the CSS default. */
function readWidth(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(`iris-drawer-${key}`));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export default function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  foot,
  storeKey,
  minWidth = 360,
  closeLabel,
  resizeLabel,
}: Props) {
  const [width, setWidth] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const openedFrom = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) openedFrom.current = document.activeElement as HTMLElement | null;
  wasOpen.current = open;

  useEffect(() => setWidth(readWidth(storeKey)), [storeKey]);

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

  const reset = () => {
    setWidth(null);
    try {
      localStorage.removeItem(`iris-drawer-${storeKey}`);
    } catch {
      /* ignore */
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const now = width ?? panel.current?.offsetWidth ?? 760;
    if (e.key === "ArrowLeft") save(now + 24);
    else if (e.key === "ArrowRight") save(now - 24);
    else return;
    e.preventDefault();
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="drawer__overlay" />
        <RadixDialog.Content
          className="drawer"
          ref={panel}
          tabIndex={-1}
          style={width ? ({ "--drawer-w": `${width}px` } as CSSProperties) : undefined}
          onOpenAutoFocus={(e) => {
            // Land on the panel itself: not the resize grip (its focus ring
            // would outline the whole edge) and not the close button (its
            // tooltip would pop the moment the drawer opens).
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
          }}
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
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            onDoubleClick={reset}
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
            <RadixDialog.Close asChild>
              <IconButton icon={XIcon} label={closeLabel} className="drawer__close" />
            </RadixDialog.Close>
          </header>
          <div className="drawer__body">{children}</div>
          {foot && <footer className="drawer__foot">{foot}</footer>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
